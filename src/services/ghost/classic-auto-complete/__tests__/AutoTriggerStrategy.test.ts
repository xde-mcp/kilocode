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
		it("should generate prompts with QUERY/FILL_HERE format", async () => {
			const { systemPrompt, userPrompt } = await strategy.getPrompts(
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
			expect(userPrompt).toContain("COMPLETION")
		})

		it("should document context format in system prompt", async () => {
			const { systemPrompt } = await strategy.getPrompts(
				createAutocompleteInput("/test.ts", 0, 13),
				"const x = 1;\n",
				"",
				"typescript",
			)

			expect(systemPrompt).toContain("Context Format")
			expect(systemPrompt).toContain("<LANGUAGE>")
			expect(systemPrompt).toContain("<QUERY>")
		})

		it("should include language ID in prompt with XML tags", async () => {
			const { userPrompt } = await strategy.getPrompts(
				createAutocompleteInput("/test.ts", 0, 13),
				"const x = 1;\n",
				"",
				"typescript",
			)

			expect(userPrompt).toContain("<LANGUAGE>typescript</LANGUAGE>")
		})

		it("should include context in QUERY when context provider not set", async () => {
			const input = createAutocompleteInput("/test.ts", 5, 0)
			input.recentlyEditedRanges = [
				{
					filepath: "/test.ts",
					range: { start: { line: 2, character: 0 }, end: { line: 3, character: 0 } },
					timestamp: Date.now(),
					lines: ["function sum(a, b) {"],
					symbols: new Set(["sum"]),
				},
			]

			const { userPrompt } = await strategy.getPrompts(input, "const x = 1;\n", "", "typescript")

			// Context is now comment-wrapped inside QUERY, not as separate XML tags
			expect(userPrompt).toContain("<QUERY>")
			expect(userPrompt).toContain("{{FILL_HERE}}")
		})

		it("should handle empty context gracefully", async () => {
			const { userPrompt } = await strategy.getPrompts(
				createAutocompleteInput("/test.ts", 0, 13),
				"const x = 1;\n",
				"",
				"typescript",
			)

			expect(userPrompt).toContain("<LANGUAGE>typescript</LANGUAGE>")
		})

		it("should handle comments in code", async () => {
			const { systemPrompt, userPrompt } = await strategy.getPrompts(
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
			expect(userPrompt).toContain("COMPLETION")
		})
	})
})
