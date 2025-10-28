import { parseGhostResponse, findBestMatch, type MatchResult } from "../GhostStreamingParser"
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

describe("GhostStreamingParser - Fuzzy Match Length Bug", () => {
	describe("Bug: Using search.length instead of actual matched length", () => {
		it("should demonstrate that actual code gets left behind when content has many extra spaces", () => {
			// Create a document with MANY extra spaces - so much that actual code gets left behind
			const mockDocument = {
				uri: { toString: () => "/test/file.ts", fsPath: "/test/file.ts" },
				getText: () =>
					"function         test(         x,         y         )         {         return         x         +         y;         }",
				languageId: "typescript",
				offsetAt: (position: any) => 0,
			} as vscode.TextDocument

			// LLM provides a change with normalized spacing (single spaces)
			const change = `<change><search><![CDATA[function test( x, y ) { return x + y; }]]></search><replace><![CDATA[function test(x, y) { return x * y; }]]></replace></change>`

			const result = parseGhostResponse(change, "", "", mockDocument, undefined)

			expect(result.hasNewSuggestions).toBe(true)
			expect(result.suggestions.hasSuggestions()).toBe(true)

			// Get the modified content
			const fimContent = result.suggestions.getFillInAtCursor()
			expect(fimContent).toBeDefined()

			// The bug with many spaces:
			// Original: "function         test(         x,         y         )         {         return         x         +         y;         }"
			// Search pattern: "function test( x, y ) { return x + y; }" (length = 41)
			// Fuzzy matched content: entire original string (length = 113, has MANY extra spaces)
			//
			// Current buggy behavior:
			// - endIndex = startIndex + search.length = 0 + 41 = 41
			// - Replaces only first 41 chars: "function         test(         x,      "
			// - Leaves behind: "   y         )         {         return         x         +         y;         }"
			// - Result: "function test(x, y) { return x * y; }   y         )         {         return         x         +         y;         }"
			//   This is WRONG - we have leftover code "y ) { return x + y; }" that should have been replaced!
			//
			// Expected correct behavior:
			// - Should replace entire fuzzy-matched content (113 chars)
			// - Result: "function test(x, y) { return x * y; }"

			console.log("Actual output:", fimContent?.text)

			// This test will FAIL with current implementation, showing actual code left behind
			expect(fimContent?.text).toBe("function test(x, y) { return x * y; }")
			// Current buggy output will have leftover code like: "function test(x, y) { return x * y; }   y ) { return x + y; }"
		})

		it("should show even more dramatic example with multiline code", () => {
			// Document with excessive spacing in a realistic code block
			const mockDocument = {
				uri: { toString: () => "/test/file.ts", fsPath: "/test/file.ts" },
				getText: () => `if         (         condition         )         {
	console.log(         "test"         );
	return         true;
}`,
				languageId: "typescript",
				offsetAt: (position: any) => 0,
			} as vscode.TextDocument

			// LLM provides normalized version
			const change = `<change><search><![CDATA[if ( condition ) {
	console.log( "test" );
	return true;
}]]></search><replace><![CDATA[if (condition) {
	console.log("updated");
	return false;
}]]></replace></change>`

			const result = parseGhostResponse(change, "", "", mockDocument, undefined)

			expect(result.hasNewSuggestions).toBe(true)

			const fimContent = result.suggestions.getFillInAtCursor()
			expect(fimContent).toBeDefined()

			// The bug:
			// Search pattern length is much shorter than the actual spaced-out content
			// So we'll leave behind parts of the original code like:
			// "if (condition) {\n\tconsole.log(\"updated\");\n\treturn false;\n}         )         {\n\tconsole.log(         \"test\"         );\n\treturn         true;\n}"
			// Notice the leftover "         )         {" and other fragments!

			console.log("Actual output:", fimContent?.text)

			expect(fimContent?.text).toBe(`if (condition) {
	console.log("updated");
	return false;
}`)
		})

		it("should demonstrate with realistic variable declaration", () => {
			// Realistic scenario: someone has weird formatting
			const mockDocument = {
				uri: { toString: () => "/test/file.ts", fsPath: "/test/file.ts" },
				getText: () =>
					"const         myVariable         =         calculateSomething(         param1,         param2,         param3         );",
				languageId: "typescript",
				offsetAt: (position: any) => 0,
			} as vscode.TextDocument

			// LLM wants to change the function call
			const change = `<change><search><![CDATA[const myVariable = calculateSomething( param1, param2, param3 );]]></search><replace><![CDATA[const myVariable = calculateSomething(param1, param2, param3);]]></replace></change>`

			const result = parseGhostResponse(change, "", "", mockDocument, undefined)

			expect(result.hasNewSuggestions).toBe(true)

			const fimContent = result.suggestions.getFillInAtCursor()
			expect(fimContent).toBeDefined()

			// Bug will leave behind: "const myVariable = calculateSomething(param1, param2, param3);         param3         );"
			// The "         param3         );" is leftover code that should have been replaced!

			console.log("Actual output:", fimContent?.text)

			expect(fimContent?.text).toBe("const myVariable = calculateSomething(param1, param2, param3);")
		})
	})

	describe("Root cause analysis", () => {
		it("should show findBestMatch now returns both start index and match length", () => {
			// The fix: findBestMatch now returns both start index and actual matched length
			const content = "function         test()         {         return         true;         }"
			const search = "function test() { return true; }"

			const matchResult = findBestMatch(content, search)

			// We get the start index: 0
			expect(matchResult.startIndex).toBe(0)

			// And now we also get the actual length of the matched content
			// search.length = 32
			// Actual matched content length = 72 (has MANY extra spaces)
			expect(matchResult.matchLength).toBe(72)

			// This ensures that in generateModifiedContent, we use:
			// const endIndex = matchResult.startIndex + matchResult.matchLength
			// Instead of the buggy:
			// const endIndex = searchIndex + change.search.length
		})
	})
})
