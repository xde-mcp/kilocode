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
import { formatSnippets } from "../../continuedev/core/autocomplete/templating/formatting"

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
	async getFormattedContext(autocompleteInput: AutocompleteInput, filepath: string): Promise<string> {
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

			// Apply token-based filtering
			const filteredSnippets = getSnippets(helper, snippetPayload)

			// Get workspace directories for relative path formatting
			const workspaceDirs = await this.ide.getWorkspaceDirs()

			// Use continuedev's proven comment-based formatting
			const formattedContext = formatSnippets(helper, filteredSnippets, workspaceDirs)

			return formattedContext
		} catch (error) {
			console.warn("Failed to get formatted context:", error)
			return ""
		}
	}
}
