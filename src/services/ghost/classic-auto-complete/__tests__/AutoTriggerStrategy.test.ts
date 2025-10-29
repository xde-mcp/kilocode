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

	describe("getPrompts", () => {
		it("should generate prompts with QUERY/FILL_HERE format", () => {
			const { systemPrompt, userPrompt } = strategy.getPrompts(
				createAutocompleteInput("/test.ts", 0, 13),
				"const x = 1;\n",
				"",
				"typescript",
			)

			// Verify system prompt contains auto-trigger keywords
			expect(systemPrompt).toContain("Auto-Completion")
			expect(systemPrompt).toContain("non-intrusive")

			// Verify user prompt uses QUERY/FILL_HERE format
			expect(userPrompt).toContain("<QUERY>")
			expect(userPrompt).toContain("{{FILL_HERE}}")
			expect(userPrompt).toContain("</QUERY>")
			expect(userPrompt).toContain("<COMPLETION>")
		})

		it("should handle comments in code", () => {
			const { systemPrompt, userPrompt } = strategy.getPrompts(
				createAutocompleteInput("/test.ts", 1, 0),
				"// TODO: implement sum function\n",
				"",
				"typescript",
			)

			// Should use same prompt format
			expect(systemPrompt).toContain("Auto-Completion")
			expect(userPrompt).toContain("<QUERY>")
			expect(userPrompt).toContain("{{FILL_HERE}}")
			expect(userPrompt).toContain("</QUERY>")
			expect(userPrompt).toContain("<COMPLETION>")
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
			expect(userPrompt).toContain("'POST',\n{{FILL_HERE}}")
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
			expect(userPrompt).toContain("const x = 1;\n{{FILL_HERE}}")
			expect(userPrompt).not.toMatch(/    \n/)
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
			expect(userPrompt).toContain("function test() {\n{{FILL_HERE}}")
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
			expect(userPrompt).toContain("const x = 1;{{FILL_HERE}}")
		})

		it("should not modify prefix ending with code on last line", () => {
			const prefix = "const x = 1;\nconst y = "
			const { userPrompt } = strategy.getPrompts(
				createAutocompleteInput("/test.js", 1, 11),
				prefix,
				"",
				"javascript",
			)
			expect(userPrompt).toContain("const y = {{FILL_HERE}}")
		})

		it("should handle mixed tabs and spaces in trailing indentation", () => {
			const prefix = "class Test {\n\t  \t\n"
			const { userPrompt } = strategy.getPrompts(
				createAutocompleteInput("/test.js", 1, 0),
				prefix,
				"",
				"javascript",
			)
			expect(userPrompt).toContain("class Test {\n{{FILL_HERE}}")
			expect(userPrompt).not.toMatch(/\t  \t/)
		})
	})
})
