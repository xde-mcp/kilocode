import { parseGhostResponse, findBestMatch } from "../GhostStreamingParser"
import { extractPrefixSuffix } from "../../types"
import * as vscode from "vscode"

// Mock vscode module
vi.mock("vscode", () => ({
	Uri: {
		file: (path: string) => ({ toString: () => path, fsPath: path }),
	},
	workspace: {
		asRelativePath: (uri: any) => uri.toString(),
	},
}))

describe("GhostStreamingParser", () => {
	let mockDocument: vscode.TextDocument
	let document: vscode.TextDocument
	let range: vscode.Range | undefined

	beforeEach(() => {
		// Create mock document
		mockDocument = {
			uri: { toString: () => "/test/file.ts", fsPath: "/test/file.ts" },
			getText: () => `function test() {
	return true;
}`,
			languageId: "typescript",
			positionAt: (offset: number) => ({ line: 0, character: offset }),
			offsetAt: (position: any) => position.character,
		} as vscode.TextDocument

		document = mockDocument
		range = undefined
	})

	describe("FIM response parsing", () => {
		it("should handle plain FIM text response", () => {
			const fimResponse = "console.log('test');"
			const position = range?.start ?? document.positionAt(0)
			const { prefix, suffix } = extractPrefixSuffix(document, position)
			const result = parseGhostResponse(fimResponse, prefix, suffix)

			expect(result.hasNewSuggestions).toBe(true)
			expect(result.isComplete).toBe(true)
			expect(result.suggestions.hasSuggestions()).toBe(true)

			const fim = result.suggestions.getFillInAtCursor()
			expect(fim?.text).toBe("console.log('test');")
		})

		it("should handle multiline FIM response", () => {
			const fimResponse = "const x = 5;\nconst y = 10;\nreturn x + y;"
			const position = range?.start ?? document.positionAt(0)
			const { prefix, suffix } = extractPrefixSuffix(document, position)
			const result = parseGhostResponse(fimResponse, prefix, suffix)

			expect(result.hasNewSuggestions).toBe(true)
			expect(result.suggestions.hasSuggestions()).toBe(true)

			const fim = result.suggestions.getFillInAtCursor()
			expect(fim?.text).toBe("const x = 5;\nconst y = 10;\nreturn x + y;")
		})

		it("should remove markdown code fences", () => {
			const fimResponse = "```typescript\nconst result = 42;\n```"
			const position = range?.start ?? document.positionAt(0)
			const { prefix, suffix } = extractPrefixSuffix(document, position)
			const result = parseGhostResponse(fimResponse, prefix, suffix)

			expect(result.hasNewSuggestions).toBe(true)
			expect(result.suggestions.hasSuggestions()).toBe(true)

			const fim = result.suggestions.getFillInAtCursor()
			expect(fim?.text).toBe("const result = 42;")
		})

		it("should handle empty response", () => {
			const position = range?.start ?? document.positionAt(0)
			const { prefix, suffix } = extractPrefixSuffix(document, position)
			const result = parseGhostResponse("", prefix, suffix)

			expect(result.hasNewSuggestions).toBe(false)
			expect(result.isComplete).toBe(false)
			expect(result.suggestions.hasSuggestions()).toBe(false)
		})

		it("should handle whitespace-only response", () => {
			const position = range?.start ?? document.positionAt(0)
			const { prefix, suffix } = extractPrefixSuffix(document, position)
			const result = parseGhostResponse("   \n\t  ", prefix, suffix)

			expect(result.hasNewSuggestions).toBe(false)
			expect(result.isComplete).toBe(false)
			expect(result.suggestions.hasSuggestions()).toBe(false)
		})

		it("should handle plain FIM text response with custom prefix/suffix", () => {
			const fimResponse = "console.log('Hello, World!');"
			const prefix = "function test() {\n  "
			const suffix = "\n}"

			const result = parseGhostResponse(fimResponse, prefix, suffix)

			expect(result.hasNewSuggestions).toBe(true)
			expect(result.suggestions.hasSuggestions()).toBe(true)
			expect(result.isComplete).toBe(true)

			const fimContent = result.suggestions.getFillInAtCursor()
			expect(fimContent).toEqual({
				text: "console.log('Hello, World!');",
				prefix: "function test() {\n  ",
				suffix: "\n}",
			})
		})

		it("should handle multiline plain FIM text response with custom prefix/suffix", () => {
			const fimResponse = "const x = 5;\nconst y = 10;\nreturn x + y;"
			const prefix = "function sum() {\n  "
			const suffix = "\n}"

			const result = parseGhostResponse(fimResponse, prefix, suffix)

			expect(result.hasNewSuggestions).toBe(true)
			expect(result.suggestions.hasSuggestions()).toBe(true)

			const fimContent = result.suggestions.getFillInAtCursor()
			expect(fimContent?.text).toBe("const x = 5;\nconst y = 10;\nreturn x + y;")
		})

		it("should handle prefix/suffix with special characters", () => {
			const fimResponse = 'const middle = "inserted";'
			const prefix = "const regex = /test/g;\n"
			const suffix = '\nconst result = "match";'

			const result = parseGhostResponse(fimResponse, prefix, suffix)

			expect(result.suggestions.hasSuggestions()).toBe(true)
			const fimContent = result.suggestions.getFillInAtCursor()
			expect(fimContent).toEqual({
				text: 'const middle = "inserted";',
				prefix: "const regex = /test/g;\n",
				suffix: '\nconst result = "match";',
			})
		})
	})

	describe("findBestMatch", () => {
		describe("exact matches", () => {
			it("should find exact match at start", () => {
				const content = "function test() {\n\treturn true;\n}"
				const search = "function test()"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(0)
			})

			it("should find exact match in middle", () => {
				const content = "function test() {\n\treturn true;\n}"
				const search = "return true;"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(19)
			})

			it("should find exact match at end", () => {
				const content = "function test() {\n\treturn true;\n}"
				const search = "}"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(32)
			})

			it("should find exact multiline match", () => {
				const content = "function test() {\n\treturn true;\n}"
				const search = "function test() {\n\treturn true;\n}"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(0)
			})
		})

		describe("whitespace variations", () => {
			it("should handle tabs vs spaces", () => {
				const content = "function test() {\n\treturn true;\n}"
				const search = "function test() {\n    return true;\n}" // Spaces instead of tab

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(0)
			})

			it("should handle extra spaces in content", () => {
				const content = "function  test()  {\n\treturn true;\n}" // Extra spaces
				const search = "function test() {\n\treturn true;\n}"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(0)
			})

			it("should handle different line endings (\\n vs \\r\\n)", () => {
				const content = "function test() {\r\n\treturn true;\r\n}"
				const search = "function test() {\n\treturn true;\n}"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(0)
			})

			it("should handle trailing whitespace differences", () => {
				const content = "function test() {  \n\treturn true;\n}"
				const search = "function test() {\n\treturn true;\n}"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(0)
			})

			it("should handle leading whitespace differences", () => {
				const content = "  function test() {\n\treturn true;\n}"
				const search = "function test() {\n\treturn true;\n}"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(2)
			})

			it("should handle multiple consecutive spaces vs single space", () => {
				const content = "const x    =    5;"
				const search = "const x = 5;"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(0)
			})

			it("should handle trailing newline in search pattern", () => {
				const content = "function test() {\n\treturn true;\n}"
				const search = "return true;\n"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(19)
			})

			it("should handle trailing newline when content has more newlines", () => {
				const content = "function test() {\n\treturn true;\n\n\n}"
				const search = "return true;\n"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(19)
			})
		})

		describe("newline matching", () => {
			it("should NOT match newline with space", () => {
				const content = "line1\nline2"
				const search = "line1 line2"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(-1)
			})

			it("should NOT match newline with tab", () => {
				const content = "line1\nline2"
				const search = "line1\tline2"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(-1)
			})

			it("should NOT match space with newline", () => {
				const content = "line1 line2"
				const search = "line1\nline2"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(-1)
			})

			it("should match \\n with \\r\\n", () => {
				const content = "line1\r\nline2"
				const search = "line1\nline2"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(0)
			})

			it("should match \\r\\n with \\n", () => {
				const content = "line1\nline2"
				const search = "line1\r\nline2"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(0)
			})

			it("should match \\r with \\n", () => {
				const content = "line1\rline2"
				const search = "line1\nline2"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(0)
			})

			it("should handle multiple newlines correctly", () => {
				const content = "line1\n\nline2"
				const search = "line1\n\nline2"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(0)
			})

			it("should still handle spaces and tabs flexibly (non-newline whitespace)", () => {
				const content = "const x  =  5;"
				const search = "const x\t=\t5;"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(0)
			})

			it("should handle mixed whitespace correctly", () => {
				const content = "function test() {\n\treturn  true;\n}"
				const search = "function test() {\n    return true;\n}"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(0)
			})
		})

		describe("edge cases", () => {
			it("should return -1 for empty content", () => {
				const content = ""
				const search = "test"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(-1)
			})

			it("should return -1 for empty pattern", () => {
				const content = "function test() {}"
				const search = ""

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(-1)
			})

			it("should return -1 when pattern is longer than content", () => {
				const content = "short"
				const search = "this is a much longer pattern"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(-1)
			})

			it("should return -1 for no match", () => {
				const content = "function test() {\n\treturn true;\n}"
				const search = "nonexistent code"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(-1)
			})

			it("should handle pattern with only whitespace", () => {
				const content = "a   b"
				const search = "   "

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBeGreaterThanOrEqual(0)
			})

			it("should handle content with only whitespace", () => {
				const content = "   \n\t  "
				const search = "test"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(-1)
			})
		})

		describe("real-world scenarios", () => {
			it("should handle code with inconsistent indentation", () => {
				const content = 'function example() {\n\tif (true) {\n\t\tconsole.log("test");\n\t}\n}'
				const search = 'function example() {\n    if (true) {\n        console.log("test");\n    }\n}'

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(0)
			})

			it("should handle code with mixed tabs and spaces", () => {
				const content = "function test() {\n\t  return true;\n}"
				const search = "function test() {\n    return true;\n}"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(0)
			})

			it("should handle actual different line endings in code", () => {
				const content = "function test() {\r\n\treturn true;\r\n}"
				const search = "function test() {\n\treturn true;\n}"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(0)
			})

			it("should find match when content has extra trailing whitespace", () => {
				const content = "const x = 5;   \nconst y = 10;"
				const search = "const x = 5;\nconst y = 10;"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(0)
			})

			it("should handle partial matches correctly", () => {
				const content = "function test() { return true; }\nfunction test2() { return false; }"
				const search = "function test2() { return false; }"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(33)
			})
		})

		describe("performance", () => {
			it("should handle large content efficiently", () => {
				const content = "x".repeat(10000) + "needle" + "y".repeat(10000)
				const search = "needle"

				const startTime = performance.now()
				const result = findBestMatch(content, search)
				const endTime = performance.now()

				expect(result.startIndex).toBe(10000)
				expect(endTime - startTime).toBeLessThan(50)
			})

			it("should handle large pattern efficiently", () => {
				const pattern = "x".repeat(1000)
				const content = "y".repeat(5000) + pattern + "z".repeat(5000)

				const startTime = performance.now()
				const result = findBestMatch(content, pattern)
				const endTime = performance.now()

				expect(result.startIndex).toBe(5000)
				expect(endTime - startTime).toBeLessThan(100)
			})

			it("should handle worst-case scenario (no match with similar patterns)", () => {
				const content = "a".repeat(1000) + "b"
				const search = "a".repeat(1000) + "c"

				const startTime = performance.now()
				const result = findBestMatch(content, search)
				const endTime = performance.now()

				expect(result.startIndex).toBe(-1)
				expect(endTime - startTime).toBeLessThan(200)
			})
		})

		describe("trimmed search fallback", () => {
			it("should NOT find match with leading whitespace in pattern (fuzzy matcher limitation)", () => {
				const content = "function test() {}"
				const search = "  function test() {}"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(-1)
			})

			it("should find match with trailing whitespace in pattern", () => {
				const content = "function test() {}"
				const search = "function test() {}  "

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(0)
			})

			it("should NOT find match with both leading and trailing whitespace in pattern (fuzzy matcher limitation)", () => {
				const content = "function test() {}"
				const search = "  function test() {}  "

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(-1)
			})
		})

		describe("bug: break prevents matching later in string", () => {
			it("should find match later in content when first position fails", () => {
				const content = "wrong function test() { return true; }"
				const search = "function test()"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(6)
			})

			it("should find match after whitespace mismatch", () => {
				const content = "abc def ghi"
				const search = "def"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(4)
			})

			it("should find match when first character differs", () => {
				const content = "x function test() {}"
				const search = "function test()"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(2)
			})

			it("should find match after multiple failed attempts", () => {
				const content = "aaa bbb ccc target ddd"
				const search = "target"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(12)
			})

			it("should find fuzzy match later in content", () => {
				const content = "  x  function  test()"
				const search = "function test()"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(5)
			})

			it("should handle newline mismatch and continue searching", () => {
				const content = "line1 line2\nfunction test() {}"
				const search = "function test()"

				const result = findBestMatch(content, search)
				expect(result.startIndex).toBe(12)
			})
		})
	})

	describe("error handling", () => {
		it("should handle context without document", () => {
			const invalidDocument = undefined as any

			expect(() => {
				const position = range?.start ?? invalidDocument.positionAt(0)
				const { prefix, suffix } = extractPrefixSuffix(invalidDocument, position)
				parseGhostResponse("test", prefix, suffix)
			}).toThrow()
		})
	})

	describe("performance", () => {
		it("should handle large responses efficiently", () => {
			const largeResponse = "y".repeat(10000)

			const startTime = performance.now()
			const position = range?.start ?? document.positionAt(0)
			const { prefix, suffix } = extractPrefixSuffix(document, position)
			const result = parseGhostResponse(largeResponse, prefix, suffix)
			const endTime = performance.now()

			expect(endTime - startTime).toBeLessThan(100)
			expect(result.hasNewSuggestions).toBe(true)
		})

		it("should handle large concatenated responses efficiently", () => {
			const largeResponse = Array(1000).fill("x").join("")
			const startTime = performance.now()

			const position = range?.start ?? document.positionAt(0)
			const { prefix, suffix } = extractPrefixSuffix(document, position)
			parseGhostResponse(largeResponse, prefix, suffix)
			const endTime = performance.now()

			expect(endTime - startTime).toBeLessThan(200)
		})
	})
})
