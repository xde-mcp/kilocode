import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { SessionService } from "../session.js"
import { SessionClient } from "../sessionClient.js"

// Mock fs module
vi.mock("fs", () => ({
	readFileSync: vi.fn(),
}))

vi.mock("../sessionClient.js")
vi.mock("../logs.js", () => ({
	logs: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}))

// Import after mocking
import { readFileSync } from "fs"
import { logs } from "../logs.js"

describe("SessionService", () => {
	let service: SessionService
	let mockSessionClient: SessionClient
	let mockCreate: ReturnType<typeof vi.fn>
	let mockUpdate: ReturnType<typeof vi.fn>

	beforeEach(() => {
		vi.useFakeTimers()
		vi.clearAllMocks()

		// Reset the singleton instance before each test
		// @ts-expect-error - Accessing private static property for testing
		SessionService.instance = null

		// Mock SessionClient methods
		mockCreate = vi.fn()
		mockUpdate = vi.fn()
		mockSessionClient = {
			create: mockCreate,
			update: mockUpdate,
		} as unknown as SessionClient

		// Mock SessionClient.getInstance to return our mock
		vi.spyOn(SessionClient, "getInstance").mockReturnValue(mockSessionClient)

		service = SessionService.getInstance()
	})

	afterEach(async () => {
		await service.destroy()
		vi.restoreAllMocks()
		vi.useRealTimers()
	})

	describe("getInstance", () => {
		it("should return same instance on multiple calls", () => {
			const instance1 = SessionService.getInstance()
			const instance2 = SessionService.getInstance()
			expect(instance1).toBe(instance2)
		})

		it("should be a singleton", () => {
			// @ts-expect-error - Accessing private static property for testing
			expect(SessionService.instance).not.toBeNull()
		})
	})

	describe("readPath", () => {
		beforeEach(() => {
			vi.clearAllMocks()
		})

		it("should read and parse JSON file", () => {
			const jsonContent = JSON.stringify({ key: "value" })
			vi.mocked(readFileSync).mockReturnValueOnce(jsonContent)

			// @ts-expect-error - Testing private method
			const result = service.readPath("/path/to/file.json")

			expect(readFileSync).toHaveBeenCalledWith("/path/to/file.json", "utf-8")
			expect(result).toEqual({ key: "value" })
		})

		it("should return undefined for non-JSON files", () => {
			const textContent = "plain text content"
			vi.mocked(readFileSync).mockReturnValueOnce(textContent)

			// @ts-expect-error - Testing private method
			const result = service.readPath("/path/to/file.txt")

			expect(readFileSync).toHaveBeenCalledWith("/path/to/file.txt", "utf-8")
			expect(result).toBeUndefined()
		})

		it("should return undefined when file read fails", () => {
			vi.mocked(readFileSync).mockImplementationOnce(() => {
				throw new Error("File not found")
			})

			// @ts-expect-error - Testing private method
			const result = service.readPath("/path/to/nonexistent.json")

			expect(result).toBeUndefined()
		})

		it("should return undefined when JSON parse fails", () => {
			const invalidJson = "{invalid json"
			vi.mocked(readFileSync).mockReturnValueOnce(invalidJson)

			// @ts-expect-error - Testing private method
			const result = service.readPath("/path/to/invalid.json")

			expect(result).toBeUndefined()
		})
	})

	describe("readPaths", () => {
		beforeEach(() => {
			vi.clearAllMocks()
		})

		it("should read all configured paths", () => {
			const mockData1 = { data: "api" }
			const mockData2 = { data: "ui" }
			const mockData3 = { data: "metadata" }

			vi.mocked(readFileSync)
				.mockReturnValueOnce(JSON.stringify(mockData1))
				.mockReturnValueOnce(JSON.stringify(mockData2))
				.mockReturnValueOnce(JSON.stringify(mockData3))

			service.setPath("apiConversationHistoryPath", "/path/to/api.json")
			service.setPath("uiMessagesPath", "/path/to/ui.json")
			service.setPath("taskMetadataPath", "/path/to/metadata.json")

			// @ts-expect-error - Testing private method
			const result = service.readPaths()

			expect(result).toEqual({
				apiConversationHistoryPath: mockData1,
				uiMessagesPath: mockData2,
				taskMetadataPath: mockData3,
			})
		})

		it("should skip null paths", () => {
			const mockData = { data: "api" }
			vi.mocked(readFileSync).mockReturnValueOnce(JSON.stringify(mockData))

			service.setPath("apiConversationHistoryPath", "/path/to/api.json")

			// @ts-expect-error - Testing private method
			const result = service.readPaths()

			expect(result).toEqual({
				apiConversationHistoryPath: mockData,
			})
			expect(readFileSync).toHaveBeenCalledTimes(1)
		})

		it("should skip paths with undefined content", () => {
			vi.mocked(readFileSync).mockImplementationOnce(() => {
				throw new Error("File not found")
			})

			service.setPath("apiConversationHistoryPath", "/path/to/nonexistent.json")

			// @ts-expect-error - Testing private method
			const result = service.readPaths()

			expect(result).toEqual({})
		})

		it("should return empty object when no paths configured", () => {
			// @ts-expect-error - Testing private method
			const result = service.readPaths()

			expect(result).toEqual({})
			expect(readFileSync).not.toHaveBeenCalled()
		})
	})

	describe("syncSession", () => {
		it("should not sync when no paths configured", async () => {
			vi.advanceTimersByTime(1000)

			expect(mockCreate).not.toHaveBeenCalled()
			expect(mockUpdate).not.toHaveBeenCalled()
		})

		it("should create new session on first sync", async () => {
			const mockData = { messages: [] }
			vi.mocked(readFileSync).mockReturnValueOnce(JSON.stringify(mockData))

			mockCreate.mockResolvedValueOnce({
				id: "new-session-id",
				title: "",
				created_at: "2025-01-01T00:00:00Z",
				updated_at: "2025-01-01T00:00:00Z",
			})

			service.setPath("apiConversationHistoryPath", "/path/to/api.json")

			// Trigger sync via timer
			await vi.advanceTimersByTimeAsync(1000)

			expect(mockCreate).toHaveBeenCalledWith({
				api_conversation_history: mockData,
				ui_messages: undefined,
				task_metadata: undefined,
			})
			expect(mockUpdate).not.toHaveBeenCalled()
		})

		it("should update existing session on subsequent syncs", async () => {
			vi.mocked(readFileSync)
				.mockReturnValueOnce(JSON.stringify({ messages: ["first"] }))
				.mockReturnValueOnce(JSON.stringify({ messages: ["first", "second"] }))

			mockCreate.mockResolvedValueOnce({
				id: "session-id",
				title: "",
				created_at: "2025-01-01T00:00:00Z",
				updated_at: "2025-01-01T00:00:00Z",
			})

			mockUpdate.mockResolvedValueOnce({
				id: "session-id",
				title: "",
				updated_at: "2025-01-01T00:01:00Z",
			})

			service.setPath("apiConversationHistoryPath", "/path/to/api.json")

			// First sync - creates session
			await vi.advanceTimersByTimeAsync(1000)

			expect(mockCreate).toHaveBeenCalledTimes(1)

			// Modify path to trigger new sync
			service.setPath("apiConversationHistoryPath", "/path/to/api.json")

			// Second sync - updates session
			await vi.advanceTimersByTimeAsync(1000)

			expect(mockUpdate).toHaveBeenCalledWith({
				sessionId: "session-id",
				api_conversation_history: { messages: ["first", "second"] },
				ui_messages: undefined,
				task_metadata: undefined,
			})
		})

		it("should not sync when lastSaveEvent equals lastSyncEvent", async () => {
			const mockData = { messages: [] }
			vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockData))

			mockCreate.mockResolvedValueOnce({
				id: "session-id",
				title: "",
				created_at: "2025-01-01T00:00:00Z",
				updated_at: "2025-01-01T00:00:00Z",
			})

			service.setPath("apiConversationHistoryPath", "/path/to/api.json")

			// First sync
			await vi.advanceTimersByTimeAsync(1000)

			expect(mockCreate).toHaveBeenCalledTimes(1)

			// Second timer tick without setPath - should not sync
			await vi.advanceTimersByTimeAsync(1000)

			expect(mockCreate).toHaveBeenCalledTimes(1)
			expect(mockUpdate).not.toHaveBeenCalled()
		})

		it("should not sync when all file reads return undefined", async () => {
			vi.mocked(readFileSync).mockImplementation(() => {
				throw new Error("File not found")
			})

			service.setPath("apiConversationHistoryPath", "/path/to/nonexistent.json")

			await vi.advanceTimersByTimeAsync(1000)

			expect(mockCreate).not.toHaveBeenCalled()
			expect(mockUpdate).not.toHaveBeenCalled()
		})

		it("should sync with multiple paths", async () => {
			const mockData1 = { api: "data" }
			const mockData2 = { ui: "data" }
			const mockData3 = { task: "data" }

			vi.mocked(readFileSync)
				.mockReturnValueOnce(JSON.stringify(mockData1))
				.mockReturnValueOnce(JSON.stringify(mockData2))
				.mockReturnValueOnce(JSON.stringify(mockData3))

			mockCreate.mockResolvedValueOnce({
				id: "session-id",
				title: "",
				created_at: "2025-01-01T00:00:00Z",
				updated_at: "2025-01-01T00:00:00Z",
			})

			service.setPath("apiConversationHistoryPath", "/path/to/api.json")
			service.setPath("uiMessagesPath", "/path/to/ui.json")
			service.setPath("taskMetadataPath", "/path/to/metadata.json")

			await vi.advanceTimersByTimeAsync(1000)

			expect(mockCreate).toHaveBeenCalledWith({
				api_conversation_history: mockData1,
				ui_messages: mockData2,
				task_metadata: mockData3,
			})
		})
	})

	describe("setPath", () => {
		it("should set path and trigger lastSaveEvent update", () => {
			service.setPath("apiConversationHistoryPath", "/path/to/api.json")

			// @ts-expect-error - Accessing private property for testing
			expect(service.paths.apiConversationHistoryPath).toBe("/path/to/api.json")
			// @ts-expect-error - Accessing private property for testing
			expect(service.lastSaveEvent).toBeTruthy()
		})

		it("should update lastSaveEvent with unique values on each call", () => {
			service.setPath("apiConversationHistoryPath", "/path/to/api.json")
			// @ts-expect-error - Accessing private property for testing
			const firstEvent = service.lastSaveEvent

			service.setPath("uiMessagesPath", "/path/to/ui.json")
			// @ts-expect-error - Accessing private property for testing
			const secondEvent = service.lastSaveEvent

			expect(firstEvent).not.toBe(secondEvent)
		})
	})

	describe("destroy", () => {
		it("should clear timer", async () => {
			const clearIntervalSpy = vi.spyOn(global, "clearInterval")

			await service.destroy()

			expect(clearIntervalSpy).toHaveBeenCalled()
		})

		it("should flush session before destroying", async () => {
			const mockData = { messages: [] }
			vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockData))

			mockCreate.mockResolvedValueOnce({
				id: "session-id",
				title: "",
				created_at: "2025-01-01T00:00:00Z",
				updated_at: "2025-01-01T00:00:00Z",
			})

			service.setPath("apiConversationHistoryPath", "/path/to/api.json")

			await service.destroy()

			// Should have called create to flush the session
			expect(mockCreate).toHaveBeenCalledWith({
				api_conversation_history: mockData,
				ui_messages: undefined,
				task_metadata: undefined,
			})
		})

		it("should reset paths to default", async () => {
			service.setPath("apiConversationHistoryPath", "/path/to/api.json")

			// @ts-expect-error - Accessing private property for testing
			expect(service.paths.apiConversationHistoryPath).toBe("/path/to/api.json")

			await service.destroy()

			// @ts-expect-error - Accessing private property for testing
			expect(service.paths.apiConversationHistoryPath).toBeNull()
		})

		it("should reset sessionId", async () => {
			// Set up a session
			const mockData = { messages: [] }
			vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockData))

			mockCreate.mockResolvedValueOnce({
				id: "session-id",
				title: "",
				created_at: "2025-01-01T00:00:00Z",
				updated_at: "2025-01-01T00:00:00Z",
			})

			service.setPath("apiConversationHistoryPath", "/path/to/api.json")

			// Wait for session creation
			await vi.advanceTimersByTimeAsync(1000)

			await service.destroy()

			// @ts-expect-error - Accessing private property for testing
			expect(service.sessionId).toBeNull()
		})

		it("should allow timer to be cleared multiple times safely", async () => {
			await service.destroy()
			await expect(service.destroy()).resolves.not.toThrow()
		})
	})

	describe("timer behavior", () => {
		it("should start timer on construction", () => {
			const setIntervalSpy = vi.spyOn(global, "setInterval")

			// Create new instance to test construction
			// @ts-expect-error - Reset for testing
			SessionService.instance = null
			SessionService.getInstance()

			expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 1000)
		})

		it("should call syncSession every 1000ms", async () => {
			const mockData = { messages: [] }
			vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockData))

			mockCreate.mockResolvedValue({
				id: "session-id",
				title: "",
				created_at: "2025-01-01T00:00:00Z",
				updated_at: "2025-01-01T00:00:00Z",
			})

			service.setPath("apiConversationHistoryPath", "/path/to/api.json")

			// First tick
			await vi.advanceTimersByTimeAsync(1000)
			expect(mockCreate).toHaveBeenCalledTimes(1)

			// Trigger new save event
			service.setPath("apiConversationHistoryPath", "/path/to/api.json")

			// Second tick - should call update
			mockUpdate.mockResolvedValue({
				id: "session-id",
				title: "",
				updated_at: "2025-01-01T00:01:00Z",
			})

			await vi.advanceTimersByTimeAsync(1000)
			expect(mockUpdate).toHaveBeenCalledTimes(1)
		})
	})

	describe("error handling", () => {
		it("should handle API errors gracefully and continue syncing", async () => {
			const mockData = { messages: [] }
			vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockData))

			// First call fails
			mockCreate.mockRejectedValueOnce(new Error("Network error"))

			service.setPath("apiConversationHistoryPath", "/path/to/api.json")

			// First sync attempt - should fail but not throw
			await vi.advanceTimersByTimeAsync(1000)

			expect(mockCreate).toHaveBeenCalledTimes(1)
			expect(vi.mocked(logs.error)).toHaveBeenCalledWith(
				"Failed to sync session",
				"SessionService",
				expect.objectContaining({
					error: "Network error",
				}),
			)

			// Second call succeeds
			mockCreate.mockResolvedValueOnce({
				id: "session-id",
				title: "",
				created_at: "2025-01-01T00:00:00Z",
				updated_at: "2025-01-01T00:00:00Z",
			})

			// Trigger new save event to force new sync
			service.setPath("apiConversationHistoryPath", "/path/to/api.json")

			// Second sync attempt - should succeed
			await vi.advanceTimersByTimeAsync(1000)

			expect(mockCreate).toHaveBeenCalledTimes(2)
			expect(vi.mocked(logs.info)).toHaveBeenCalledWith(
				"Session created successfully",
				"SessionService",
				expect.objectContaining({
					sessionId: "session-id",
				}),
			)
		})

		it("should handle update failures gracefully", async () => {
			const mockData = { messages: [] }
			vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockData))

			mockCreate.mockResolvedValueOnce({
				id: "session-id",
				title: "",
				created_at: "2025-01-01T00:00:00Z",
				updated_at: "2025-01-01T00:00:00Z",
			})

			service.setPath("apiConversationHistoryPath", "/path/to/api.json")

			// First sync - creates session
			await vi.advanceTimersByTimeAsync(1000)

			expect(mockCreate).toHaveBeenCalledTimes(1)

			// Update fails
			mockUpdate.mockRejectedValueOnce(new Error("Update failed"))

			service.setPath("apiConversationHistoryPath", "/path/to/api.json")

			// Second sync - update fails but doesn't throw
			await vi.advanceTimersByTimeAsync(1000)

			expect(mockUpdate).toHaveBeenCalledTimes(1)
			expect(vi.mocked(logs.error)).toHaveBeenCalledWith(
				"Failed to sync session",
				"SessionService",
				expect.objectContaining({
					error: "Update failed",
					sessionId: "session-id",
				}),
			)
		})

		it("should complete destroy even when final sync fails", async () => {
			const mockData = { messages: [] }
			vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockData))

			// Create a session first
			mockCreate.mockResolvedValueOnce({
				id: "session-id",
				title: "",
				created_at: "2025-01-01T00:00:00Z",
				updated_at: "2025-01-01T00:00:00Z",
			})

			service.setPath("apiConversationHistoryPath", "/path/to/api.json")

			// Wait for initial sync to complete
			await vi.advanceTimersByTimeAsync(1000)

			// Clear mocks to isolate destroy behavior
			vi.clearAllMocks()

			// Set a new path to trigger sync during destroy
			service.setPath("apiConversationHistoryPath", "/path/to/api2.json")

			// Make the update during destroy fail
			mockUpdate.mockRejectedValueOnce(new Error("Sync failed during destroy"))

			// Destroy should complete without throwing, even though sync fails
			await expect(service.destroy()).resolves.not.toThrow()

			// syncSession logs the error (not destroy, since syncSession catches internally)
			expect(vi.mocked(logs.error)).toHaveBeenCalledWith(
				"Failed to sync session",
				"SessionService",
				expect.objectContaining({
					error: "Sync failed during destroy",
					sessionId: "session-id",
				}),
			)

			// Verify destroy completed successfully
			expect(vi.mocked(logs.debug)).toHaveBeenCalledWith("SessionService destroyed", "SessionService")
		})
	})

	describe("concurrency protection", () => {
		it("should prevent concurrent sync operations", async () => {
			const mockData = { messages: [] }
			vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockData))

			// Make the first sync take a long time
			let resolveFirst: () => void
			const firstSyncPromise = new Promise<{
				id: string
				title: string
				created_at: string
				updated_at: string
			}>((resolve) => {
				resolveFirst = () =>
					resolve({
						id: "session-id",
						title: "",
						created_at: "2025-01-01T00:00:00Z",
						updated_at: "2025-01-01T00:00:00Z",
					})
			})

			mockCreate.mockReturnValueOnce(firstSyncPromise)

			service.setPath("apiConversationHistoryPath", "/path/to/api.json")

			// Start first sync (but don't await - it's already running via timer)
			const firstTick = vi.advanceTimersByTimeAsync(1000)

			// Try to trigger another sync while first is in progress
			service.setPath("apiConversationHistoryPath", "/path/to/api2.json")
			const secondTick = vi.advanceTimersByTimeAsync(1000)

			// Both ticks run but second should skip due to lock
			await Promise.all([firstTick, secondTick])

			// Now resolve the first sync
			resolveFirst!()
			await firstSyncPromise

			// Only one create call should have been made (second was blocked by lock)
			expect(mockCreate).toHaveBeenCalledTimes(1)
		})

		it("should release lock even if sync fails", async () => {
			const mockData = { messages: [] }
			vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockData))

			// First sync fails
			mockCreate.mockRejectedValueOnce(new Error("Sync failed"))

			service.setPath("apiConversationHistoryPath", "/path/to/api.json")

			await vi.advanceTimersByTimeAsync(1000)

			expect(mockCreate).toHaveBeenCalledTimes(1)

			// Second sync should work (lock was released)
			mockCreate.mockResolvedValueOnce({
				id: "session-id",
				title: "",
				created_at: "2025-01-01T00:00:00Z",
				updated_at: "2025-01-01T00:00:00Z",
			})

			service.setPath("apiConversationHistoryPath", "/path/to/api.json")

			await vi.advanceTimersByTimeAsync(1000)

			expect(mockCreate).toHaveBeenCalledTimes(2)
		})
	})

	describe("logging", () => {
		it("should log debug messages for successful operations", async () => {
			const mockData = { messages: [] }
			vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockData))

			mockCreate.mockResolvedValueOnce({
				id: "new-session-id",
				title: "",
				created_at: "2025-01-01T00:00:00Z",
				updated_at: "2025-01-01T00:00:00Z",
			})

			service.setPath("apiConversationHistoryPath", "/path/to/api.json")

			await vi.advanceTimersByTimeAsync(1000)

			expect(vi.mocked(logs.debug)).toHaveBeenCalledWith("Creating new session", "SessionService")
			expect(vi.mocked(logs.info)).toHaveBeenCalledWith(
				"Session created successfully",
				"SessionService",
				expect.objectContaining({
					sessionId: "new-session-id",
				}),
			)
		})

		it("should log debug messages for updates", async () => {
			const mockData = { messages: [] }
			vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockData))

			mockCreate.mockResolvedValueOnce({
				id: "session-id",
				title: "",
				created_at: "2025-01-01T00:00:00Z",
				updated_at: "2025-01-01T00:00:00Z",
			})

			service.setPath("apiConversationHistoryPath", "/path/to/api.json")

			await vi.advanceTimersByTimeAsync(1000)

			vi.clearAllMocks()

			mockUpdate.mockResolvedValueOnce({
				id: "session-id",
				title: "",
				updated_at: "2025-01-01T00:01:00Z",
			})

			service.setPath("apiConversationHistoryPath", "/path/to/api.json")

			await vi.advanceTimersByTimeAsync(1000)

			expect(vi.mocked(logs.debug)).toHaveBeenCalledWith(
				"Updating existing session",
				"SessionService",
				expect.objectContaining({
					sessionId: "session-id",
				}),
			)
			expect(vi.mocked(logs.debug)).toHaveBeenCalledWith(
				"Session updated successfully",
				"SessionService",
				expect.objectContaining({
					sessionId: "session-id",
				}),
			)
		})

		it("should log during destroy", async () => {
			await service.destroy()

			expect(vi.mocked(logs.debug)).toHaveBeenCalledWith(
				"Destroying SessionService",
				"SessionService",
				expect.objectContaining({
					sessionId: null,
				}),
			)
			expect(vi.mocked(logs.debug)).toHaveBeenCalledWith("SessionService destroyed", "SessionService")
		})
	})
})
