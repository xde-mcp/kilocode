import { Anthropic } from "@anthropic-ai/sdk"
import { TelemetryService } from "@roo-code/telemetry"
import { deduplicateToolUseBlocks, DuplicateToolUseError } from "../deduplicateToolUseBlocks"

// Mock TelemetryService
vi.mock("@roo-code/telemetry", () => ({
	TelemetryService: {
		hasInstance: vi.fn(() => true),
		instance: {
			captureException: vi.fn(),
		},
	},
}))

describe("deduplicateToolUseBlocks", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("when there are no duplicates", () => {
		it("should return the message unchanged", () => {
			const assistantMessage: Anthropic.MessageParam = {
				role: "assistant",
				content: [
					{
						type: "text",
						text: "Let me help you with that.",
					},
					{
						type: "tool_use",
						id: "tool-1",
						name: "read_file",
						input: { path: "test.txt" },
					},
					{
						type: "tool_use",
						id: "tool-2",
						name: "write_to_file",
						input: { path: "output.txt", content: "test" },
					},
				],
			}

			const result = deduplicateToolUseBlocks(assistantMessage)

			expect(result).toEqual(assistantMessage)
			expect(TelemetryService.instance.captureException).not.toHaveBeenCalled()
		})

		it("should return non-assistant messages unchanged", () => {
			const userMessage: Anthropic.MessageParam = {
				role: "user",
				content: [
					{
						type: "tool_result",
						tool_use_id: "tool-1",
						content: "Result",
					},
				],
			}

			const result = deduplicateToolUseBlocks(userMessage)

			expect(result).toEqual(userMessage)
		})

		it("should return string content unchanged", () => {
			const assistantMessage: Anthropic.MessageParam = {
				role: "assistant",
				content: "Just a text message",
			}

			const result = deduplicateToolUseBlocks(assistantMessage)

			expect(result).toEqual(assistantMessage)
		})
	})

	describe("when there are duplicate tool_use IDs", () => {
		it("should remove duplicate tool_use blocks with the same ID", () => {
			const assistantMessage: Anthropic.MessageParam = {
				role: "assistant",
				content: [
					{
						type: "tool_use",
						id: "toolu_01ABU1BGwKQY5cGhzxVzF7QN",
						name: "ask_followup_question",
						input: { question: "First question?" },
					},
					{
						type: "tool_use",
						id: "toolu_01ABU1BGwKQY5cGhzxVzF7QN", // DUPLICATE
						name: "ask_followup_question",
						input: { question: "First question?" },
					},
				],
			}

			const result = deduplicateToolUseBlocks(assistantMessage)

			expect(Array.isArray(result.content)).toBe(true)
			const resultContent = result.content as Anthropic.ContentBlockParam[]
			expect(resultContent.length).toBe(1)
			expect((resultContent[0] as Anthropic.ToolUseBlockParam).id).toBe("toolu_01ABU1BGwKQY5cGhzxVzF7QN")
		})

		it("should keep the first occurrence of duplicate IDs", () => {
			const assistantMessage: Anthropic.MessageParam = {
				role: "assistant",
				content: [
					{
						type: "tool_use",
						id: "tool-dup",
						name: "read_file",
						input: { path: "first.txt" },
					},
					{
						type: "tool_use",
						id: "tool-unique",
						name: "write_to_file",
						input: { path: "output.txt", content: "data" },
					},
					{
						type: "tool_use",
						id: "tool-dup", // DUPLICATE - should be removed
						name: "read_file",
						input: { path: "second.txt" }, // Different input, same ID
					},
				],
			}

			const result = deduplicateToolUseBlocks(assistantMessage)

			expect(Array.isArray(result.content)).toBe(true)
			const resultContent = result.content as Anthropic.ContentBlockParam[]
			expect(resultContent.length).toBe(2)
			expect((resultContent[0] as Anthropic.ToolUseBlockParam).id).toBe("tool-dup")
			expect((resultContent[0] as Anthropic.ToolUseBlockParam).input).toEqual({ path: "first.txt" })
			expect((resultContent[1] as Anthropic.ToolUseBlockParam).id).toBe("tool-unique")
		})

		it("should preserve text blocks while removing duplicates", () => {
			const assistantMessage: Anthropic.MessageParam = {
				role: "assistant",
				content: [
					{
						type: "text",
						text: "I'll read the file for you.",
					},
					{
						type: "tool_use",
						id: "tool-1",
						name: "read_file",
						input: { path: "test.txt" },
					},
					{
						type: "tool_use",
						id: "tool-1", // DUPLICATE
						name: "read_file",
						input: { path: "test.txt" },
					},
				],
			}

			const result = deduplicateToolUseBlocks(assistantMessage)

			expect(Array.isArray(result.content)).toBe(true)
			const resultContent = result.content as Anthropic.ContentBlockParam[]
			expect(resultContent.length).toBe(2)
			expect(resultContent[0].type).toBe("text")
			expect((resultContent[0] as Anthropic.TextBlockParam).text).toBe("I'll read the file for you.")
			expect(resultContent[1].type).toBe("tool_use")
			expect((resultContent[1] as Anthropic.ToolUseBlockParam).id).toBe("tool-1")
		})

		it("should handle multiple duplicate IDs", () => {
			const assistantMessage: Anthropic.MessageParam = {
				role: "assistant",
				content: [
					{
						type: "tool_use",
						id: "id-A",
						name: "read_file",
						input: { path: "a.txt" },
					},
					{
						type: "tool_use",
						id: "id-A", // DUPLICATE
						name: "read_file",
						input: { path: "a.txt" },
					},
					{
						type: "tool_use",
						id: "id-B",
						name: "write_to_file",
						input: { path: "b.txt", content: "data" },
					},
					{
						type: "tool_use",
						id: "id-B", // DUPLICATE
						name: "write_to_file",
						input: { path: "b.txt", content: "data" },
					},
				],
			}

			const result = deduplicateToolUseBlocks(assistantMessage)

			expect(Array.isArray(result.content)).toBe(true)
			const resultContent = result.content as Anthropic.ContentBlockParam[]
			expect(resultContent.length).toBe(2)
			expect((resultContent[0] as Anthropic.ToolUseBlockParam).id).toBe("id-A")
			expect((resultContent[1] as Anthropic.ToolUseBlockParam).id).toBe("id-B")
		})

		it("should handle 3+ duplicates of the same ID", () => {
			const assistantMessage: Anthropic.MessageParam = {
				role: "assistant",
				content: [
					{ type: "tool_use", id: "same-id", name: "read_file", input: { v: 1 } },
					{ type: "tool_use", id: "same-id", name: "read_file", input: { v: 2 } },
					{ type: "tool_use", id: "same-id", name: "read_file", input: { v: 3 } },
					{ type: "tool_use", id: "same-id", name: "read_file", input: { v: 4 } },
					{ type: "tool_use", id: "same-id", name: "read_file", input: { v: 5 } },
				],
			}

			const result = deduplicateToolUseBlocks(assistantMessage)

			expect(Array.isArray(result.content)).toBe(true)
			const resultContent = result.content as Anthropic.ContentBlockParam[]
			expect(resultContent.length).toBe(1)
			expect((resultContent[0] as Anthropic.ToolUseBlockParam).input).toEqual({ v: 1 })

			// Telemetry should report unique ID, not 4 duplicates of same string
			expect(TelemetryService.instance.captureException).toHaveBeenCalledWith(
				expect.any(DuplicateToolUseError),
				expect.objectContaining({
					duplicateIds: ["same-id"], // Should be deduplicated
					totalToolUseCount: 5,
					uniqueToolUseCount: 1,
				}),
			)
		})

		it("should handle mixed content with text between duplicate tool_uses", () => {
			const assistantMessage: Anthropic.MessageParam = {
				role: "assistant",
				content: [
					{ type: "text", text: "Starting..." },
					{ type: "tool_use", id: "id-A", name: "read_file", input: { path: "a.txt" } },
					{ type: "text", text: "Middle text" },
					{ type: "tool_use", id: "id-B", name: "write_file", input: { path: "b.txt" } },
					{ type: "tool_use", id: "id-A", name: "read_file", input: { path: "a2.txt" } }, // DUP
					{ type: "text", text: "More text" },
					{ type: "tool_use", id: "id-B", name: "write_file", input: { path: "b2.txt" } }, // DUP
					{ type: "text", text: "Done" },
				],
			}

			const result = deduplicateToolUseBlocks(assistantMessage)

			expect(Array.isArray(result.content)).toBe(true)
			const resultContent = result.content as Anthropic.ContentBlockParam[]
			expect(resultContent.length).toBe(6) // 4 text + 2 unique tool_use
			expect(resultContent[0].type).toBe("text")
			expect(resultContent[1].type).toBe("tool_use")
			expect((resultContent[1] as Anthropic.ToolUseBlockParam).id).toBe("id-A")
			expect(resultContent[2].type).toBe("text")
			expect(resultContent[3].type).toBe("tool_use")
			expect((resultContent[3] as Anthropic.ToolUseBlockParam).id).toBe("id-B")
			expect(resultContent[4].type).toBe("text")
			expect(resultContent[5].type).toBe("text")
		})

		it("should keep tool_use blocks with invalid/missing IDs", () => {
			const assistantMessage: Anthropic.MessageParam = {
				role: "assistant",
				content: [
					{ type: "tool_use", id: "valid-id", name: "read_file", input: {} },
					{ type: "tool_use", id: "", name: "empty_id", input: {} }, // Empty ID
					{ type: "tool_use", id: "valid-id", name: "read_file", input: {} }, // DUP
				],
			}

			const result = deduplicateToolUseBlocks(assistantMessage)

			expect(Array.isArray(result.content)).toBe(true)
			const resultContent = result.content as Anthropic.ContentBlockParam[]
			expect(resultContent.length).toBe(2) // valid-id + empty-id (kept), duplicate removed
		})
	})

	describe("telemetry", () => {
		it("should report duplicates to telemetry", () => {
			const assistantMessage: Anthropic.MessageParam = {
				role: "assistant",
				content: [
					{
						type: "tool_use",
						id: "tool-dup",
						name: "read_file",
						input: { path: "test.txt" },
					},
					{
						type: "tool_use",
						id: "tool-dup", // DUPLICATE
						name: "read_file",
						input: { path: "test.txt" },
					},
				],
			}

			deduplicateToolUseBlocks(assistantMessage)

			expect(TelemetryService.instance.captureException).toHaveBeenCalledTimes(1)
			expect(TelemetryService.instance.captureException).toHaveBeenCalledWith(
				expect.any(DuplicateToolUseError),
				expect.objectContaining({
					duplicateIds: ["tool-dup"],
					totalToolUseCount: 2,
					uniqueToolUseCount: 1,
				}),
			)
		})

		it("should not report when there are no duplicates", () => {
			const assistantMessage: Anthropic.MessageParam = {
				role: "assistant",
				content: [
					{
						type: "tool_use",
						id: "tool-1",
						name: "read_file",
						input: { path: "test.txt" },
					},
				],
			}

			deduplicateToolUseBlocks(assistantMessage)

			expect(TelemetryService.instance.captureException).not.toHaveBeenCalled()
		})
	})

	describe("DuplicateToolUseError", () => {
		it("should create error with correct properties", () => {
			const error = new DuplicateToolUseError("Duplicate detected", ["id-1", "id-2"], 5)

			expect(error.name).toBe("DuplicateToolUseError")
			expect(error.message).toBe("Duplicate detected")
			expect(error.duplicateIds).toEqual(["id-1", "id-2"])
			expect(error.totalToolUseCount).toBe(5)
		})
	})
})
