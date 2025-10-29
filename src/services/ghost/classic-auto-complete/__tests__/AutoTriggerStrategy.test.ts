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
})
