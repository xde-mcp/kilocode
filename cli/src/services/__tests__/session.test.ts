import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { SessionService } from "../session.js"
import { TrpcClient } from "../trpcClient.js"

describe("SessionService", () => {
	let service: SessionService
	let mockTrpcClient: TrpcClient
	let requestMock: ReturnType<typeof vi.fn>

	beforeEach(() => {
		// Reset the singleton instance before each test
		// @ts-expect-error - Accessing private static property for testing
		SessionService.instance = null

		// Mock TrpcClient
		requestMock = vi.fn()
		mockTrpcClient = {
			request: requestMock,
		} as unknown as TrpcClient

		// Mock TrpcClient.getInstance to return our mock
		vi.spyOn(TrpcClient, "getInstance").mockReturnValue(mockTrpcClient)

		service = SessionService.getInstance()
	})

	afterEach(() => {
		vi.restoreAllMocks()
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

	describe("get", () => {
		it("should get session without blobs", async () => {
			const mockSession = {
				id: "session-1",
				title: "Test Session",
				created_at: "2025-01-01T00:00:00Z",
				updated_at: "2025-01-01T00:00:00Z",
			}

			requestMock.mockResolvedValueOnce({
				result: { data: mockSession },
			})

			const result = await service.get({
				sessionId: "session-1",
			})

			expect(requestMock).toHaveBeenCalledWith("sessions.get", "GET", {
				sessionId: "session-1",
			})
			expect(result).toEqual(mockSession)
		})

		it("should get session with blobs", async () => {
			const mockSession = {
				id: "session-1",
				title: "Test Session",
				api_conversation_history: { messages: [] },
				task_metadata: { task: "test" },
				ui_messages: [{ type: "user", content: "hello" }],
				created_at: "2025-01-01T00:00:00Z",
				updated_at: "2025-01-01T00:00:00Z",
			}

			requestMock.mockResolvedValueOnce({
				result: { data: mockSession },
			})

			const result = await service.get({
				sessionId: "session-1",
				includeBlobs: true,
			})

			expect(requestMock).toHaveBeenCalledWith("sessions.get", "GET", {
				sessionId: "session-1",
				includeBlobs: true,
			})
			expect(result).toEqual(mockSession)
		})

		it("should handle NOT_FOUND error", async () => {
			requestMock.mockRejectedValueOnce(new Error("tRPC request failed: 404 Not Found - Session not found"))

			await expect(
				service.get({
					sessionId: "non-existent",
				}),
			).rejects.toThrow("Session not found")
		})
	})

	describe("create", () => {
		it("should create session with default title", async () => {
			const mockSession = {
				id: "new-session-1",
				title: "",
				created_at: "2025-01-01T00:00:00Z",
				updated_at: "2025-01-01T00:00:00Z",
			}

			requestMock.mockResolvedValueOnce({
				result: { data: mockSession },
			})

			const result = await service.create({})

			expect(requestMock).toHaveBeenCalledWith("sessions.create", "POST", {})
			expect(result).toEqual(mockSession)
		})

		it("should create session with title", async () => {
			const mockSession = {
				id: "new-session-2",
				title: "My Session",
				created_at: "2025-01-01T00:00:00Z",
				updated_at: "2025-01-01T00:00:00Z",
			}

			requestMock.mockResolvedValueOnce({
				result: { data: mockSession },
			})

			const result = await service.create({
				title: "My Session",
			})

			expect(requestMock).toHaveBeenCalledWith("sessions.create", "POST", {
				title: "My Session",
			})
			expect(result).toEqual(mockSession)
		})

		it("should create session with all fields", async () => {
			const mockSession = {
				id: "new-session-3",
				title: "Full Session",
				created_at: "2025-01-01T00:00:00Z",
				updated_at: "2025-01-01T00:00:00Z",
			}

			const input = {
				title: "Full Session",
				api_conversation_history: { messages: [{ role: "user", content: "hello" }] },
				task_metadata: { complexity: "high" },
				ui_messages: [{ type: "user", text: "hello" }],
			}

			requestMock.mockResolvedValueOnce({
				result: { data: mockSession },
			})

			const result = await service.create(input)

			expect(requestMock).toHaveBeenCalledWith("sessions.create", "POST", input)
			expect(result).toEqual(mockSession)
		})
	})

	describe("update", () => {
		it("should update session title", async () => {
			const mockSession = {
				id: "session-1",
				title: "Updated Title",
				updated_at: "2025-01-02T00:00:00Z",
			}

			requestMock.mockResolvedValueOnce({
				result: { data: mockSession },
			})

			const result = await service.update({
				sessionId: "session-1",
				title: "Updated Title",
			})

			expect(requestMock).toHaveBeenCalledWith("sessions.update", "POST", {
				sessionId: "session-1",
				title: "Updated Title",
			})
			expect(result).toEqual(mockSession)
		})

		it("should update session with multiple fields", async () => {
			const mockSession = {
				id: "session-1",
				title: "Updated Session",
				updated_at: "2025-01-02T00:00:00Z",
			}

			const input = {
				sessionId: "session-1",
				title: "Updated Session",
				api_conversation_history: { messages: [] },
				task_metadata: { updated: true },
			}

			requestMock.mockResolvedValueOnce({
				result: { data: mockSession },
			})

			const result = await service.update(input)

			expect(requestMock).toHaveBeenCalledWith("sessions.update", "POST", input)
			expect(result).toEqual(mockSession)
		})

		it("should handle NOT_FOUND error on update", async () => {
			requestMock.mockRejectedValueOnce(new Error("tRPC request failed: 404 Not Found - Session not found"))

			await expect(
				service.update({
					sessionId: "non-existent",
					title: "New Title",
				}),
			).rejects.toThrow("Session not found")
		})

		it("should handle BAD_REQUEST error when no fields to update", async () => {
			requestMock.mockRejectedValueOnce(new Error("tRPC request failed: 400 Bad Request - No fields to update"))

			await expect(
				service.update({
					sessionId: "session-1",
				}),
			).rejects.toThrow("No fields to update")
		})
	})

	describe("error handling", () => {
		it("should propagate network errors", async () => {
			requestMock.mockRejectedValueOnce(new Error("Network error"))

			await expect(service.get({ sessionId: "session-1" })).rejects.toThrow("Network error")
		})

		it("should propagate authorization errors", async () => {
			requestMock.mockRejectedValueOnce(new Error("tRPC request failed: 401 Unauthorized - Invalid token"))

			await expect(service.get({ sessionId: "session-1" })).rejects.toThrow("Invalid token")
		})

		it("should propagate validation errors", async () => {
			requestMock.mockRejectedValueOnce(new Error("tRPC request failed: 400 Bad Request - Invalid input"))

			await expect(
				service.create({
					title: "a".repeat(200), // Too long
				}),
			).rejects.toThrow("Invalid input")
		})
	})

	describe("type safety", () => {
		it("should handle typed responses correctly", async () => {
			const mockSession = {
				id: "uuid-string",
				title: "Typed Session",
				created_at: "2025-01-01T00:00:00.000Z",
				updated_at: "2025-01-01T00:00:00.000Z",
			}

			requestMock.mockResolvedValueOnce({
				result: { data: mockSession },
			})

			const result = await service.get({
				sessionId: "uuid-string",
			})

			expect(typeof result.id).toBe("string")
			expect(typeof result.title).toBe("string")
			expect(typeof result.created_at).toBe("string")
			expect(typeof result.updated_at).toBe("string")
		})

		it("should handle sessions with blobs correctly", async () => {
			const mockSession = {
				id: "uuid-string",
				title: "Session with Blobs",
				api_conversation_history: { messages: [] },
				task_metadata: { key: "value" },
				ui_messages: [],
				created_at: "2025-01-01T00:00:00.000Z",
				updated_at: "2025-01-01T00:00:00.000Z",
			}

			requestMock.mockResolvedValueOnce({
				result: { data: mockSession },
			})

			const result = await service.get({
				sessionId: "uuid-string",
				includeBlobs: true,
			})

			// Result should have blob fields when includeBlobs is true
			expect("api_conversation_history" in result).toBe(true)
			expect("task_metadata" in result).toBe(true)
			expect("ui_messages" in result).toBe(true)
		})
	})
})
