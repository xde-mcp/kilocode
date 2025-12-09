import {
	AutocompleteInput,
	GhostContextProvider,
	FimGhostPrompt,
	FimCompletionResult,
	FillInAtCursorSuggestion,
} from "../types"
import { getProcessedSnippets } from "./getProcessedSnippets"
import { getTemplateForModel } from "../../continuedev/core/autocomplete/templating/AutocompleteTemplate"
import { GhostModel } from "../GhostModel"

export type { FimGhostPrompt, FimCompletionResult }

export class FimPromptBuilder {
	constructor(private contextProvider: GhostContextProvider) {}

	/**
	 * Build complete FIM prompt with all necessary data
	 */
	async getFimPrompts(autocompleteInput: AutocompleteInput, modelName: string): Promise<FimGhostPrompt> {
		// Check if this is a request with manually passed content
		// JetBrains sends the full file content and we extract prefix/suffix in extractPrefixSuffix
		// Using HelperVars would re-read from a cached/stale document, causing incorrect context
		const hasManualContent = autocompleteInput.manuallyPassPrefix !== undefined

		let prunedPrefixRaw: string
		let prunedSuffix: string
		let filepathUri: string
		let snippetsWithUris: any[] = []
		let workspaceDirs: string[] = []

		if (hasManualContent && autocompleteInput.manuallyPassPrefix) {
			prunedPrefixRaw = autocompleteInput.manuallyPassPrefix
			if (autocompleteInput.manuallyPassFileContents) {
				const fullContent = autocompleteInput.manuallyPassFileContents
				const prefixLength = prunedPrefixRaw.length
				prunedSuffix = fullContent.substring(prefixLength)
			} else {
				prunedSuffix = ""
			}
			filepathUri = autocompleteInput.filepath.startsWith("file://")
				? autocompleteInput.filepath
				: `file://${autocompleteInput.filepath}`
		} else {
			// For VSCode: Use the normal flow with HelperVars and snippet processing
			const processed = await getProcessedSnippets(
				autocompleteInput,
				autocompleteInput.filepath,
				this.contextProvider.contextService,
				this.contextProvider.model,
				this.contextProvider.ide,
				this.contextProvider.ignoreController,
			)

			filepathUri = processed.filepathUri
			snippetsWithUris = processed.snippetsWithUris
			workspaceDirs = processed.workspaceDirs

			// Use pruned prefix/suffix from HelperVars (token-limited based on DEFAULT_AUTOCOMPLETE_OPTS)
			prunedPrefixRaw = processed.helper.prunedPrefix
			prunedSuffix = processed.helper.prunedSuffix
		}

		const template = getTemplateForModel(modelName)

		let formattedPrefix = prunedPrefixRaw
		if (template.compilePrefixSuffix && prunedSuffix) {
			const [compiledPrefix] = template.compilePrefixSuffix(
				prunedPrefixRaw,
				prunedSuffix,
				filepathUri,
				"", // reponame not used in our context
				snippetsWithUris,
				workspaceDirs,
			)
			formattedPrefix = compiledPrefix
		}

		return {
			strategy: "fim",
			formattedPrefix,
			prunedSuffix,
			autocompleteInput,
		}
	}

	/**
	 * Execute FIM-based completion using the model
	 */
	async getFromFIM(
		model: GhostModel,
		prompt: FimGhostPrompt,
		processSuggestion: (text: string) => FillInAtCursorSuggestion,
	): Promise<FimCompletionResult> {
		const { formattedPrefix, prunedSuffix, autocompleteInput } = prompt
		let perflog = ""
		const logtime = (() => {
			let timestamp = performance.now()
			return (msg: string) => {
				const baseline = timestamp
				timestamp = performance.now()
				perflog += `${msg}: ${timestamp - baseline}\n`
			}
		})()

		logtime("snippets")

		console.log("[FIM] formattedPrefix:", formattedPrefix)

		let response = ""
		const onChunk = (text: string) => {
			response += text
		}
		logtime("prep fim")
		const usageInfo = await model.generateFimResponse(
			formattedPrefix,
			prunedSuffix,
			onChunk,
			autocompleteInput.completionId, // Pass completionId as taskId for tracking
		)
		logtime("fim network")
		console.log("[FIM] response:", response)

		const fillInAtCursorSuggestion = processSuggestion(response)

		if (fillInAtCursorSuggestion.text) {
			console.info("Final FIM suggestion:", fillInAtCursorSuggestion)
		}
		logtime("processSuggestion")
		console.log(perflog + `lengths: ${formattedPrefix.length + prunedSuffix.length}\n`)
		return {
			suggestion: fillInAtCursorSuggestion,
			cost: usageInfo.cost,
			inputTokens: usageInfo.inputTokens,
			outputTokens: usageInfo.outputTokens,
			cacheWriteTokens: usageInfo.cacheWriteTokens,
			cacheReadTokens: usageInfo.cacheReadTokens,
		}
	}
}
