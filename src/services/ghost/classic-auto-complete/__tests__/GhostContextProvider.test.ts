import { describe, it, expect, beforeEach, vi } from "vitest"
import { GhostContextProvider } from "../GhostContextProvider"
import { AutocompleteInput } from "../../types"
import { AutocompleteSnippetType } from "../../../continuedev/core/autocomplete/snippets/types"
import * as vscode from "vscode"
import crypto from "crypto"

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
		textDocuments: [],
		workspaceFolders: [],
	},
	window: {
		activeTextEditor: null,
	},
}))

// Mock the continuedev imports
vi.mock("../../../continuedev/core/autocomplete/context/ContextRetrievalService", () => ({
	ContextRetrievalService: vi.fn().mockImplementation(() => ({
		initializeForFile: vi.fn().mockResolvedValue(undefined),
		getSnippetsFromImportDefinitions: vi.fn().mockResolvedValue([]),
		getRootPathSnippets: vi.fn().mockResolvedValue([]),
		getStaticContextSnippets: vi.fn().mockResolvedValue([]),
	})),
}))

vi.mock("../../../continuedev/core/vscode-test-harness/src/VSCodeIde", () => ({
	VsCodeIde: vi.fn().mockImplementation(() => ({
		getWorkspaceDirs: vi.fn().mockResolvedValue(["/workspace"]),
		readFile: vi.fn().mockResolvedValue("const example = 'test';"),
		getClipboardContent: vi.fn().mockResolvedValue({ text: "", copiedAt: new Date().toISOString() }),
		getUniqueId: vi.fn().mockResolvedValue("test-machine-id"),
		getIdeInfo: vi.fn().mockResolvedValue({ ideType: "vscode" }),
	})),
}))

// Mock HelperVars
vi.mock("../../../continuedev/core/autocomplete/util/HelperVars", () => ({
	HelperVars: {
		create: vi.fn().mockResolvedValue({
			filepath: "/test.ts",
			pos: { line: 0, character: 0 },
			fullPrefix: "",
			fullSuffix: "",
			prunedPrefix: "",
			prunedSuffix: "",
			prunedCaretWindow: "",
			lang: { name: "typescript", topLevelKeywords: [], singleLineComment: "//" },
			treePath: undefined,
			workspaceUris: ["/workspace"],
			options: {},
			modelName: "codestral",
			input: {},
		}),
	},
}))

// Mock getAllSnippetsWithoutRace
vi.mock("../../../continuedev/core/autocomplete/snippets/getAllSnippets", () => ({
	getAllSnippetsWithoutRace: vi.fn().mockResolvedValue({
		recentlyOpenedFileSnippets: [],
		importDefinitionSnippets: [],
		rootPathSnippets: [],
		recentlyEditedRangeSnippets: [],
		recentlyVisitedRangesSnippets: [],
		diffSnippets: [],
		clipboardSnippets: [],
		ideSnippets: [],
		staticSnippet: [],
	}),
}))

// Mock getDefinitionsFromLsp
vi.mock("../../../continuedev/core/vscode-test-harness/src/autocomplete/lsp", () => ({
	getDefinitionsFromLsp: vi.fn().mockResolvedValue([]),
}))

// Mock getSnippets (token-based filtering)
vi.mock("../../../continuedev/core/autocomplete/templating/filtering", () => ({
	getSnippets: vi.fn().mockImplementation((_helper, payload) => {
		// Return all snippets for testing - in production this filters by tokens
		return [
			...payload.recentlyOpenedFileSnippets,
			...payload.importDefinitionSnippets,
			...payload.rootPathSnippets,
			...payload.clipboardSnippets,
			...payload.staticSnippet,
			...payload.recentlyVisitedRangesSnippets,
			...payload.recentlyEditedRangeSnippets,
		]
	}),
}))

// Mock formatSnippets (continuedev's comment-based formatting)
vi.mock("../../../continuedev/core/autocomplete/templating/formatting", () => ({
	formatSnippets: vi.fn().mockImplementation((helper, snippets, _workspaceDirs) => {
		// Simulate comment-wrapped format
		if (snippets.length === 0) return ""
		const commentMark = helper.lang.singleLineComment
		return snippets.map((s: any) => `${commentMark} Path: ${s.filepath}\n${commentMark} ${s.content}`).join("\n")
	}),
}))

function createAutocompleteInput(filepath: string = "/test.ts"): AutocompleteInput {
	return {
		isUntitledFile: false,
		completionId: crypto.randomUUID(),
		filepath,
		pos: { line: 0, character: 0 },
		recentlyVisitedRanges: [],
		recentlyEditedRanges: [],
	}
}

