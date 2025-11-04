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

	describe("formatContextForPrompt", () => {
		it("should return empty string for empty snippets", () => {
			const snippets = {
				recentlyOpenedFiles: [],
				importDefinitions: [],
				rootPath: [],
			}

			const formatted = contextProvider.formatContextForPrompt(snippets)
			expect(formatted).toBe("")
		})

		it("should format recently opened files", () => {
			const snippets = {
				recentlyOpenedFiles: [
					{
						filepath: "/test1.ts",
						content: "const x = 1;\nconst y = 2;",
					},
				],
				importDefinitions: [],
				rootPath: [],
			}

			const formatted = contextProvider.formatContextForPrompt(snippets)
			expect(formatted).toContain("<RECENTLY_OPENED_FILES>")
			expect(formatted).toContain("</RECENTLY_OPENED_FILES>")
			expect(formatted).toContain("/test1.ts")
			expect(formatted).toContain("const x = 1;")
		})

		it("should format import definitions", () => {
			const snippets = {
				recentlyOpenedFiles: [],
				importDefinitions: [
					{
						filepath: "/utils.ts",
						content: "export function sum(a: number, b: number) { return a + b; }",
					},
				],
				rootPath: [],
			}

			const formatted = contextProvider.formatContextForPrompt(snippets)
			expect(formatted).toContain("<IMPORTED_SYMBOLS>")
			expect(formatted).toContain("</IMPORTED_SYMBOLS>")
			expect(formatted).toContain("/utils.ts")
			expect(formatted).toContain("export function sum")
		})

		it("should format root path context", () => {
			const snippets = {
				recentlyOpenedFiles: [],
				importDefinitions: [],
				rootPath: [
					{
						filepath: "/similar.ts",
						content: "interface User { name: string; }",
					},
				],
			}

			const formatted = contextProvider.formatContextForPrompt(snippets)
			expect(formatted).toContain("<SIMILAR_FILES>")
			expect(formatted).toContain("</SIMILAR_FILES>")
			expect(formatted).toContain("/similar.ts")
			expect(formatted).toContain("interface User")
		})

		it("should limit number of snippets per category", () => {
			const snippets = {
				recentlyOpenedFiles: Array(10)
					.fill(null)
					.map((_, i) => ({
						filepath: `/test${i}.ts`,
						content: `const x${i} = ${i};`,
					})),
				importDefinitions: [],
				rootPath: [],
			}

			const formatted = contextProvider.formatContextForPrompt(snippets)
			// Should only include first 3 files
			expect(formatted).toContain("/test0.ts")
			expect(formatted).toContain("/test1.ts")
			expect(formatted).toContain("/test2.ts")
			expect(formatted).not.toContain("/test3.ts")
		})

		it("should truncate large file contents", () => {
			const largeContent = Array(50)
				.fill(null)
				.map((_, i) => `line ${i}`)
				.join("\n")

			const snippets = {
				recentlyOpenedFiles: [
					{
						filepath: "/large.ts",
						content: largeContent,
					},
				],
				importDefinitions: [],
				rootPath: [],
			}

			const formatted = contextProvider.formatContextForPrompt(snippets)
			// Should only show first 10 lines
			expect(formatted).toContain("line 0")
			expect(formatted).toContain("line 9")
			expect(formatted).toContain("...")
			expect(formatted).not.toContain("line 40")
		})
	})
})
