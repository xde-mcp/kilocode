import { describe, it, expect, beforeEach, vi } from "vitest"
import { GhostContextProvider, formatContextForPrompt, ContextSnippets } from "../GhostContextProvider"
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
		getWorkspaceDirs: vi.fn().mockResolvedValue([]),
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
			lang: { name: "typescript", topLevelKeywords: [] },
			treePath: undefined,
			workspaceUris: [],
			options: {},
			modelName: "gpt-4",
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
		]
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

	describe("getContextSnippets", () => {
		it("should return empty snippets when getAllSnippetsWithoutRace returns empty", async () => {
			const input = createAutocompleteInput("/test.ts")
			const snippets = await contextProvider.getContextSnippets(input, "/test.ts")

			expect(snippets).toBeDefined()
			expect(snippets.recentlyOpenedFiles).toEqual([])
			expect(snippets.importDefinitions).toEqual([])
			expect(snippets.rootPath).toEqual([])
		})

		it("should call getAllSnippetsWithoutRace with correct parameters", async () => {
			const { getAllSnippetsWithoutRace } = await import(
				"../../../continuedev/core/autocomplete/snippets/getAllSnippets"
			)
			const input = createAutocompleteInput("/test.ts")

			await contextProvider.getContextSnippets(input, "/test.ts")

			expect(getAllSnippetsWithoutRace).toHaveBeenCalled()
		})

		it("should return snippets from getAllSnippetsWithoutRace", async () => {
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
						range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
					},
				],
				importDefinitionSnippets: [
					{
						filepath: "/import.ts",
						content: "export const imported = 2;",
						type: AutocompleteSnippetType.Code,
						range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
					},
				],
				rootPathSnippets: [
					{
						filepath: "/root.ts",
						content: "const root = 3;",
						type: AutocompleteSnippetType.Code,
						range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
					},
				],
				recentlyEditedRangeSnippets: [],
				recentlyVisitedRangesSnippets: [],
				diffSnippets: [],
				clipboardSnippets: [],
				ideSnippets: [],
				staticSnippet: [],
			})

			const input = createAutocompleteInput("/test.ts")
			const snippets = await contextProvider.getContextSnippets(input, "/test.ts")

			expect(snippets.recentlyOpenedFiles).toHaveLength(1)
			expect(snippets.recentlyOpenedFiles[0].filepath).toBe("/recent.ts")
			expect(snippets.importDefinitions).toHaveLength(1)
			expect(snippets.importDefinitions[0].filepath).toBe("/import.ts")
			expect(snippets.rootPath).toHaveLength(1)
			expect(snippets.rootPath[0].filepath).toBe("/root.ts")
		})

		it("should handle errors gracefully and return empty snippets", async () => {
			const { getAllSnippetsWithoutRace } = await import(
				"../../../continuedev/core/autocomplete/snippets/getAllSnippets"
			)

			// Mock to throw error
			;(getAllSnippetsWithoutRace as any).mockRejectedValueOnce(new Error("Test error"))

			const input = createAutocompleteInput("/test.ts")
			const snippets = await contextProvider.getContextSnippets(input, "/test.ts")

			// Should return empty snippets instead of throwing
			expect(snippets).toBeDefined()
			expect(snippets.recentlyOpenedFiles).toEqual([])
			expect(snippets.importDefinitions).toEqual([])
			expect(snippets.rootPath).toEqual([])
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

			await contextProvider.getContextSnippets(input, "/test.ts")

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
	})
})

