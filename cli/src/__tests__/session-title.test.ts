/**
 * Tests for session title extraction from first user message
 */

import { describe, it, expect } from "vitest"
import { extractTitleFromFirstUserMessage } from "../services/session.js"
import type { ClineMessage } from "@roo-code/types"

describe("extractTitleFromFirstUserMessage", () => {
	describe("basic extraction", () => {
		it("should extract title from first followup ask message", () => {
			const messages: ClineMessage[] = [
				{
					ts: Date.now(),
					type: "ask",
					ask: "followup",
					text: "Help me write a function to calculate fibonacci numbers",
				},
			]

			const title = extractTitleFromFirstUserMessage(messages)

			expect(title).toBe("Help me write a function to calculate fibonacci numbers")
		})

		it("should extract title from first user_feedback say message", () => {
			const messages: ClineMessage[] = [
				{
					ts: Date.now(),
					type: "say",
					say: "user_feedback",
					text: "Please refactor this code to use async/await",
				},
			]

			const title = extractTitleFromFirstUserMessage(messages)

			expect(title).toBe("Please refactor this code to use async/await")
		})

		it("should extract from first message with text in array", () => {
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
					ask: "followup",
					text: "This is the actual user message",
				},
			]

			const title = extractTitleFromFirstUserMessage(messages)

			expect(title).toBe("This is the actual user message")
		})
	})

	describe("whitespace handling", () => {
		it("should trim leading and trailing whitespace", () => {
			const messages: ClineMessage[] = [
				{
					ts: Date.now(),
					type: "ask",
					ask: "followup",
					text: "   Hello world   ",
				},
			]

			const title = extractTitleFromFirstUserMessage(messages)

			expect(title).toBe("Hello world")
		})

		it("should collapse multiple spaces into single space", () => {
			const messages: ClineMessage[] = [
				{
					ts: Date.now(),
					type: "ask",
					ask: "followup",
					text: "Hello    world    test",
				},
			]

			const title = extractTitleFromFirstUserMessage(messages)

			expect(title).toBe("Hello world test")
		})

		it("should replace newlines with spaces", () => {
			const messages: ClineMessage[] = [
				{
					ts: Date.now(),
					type: "ask",
					ask: "followup",
					text: "Hello\nworld\ntest",
				},
			]

			const title = extractTitleFromFirstUserMessage(messages)

			expect(title).toBe("Hello world test")
		})

		it("should handle tabs and other whitespace", () => {
			const messages: ClineMessage[] = [
				{
					ts: Date.now(),
					type: "ask",
					ask: "followup",
					text: "Hello\t\tworld\r\ntest",
				},
			]

			const title = extractTitleFromFirstUserMessage(messages)

			expect(title).toBe("Hello world test")
		})
	})

	describe("edge cases", () => {
		it("should return null for empty array", () => {
			const title = extractTitleFromFirstUserMessage([])

			expect(title).toBeNull()
		})

		it("should return null for non-array input", () => {
			// @ts-expect-error Testing invalid input
			const title = extractTitleFromFirstUserMessage(null)

			expect(title).toBeNull()
		})

		it("should return null for undefined input", () => {
			// @ts-expect-error Testing invalid input
			const title = extractTitleFromFirstUserMessage(undefined)

			expect(title).toBeNull()
		})

		it("should return null when no messages have text", () => {
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

			const title = extractTitleFromFirstUserMessage(messages)

			expect(title).toBeNull()
		})

		it("should return null when user message has no text", () => {
			const messages: ClineMessage[] = [
				{
					ts: Date.now(),
					type: "ask",
					ask: "followup",
					// No text field
				},
			]

			const title = extractTitleFromFirstUserMessage(messages)

			expect(title).toBeNull()
		})

		it("should return null when user message has empty text", () => {
			const messages: ClineMessage[] = [
				{
					ts: Date.now(),
					type: "ask",
					ask: "followup",
					text: "",
				},
			]

			const title = extractTitleFromFirstUserMessage(messages)

			expect(title).toBeNull()
		})

		it("should return null when user message has only whitespace", () => {
			const messages: ClineMessage[] = [
				{
					ts: Date.now(),
					type: "ask",
					ask: "followup",
					text: "   \n\t  ",
				},
			]

			const title = extractTitleFromFirstUserMessage(messages)

			expect(title).toBeNull()
		})

		it("should skip messages without text and find next valid message", () => {
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

			const title = extractTitleFromFirstUserMessage(messages)

			expect(title).toBe("Valid user message")
		})
	})

	describe("message type behavior", () => {
		it("should extract from any message type with text (first message wins)", () => {
			// The function extracts from the first message with text,
			// regardless of message type
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

			const title = extractTitleFromFirstUserMessage(messages)

			// First message with text wins
			expect(title).toBe("First message with text")
		})

		it("should extract from command ask if it has text", () => {
			const messages: ClineMessage[] = [
				{
					ts: Date.now(),
					type: "ask",
					ask: "command",
					text: "npm install",
				},
			]

			const title = extractTitleFromFirstUserMessage(messages)

			expect(title).toBe("npm install")
		})

		it("should extract from tool ask if it has text", () => {
			const messages: ClineMessage[] = [
				{
					ts: Date.now(),
					type: "ask",
					ask: "tool",
					text: "read_file",
				},
			]

			const title = extractTitleFromFirstUserMessage(messages)

			expect(title).toBe("read_file")
		})
	})
})