describe("GhostContextProvider", () => {
	let contextProvider: GhostContextProvider
	let mockContext: vscode.ExtensionContext

	beforeEach(() => {
		mockContext = {
			subscriptions: [],
			globalState: {
				get: vi.fn(),
				update: vi.fn(),
			},
		} as any

		contextProvider = new GhostContextProvider(mockContext)
	})

	describe("getFormattedContext", () => {
		it("should return empty string when no snippets available", async () => {
			const input = createAutocompleteInput("/test.ts")
			const formatted = await contextProvider.getFormattedContext(input, "/test.ts")

			expect(formatted).toBe("")
		})

		it("should return comment-wrapped context when snippets available", async () => {
			const { getAllSnippetsWithoutRace } = await import(
				"../../../continuedev/core/autocomplete/snippets/getAllSnippets"
			)

			// Mock with actual snippets
			;(getAllSnippetsWithoutRace as any).mockResolvedValueOnce({
				recentlyOpenedFileSnippets: [
					{
						filepath: "/recent.ts",
						content: "const recent = 1;",
						type: AutocompleteSnippetType.Code,
					},
				],
				importDefinitionSnippets: [],
				rootPathSnippets: [],
				recentlyEditedRangeSnippets: [],
				recentlyVisitedRangesSnippets: [],
				diffSnippets: [],
				clipboardSnippets: [],
				ideSnippets: [],
				staticSnippet: [],
			})

			const input = createAutocompleteInput("/test.ts")
			const formatted = await contextProvider.getFormattedContext(input, "/test.ts")

			// Should contain comment-wrapped context
			expect(formatted).toContain("//")
			expect(formatted).toContain("/recent.ts")
		})

		it("should call getAllSnippetsWithoutRace and formatSnippets", async () => {
			const { getAllSnippetsWithoutRace } = await import(
				"../../../continuedev/core/autocomplete/snippets/getAllSnippets"
			)
			const { formatSnippets } = await import("../../../continuedev/core/autocomplete/templating/formatting")

			const input = createAutocompleteInput("/test.ts")
			await contextProvider.getFormattedContext(input, "/test.ts")

			// Verify integration with continuedev services
			expect(getAllSnippetsWithoutRace).toHaveBeenCalled()
			expect(formatSnippets).toHaveBeenCalled()
		})

		it("should handle errors gracefully and return empty string", async () => {
			const { getAllSnippetsWithoutRace } = await import(
				"../../../continuedev/core/autocomplete/snippets/getAllSnippets"
			)

			// Mock to throw error
			;(getAllSnippetsWithoutRace as any).mockRejectedValueOnce(new Error("Test error"))

			const input = createAutocompleteInput("/test.ts")
			const formatted = await contextProvider.getFormattedContext(input, "/test.ts")

			// Should return empty string instead of throwing
			expect(formatted).toBe("")
		})

		it("should convert recentlyVisitedRanges to include type property", async () => {
			const { HelperVars } = await import("../../../continuedev/core/autocomplete/util/HelperVars")

			// Clear previous calls
			vi.clearAllMocks()

			const input = createAutocompleteInput("/test.ts")
			input.recentlyVisitedRanges = [
				{
					filepath: "/visited.ts",
					range: { start: { line: 0, character: 0 }, end: { line: 1, character: 0 } },
					content: "visited code",
				},
			]

			await contextProvider.getFormattedContext(input, "/test.ts")

			// Verify HelperVars.create was called with input that has type property
			expect(HelperVars.create).toHaveBeenCalled()
			const createMock = HelperVars.create as any
			expect(createMock.mock.calls.length).toBeGreaterThan(0)

			if (createMock.mock.calls[0] && createMock.mock.calls[0][0]) {
				const callArgs = createMock.mock.calls[0][0]
				expect(callArgs.recentlyVisitedRanges).toBeDefined()
				expect(callArgs.recentlyVisitedRanges.length).toBe(1)
				expect(callArgs.recentlyVisitedRanges[0]).toHaveProperty("type")
				expect(callArgs.recentlyVisitedRanges[0].type).toBe(AutocompleteSnippetType.Code)
			}
		})

		it("should use token-based filtering via getSnippets", async () => {
			const { getSnippets } = await import("../../../continuedev/core/autocomplete/templating/filtering")

			const input = createAutocompleteInput("/test.ts")
			await contextProvider.getFormattedContext(input, "/test.ts")

			// Verify token-based filtering is used
			expect(getSnippets).toHaveBeenCalled()
		})
	})
})
