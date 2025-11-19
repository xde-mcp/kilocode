/**
 * Tests for the /session command
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { sessionCommand } from "../session.js"
import type { CommandContext } from "../core/types.js"
import { createMockContext } from "./helpers/mockContext.js"
import { SessionService } from "../../services/session.js"
import { SessionClient } from "../../services/sessionClient.js"

// Mock the SessionService
vi.mock("../../services/session.js", () => ({
	SessionService: {
		init: vi.fn(),
	},
}))

// Mock the SessionClient
vi.mock("../../services/sessionClient.js", () => ({
	SessionClient: {
		getInstance: vi.fn(),
	},
}))

describe("sessionCommand", () => {
	let mockContext: CommandContext
	let mockSessionService: Partial<SessionService>
	let mockSessionClient: Partial<SessionClient>

	beforeEach(() => {
		mockContext = createMockContext({
			input: "/session",
		})

		// Create a mock session service instance
		mockSessionService = {
			sessionId: null,
			restoreSession: vi.fn().mockResolvedValue(undefined),
		}

		// Create a mock session client instance
		mockSessionClient = {
			list: vi.fn().mockResolvedValue({
				sessions: [],
				nextCursor: null,
			}),
		}

		// Mock SessionService.init to return our mock instance
		vi.mocked(SessionService.init).mockReturnValue(mockSessionService as SessionService)

		// Mock SessionClient.getInstance to return our mock instance
		vi.mocked(SessionClient.getInstance).mockReturnValue(mockSessionClient as SessionClient)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("command metadata", () => {
		it("should have correct name", () => {
			expect(sessionCommand.name).toBe("session")
		})

		it("should have empty aliases array", () => {
			expect(sessionCommand.aliases).toEqual([])
		})

		it("should have correct category", () => {
			expect(sessionCommand.category).toBe("system")
		})

		it("should have correct priority", () => {
			expect(sessionCommand.priority).toBe(5)
		})

		it("should have description", () => {
			expect(sessionCommand.description).toBeTruthy()
			expect(sessionCommand.description).toContain("session")
		})

		it("should have usage examples", () => {
			expect(sessionCommand.examples).toHaveLength(3)
			expect(sessionCommand.examples).toContain("/session show")
			expect(sessionCommand.examples).toContain("/session list")
			expect(sessionCommand.examples).toContain("/session select <sessionId>")
		})

		it("should have subcommand argument defined", () => {
			expect(sessionCommand.arguments).toBeDefined()
			expect(sessionCommand.arguments).toHaveLength(2)
			expect(sessionCommand.arguments![0].name).toBe("subcommand")
			expect(sessionCommand.arguments![0].required).toBe(false)
		})

		it("should have all subcommand values defined", () => {
			const subcommandArg = sessionCommand.arguments![0]
			expect(subcommandArg.values).toBeDefined()
			expect(subcommandArg.values).toHaveLength(3)
			expect(subcommandArg.values!.map((v) => v.value)).toEqual(["show", "list", "select"])
		})

		it("should have sessionId argument with autocomplete provider", () => {
			const sessionIdArg = sessionCommand.arguments![1]
			expect(sessionIdArg.name).toBe("sessionId")
			expect(sessionIdArg.required).toBe(false)
			expect(sessionIdArg.provider).toBeDefined()
		})
	})

	describe("handler - no arguments", () => {
		it("should show usage message when called without arguments", async () => {
			mockContext.args = []

			await sessionCommand.handler(mockContext)

			expect(mockContext.addMessage).toHaveBeenCalledTimes(1)
			const message = (mockContext.addMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
			expect(message.type).toBe("system")
			expect(message.content).toContain("Usage: /session")
			expect(message.content).toContain("show")
			expect(message.content).toContain("list")
			expect(message.content).toContain("select")
		})

		it("should not call SessionService when showing usage", async () => {
			mockContext.args = []

			await sessionCommand.handler(mockContext)

			expect(SessionService.init).not.toHaveBeenCalled()
			expect(SessionClient.getInstance).not.toHaveBeenCalled()
		})
	})

	describe("handler - show subcommand", () => {
		it("should display session ID when session exists", async () => {
			const testSessionId = "test-session-123"
			mockSessionService.sessionId = testSessionId
			mockContext.args = ["show"]

			await sessionCommand.handler(mockContext)

			expect(SessionService.init).toHaveBeenCalledTimes(1)
			expect(mockContext.addMessage).toHaveBeenCalledTimes(1)
			const message = (mockContext.addMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
			expect(message.type).toBe("system")
			expect(message.content).toContain("Current Session ID")
			expect(message.content).toContain(testSessionId)
		})

		it("should display message when no session exists", async () => {
			mockSessionService.sessionId = null
			mockContext.args = ["show"]

			await sessionCommand.handler(mockContext)

			expect(SessionService.init).toHaveBeenCalledTimes(1)
			expect(mockContext.addMessage).toHaveBeenCalledTimes(1)
			const message = (mockContext.addMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
			expect(message.type).toBe("system")
			expect(message.content).toContain("No active session")
		})

		it("should handle 'show' subcommand case-insensitively", async () => {
			mockSessionService.sessionId = "test-id"
			mockContext.args = ["SHOW"]

			await sessionCommand.handler(mockContext)

			expect(SessionService.init).toHaveBeenCalledTimes(1)
			expect(mockContext.addMessage).toHaveBeenCalledTimes(1)
		})
	})

	describe("handler - list subcommand", () => {
		it("should display empty sessions list", async () => {
			mockSessionClient.list = vi.fn().mockResolvedValue({
				sessions: [],
				nextCursor: null,
			})
			mockContext.args = ["list"]

			await sessionCommand.handler(mockContext)

			expect(SessionClient.getInstance).toHaveBeenCalled()
			expect(mockSessionClient.list).toHaveBeenCalledWith({ limit: 50 })
			expect(mockContext.addMessage).toHaveBeenCalledTimes(1)
			const message = (mockContext.addMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
			expect(message.type).toBe("system")
			expect(message.content).toContain("No sessions found")
		})

		it("should display sessions list with results", async () => {
			const mockSessions = [
				{
					id: "session-1",
					title: "Test Session 1",
					created_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
					updated_at: new Date().toISOString(),
				},
				{
					id: "session-2",
					title: "Test Session 2",
					created_at: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
					updated_at: new Date().toISOString(),
				},
			]

			mockSessionClient.list = vi.fn().mockResolvedValue({
				sessions: mockSessions,
				nextCursor: null,
			})
			mockContext.args = ["list"]

			await sessionCommand.handler(mockContext)

			expect(mockSessionClient.list).toHaveBeenCalledWith({ limit: 50 })
			expect(mockContext.addMessage).toHaveBeenCalledTimes(1)
			const message = (mockContext.addMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
			expect(message.type).toBe("system")
			expect(message.content).toContain("Available Sessions")
			expect(message.content).toContain("Test Session 1")
			expect(message.content).toContain("Test Session 2")
			expect(message.content).toContain("session-1")
			expect(message.content).toContain("session-2")
		})

		it("should indicate active session in list", async () => {
			mockSessionService.sessionId = "session-active"
			const mockSessions = [
				{
					id: "session-active",
					title: "Active Session",
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				},
				{
					id: "session-inactive",
					title: "Inactive Session",
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				},
			]

			mockSessionClient.list = vi.fn().mockResolvedValue({
				sessions: mockSessions,
				nextCursor: null,
			})
			mockContext.args = ["list"]

			await sessionCommand.handler(mockContext)

			const message = (mockContext.addMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
			expect(message.content).toContain("🟢 [Active]")
		})

		it("should display pagination cursor when available", async () => {
			const mockSessions = Array.from({ length: 50 }, (_, i) => ({
				id: `session-${i}`,
				title: `Session ${i}`,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			}))

			mockSessionClient.list = vi.fn().mockResolvedValue({
				sessions: mockSessions,
				nextCursor: "cursor-next",
			})
			mockContext.args = ["list"]

			await sessionCommand.handler(mockContext)

			const message = (mockContext.addMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
			expect(message.content).toContain("Showing first 50 sessions. More available.")
		})

		it("should handle list error gracefully", async () => {
			mockSessionClient.list = vi.fn().mockRejectedValue(new Error("Network error"))
			mockContext.args = ["list"]

			await sessionCommand.handler(mockContext)

			expect(mockContext.addMessage).toHaveBeenCalledTimes(1)
			const message = (mockContext.addMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
			expect(message.type).toBe("error")
			expect(message.content).toContain("Failed to list sessions")
			expect(message.content).toContain("Network error")
		})

		it("should format relative time correctly", async () => {
			const mockSessions = [
				{
					id: "session-1",
					title: "Just created",
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				},
			]

			mockSessionClient.list = vi.fn().mockResolvedValue({
				sessions: mockSessions,
				nextCursor: null,
			})
			mockContext.args = ["list"]

			await sessionCommand.handler(mockContext)

			const message = (mockContext.addMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
			expect(message.content).toContain("just now")
		})
	})

	describe("handler - select subcommand", () => {
		it("should restore session successfully", async () => {
			mockContext.args = ["select", "session-123"]

			await sessionCommand.handler(mockContext)

			expect(SessionService.init).toHaveBeenCalled()
			expect(mockContext.replaceMessages).toHaveBeenCalledTimes(1)
			expect(mockContext.refreshTerminal).toHaveBeenCalled()
			expect(mockSessionService.restoreSession).toHaveBeenCalledWith("session-123")

			const replacedMessages = (mockContext.replaceMessages as ReturnType<typeof vi.fn>).mock.calls[0][0]
			expect(replacedMessages).toHaveLength(2)
			expect(replacedMessages[1].content).toContain("Restoring session")
			expect(replacedMessages[1].content).toContain("session-123")
		})

		it("should show error when sessionId is missing", async () => {
			mockContext.args = ["select"]

			await sessionCommand.handler(mockContext)

			expect(mockContext.addMessage).toHaveBeenCalledTimes(1)
			const message = (mockContext.addMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
			expect(message.type).toBe("error")
			expect(message.content).toContain("Usage: /session select <sessionId>")
			expect(mockSessionService.restoreSession).not.toHaveBeenCalled()
		})

		it("should show error when sessionId is empty string", async () => {
			mockContext.args = ["select", ""]

			await sessionCommand.handler(mockContext)

			expect(mockContext.addMessage).toHaveBeenCalledTimes(1)
			const message = (mockContext.addMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
			expect(message.type).toBe("error")
			expect(message.content).toContain("Usage: /session select <sessionId>")
		})

		it("should handle restore error gracefully", async () => {
			mockSessionService.restoreSession = vi.fn().mockRejectedValue(new Error("Session not found"))
			mockContext.args = ["select", "invalid-session"]

			await sessionCommand.handler(mockContext)

			expect(mockContext.addMessage).toHaveBeenCalled()
			const errorMessage = (mockContext.addMessage as ReturnType<typeof vi.fn>).mock.calls.find(
				(call) => call[0].type === "error",
			)
			expect(errorMessage).toBeDefined()
			if (errorMessage) {
				expect(errorMessage[0].content).toContain("Failed to restore session")
				expect(errorMessage[0].content).toContain("Session not found")
			}
		})

		it("should handle 'select' subcommand case-insensitively", async () => {
			mockContext.args = ["SELECT", "session-123"]

			await sessionCommand.handler(mockContext)

			expect(mockSessionService.restoreSession).toHaveBeenCalledWith("session-123")
		})
	})

	describe("handler - invalid subcommand", () => {
		it("should show error for unknown subcommand", async () => {
			mockContext.args = ["invalid"]

			await sessionCommand.handler(mockContext)

			expect(mockContext.addMessage).toHaveBeenCalledTimes(1)
			const message = (mockContext.addMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
			expect(message.type).toBe("error")
			expect(message.content).toContain("Unknown subcommand")
			expect(message.content).toContain("invalid")
			expect(message.content).toContain("show")
			expect(message.content).toContain("list")
			expect(message.content).toContain("select")
		})

		it("should not call SessionService for invalid subcommand", async () => {
			mockContext.args = ["invalid"]

			await sessionCommand.handler(mockContext)

			expect(SessionService.init).not.toHaveBeenCalled()
			expect(SessionClient.getInstance).not.toHaveBeenCalled()
		})
	})

	describe("handler - execution", () => {
		it("should execute without errors when session exists", async () => {
			mockSessionService.sessionId = "test-id"
			mockContext.args = ["show"]

			await expect(sessionCommand.handler(mockContext)).resolves.not.toThrow()
		})

		it("should execute without errors when no session exists", async () => {
			mockSessionService.sessionId = null
			mockContext.args = ["show"]

			await expect(sessionCommand.handler(mockContext)).resolves.not.toThrow()
		})

		it("should execute without errors for invalid subcommand", async () => {
			mockContext.args = ["invalid"]

			await expect(sessionCommand.handler(mockContext)).resolves.not.toThrow()
		})
	})

	describe("message generation", () => {
		it("should generate messages with proper structure", async () => {
			mockSessionService.sessionId = "test-id"
			mockContext.args = ["show"]

			await sessionCommand.handler(mockContext)

			const message = (mockContext.addMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
			expect(message).toHaveProperty("id")
			expect(message).toHaveProperty("type")
			expect(message).toHaveProperty("content")
			expect(message).toHaveProperty("ts")
		})
	})
})
