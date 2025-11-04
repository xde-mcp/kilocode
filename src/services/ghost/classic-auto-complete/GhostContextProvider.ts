import * as vscode from "vscode"
import { ContextRetrievalService } from "../../continuedev/core/autocomplete/context/ContextRetrievalService"
import { VsCodeIde } from "../../continuedev/core/vscode-test-harness/src/VSCodeIde"
import { AutocompleteInput } from "../types"
import { AutocompleteCodeSnippet, AutocompleteSnippetType } from "../../continuedev/core/autocomplete/snippets/types"
import { HelperVars } from "../../continuedev/core/autocomplete/util/HelperVars"
import { getAllSnippetsWithoutRace } from "../../continuedev/core/autocomplete/snippets/getAllSnippets"
import { getDefinitionsFromLsp } from "../../continuedev/core/vscode-test-harness/src/autocomplete/lsp"
import { DEFAULT_AUTOCOMPLETE_OPTS } from "../../continuedev/core/util/parameters"
import { getSnippets } from "../../continuedev/core/autocomplete/templating/filtering"

/**
 * Simplified snippet type for context - just needs filepath and content
 */
export interface ContextSnippet {
	filepath: string
	content: string
}

export interface ContextSnippets {
	recentlyOpenedFiles: ContextSnippet[]
	importDefinitions: ContextSnippet[]
	rootPath: ContextSnippet[]
	clipboard: ContextSnippet[]
	static: ContextSnippet[]
	recentlyVisited: ContextSnippet[]
	recentlyEdited: ContextSnippet[]
}

/**
 * Helper to format a section of snippets with consistent XML tags
 */
function formatSection(
	snippets: ContextSnippet[],
	tagName: string,
	formatter: (snippet: ContextSnippet, index: number) => string,
): string {
	if (snippets.length === 0) return ""

	let section = `<${tagName}>\n`
	snippets.forEach((snippet, index) => {
		section += formatter(snippet, index)
	})
	section += `</${tagName}>\n\n`

	return section
}

/**
 * Format context snippets into a string suitable for adding to prompts
 * Pure function for easy testing without mocks
 */
export function formatContextForPrompt(snippets: ContextSnippets): string {
	let context = ""

	// Add clipboard (highest priority)
	context += formatSection(snippets.clipboard, "CLIPBOARD", (snippet, index) => {
		const preview = snippet.content.split("\n").slice(0, 5).join("\n")
		return `${index + 1}. ${snippet.content.length > 200 ? preview + "\n..." : snippet.content}\n\n`
	})

	// Add recently opened files
	context += formatSection(snippets.recentlyOpenedFiles, "RECENTLY_OPENED_FILES", (snippet, index) => {
		const preview = snippet.content.split("\n").slice(0, 10).join("\n")
		const hasMore = snippet.content.split("\n").length > 10
		return `File ${index + 1}: ${snippet.filepath}\n${preview}\n${hasMore ? "...\n" : ""}\n`
	})

	// Add recently visited ranges
	context += formatSection(snippets.recentlyVisited, "RECENTLY_VISITED", (snippet, index) => {
		const preview = snippet.content.split("\n").slice(0, 5).join("\n")
		return `${index + 1}. ${snippet.filepath}:\n${preview}\n\n`
	})

	// Add recently edited ranges
	context += formatSection(snippets.recentlyEdited, "RECENTLY_EDITED", (snippet, index) => {
		const preview = snippet.content.split("\n").slice(0, 5).join("\n")
		return `${index + 1}. ${snippet.filepath}:\n${preview}\n\n`
	})

	// Add import definitions
	context += formatSection(snippets.importDefinitions, "IMPORTED_SYMBOLS", (snippet, index) => {
		const preview = snippet.content.split("\n").slice(0, 5).join("\n")
		return `${index + 1}. From ${snippet.filepath}:\n${preview}\n\n`
	})

	// Add root path context (similar files)
	context += formatSection(snippets.rootPath, "SIMILAR_FILES", (snippet, index) => {
		const preview = snippet.content.split("\n").slice(0, 5).join("\n")
		return `${index + 1}. ${snippet.filepath}:\n${preview}\n\n`
	})

	// Add static context (tree-sitter analysis)
	context += formatSection(snippets.static, "CODE_STRUCTURE", (snippet, index) => {
		return `${index + 1}. ${snippet.content}\n\n`
	})

	return context
}

