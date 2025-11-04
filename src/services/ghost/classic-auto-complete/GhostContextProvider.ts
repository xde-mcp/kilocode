import * as vscode from "vscode"
import { ContextRetrievalService } from "../../continuedev/core/autocomplete/context/ContextRetrievalService"
import { VsCodeIde } from "../../continuedev/core/vscode-test-harness/src/VSCodeIde"
import { AutocompleteInput } from "../types"
import { AutocompleteCodeSnippet, AutocompleteSnippetType } from "../../continuedev/core/autocomplete/snippets/types"
import { HelperVars } from "../../continuedev/core/autocomplete/util/HelperVars"
import { getAllSnippetsWithoutRace } from "../../continuedev/core/autocomplete/snippets/getAllSnippets"
import { getDefinitionsFromLsp } from "../../continuedev/core/vscode-test-harness/src/autocomplete/lsp"
import { DEFAULT_AUTOCOMPLETE_OPTS } from "../../continuedev/core/util/parameters"

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
}

/**
 * Format context snippets into a string suitable for adding to prompts
 * Pure function for easy testing without mocks
 */
export function formatContextForPrompt(snippets: ContextSnippets): string {
	let context = ""

	// Add recently opened files
	if (snippets.recentlyOpenedFiles.length > 0) {
		context += "<RECENTLY_OPENED_FILES>\n"
		snippets.recentlyOpenedFiles.slice(0, 3).forEach((snippet, index) => {
			const preview = snippet.content.split("\n").slice(0, 10).join("\n")
			context += `File ${index + 1}: ${snippet.filepath}\n${preview}\n...\n\n`
		})
		context += "</RECENTLY_OPENED_FILES>\n\n"
	}

	// Add import definitions
	if (snippets.importDefinitions.length > 0) {
		context += "<IMPORTED_SYMBOLS>\n"
		snippets.importDefinitions.slice(0, 3).forEach((snippet, index) => {
			const preview = snippet.content.split("\n").slice(0, 5).join("\n")
			context += `${index + 1}. From ${snippet.filepath}:\n${preview}\n\n`
		})
		context += "</IMPORTED_SYMBOLS>\n\n"
	}

	// Add root path context
	if (snippets.rootPath.length > 0) {
		context += "<SIMILAR_FILES>\n"
		snippets.rootPath.slice(0, 2).forEach((snippet, index) => {
			const preview = snippet.content.split("\n").slice(0, 5).join("\n")
			context += `${index + 1}. ${snippet.filepath}:\n${preview}\n\n`
		})
		context += "</SIMILAR_FILES>\n\n"
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

			// Map to our simplified ContextSnippets interface (just filepath and content)
			return {
				recentlyOpenedFiles: snippetPayload.recentlyOpenedFileSnippets.map((s) => ({
					filepath: s.filepath,
					content: s.content,
				})),
				importDefinitions: snippetPayload.importDefinitionSnippets.map((s) => ({
					filepath: s.filepath,
					content: s.content,
				})),
				rootPath: snippetPayload.rootPathSnippets.map((s) => ({
					filepath: s.filepath,
					content: s.content,
				})),
			}
		} catch (error) {
			console.warn("Failed to get context snippets:", error)
			// Return empty snippets on error to avoid breaking autocomplete
			return {
				recentlyOpenedFiles: [],
				importDefinitions: [],
				rootPath: [],
			}
		}
	}
}
