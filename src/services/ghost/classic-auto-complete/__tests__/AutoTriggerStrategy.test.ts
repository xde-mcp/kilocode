import { describe, it, expect, beforeEach } from "vitest"
import { AutoTriggerStrategy } from "../AutoTriggerStrategy"
import { AutocompleteInput } from "../../types"
import crypto from "crypto"

function createAutocompleteInput(
	filepath: string = "/test.ts",
	line: number = 0,
	character: number = 0,
): AutocompleteInput {
	return {
		isUntitledFile: false,
		completionId: crypto.randomUUID(),
		filepath,
		pos: { line, character },
		recentlyVisitedRanges: [],
		recentlyEditedRanges: [],
	}
}

describe("AutoTriggerStrategy", () => {
	let strategy: AutoTriggerStrategy

	beforeEach(() => {
		strategy = new AutoTriggerStrategy()
	})

	describe("shouldTreatAsComment", () => {
		it("should return true when current line is a comment", () => {
			const prefix = "// TODO: implement"
			const result = strategy.shouldTreatAsComment(prefix, "typescript")
			expect(result).toBe(true)
		})

		it("should return true when current line is empty and previous line is a comment", () => {
			const prefix = "// TODO: implement\n"
			const result = strategy.shouldTreatAsComment(prefix, "typescript")
			expect(result).toBe(true)
		})

		it("should return false when current line is not a comment", () => {
			const prefix = "const x = 1;"
			const result = strategy.shouldTreatAsComment(prefix, "typescript")
			expect(result).toBe(false)
		})

		it("should return false when current line is empty and previous line is not a comment", () => {
			const prefix = "const x = 1;\n"
			const result = strategy.shouldTreatAsComment(prefix, "typescript")
			expect(result).toBe(false)
		})

		it("should return false when prefix is empty", () => {
			const prefix = ""
			const result = strategy.shouldTreatAsComment(prefix, "typescript")
			expect(result).toBe(false)
		})

		it("should handle Python comments", () => {
			const prefix = "# TODO: implement"
			const result = strategy.shouldTreatAsComment(prefix, "python")
			expect(result).toBe(true)
		})

		it("should handle block comments", () => {
			const prefix = "/* TODO: implement */"
			const result = strategy.shouldTreatAsComment(prefix, "javascript")
			expect(result).toBe(true)
		})

		it("should handle multi-line prefix with comment on last line", () => {
			const prefix = "const x = 1;\nconst y = 2;\n// TODO: implement sum"
			const result = strategy.shouldTreatAsComment(prefix, "typescript")
			expect(result).toBe(true)
		})

		it("should handle multi-line prefix with empty last line after comment", () => {
			const prefix = "const x = 1;\n// TODO: implement sum\n"
			const result = strategy.shouldTreatAsComment(prefix, "typescript")
			expect(result).toBe(true)
		})
	})

	describe("getPrompts - comment-driven behavior", () => {
		it("should use comment-specific prompts when cursor is on empty line after comment", () => {
			const { systemPrompt, userPrompt } = strategy.getPrompts(
				createAutocompleteInput("/test.ts", 1, 0),
				"// TODO: implement sum function\n",
				"",
				"typescript",
			)

			// Verify system prompt contains comment-specific keywords
			expect(systemPrompt.toLowerCase()).toContain("comment")
			expect(systemPrompt).toContain("implements code based on comments")

			// Verify user prompt contains comment context
			expect(userPrompt).toContain("Comment to implement: TODO: implement sum function")
		})

		it("should use comment-specific prompts when cursor is on comment line", () => {
			const { systemPrompt, userPrompt } = strategy.getPrompts(
				createAutocompleteInput("/test.ts", 0, 26),
				"// FIXME: handle edge case",
				"\n",
				"typescript",
			)

			// Verify system prompt contains comment-specific keywords
			expect(systemPrompt.toLowerCase()).toContain("comment")
			expect(systemPrompt).toContain("implements code based on comments")

			// Verify user prompt contains comment context
			expect(userPrompt).toContain("Comment to implement: FIXME: handle edge case")
		})
	})

	describe("getPrompts - auto-trigger behavior", () => {
		it("should use auto-trigger prompts for regular code completion", () => {
			const { systemPrompt, userPrompt } = strategy.getPrompts(
				createAutocompleteInput("/test.ts", 0, 13),
				"const x = 1;\n",
				"",
				"typescript",
			)

			// Verify system prompt contains auto-trigger keywords
			expect(systemPrompt).toContain("Auto-Completion")
			expect(systemPrompt).toContain("non-intrusive")

			// Verify user prompt uses CODE tags instead of markdown code blocks
			expect(userPrompt).toContain("Fill in the missing code at <<<FILL_HERE>>>")
			expect(userPrompt).toContain("Return ONLY the code that belongs at <<<FILL_HERE>>>")
			expect(userPrompt).toContain("<CODE>")
			// Should not use markdown code blocks for code sections
			expect(userPrompt).not.toMatch(/```typescript/)
			expect(userPrompt).not.toMatch(/```\nconst x = 1;/)
		})

		it("should not treat empty line without preceding comment as comment-driven", () => {
			const { systemPrompt } = strategy.getPrompts(
				createAutocompleteInput("/test.ts", 1, 0),
				"const x = 1;\n",
				"\n",
				"typescript",
			)

			// Should use auto-trigger, not comment-driven
			expect(systemPrompt).toContain("Auto-Completion")
			expect(systemPrompt).not.toContain("Comment-Driven")
		})
	})

	describe("trimTrailingIndentation", () => {
		it("should remove trailing tabs followed by newline from prefix", () => {
			const prefix = "'POST',\n\t\t\t\n"
			const { userPrompt } = strategy.getPrompts(
				createAutocompleteInput("/test.js", 2, 0),
				prefix,
				"",
				"javascript",
			)
			// The prefix in the prompt should not contain the trailing indentation
			expect(userPrompt).toContain("'POST',\n")
			expect(userPrompt).not.toContain("\t\t\t")
		})

		it("should remove trailing spaces followed by newline from prefix", () => {
			const prefix = "const x = 1;\n    \n"
			const { userPrompt } = strategy.getPrompts(
				createAutocompleteInput("/test.js", 1, 0),
				prefix,
				"",
				"javascript",
			)
			// The prefix in the prompt should not contain the trailing spaces
			expect(userPrompt).toContain("const x = 1;\n")
			expect(userPrompt).not.toMatch(/\n    \n/)
		})

		it("should remove trailing tabs without final newline from prefix", () => {
			const prefix = "function test() {\n\t\t"
			const { userPrompt } = strategy.getPrompts(
				createAutocompleteInput("/test.js", 1, 2),
				prefix,
				"",
				"javascript",
			)
			// The prefix should have trailing tabs removed, ending with just newline
			expect(userPrompt).toContain("function test() {\n")
			expect(userPrompt).not.toContain("\t\t")
		})

		it("should not modify prefix without trailing indentation", () => {
			const prefix = "const x = 1;"
			const { userPrompt } = strategy.getPrompts(
				createAutocompleteInput("/test.js", 0, 13),
				prefix,
				"",
				"javascript",
			)
			expect(userPrompt).toContain("const x = 1;")
		})

		it("should not modify prefix ending with code on last line", () => {
			const prefix = "const x = 1;\nconst y = "
			const { userPrompt } = strategy.getPrompts(
				createAutocompleteInput("/test.js", 1, 11),
				prefix,
				"",
				"javascript",
			)
			expect(userPrompt).toContain("const y = ")
		})

		it("should handle mixed tabs and spaces in trailing indentation", () => {
			const prefix = "class Test {\n\t  \t\n"
			const { userPrompt } = strategy.getPrompts(
				createAutocompleteInput("/test.js", 1, 0),
				prefix,
				"",
				"javascript",
			)
			expect(userPrompt).toContain("class Test {\n")
			expect(userPrompt).not.toMatch(/\n\t  \t/)
		})
	})
})
