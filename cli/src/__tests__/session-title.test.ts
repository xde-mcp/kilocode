/**
 * Tests for session title generation from first user message
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ClineMessage } from "@roo-code/types"

// Mock the dependencies
vi.mock("../services/logs.js", () => ({
	logs: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}))

vi.mock("../utils/paths", () => ({
	KiloCodePaths: {
		getTasksDir: vi.fn(() => "/mock/tasks"),
	},
}))

vi.mock("./sessionClient", () => ({
	SessionClient: {
		getInstance: vi.fn(() => ({
			create: vi.fn(),
			update: vi.fn(),
			get: vi.fn(),
			share: vi.fn(),
			fork: vi.fn(),
		})),
	},
	CliSessionSharedState: {
		Public: "public",
	},
}))

// Create a mock ExtensionService
const createMockExtensionService = () => ({
	requestSingleCompletion: vi.fn(),
	sendWebviewMessage: vi.fn(),
	on: vi.fn(),
	off: vi.fn(),
	emit: vi.fn(),
	isReady: vi.fn(() => true),
})

// We need to test the generateTitleFromFirstUserMessage method
// Since SessionService is a singleton with private constructor, we'll test it differently
// by creating a test helper that exposes the internal logic

describe("SessionService.generateTitleFromFirstUserMessage", () => {
	let mockExtensionService: ReturnType<typeof createMockExtensionService>

	beforeEach(() => {
		vi.clearAllMocks()
		mockExtensionService = createMockExtensionService()
	})

	describe("short messages (≤140 chars)", () => {
		it("should return short message directly without LLM call", async () => {
			// Import the module dynamically to get fresh instance
			const { SessionService } = await import("../services/session.js")

			// Reset the singleton
			;(SessionService as unknown as { instance: null }).instance = null

			// Initialize with mock
			const service = SessionService.init(mockExtensionService as never, false)

			const messages: ClineMessage[] = [
				{
					ts: Date.now(),
					type: "ask",
					ask: "followup",
					text: "Help me write a function to calculate fibonacci numbers",
				},
			]

			const title = await service.generateTitle(messages)

			expect(title).toBe("Help me write a function to calculate fibonacci numbers")
			expect(mockExtensionService.requestSingleCompletion).not.toHaveBeenCalled()
		})

		it("should trim and collapse whitespace for short messages", async () => {
			const { SessionService } = await import("../services/session.js")
			;(SessionService as unknown as { instance: null }).instance = null
			const service = SessionService.init(mockExtensionService as never, false)

			const messages: ClineMessage[] = [
				{
					ts: Date.now(),
					type: "ask",
					ask: "followup",
					text: "   Hello    world   ",
				},
			]

			const title = await service.generateTitle(messages)

			expect(title).toBe("Hello world")
			expect(mockExtensionService.requestSingleCompletion).not.toHaveBeenCalled()
		})

		it("should replace newlines with spaces for short messages", async () => {
			const { SessionService } = await import("../services/session.js")
			;(SessionService as unknown as { instance: null }).instance = null
			const service = SessionService.init(mockExtensionService as never, false)

			const messages: ClineMessage[] = [
				{
					ts: Date.now(),
					type: "ask",
					ask: "followup",
					text: "Hello\nworld\ntest",
				},
			]

			const title = await service.generateTitle(messages)

			expect(title).toBe("Hello world test")
		})
	})

	describe("long messages (>140 chars)", () => {
		it("should use LLM to summarize long messages", async () => {
			const { SessionService } = await import("../services/session.js")
			;(SessionService as unknown as { instance: null }).instance = null

			mockExtensionService.requestSingleCompletion.mockResolvedValue("Summarized title from LLM")

			const service = SessionService.init(mockExtensionService as never, false)

			const longText = "a".repeat(200) // 200 characters
			const messages: ClineMessage[] = [
				{
					ts: Date.now(),
					type: "ask",
					ask: "followup",
					text: longText,
				},
			]

			const title = await service.generateTitle(messages)

			expect(title).toBe("Summarized title from LLM")
			expect(mockExtensionService.requestSingleCompletion).toHaveBeenCalledTimes(1)
			expect(mockExtensionService.requestSingleCompletion).toHaveBeenCalledWith(
				expect.stringContaining("Summarize the following user request"),
				30000,
			)
		})

		it("should truncate LLM response if still too long", async () => {
			const { SessionService } = await import("../services/session.js")
			;(SessionService as unknown as { instance: null }).instance = null

			// LLM returns something longer than 140 chars
			mockExtensionService.requestSingleCompletion.mockResolvedValue("b".repeat(200))

			const service = SessionService.init(mockExtensionService as never, false)

			const longText = "a".repeat(200)
			const messages: ClineMessage[] = [
				{
					ts: Date.now(),
					type: "ask",
					ask: "followup",
					text: longText,
				},
			]

			const title = await service.generateTitle(messages)

			expect(title!.length).toBeLessThanOrEqual(140)
			expect(title).toMatch(/\.\.\.$/i)
		})

		it("should remove quotes from LLM response", async () => {
			const { SessionService } = await import("../services/session.js")
			;(SessionService as unknown as { instance: null }).instance = null

			mockExtensionService.requestSingleCompletion.mockResolvedValue('"Quoted summary"')

			const service = SessionService.init(mockExtensionService as never, false)

			const longText = "a".repeat(200)
			const messages: ClineMessage[] = [
				{
					ts: Date.now(),
					type: "ask",
					ask: "followup",
					text: longText,
				},
			]

			const title = await service.generateTitle(messages)

			expect(title).toBe("Quoted summary")
		})

		it("should fallback to truncation when LLM fails", async () => {
			const { SessionService } = await import("../services/session.js")
			;(SessionService as unknown as { instance: null }).instance = null

			mockExtensionService.requestSingleCompletion.mockRejectedValue(new Error("LLM error"))

			const service = SessionService.init(mockExtensionService as never, false)

			const longText = "a".repeat(200)
			const messages: ClineMessage[] = [
				{
					ts: Date.now(),
					type: "ask",
					ask: "followup",
					text: longText,
				},
			]

			const title = await service.generateTitle(messages)

			expect(title!.length).toBeLessThanOrEqual(140)
			expect(title).toMatch(/\.\.\.$/i)
			expect(title).toContain("a".repeat(137))
		})
	})

	describe("edge cases", () => {
		it("should return null for empty array", async () => {
			const { SessionService } = await import("../services/session.js")
			;(SessionService as unknown as { instance: null }).instance = null
			const service = SessionService.init(mockExtensionService as never, false)

			const title = await service.generateTitle([])

			expect(title).toBeNull()
		})

		it("should return null for non-array input", async () => {
			const { SessionService } = await import("../services/session.js")
			;(SessionService as unknown as { instance: null }).instance = null
			const service = SessionService.init(mockExtensionService as never, false)

			// @ts-expect-error Testing invalid input
			const title = await service.generateTitle(null)

			expect(title).toBeNull()
		})

		it("should return null for undefined input", async () => {
			const { SessionService } = await import("../services/session.js")
			;(SessionService as unknown as { instance: null }).instance = null
			const service = SessionService.init(mockExtensionService as never, false)

			// @ts-expect-error Testing invalid input
			const title = await service.generateTitle(undefined)

			expect(title).toBeNull()
		})

		it("should return null when no messages have text", async () => {
			const { SessionService } = await import("../services/session.js")
			;(SessionService as unknown as { instance: null }).instance = null
			const service = SessionService.init(mockExtensionService as never, false)

			const messages: ClineMessage[] = [
				{
					ts: Date.now(),
					type: "say",
					say: "api_req_started",
					// No text field
				},
				{
					ts: Date.now(),
					type: "ask",
					ask: "command",
					// No text field
				},
			]

			const title = await service.generateTitle(messages)

			expect(title).toBeNull()
		})

		it("should return null when user message has empty text", async () => {
			const { SessionService } = await import("../services/session.js")
			;(SessionService as unknown as { instance: null }).instance = null
			const service = SessionService.init(mockExtensionService as never, false)

			const messages: ClineMessage[] = [
				{
					ts: Date.now(),
					type: "ask",
					ask: "followup",
					text: "",
				},
			]

			const title = await service.generateTitle(messages)

			expect(title).toBeNull()
		})

		it("should return null when user message has only whitespace", async () => {
			const { SessionService } = await import("../services/session.js")
			;(SessionService as unknown as { instance: null }).instance = null
			const service = SessionService.init(mockExtensionService as never, false)

			const messages: ClineMessage[] = [
				{
					ts: Date.now(),
					type: "ask",
					ask: "followup",
					text: "   \n\t  ",
				},
			]

			const title = await service.generateTitle(messages)

			expect(title).toBeNull()
		})

		it("should skip messages without text and find next valid message", async () => {
			const { SessionService } = await import("../services/session.js")
			;(SessionService as unknown as { instance: null }).instance = null
			const service = SessionService.init(mockExtensionService as never, false)

			const messages: ClineMessage[] = [
				{
					ts: Date.now(),
					type: "ask",
					ask: "followup",
					// No text
				},
				{
					ts: Date.now(),
					type: "say",
					say: "user_feedback",
					text: "Valid user message",
				},
			]

			const title = await service.generateTitle(messages)

			expect(title).toBe("Valid user message")
		})
	})

	describe("message type behavior", () => {
		it("should extract from any message type with text (first message wins)", async () => {
			const { SessionService } = await import("../services/session.js")
			;(SessionService as unknown as { instance: null }).instance = null
			const service = SessionService.init(mockExtensionService as never, false)

			const messages: ClineMessage[] = [
				{
					ts: Date.now(),
					type: "say",
					say: "text",
					text: "First message with text",
				},
				{
					ts: Date.now(),
					type: "ask",
					ask: "followup",
					text: "Second message",
				},
			]

			const title = await service.generateTitle(messages)

			expect(title).toBe("First message with text")
		})

		it("should extract from command ask if it has text", async () => {
			const { SessionService } = await import("../services/session.js")
			;(SessionService as unknown as { instance: null }).instance = null
			const service = SessionService.init(mockExtensionService as never, false)

			const messages: ClineMessage[] = [
				{
					ts: Date.now(),
					type: "ask",
					ask: "command",
					text: "npm install",
				},
			]

			const title = await service.generateTitle(messages)

			expect(title).toBe("npm install")
		})
	})
})
