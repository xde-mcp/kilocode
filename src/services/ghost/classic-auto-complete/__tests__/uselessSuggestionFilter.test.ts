import { refuseUselessSuggestion, postprocessGhostSuggestion } from "../uselessSuggestionFilter"

describe("postprocessGhostSuggestion", () => {
	// Helper function to test filtering (returns undefined)
	const shouldFilter = (suggestion: string, prefix: string, suffix: string, model = "") => {
		return postprocessGhostSuggestion({ suggestion, prefix, suffix, model }) === undefined
	}

	// Helper function to test acceptance (returns processed string)
	const shouldAccept = (suggestion: string, prefix: string, suffix: string, model = "") => {
		const result = postprocessGhostSuggestion({ suggestion, prefix, suffix, model })
		return result !== undefined
	}

	describe("should filter out useless suggestions", () => {
		it("should filter empty suggestions", () => {
			expect(shouldFilter("", "const x = ", " + 1")).toBe(true)
			expect(shouldFilter("   ", "const x = ", " + 1")).toBe(true)
			expect(shouldFilter("\t\n", "const x = ", " + 1")).toBe(true)
		})

		it("should filter suggestions that match the end of prefix", () => {
			// Exact match at the end
			expect(shouldFilter("hello", "const x = hello", "")).toBe(true)
			expect(shouldFilter("world", "hello world", " + 1")).toBe(true)

			// With whitespace variations
			expect(shouldFilter("test", "const test ", "")).toBe(true)
			expect(shouldFilter("foo", "bar foo  ", "")).toBe(true)
		})

		it("should filter suggestions that match the start of suffix", () => {
			// Exact match at the start
			expect(shouldFilter("hello", "const x = ", "hello world")).toBe(true)
			expect(shouldFilter("const", "", "const y = 2")).toBe(true)

			// With whitespace variations
			expect(shouldFilter("test", "const x = ", "  test()")).toBe(true)
			expect(shouldFilter("foo", "", " foo bar")).toBe(true)

			// Trimmed match
			expect(shouldFilter("bar", "const x = ", "  bar  baz")).toBe(true)
		})

		it("should filter suggestions when trimmed version matches", () => {
			expect(shouldFilter("  hello  ", "const x = ", "hello world")).toBe(true)
			expect(shouldFilter("\nhello\t", "test hello", "")).toBe(true)
		})
	})

	describe("should accept useful suggestions", () => {
		it("should accept suggestions that add new content", () => {
			expect(shouldAccept("newValue", "const x = ", "")).toBe(true)
			expect(shouldAccept("42", "const x = ", " + y")).toBe(true)
			expect(shouldAccept("middle", "const x = ", " + y")).toBe(true)
		})

		it("should accept suggestions that don't match prefix end or suffix start", () => {
			expect(shouldAccept("hello", "const x = ", "world")).toBe(true)
			expect(shouldAccept("test", "const x = ", "const y = 2")).toBe(true)
			expect(shouldAccept("foo", "bar", "baz")).toBe(true)
		})

		it("should accept partial matches that are still useful", () => {
			// Suggestion "hello world" with prefix ending in "hello" should be accepted
			// because the full suggestion doesn't match what's at the end of the prefix
			expect(shouldAccept("hello world", "const x = hello", "")).toBe(true)
			expect(shouldAccept("test123", "test", "456")).toBe(true)
		})

		it("should accept suggestions with meaningful content between prefix and suffix", () => {
			expect(shouldAccept("= 42", "const x ", " + y")).toBe(true)
			expect(shouldAccept("()", "myFunction", ".then()")).toBe(true)
		})
	})

	describe("edge cases", () => {
		it("should handle empty prefix and suffix", () => {
			expect(shouldAccept("hello", "", "")).toBe(true)
			expect(shouldFilter("", "", "")).toBe(true)
		})

		it("should handle very long strings", () => {
			const longString = "a".repeat(1000)
			expect(shouldAccept("different", longString, longString)).toBe(true)
			expect(shouldFilter("different", longString + "different", "")).toBe(true)
		})

		it("should handle special characters", () => {
			expect(shouldFilter("${}", "const template = `", "${}`")).toBe(true)
			expect(shouldFilter("\\n", "const x = ", "\\n")).toBe(true)
			expect(shouldFilter("/**/", "const x = /**/", "")).toBe(true)
		})

		it("should handle unicode characters", () => {
			expect(shouldFilter("😀", "const emoji = ", "😀")).toBe(true)
			expect(shouldFilter("你好", "const greeting = 你好", "")).toBe(true)
			expect(shouldAccept("🚀", "launch", "🌟")).toBe(true)
		})
	})

	describe("returns the original suggestion when accepted", () => {
		it("should return the original suggestion, not the trimmed version", () => {
			const result = postprocessGhostSuggestion({
				suggestion: "  hello world  ",
				prefix: "const x = ",
				suffix: "",
				model: "",
			})
			expect(result).toBe("  hello world  ")
		})
	})
})

