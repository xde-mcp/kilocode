import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import * as vscode from "vscode"
import { GhostContext } from "../GhostContext"
import { GhostDocumentStore } from "../GhostDocumentStore"
import { AutoTriggerStrategy } from "../classic-auto-complete/AutoTriggerStrategy"
import { GhostSuggestionContext, contextToAutocompleteInput } from "../types"
import { MockTextDocument } from "../../mocking/MockTextDocument"

// Mock vscode
vi.mock("vscode", () => ({
	Uri: {
		parse: (uriString: string) => ({
			toString: () => uriString,
			fsPath: uriString.replace("file://", ""),
			scheme: "file",
			path: uriString.replace("file://", ""),
		}),
	},
	workspace: {
		asRelativePath: vi.fn().mockImplementation((uri) => {
			if (typeof uri === "string") {
				return uri.replace("file:///", "")
			}
			return uri.toString().replace("file:///", "")
		}),
		textDocuments: [], // Mock textDocuments as an empty array
	},
	window: {
		activeTextEditor: null,
	},
	languages: {
		getDiagnostics: vi.fn().mockReturnValue([]), // Mock getDiagnostics to return empty array
	},
	Position: class {
		constructor(
			public line: number,
			public character: number,
		) {}
	},
	Range: class {
		constructor(
			public start: any,
			public end: any,
		) {}
	},
	DiagnosticSeverity: {
		Error: 0,
		Warning: 1,
		Information: 2,
		Hint: 3,
	},
}))

// Mock diff - using importOriginal as recommended in the error message
vi.mock("diff", async (importOriginal) => {
	// Create a mock module with the functions we need
	return {
		createPatch: vi.fn().mockImplementation((filePath, oldContent, newContent) => {
			return `--- a/${filePath}\n+++ b/${filePath}\n@@ -1,1 +1,1 @@\n-${oldContent}\n+${newContent}`
		}),
		structuredPatch: vi.fn().mockImplementation((oldFileName, newFileName, oldContent, newContent) => {
			return {
				hunks: [
					{
						oldStart: 1,
						oldLines: 1,
						newStart: 1,
						newLines: 1,
						lines: [`-${oldContent}`, `+${newContent}`],
					},
				],
			}
		}),
		parsePatch: vi.fn().mockReturnValue([]),
	}
})

describe("GhostRecentOperations", () => {
	let documentStore: GhostDocumentStore
	let context: GhostContext
	let autoTriggerStrategy: AutoTriggerStrategy
	let mockDocument: MockTextDocument

	beforeEach(() => {
		documentStore = new GhostDocumentStore()
		context = new GhostContext(documentStore)
		autoTriggerStrategy = new AutoTriggerStrategy()

		// Create a mock document
		const uri = vscode.Uri.parse("file:///test-file.ts")
		mockDocument = new MockTextDocument(uri, "test-content")
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	it("should include recent operations in autocomplete input", async () => {
		// Store initial document version
		await documentStore.storeDocument({ document: mockDocument, bypassDebounce: true })

		// Update document content and store again
		mockDocument.updateContent("test-content-updated")
		await documentStore.storeDocument({ document: mockDocument, bypassDebounce: true })

		// Create a suggestion context
		const suggestionContext: GhostSuggestionContext = {
			document: mockDocument,
		}

		// Generate context with recent operations
		const enrichedContext = await context.generate(suggestionContext)

		// Verify that recent operations were added to the context
		expect(enrichedContext.recentOperations).toBeDefined()
		expect(enrichedContext.recentOperations?.length).toBeGreaterThan(0)

		const autocompleteInput = contextToAutocompleteInput(enrichedContext)

		// Verify recent operations are converted to recentlyEditedRanges
		expect(autocompleteInput.recentlyEditedRanges).toBeDefined()
		expect(autocompleteInput.recentlyEditedRanges.length).toBeGreaterThan(0)

		// Generate prompt
		const prefix = enrichedContext.document.getText()
		const suffix = ""
		const languageId = enrichedContext.document.languageId
		const { userPrompt } = await autoTriggerStrategy.getPrompts(autocompleteInput, prefix, suffix, languageId)

		// Context is now comment-wrapped inside QUERY (not as separate XML tags)
		expect(userPrompt).toContain("<QUERY>")
		expect(userPrompt).toContain("{{FILL_HERE}}")
	})

	it("should work without recent operations", async () => {
		// Create a suggestion context without storing document history
		const suggestionContext: GhostSuggestionContext = {
			document: mockDocument,
		}

		// Generate context
		const enrichedContext = await context.generate(suggestionContext)

		const autocompleteInput = contextToAutocompleteInput(enrichedContext)

		// Generate prompt
		const prefix = enrichedContext.document.getText()
		const suffix = ""
		const languageId = enrichedContext.document.languageId
		const { userPrompt } = await autoTriggerStrategy.getPrompts(autocompleteInput, prefix, suffix, languageId)

		// Should still generate valid prompt with QUERY and FILL_HERE
		expect(userPrompt).toContain("<QUERY>")
		expect(userPrompt).toContain("{{FILL_HERE}}")
		expect(userPrompt).toContain("</QUERY>")
	})
})
