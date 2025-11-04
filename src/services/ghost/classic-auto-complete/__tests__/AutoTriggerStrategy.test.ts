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
		it("should generate basic prompt without context provider", async () => {
			const { systemPrompt, userPrompt } = await strategy.getPrompts(
				createAutocompleteInput("/test.ts", 0, 13),
				"const x = 1;\n",
				"",
				"typescript",
			)

			expect(systemPrompt).toContain("Auto-Completion")
			expect(systemPrompt).toContain("Context Format")

			const expected = `<LANGUAGE>typescript</LANGUAGE>

<QUERY>
const x = 1;
{{FILL_HERE}}
</QUERY>

TASK: Fill the {{FILL_HERE}} hole. Answer only with the CORRECT completion, and NOTHING ELSE. Do it now.
Return the COMPLETION tags`

			expect(userPrompt).toBe(expected)
		})

		it("should include comment-wrapped context when provider is set", async () => {
			const mockContextProvider = {
				getFormattedContext: async () => {
					// Simulate comment-wrapped format
					return `// Path: utils.ts
// export function sum(a: number, b: number) {
//   return a + b
// }
// Path: app.ts
`
				},
			} as any

			const strategyWithContext = new AutoTriggerStrategy(mockContextProvider)
			const { userPrompt } = await strategyWithContext.getPrompts(
				createAutocompleteInput("/app.ts", 5, 0),
				"function calculate() {\n  ",
				"\n}",
				"typescript",
			)

			const expected = `<LANGUAGE>typescript</LANGUAGE>

<QUERY>
// Path: utils.ts
// export function sum(a: number, b: number) {
//   return a + b
// }
// Path: app.ts
function calculate() {
  {{FILL_HERE}}
}
</QUERY>

TASK: Fill the {{FILL_HERE}} hole. Answer only with the CORRECT completion, and NOTHING ELSE. Do it now.
Return the COMPLETION tags`

			expect(userPrompt).toBe(expected)
		})
	})
})