// Pure function tests - no mocks needed!
describe("formatContextForPrompt", () => {
	it("should return empty string for empty snippets", () => {
		const snippets: ContextSnippets = {
			recentlyOpenedFiles: [],
			importDefinitions: [],
			rootPath: [],
			clipboard: [],
			static: [],
			recentlyVisited: [],
			recentlyEdited: [],
		}

		const formatted = formatContextForPrompt(snippets)
		expect(formatted).toBe("")
	})

	it("should format recently opened files", () => {
		const snippets: ContextSnippets = {
			recentlyOpenedFiles: [
				{
					filepath: "/test1.ts",
					content: "const x = 1;\nconst y = 2;",
				},
			],
			importDefinitions: [],
			rootPath: [],
			clipboard: [],
			static: [],
			recentlyVisited: [],
			recentlyEdited: [],
		}

		const formatted = formatContextForPrompt(snippets)
		const expected = `<RECENTLY_OPENED_FILES>
File 1: /test1.ts
const x = 1;
const y = 2;

</RECENTLY_OPENED_FILES>

`
		expect(formatted).toBe(expected)
	})

	it("should format import definitions", () => {
		const snippets: ContextSnippets = {
			recentlyOpenedFiles: [],
			importDefinitions: [
				{
					filepath: "/utils.ts",
					content: "export function sum(a: number, b: number) { return a + b; }",
				},
			],
			rootPath: [],
			clipboard: [],
			static: [],
			recentlyVisited: [],
			recentlyEdited: [],
		}

		const formatted = formatContextForPrompt(snippets)
		const expected = `<IMPORTED_SYMBOLS>
1. From /utils.ts:
export function sum(a: number, b: number) { return a + b; }

</IMPORTED_SYMBOLS>

`
		expect(formatted).toBe(expected)
	})

	it("should format root path context", () => {
		const snippets: ContextSnippets = {
			recentlyOpenedFiles: [],
			importDefinitions: [],
			rootPath: [
				{
					filepath: "/similar.ts",
					content: "interface User { name: string; }",
				},
			],
			clipboard: [],
			static: [],
			recentlyVisited: [],
			recentlyEdited: [],
		}

		const formatted = formatContextForPrompt(snippets)
		const expected = `<SIMILAR_FILES>
1. /similar.ts:
interface User { name: string; }

</SIMILAR_FILES>

`
		expect(formatted).toBe(expected)
	})

	it("should format all provided snippets", () => {
		const snippets: ContextSnippets = {
			recentlyOpenedFiles: [
				{ filepath: "/test0.ts", content: "const x0 = 0;" },
				{ filepath: "/test1.ts", content: "const x1 = 1;" },
				{ filepath: "/test2.ts", content: "const x2 = 2;" },
			],
			importDefinitions: [],
			rootPath: [],
			clipboard: [],
			static: [],
			recentlyVisited: [],
			recentlyEdited: [],
		}

		const formatted = formatContextForPrompt(snippets)
		const expected = `<RECENTLY_OPENED_FILES>
File 1: /test0.ts
const x0 = 0;

File 2: /test1.ts
const x1 = 1;

File 3: /test2.ts
const x2 = 2;

</RECENTLY_OPENED_FILES>

`
		expect(formatted).toBe(expected)
	})

	it("should show preview of large file contents", () => {
		const largeContent = Array(50)
			.fill(null)
			.map((_, i) => `line ${i}`)
			.join("\n")

		const snippets: ContextSnippets = {
			recentlyOpenedFiles: [
				{
					filepath: "/large.ts",
					content: largeContent,
				},
			],
			importDefinitions: [],
			rootPath: [],
			clipboard: [],
			static: [],
			recentlyVisited: [],
			recentlyEdited: [],
		}

		const formatted = formatContextForPrompt(snippets)
		const expected = `<RECENTLY_OPENED_FILES>
File 1: /large.ts
line 0
line 1
line 2
line 3
line 4
line 5
line 6
line 7
line 8
line 9
...

</RECENTLY_OPENED_FILES>

`
		expect(formatted).toBe(expected)
	})

	it("should format clipboard snippets", () => {
		const snippets: ContextSnippets = {
			recentlyOpenedFiles: [],
			importDefinitions: [],
			rootPath: [],
			clipboard: [
				{
					filepath: "clipboard",
					content: "copied text",
				},
			],
			static: [],
			recentlyVisited: [],
			recentlyEdited: [],
		}

		const formatted = formatContextForPrompt(snippets)
		const expected = `<CLIPBOARD>
1. copied text

</CLIPBOARD>

`
		expect(formatted).toBe(expected)
	})

	it("should format static context snippets", () => {
		const snippets: ContextSnippets = {
			recentlyOpenedFiles: [],
			importDefinitions: [],
			rootPath: [],
			clipboard: [],
			static: [
				{
					filepath: "structure",
					content: "class User { constructor() {} }",
				},
			],
			recentlyVisited: [],
			recentlyEdited: [],
		}

		const formatted = formatContextForPrompt(snippets)
		const expected = `<CODE_STRUCTURE>
1. class User { constructor() {} }

</CODE_STRUCTURE>

`
		expect(formatted).toBe(expected)
	})

	it("should format recently visited snippets", () => {
		const snippets: ContextSnippets = {
			recentlyOpenedFiles: [],
			importDefinitions: [],
			rootPath: [],
			clipboard: [],
			static: [],
			recentlyVisited: [
				{
					filepath: "/visited.ts",
					content: "const visited = true;",
				},
			],
			recentlyEdited: [],
		}

		const formatted = formatContextForPrompt(snippets)
		const expected = `<RECENTLY_VISITED>
1. /visited.ts:
const visited = true;

</RECENTLY_VISITED>

`
		expect(formatted).toBe(expected)
	})

	it("should format recently edited snippets", () => {
		const snippets: ContextSnippets = {
			recentlyOpenedFiles: [],
			importDefinitions: [],
			rootPath: [],
			clipboard: [],
			static: [],
			recentlyVisited: [],
			recentlyEdited: [
				{
					filepath: "/edited.ts",
					content: "const edited = true;",
				},
			],
		}

		const formatted = formatContextForPrompt(snippets)
		const expected = `<RECENTLY_EDITED>
1. /edited.ts:
const edited = true;

</RECENTLY_EDITED>

`
		expect(formatted).toBe(expected)
	})
})
