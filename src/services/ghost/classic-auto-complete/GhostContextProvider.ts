import * as vscode from "vscode"
import { ContextRetrievalService } from "../../continuedev/core/autocomplete/context/ContextRetrievalService"
import { VsCodeIde } from "../../continuedev/core/vscode-test-harness/src/VSCodeIde"
import { AutocompleteInput } from "../types"
import { AutocompleteSnippetType } from "../../continuedev/core/autocomplete/snippets/types"
import { HelperVars } from "../../continuedev/core/autocomplete/util/HelperVars"
import { getAllSnippetsWithoutRace } from "../../continuedev/core/autocomplete/snippets/getAllSnippets"
import { getDefinitionsFromLsp } from "../../continuedev/core/vscode-test-harness/src/autocomplete/lsp"
import { DEFAULT_AUTOCOMPLETE_OPTS } from "../../continuedev/core/util/parameters"
import { getSnippets } from "../../continuedev/core/autocomplete/templating/filtering"
import { formatSnippets } from "../../continuedev/core/autocomplete/templating/formatting"

function convertToContinuedevInput(autocompleteInput: AutocompleteInput) {
	return {
		...autocompleteInput,
		recentlyVisitedRanges: autocompleteInput.recentlyVisitedRanges.map((range) => ({
			...range,
			type: AutocompleteSnippetType.Code,
		})),
	}
}

export class GhostContextProvider {
	private contextService: ContextRetrievalService
	private ide: VsCodeIde

	constructor(context: vscode.ExtensionContext) {
		this.ide = new VsCodeIde(context)
		this.contextService = new ContextRetrievalService(this.ide)
	}

	/**
	 * Get context snippets for the current autocomplete request
	 * Returns comment-based formatted context that can be added to prompts
	 */
	async getFormattedContext(autocompleteInput: AutocompleteInput, filepath: string): Promise<string> {
		try {
			// Convert filepath to URI if it's not already one
			const filepathUri = filepath.startsWith("file://") ? filepath : vscode.Uri.file(filepath).toString()

			// Initialize import definitions cache
			await this.contextService.initializeForFile(filepathUri)

			const continuedevInput = convertToContinuedevInput(autocompleteInput)

			// Create helper with URI filepath
			const helperInput = {
				...continuedevInput,
				filepath: filepathUri,
			}

			const helper = await HelperVars.create(helperInput as any, DEFAULT_AUTOCOMPLETE_OPTS, "codestral", this.ide)

			const snippetPayload = await getAllSnippetsWithoutRace({
				helper,
				ide: this.ide,
				getDefinitionsFromLsp,
				contextRetrievalService: this.contextService,
			})

			const filteredSnippets = getSnippets(helper, snippetPayload)

			// Convert all snippet filepaths to URIs
			const snippetsWithUris = filteredSnippets.map((snippet: any) => ({
				...snippet,
				filepath: snippet.filepath?.startsWith("file://")
					? snippet.filepath
					: vscode.Uri.file(snippet.filepath).toString(),
			}))

			const workspaceDirs = await this.ide.getWorkspaceDirs()
			const formattedContext = formatSnippets(helper, snippetsWithUris, workspaceDirs)

			console.log("[GhostContextProvider] - formattedContext:", formattedContext)

			return formattedContext
		} catch (error) {
			console.warn("Failed to get formatted context:", error)
			return ""
		}
	}
}
