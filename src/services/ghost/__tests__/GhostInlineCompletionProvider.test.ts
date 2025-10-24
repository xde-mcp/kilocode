import * as vscode from "vscode"
import { GhostInlineCompletionProvider } from "../GhostInlineCompletionProvider"
import { GhostSuggestionsState } from "../GhostSuggestions"
import { MockTextDocument } from "../../mocking/MockTextDocument"

describe("GhostInlineCompletionProvider", () => {
	let provider: GhostInlineCompletionProvider
	let mockDocument: vscode.TextDocument
	let mockPosition: vscode.Position
	let mockContext: vscode.InlineCompletionContext
	let mockToken: vscode.CancellationToken

	beforeEach(() => {
		provider = new GhostInlineCompletionProvider()
		mockDocument = new MockTextDocument(vscode.Uri.file("/test.ts"), "const x = 1\nconst y = 2")
		mockPosition = new vscode.Position(0, 11) // After "const x = 1"
		mockContext = {} as vscode.InlineCompletionContext
		mockToken = {} as vscode.CancellationToken
	})

	describe("provideInlineCompletionItems", () => {
		it("should return empty array when no suggestions are set", () => {
			const result = provider.provideInlineCompletionItems(mockDocument, mockPosition, mockContext, mockToken)
			expect(result).toEqual([])
		})

		it("should return empty array when suggestions have no FIM content", () => {
			const suggestions = new GhostSuggestionsState()
			provider.updateSuggestions(suggestions)

			const result = provider.provideInlineCompletionItems(mockDocument, mockPosition, mockContext, mockToken)
			expect(result).toEqual([])
		})

		it("should return inline completion item when FIM content is available and prefix/suffix match", () => {
			const suggestions = new GhostSuggestionsState()
			const fimContent = {
				text: "console.log('Hello, World!');",
				prefix: "const x = 1",
				suffix: "\nconst y = 2",
			}
			suggestions.setFillInAtCursor(fimContent)
			provider.updateSuggestions(suggestions)

			const result = provider.provideInlineCompletionItems(
				mockDocument,
				mockPosition,
				mockContext,
				mockToken,
			) as vscode.InlineCompletionItem[]

			expect(result).toHaveLength(1)
			expect(result[0].insertText).toBe(fimContent.text)
			expect(result[0].range).toEqual(new vscode.Range(mockPosition, mockPosition))
			// No command property - VSCode handles acceptance automatically
			expect(result[0].command).toBeUndefined()
		})

		it("should return empty array when prefix does not match", () => {
			const suggestions = new GhostSuggestionsState()
			const fimContent = {
				text: "console.log('Hello, World!');",
				prefix: "different prefix",
				suffix: "\nconst y = 2",
			}
			suggestions.setFillInAtCursor(fimContent)
			provider.updateSuggestions(suggestions)

			const result = provider.provideInlineCompletionItems(mockDocument, mockPosition, mockContext, mockToken)

			expect(result).toEqual([])
		})

		it("should return empty array when suffix does not match", () => {
			const suggestions = new GhostSuggestionsState()
			const fimContent = {
				text: "console.log('Hello, World!');",
				prefix: "const x = 1",
				suffix: "different suffix",
			}
			suggestions.setFillInAtCursor(fimContent)
			provider.updateSuggestions(suggestions)

			const result = provider.provideInlineCompletionItems(mockDocument, mockPosition, mockContext, mockToken)

			expect(result).toEqual([])
		})

		it("should return empty array after suggestions are cleared", () => {
			const suggestions = new GhostSuggestionsState()
			suggestions.setFillInAtCursor({
				text: "test content",
				prefix: "const x = 1",
				suffix: "\nconst y = 2",
			})
			provider.updateSuggestions(suggestions)

			// Clear suggestions
			provider.updateSuggestions(null)

			const result = provider.provideInlineCompletionItems(mockDocument, mockPosition, mockContext, mockToken)
			expect(result).toEqual([])
		})

		it("should update suggestions when called multiple times", () => {
			const suggestions1 = new GhostSuggestionsState()
			suggestions1.setFillInAtCursor({
				text: "first suggestion",
				prefix: "const x = 1",
				suffix: "\nconst y = 2",
			})
			provider.updateSuggestions(suggestions1)

			let result = provider.provideInlineCompletionItems(
				mockDocument,
				mockPosition,
				mockContext,
				mockToken,
			) as vscode.InlineCompletionItem[]
			expect(result[0].insertText).toBe("first suggestion")

			const suggestions2 = new GhostSuggestionsState()
			suggestions2.setFillInAtCursor({
				text: "second suggestion",
				prefix: "const x = 1",
				suffix: "\nconst y = 2",
			})
			provider.updateSuggestions(suggestions2)

			result = provider.provideInlineCompletionItems(
				mockDocument,
				mockPosition,
				mockContext,
				mockToken,
			) as vscode.InlineCompletionItem[]
			expect(result[0].insertText).toBe("second suggestion")
		})
	})

	describe("updateSuggestions", () => {
		it("should accept null to clear suggestions", () => {
			const suggestions = new GhostSuggestionsState()
			suggestions.setFillInAtCursor({
				text: "test",
				prefix: "const x = 1",
				suffix: "\nconst y = 2",
			})
			provider.updateSuggestions(suggestions)

			provider.updateSuggestions(null)

			const result = provider.provideInlineCompletionItems(mockDocument, mockPosition, mockContext, mockToken)
			expect(result).toEqual([])
		})

		it("should accept new suggestions state", () => {
			const suggestions = new GhostSuggestionsState()
			suggestions.setFillInAtCursor({
				text: "new content",
				prefix: "const x = 1",
				suffix: "\nconst y = 2",
			})

			provider.updateSuggestions(suggestions)

			const result = provider.provideInlineCompletionItems(
				mockDocument,
				mockPosition,
				mockContext,
				mockToken,
			) as vscode.InlineCompletionItem[]
			expect(result).toHaveLength(1)
			expect(result[0].insertText).toBe("new content")
		})
	})
})
