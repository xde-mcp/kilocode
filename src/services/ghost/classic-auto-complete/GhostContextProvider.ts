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
 * Format context snippets into a string suitable for adding to prompts
 * Pure function for easy testing without mocks
 */
export function formatContextForPrompt(snippets: ContextSnippets): string {
	let context = ""

	// Add clipboard (highest priority in continuedev)
	if (snippets.clipboard.length > 0) {
		context += "<CLIPBOARD>\n"
		snippets.clipboard.forEach((snippet, index) => {
			const preview = snippet.content.split("\n").slice(0, 5).join("\n")
			context += `${index + 1}. ${snippet.content.length > 200 ? preview + "\n..." : snippet.content}\n\n`
		})
		context += "</CLIPBOARD>\n\n"
	}

	// Add recently opened files
	if (snippets.recentlyOpenedFiles.length > 0) {
		context += "<RECENTLY_OPENED_FILES>\n"
		snippets.recentlyOpenedFiles.forEach((snippet, index) => {
			const preview = snippet.content.split("\n").slice(0, 10).join("\n")
			context += `File ${index + 1}: ${snippet.filepath}\n${preview}\n${
				snippet.content.split("\n").length > 10 ? "...\n" : ""
			}\n`
		})
		context += "</RECENTLY_OPENED_FILES>\n\n"
	}

	// Add recently visited ranges
	if (snippets.recentlyVisited.length > 0) {
		context += "<RECENTLY_VISITED>\n"
		snippets.recentlyVisited.forEach((snippet, index) => {
			const preview = snippet.content.split("\n").slice(0, 5).join("\n")
			context += `${index + 1}. ${snippet.filepath}:\n${preview}\n\n`
		})
		context += "</RECENTLY_VISITED>\n\n"
	}

	// Add import definitions
	if (snippets.importDefinitions.length > 0) {
		context += "<IMPORTED_SYMBOLS>\n"
		snippets.importDefinitions.forEach((snippet, index) => {
			const preview = snippet.content.split("\n").slice(0, 5).join("\n")
			context += `${index + 1}. From ${snippet.filepath}:\n${preview}\n\n`
		})
		context += "</IMPORTED_SYMBOLS>\n\n"
	}

	// Add root path context (similar files)
	if (snippets.rootPath.length > 0) {
		context += "<SIMILAR_FILES>\n"
		snippets.rootPath.forEach((snippet, index) => {
			const preview = snippet.content.split("\n").slice(0, 5).join("\n")
			context += `${index + 1}. ${snippet.filepath}:\n${preview}\n\n`
		})
		context += "</SIMILAR_FILES>\n\n"
	}

	// Add recently edited ranges
	if (snippets.recentlyEdited.length > 0) {
		context += "<RECENTLY_EDITED>\n"
		snippets.recentlyEdited.forEach((snippet, index) => {
			const preview = snippet.content.split("\n").slice(0, 5).join("\n")
			context += `${index + 1}. ${snippet.filepath}:\n${preview}\n\n`
		})
		context += "</RECENTLY_EDITED>\n\n"
	}

	// Add static context (tree-sitter analysis)
	if (snippets.static.length > 0) {
		context += "<CODE_STRUCTURE>\n"
		snippets.static.forEach((snippet, index) => {
			context += `${index + 1}. ${snippet.content}\n\n`
		})
		context += "</CODE_STRUCTURE>\n\n"
	}

	return context
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
			// Initialize import definitions cache for the file
			await this.contextService.initializeForFile(filepath)

			// Convert to continuedev AutocompleteInput format by adding type property
			const continuedevInput = {
				...autocompleteInput,
				recentlyVisitedRanges: autocompleteInput.recentlyVisitedRanges.map((range) => ({
					...range,
					type: AutocompleteSnippetType.Code,
				})),
			}

			// Create HelperVars with default autocomplete options
			const helper = await HelperVars.create(
				continuedevInput as any,
				DEFAULT_AUTOCOMPLETE_OPTS,
				"codestral", // Default model name for token counting
				this.ide,
			)

			// Get all snippets using continuedev's context gathering
			const snippetPayload = await getAllSnippetsWithoutRace({
				helper,
				ide: this.ide,
				getDefinitionsFromLsp,
				contextRetrievalService: this.contextService,
			})

			// Use continuedev's token-based filtering for intelligent snippet selection
			const filteredSnippets = getSnippets(helper, snippetPayload)

			// Organize filtered snippets by type using snippet.type property
			const snippetsByType: ContextSnippets = {
				recentlyOpenedFiles: [],
				importDefinitions: [],
				rootPath: [],
				clipboard: [],
				static: [],
				recentlyVisited: [],
				recentlyEdited: [],
			}

			// Create lookup sets for categorization (since getSnippets() mixes all types)
			const recentlyOpenedSet = new Set(snippetPayload.recentlyOpenedFileSnippets.map((s) => s.filepath))
			const importDefSet = new Set(snippetPayload.importDefinitionSnippets.map((s) => s.filepath))
			const rootPathSet = new Set(snippetPayload.rootPathSnippets.map((s) => s.filepath))
			const recentlyVisitedSet = new Set(snippetPayload.recentlyVisitedRangesSnippets.map((s) => s.filepath))
			const recentlyEditedSet = new Set(snippetPayload.recentlyEditedRangeSnippets.map((s) => s.filepath))

			// Categorize each filtered snippet
			filteredSnippets.forEach((snippet) => {
				const contextSnippet: ContextSnippet = {
					filepath: (snippet as AutocompleteCodeSnippet).filepath || "clipboard",
					content: snippet.content,
				}

				// Use type and filepath to determine category
				switch (snippet.type) {
					case AutocompleteSnippetType.Clipboard:
						snippetsByType.clipboard.push(contextSnippet)
						break
					case AutocompleteSnippetType.Static:
						snippetsByType.static.push(contextSnippet)
						break
					case AutocompleteSnippetType.Code: {
						// Further categorize Code snippets by matching filepath
						const codeSnippet = snippet as AutocompleteCodeSnippet
						if (recentlyEditedSet.has(codeSnippet.filepath)) {
							snippetsByType.recentlyEdited.push(contextSnippet)
						} else if (recentlyOpenedSet.has(codeSnippet.filepath)) {
							snippetsByType.recentlyOpenedFiles.push(contextSnippet)
						} else if (recentlyVisitedSet.has(codeSnippet.filepath)) {
							snippetsByType.recentlyVisited.push(contextSnippet)
						} else if (importDefSet.has(codeSnippet.filepath)) {
							snippetsByType.importDefinitions.push(contextSnippet)
						} else if (rootPathSet.has(codeSnippet.filepath)) {
							snippetsByType.rootPath.push(contextSnippet)
						}
						break
					}
				}
			})

			return snippetsByType
		} catch (error) {
			console.warn("Failed to get context snippets:", error)
			// Return empty snippets on error to avoid breaking autocomplete
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
	}
}