describe("refuseUselessSuggestion (deprecated)", () => {
	describe("should refuse useless suggestions", () => {
		it("should refuse empty suggestions", () => {
			expect(refuseUselessSuggestion("", "const x = ", " + 1")).toBe(true)
			expect(refuseUselessSuggestion("   ", "const x = ", " + 1")).toBe(true)
			expect(refuseUselessSuggestion("\t\n", "const x = ", " + 1")).toBe(true)
		})

		it("should refuse suggestions that match the end of prefix", () => {
			// Exact match at the end
			expect(refuseUselessSuggestion("hello", "const x = hello", "")).toBe(true)
			expect(refuseUselessSuggestion("world", "hello world", " + 1")).toBe(true)

			// With whitespace variations
			expect(refuseUselessSuggestion("test", "const test ", "")).toBe(true)
			expect(refuseUselessSuggestion("foo", "bar foo  ", "")).toBe(true)
		})

		it("should refuse suggestions that match the start of suffix", () => {
			// Exact match at the start
			expect(refuseUselessSuggestion("hello", "const x = ", "hello world")).toBe(true)
			expect(refuseUselessSuggestion("const", "", "const y = 2")).toBe(true)

			// With whitespace variations
			expect(refuseUselessSuggestion("test", "const x = ", "  test()")).toBe(true)
			expect(refuseUselessSuggestion("foo", "", " foo bar")).toBe(true)

			// Trimmed match
			expect(refuseUselessSuggestion("bar", "const x = ", "  bar  baz")).toBe(true)
		})

		it("should refuse suggestions when trimmed version matches", () => {
			expect(refuseUselessSuggestion("  hello  ", "const x = ", "hello world")).toBe(true)
			expect(refuseUselessSuggestion("\nhello\t", "test hello", "")).toBe(true)
		})
	})

	describe("should accept useful suggestions", () => {
		it("should accept suggestions that add new content", () => {
			expect(refuseUselessSuggestion("newValue", "const x = ", "")).toBe(false)
			expect(refuseUselessSuggestion("42", "const x = ", " + y")).toBe(false)
			expect(refuseUselessSuggestion("middle", "const x = ", " + y")).toBe(false)
		})

		it("should accept suggestions that don't match prefix end or suffix start", () => {
			expect(refuseUselessSuggestion("hello", "const x = ", "world")).toBe(false)
			expect(refuseUselessSuggestion("test", "const x = ", "const y = 2")).toBe(false)
			expect(refuseUselessSuggestion("foo", "bar", "baz")).toBe(false)
		})

		it("should accept partial matches that are still useful", () => {
			// Suggestion "hello world" with prefix ending in "hello" should be accepted
			// because the full suggestion doesn't match what's at the end of the prefix
			expect(refuseUselessSuggestion("hello world", "const x = hello", "")).toBe(false)
			expect(refuseUselessSuggestion("test123", "test", "456")).toBe(false)
		})

		it("should accept suggestions with meaningful content between prefix and suffix", () => {
			expect(refuseUselessSuggestion("= 42", "const x ", " + y")).toBe(false)
			expect(refuseUselessSuggestion("()", "myFunction", ".then()")).toBe(false)
		})
	})

	describe("edge cases", () => {
		it("should handle empty prefix and suffix", () => {
			expect(refuseUselessSuggestion("hello", "", "")).toBe(false)
			expect(refuseUselessSuggestion("", "", "")).toBe(true)
		})

		it("should handle very long strings", () => {
			const longString = "a".repeat(1000)
			expect(refuseUselessSuggestion("different", longString, longString)).toBe(false)
			expect(refuseUselessSuggestion("different", longString + "different", "")).toBe(true)
		})

		it("should handle special characters", () => {
			expect(refuseUselessSuggestion("${}", "const template = `", "${}`")).toBe(true)
			expect(refuseUselessSuggestion("\\n", "const x = ", "\\n")).toBe(true)
			expect(refuseUselessSuggestion("/**/", "const x = /**/", "")).toBe(true)
		})

		it("should handle unicode characters", () => {
			expect(refuseUselessSuggestion("😀", "const emoji = ", "😀")).toBe(true)
			expect(refuseUselessSuggestion("你好", "const greeting = 你好", "")).toBe(true)
			expect(refuseUselessSuggestion("🚀", "launch", "🌟")).toBe(false)
		})
	})
})