/**
 * Helper to create empty ContextSnippets
 */
function createEmptyContextSnippets(): ContextSnippets {
	return {
		recentlyOpenedFiles: [],
		importDefinitions: [],
		rootPath: [],
		clipboard: [],
		static: [],
		recentlyVisited: [],
		recentlyEdited: [],
	}
}

/**
 * Convert Ghost AutocompleteInput to continuedev format
 */
function convertToContinuedevInput(autocompleteInput: AutocompleteInput) {
	return {
		...autocompleteInput,
		recentlyVisitedRanges: autocompleteInput.recentlyVisitedRanges.map((range) => ({
			...range,
			type: AutocompleteSnippetType.Code,
		})),
	}
}

/**
 * Categorize filtered snippets by type
 */
function categorizeSnippets(filteredSnippets: any[], snippetPayload: any): ContextSnippets {
	const result = createEmptyContextSnippets()

	// Create lookup sets for efficient categorization
	const categoryMaps = {
		recentlyEdited: new Set(snippetPayload.recentlyEditedRangeSnippets.map((s: any) => s.filepath)),
		recentlyOpened: new Set(snippetPayload.recentlyOpenedFileSnippets.map((s: any) => s.filepath)),
		recentlyVisited: new Set(snippetPayload.recentlyVisitedRangesSnippets.map((s: any) => s.filepath)),
		importDef: new Set(snippetPayload.importDefinitionSnippets.map((s: any) => s.filepath)),
		rootPath: new Set(snippetPayload.rootPathSnippets.map((s: any) => s.filepath)),
	}

	filteredSnippets.forEach((snippet) => {
		const contextSnippet: ContextSnippet = {
			filepath: (snippet as AutocompleteCodeSnippet).filepath || "clipboard",
			content: snippet.content,
		}

		switch (snippet.type) {
			case AutocompleteSnippetType.Clipboard:
				result.clipboard.push(contextSnippet)
				break
			case AutocompleteSnippetType.Static:
				result.static.push(contextSnippet)
				break
			case AutocompleteSnippetType.Code: {
				const codeSnippet = snippet as AutocompleteCodeSnippet
				// Check in priority order
				if (categoryMaps.recentlyEdited.has(codeSnippet.filepath)) {
					result.recentlyEdited.push(contextSnippet)
				} else if (categoryMaps.recentlyOpened.has(codeSnippet.filepath)) {
					result.recentlyOpenedFiles.push(contextSnippet)
				} else if (categoryMaps.recentlyVisited.has(codeSnippet.filepath)) {
					result.recentlyVisited.push(contextSnippet)
				} else if (categoryMaps.importDef.has(codeSnippet.filepath)) {
					result.importDefinitions.push(contextSnippet)
				} else if (categoryMaps.rootPath.has(codeSnippet.filepath)) {
					result.rootPath.push(contextSnippet)
				}
				break
			}
		}
	})

	return result
}

/**
 * Provides code context for autocomplete prompts by wrapping continuedev's context services
 */
export class GhostContextProvider {
	private contextService: ContextRetrievalService
	private ide: VsCodeIde

	constructor(context: vscode.ExtensionContext) {
		this.ide = new VsCodeIde(context)
		this.contextService = new ContextRetrievalService(this.ide)
	}

	/**
	 * Get context snippets for the current autocomplete request
	 * Returns formatted context that can be added to prompts
	 */
	async getContextSnippets(autocompleteInput: AutocompleteInput, filepath: string): Promise<ContextSnippets> {
		try {
			// Initialize import definitions cache
			await this.contextService.initializeForFile(filepath)

			// Convert input format and create helper
			const continuedevInput = convertToContinuedevInput(autocompleteInput)
			const helper = await HelperVars.create(
				continuedevInput as any,
				DEFAULT_AUTOCOMPLETE_OPTS,
				"codestral",
				this.ide,
			)

			// Get all available snippets
			const snippetPayload = await getAllSnippetsWithoutRace({
				helper,
				ide: this.ide,
				getDefinitionsFromLsp,
				contextRetrievalService: this.contextService,
			})

			// Apply token-based filtering and categorize
			const filteredSnippets = getSnippets(helper, snippetPayload)
			return categorizeSnippets(filteredSnippets, snippetPayload)
		} catch (error) {
			console.warn("Failed to get context snippets:", error)
			return createEmptyContextSnippets()
		}
	}
}
