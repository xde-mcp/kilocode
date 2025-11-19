/**
 * Tests for the /session command
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { sessionCommand } from "../session.js"
import type { CommandContext } from "../core/types.js"
import { createMockContext } from "./helpers/mockContext.js"
import { SessionService } from "../../services/session.js"

// Mock the SessionService
vi.mock("../../services/session.js", () => ({
	SessionService: {
		init: vi.fn(),
	},
}))

describe("sessionCommand", () => {
	let mockContext: CommandContext
	let mockSessionService: Partial<SessionService>

	beforeEach(() => {
		mockContext = createMockContext({
			input: "/session",
		})

		// Create a mock session service instance
		mockSessionService = {
			sessionId: null,
		}

		// Mock SessionService.init to return our mock instance
		vi.mocked(SessionService.init).mockReturnValue(mockSessionService as SessionService)
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
			expect(sessionCommand.examples).toHaveLength(1)
			expect(sessionCommand.examples).toContain("/session show")
		})

		it("should have subcommand argument defined", () => {
			expect(sessionCommand.arguments).toBeDefined()
			expect(sessionCommand.arguments).toHaveLength(1)
			expect(sessionCommand.arguments![0].name).toBe("subcommand")
			expect(sessionCommand.arguments![0].required).toBe(false)
		})

		it("should have 'show' as available subcommand value", () => {
			const subcommandArg = sessionCommand.arguments![0]
			expect(subcommandArg.values).toBeDefined()
			expect(subcommandArg.values).toHaveLength(1)
			expect(subcommandArg.values![0].value).toBe("show")
		})
	})

	describe("handler - no arguments", () => {
		it("should show help message when called without arguments", async () => {
			mockContext.args = []

			await sessionCommand.handler(mockContext)

			expect(mockContext.addMessage).toHaveBeenCalledTimes(1)
			const message = (mockContext.addMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
			expect(message.type).toBe("system")
			expect(message.content).toContain("Session Command")
			expect(message.content).toContain("show")
		})

		it("should not call SessionService when showing help", async () => {
			mockContext.args = []

			await sessionCommand.handler(mockContext)

			expect(SessionService.init).not.toHaveBeenCalled()
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

	describe("handler - invalid subcommand", () => {
		it("should show error for unknown subcommand", async () => {
			mockContext.args = ["invalid"]

			await sessionCommand.handler(mockContext)

			expect(mockContext.addMessage).toHaveBeenCalledTimes(1)
			const message = (mockContext.addMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
			expect(message.type).toBe("error")
			expect(message.content).toContain("Unknown subcommand")
			expect(message.content).toContain("invalid")
		})

		it("should not call SessionService for invalid subcommand", async () => {
			mockContext.args = ["invalid"]

			await sessionCommand.handler(mockContext)

			expect(SessionService.init).not.toHaveBeenCalled()
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
