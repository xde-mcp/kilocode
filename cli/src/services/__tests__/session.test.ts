import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { SessionService } from "../session.js"
import { SessionClient } from "../sessionClient.js"
import type { ExtensionService } from "../extension.js"
import type { ClineMessage } from "@roo-code/types"
import { createStore } from "jotai"
import { sessionIdAtom } from "../../state/atoms/session.js"

// Mock fs module
vi.mock("fs", () => ({
	readFileSync: vi.fn(),
	writeFileSync: vi.fn(),
}))

// Mock fs-extra module
vi.mock("fs-extra", () => ({
	ensureDirSync: vi.fn(),
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

// Mock KiloCodePaths
vi.mock("../../utils/paths.js", () => ({
	KiloCodePaths: {
		getTasksDir: vi.fn(() => "/mock/tasks/dir"),
	},
}))

// Import after mocking
import { readFileSync, writeFileSync } from "fs"
import { ensureDirSync } from "fs-extra"
import { logs } from "../logs.js"

describe("SessionService", () => {
	let service: SessionService
	let mockSessionClient: SessionClient
	let mockCreate: ReturnType<typeof vi.fn>
	let mockUpdate: ReturnType<typeof vi.fn>
	let mockGet: ReturnType<typeof vi.fn>
	let mockExtensionService: ExtensionService
	let mockSendWebviewMessage: ReturnType<typeof vi.fn>
	let mockStore: ReturnType<typeof createStore>

	beforeEach(() => {
		vi.useFakeTimers()
		vi.clearAllMocks()

		// Reset the singleton instance before each test
		// @ts-expect-error - Accessing private static property for testing
		SessionService.instance = null

		// Mock ExtensionService
		mockSendWebviewMessage = vi.fn().mockResolvedValue(undefined)
		mockExtensionService = {
			sendWebviewMessage: mockSendWebviewMessage,
		} as unknown as ExtensionService

		// Mock Jotai store
		mockStore = {
			set: vi.fn(),
			get: vi.fn(),
			sub: vi.fn(),
		} as ReturnType<typeof createStore>

		// Mock SessionClient methods
		mockCreate = vi.fn()
		mockUpdate = vi.fn()
		mockGet = vi.fn()
		mockSessionClient = {
			create: mockCreate,
			update: mockUpdate,
			get: mockGet,
		} as unknown as SessionClient

		// Mock SessionClient.getInstance to return our mock
		vi.spyOn(SessionClient, "getInstance").mockReturnValue(mockSessionClient)

		service = SessionService.init(mockExtensionService, mockStore)
	})

	afterEach(async () => {
		await service.destroy()
		vi.restoreAllMocks()
		vi.useRealTimers()
	})

	describe("init", () => {
		it("should throw error when called without extensionService and store on first init", () => {
			// @ts-expect-error - Accessing private static property for testing
			SessionService.instance = null

			expect(() => SessionService.init()).toThrow("extensionService and store required to init SessionService")
		})

		it("should return same instance on multiple calls", () => {
			const instance1 = SessionService.init(mockExtensionService, mockStore)
			const instance2 = SessionService.init()
			expect(instance1).toBe(instance2)
		})

		it("should be a singleton", () => {
			// @ts-expect-error - Accessing private static property for testing
			expect(SessionService.instance).not.toBeNull()
		})

		it("should accept extensionService and store parameters", () => {
			// @ts-expect-error - Accessing private static property for testing
			SessionService.instance = null

			const instance = SessionService.init(mockExtensionService, mockStore)
			expect(instance).toBeInstanceOf(SessionService)
			expect(vi.mocked(logs.debug)).toHaveBeenCalledWith("Initiated SessionService", "SessionService")
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
			SessionService.init(mockExtensionService, mockStore)

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

			describe("restoreSession", () => {
				it("should restore session from remote and write files to disk", async () => {
					const mockSessionData = {
						id: "restored-session-id",
						title: "Restored Session",
						created_at: "2025-01-01T00:00:00Z",
						updated_at: "2025-01-01T00:00:00Z",
						api_conversation_history: { messages: [{ role: "user", content: "test" }] },
						ui_messages: [
							{ say: "text", text: "message 1", ts: 1000 },
							{ say: "checkpoint_saved", text: "", ts: 2000 }, // Should be filtered out
							{ say: "text", text: "message 2", ts: 3000 },
						] as ClineMessage[],
						task_metadata: { task: "test task" },
					}

					mockGet.mockResolvedValueOnce(mockSessionData)

					await service.restoreSession("restored-session-id")

					// Verify SessionClient.get was called with includeBlobs
					expect(mockGet).toHaveBeenCalledWith({
						sessionId: "restored-session-id",
						includeBlobs: true,
					})

					// Verify directory was created
					expect(vi.mocked(ensureDirSync)).toHaveBeenCalledWith("/mock/tasks/dir/restored-session-id")

					// Verify files were written
					expect(vi.mocked(writeFileSync)).toHaveBeenCalledTimes(3)
					expect(vi.mocked(writeFileSync)).toHaveBeenCalledWith(
						"/mock/tasks/dir/restored-session-id/api_conversation_history.json",
						JSON.stringify(mockSessionData.api_conversation_history, null, 2),
					)
					expect(vi.mocked(writeFileSync)).toHaveBeenCalledWith(
						"/mock/tasks/dir/restored-session-id/ui_messages.json",
						expect.stringContaining("message 1"),
					)
					// Verify checkpoint messages were filtered out
					const uiMessagesCall = vi
						.mocked(writeFileSync)
						.mock.calls.find((call) => call[0] === "/mock/tasks/dir/restored-session-id/ui_messages.json")
					expect(uiMessagesCall?.[1]).not.toContain("checkpoint_saved")

					expect(vi.mocked(writeFileSync)).toHaveBeenCalledWith(
						"/mock/tasks/dir/restored-session-id/task_metadata.json",
						JSON.stringify(mockSessionData.task_metadata, null, 2),
					)
				})

				it("should send messages to extension to register task", async () => {
					const mockSessionData = {
						id: "restored-session-id",
						title: "Restored Session",
						created_at: "2025-01-01T12:00:00Z",
						updated_at: "2025-01-01T12:00:00Z",
					}

					mockGet.mockResolvedValueOnce(mockSessionData)

					await service.restoreSession("restored-session-id")

					// Verify addTaskToHistory message was sent
					expect(mockSendWebviewMessage).toHaveBeenCalledWith({
						type: "addTaskToHistory",
						historyItem: {
							id: "restored-session-id",
							number: 1,
							task: "Restored Session",
							ts: new Date("2025-01-01T12:00:00Z").getTime(),
							tokensIn: 0,
							tokensOut: 0,
							totalCost: 0,
						},
					})

					// Verify showTaskWithId message was sent
					expect(mockSendWebviewMessage).toHaveBeenCalledWith({
						type: "showTaskWithId",
						text: "restored-session-id",
					})
				})

				it("should set session ID in atom", async () => {
					const mockSessionData = {
						id: "restored-session-id",
						title: "Restored Session",
						created_at: "2025-01-01T00:00:00Z",
						updated_at: "2025-01-01T00:00:00Z",
					}

					mockGet.mockResolvedValueOnce(mockSessionData)

					await service.restoreSession("restored-session-id")

					// Verify session ID was set in atom
					expect(mockStore.set).toHaveBeenCalledWith(sessionIdAtom, "restored-session-id")
				})

				it("should handle missing session gracefully", async () => {
					mockGet.mockResolvedValueOnce(null)

					await service.restoreSession("non-existent-id")

					expect(vi.mocked(logs.error)).toHaveBeenCalledWith(
						"Failed to obtain session",
						"SessionService",
						expect.objectContaining({
							sessionId: "non-existent-id",
						}),
					)

					// Should not write any files
					expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled()
				})

				it("should handle restore errors gracefully", async () => {
					mockGet.mockRejectedValueOnce(new Error("Network error"))

					await service.restoreSession("error-session-id")

					expect(vi.mocked(logs.error)).toHaveBeenCalledWith(
						"Failed to restore session",
						"SessionService",
						expect.objectContaining({
							error: "Network error",
							sessionId: "error-session-id",
						}),
					)

					// SessionId should be reset to null on error
					// @ts-expect-error - Accessing private property for testing
					expect(service.sessionId).toBeNull()
				})

				it("should skip writing files that are not present in session data", async () => {
					const mockSessionData = {
						id: "partial-session-id",
						title: "Partial Session",
						created_at: "2025-01-01T00:00:00Z",
						updated_at: "2025-01-01T00:00:00Z",
						api_conversation_history: { messages: [] },
						// ui_messages and task_metadata are missing
					}

					mockGet.mockResolvedValueOnce(mockSessionData)

					await service.restoreSession("partial-session-id")

					// Only one file should be written (api_conversation_history)
					expect(vi.mocked(writeFileSync)).toHaveBeenCalledTimes(1)
					expect(vi.mocked(writeFileSync)).toHaveBeenCalledWith(
						"/mock/tasks/dir/partial-session-id/api_conversation_history.json",
						JSON.stringify(mockSessionData.api_conversation_history, null, 2),
					)
				})

				it("should log info messages during restoration", async () => {
					const mockSessionData = {
						id: "session-with-logs",
						title: "Test Session",
						created_at: "2025-01-01T00:00:00Z",
						updated_at: "2025-01-01T00:00:00Z",
					}

					mockGet.mockResolvedValueOnce(mockSessionData)

					await service.restoreSession("session-with-logs")

					expect(vi.mocked(logs.info)).toHaveBeenCalledWith(
						"Restoring session",
						"SessionService",
						expect.objectContaining({
							sessionId: "session-with-logs",
						}),
					)

					expect(vi.mocked(logs.info)).toHaveBeenCalledWith(
						"Task registered with extension",
						"SessionService",
						expect.objectContaining({
							sessionId: "session-with-logs",
							taskId: "session-with-logs",
						}),
					)

					expect(vi.mocked(logs.info)).toHaveBeenCalledWith(
						"Switched to restored task",
						"SessionService",
						expect.objectContaining({
							sessionId: "session-with-logs",
						}),
					)
				})
			})

			describe("Session ID atom management", () => {
				it("should set session ID in atom when creating new session", async () => {
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

					// Verify session ID was set in atom
					expect(mockStore.set).toHaveBeenCalledWith(sessionIdAtom, "new-session-id")
				})

				it("should not update atom for session updates", async () => {
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

					// Clear mock calls
					vi.mocked(mockStore.set).mockClear()

					mockUpdate.mockResolvedValueOnce({
						id: "session-id",
						title: "",
						updated_at: "2025-01-01T00:01:00Z",
					})

					// Trigger update
					service.setPath("apiConversationHistoryPath", "/path/to/api.json")
					await vi.advanceTimersByTimeAsync(1000)

					// Should not call store.set for updates (only for create and restore)
					expect(mockStore.set).not.toHaveBeenCalled()
				})

				it("should clear session ID in atom on destroy", async () => {
					await service.destroy()

					// Verify session ID was cleared in atom
					expect(mockStore.set).toHaveBeenCalledWith(sessionIdAtom, null)
				})
			})
		})
	})
})
