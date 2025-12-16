import { postprocessGhostSuggestion, suggestionConsideredDuplication } from "../uselessSuggestionFilter"

describe("postprocessGhostSuggestion", () => {
	it("calls suggestionConsideredDuplication", () => {
		let calls = 0
		;(globalThis as any).__kiloTestHooks = {
			onSuggestionConsideredDuplication: () => {
				calls++
			},
		}

		try {
			const result = postprocessGhostSuggestion({
				suggestion: "hello",
				prefix: "",
				suffix: "",
				model: "",
			})

			expect(result).toBe("hello")
			expect(calls).toBe(1)
		} finally {
			;(globalThis as any).__kiloTestHooks = undefined
		}
	})

	it("filters suggestions that rewrite the line above (continuedev postprocessCompletion behavior)", () => {
		const prefix = "function test() {\n  return true\n  "
		const suggestion = "return true"
		const result = postprocessGhostSuggestion({ suggestion, prefix, suffix: "", model: "" })
		expect(result).toBeUndefined()
	})

	describe("model-specific postprocessing", () => {
		it("removes markdown code fences", () => {
			const suggestion = "```javascript\nconst x = 1\n```"
			const result = postprocessGhostSuggestion({
				suggestion,
				prefix: "",
				suffix: "",
				model: "gpt-4",
			})
			expect(result).toBe("const x = 1")
		})

		it("handles Codestral-specific quirks", () => {
			// Codestral sometimes adds extra leading space
			const result = postprocessGhostSuggestion({
				suggestion: " test",
				prefix: "const x = ",
				suffix: "\n",
				model: "codestral",
			})
			expect(result).toBe("test")
		})

		it("handles Mercury/Granite prefix duplication", () => {
			const result = postprocessGhostSuggestion({
				suggestion: "const x = 42",
				prefix: "const x = ",
				suffix: "",
				model: "granite-20b",
			})
			expect(result).toBe("42")
		})

		it("handles Gemini/Gemma file separator", () => {
			const result = postprocessGhostSuggestion({
				suggestion: "const x = 1<|file_separator|>",
				prefix: "",
				suffix: "",
				model: "gemini-pro",
			})
			expect(result).toBe("const x = 1")
		})
	})

	describe("extreme repetition filtering", () => {
		it("filters extreme repetition", () => {
			const repetitive = "test\ntest\ntest\ntest\ntest\ntest\ntest\ntest\ntest\n"
			const result = postprocessGhostSuggestion({
				suggestion: repetitive,
				prefix: "",
				suffix: "",
				model: "",
			})
			expect(result).toBeUndefined()
		})

		it("allows normal repetition", () => {
			const normal = "test1\ntest2\ntest3\ntest4\n"
			const result = postprocessGhostSuggestion({
				suggestion: normal,
				prefix: "",
				suffix: "",
				model: "",
			})
			expect(result).toBe(normal)
		})
	})
})

describe("suggestionConsideredDuplication", () => {
	const isDuplication = (processed: string, prefix: string, suffix: string) =>
		suggestionConsideredDuplication({ processed, prefix, suffix })

	it("treats empty/whitespace-only processed suggestions as duplication", () => {
		expect(isDuplication("", "const x = ", " + 1")).toBe(true)
		expect(isDuplication("   ", "const x = ", " + 1")).toBe(true)
		expect(isDuplication("\t\n", "const x = ", " + 1")).toBe(true)
	})

	it("treats processed suggestion as duplication when it matches the end of the prefix (trim-aware)", () => {
		// Exact match at the end
		expect(isDuplication("hello", "const x = hello", "")).toBe(true)
		expect(isDuplication("world", "hello world", " + 1")).toBe(true)

		// With whitespace variations
		expect(isDuplication("test", "const test ", "")).toBe(true)
		expect(isDuplication("foo", "bar foo  ", "")).toBe(true)
	})

	it("treats processed suggestion as duplication when it matches the start of the suffix (trim-aware)", () => {
		// Exact match at the start
		expect(isDuplication("hello", "const x = ", "hello world")).toBe(true)
		expect(isDuplication("const", "", "const y = 2")).toBe(true)

		// With whitespace variations
		expect(isDuplication("test", "const x = ", "  test()")).toBe(true)
		expect(isDuplication("foo", "", " foo bar")).toBe(true)

		// Trimmed match
		expect(isDuplication("bar", "const x = ", "  bar  baz")).toBe(true)
	})

	it("trims processed before comparing to prefix/suffix", () => {
		expect(isDuplication("  hello  ", "const x = ", "hello world")).toBe(true)
		expect(isDuplication("\nhello\t", "test hello", "")).toBe(true)
	})

	it("returns false for useful suggestions that do not match prefix end or suffix start", () => {
		expect(isDuplication("newValue", "const x = ", "")).toBe(false)
		expect(isDuplication("42", "const x = ", " + y")).toBe(false)
		expect(isDuplication("middle", "const x = ", " + y")).toBe(false)

		expect(isDuplication("hello", "const x = ", "world")).toBe(false)
		expect(isDuplication("test", "const x = ", "const y = 2")).toBe(false)
		expect(isDuplication("foo", "bar", "baz")).toBe(false)
	})

	it("does not consider partial matches at the edge as duplication", () => {
		// Suggestion "hello world" with prefix ending in "hello" is NOT a duplication
		expect(isDuplication("hello world", "const x = hello", "")).toBe(false)
		expect(isDuplication("test123", "test", "456")).toBe(false)
	})

	it("handles empty prefix and suffix", () => {
		expect(isDuplication("hello", "", "")).toBe(false)
		expect(isDuplication("", "", "")).toBe(true)
	})

	it("handles very long strings", () => {
		const longString = "a".repeat(1000)
		expect(isDuplication("different", longString, longString)).toBe(false)
		expect(isDuplication("different", longString + "different", "")).toBe(true)
	})

	it("handles special characters", () => {
		expect(isDuplication("${}", "const template = `", "${}`")).toBe(true)
		expect(isDuplication("\\n", "const x = ", "\\n")).toBe(true)
		expect(isDuplication("/**/", "const x = /**/", "")).toBe(true)
	})

	it("handles unicode characters", () => {
		expect(isDuplication("😀", "const emoji = ", "😀")).toBe(true)
		expect(isDuplication("你好", "const greeting = 你好", "")).toBe(true)
		expect(isDuplication("🚀", "launch", "🌟")).toBe(false)
	})
})
