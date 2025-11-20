import { AutocompleteInput } from "../types"
import { GhostContextProvider } from "./GhostContextProvider"
import { getTemplateForModel } from "../../continuedev/core/autocomplete/templating/AutocompleteTemplate"
import { GhostModel } from "../GhostModel"
import { FillInAtCursorSuggestion } from "./HoleFiller"

export interface FimCompletionResult {
	suggestion: FillInAtCursorSuggestion
	cost: number
	inputTokens: number
	outputTokens: number
	cacheWriteTokens: number
	cacheReadTokens: number
}

export class FimPromptBuilder {
	constructor(private contextProvider: GhostContextProvider) {}

	/**
	 * Build FIM (Fill-In-the-Middle) prompts with formatted prefix and pruned suffix
	 */
	async getFimPrompts(
		autocompleteInput: AutocompleteInput,
		modelName: string,
	): Promise<{
		formattedPrefix: string
		prunedSuffix: string
	}> {
		const { filepathUri, helper, snippetsWithUris, workspaceDirs } =
			await this.contextProvider.getProcessedSnippets(autocompleteInput, autocompleteInput.filepath)

		// Use pruned prefix/suffix from HelperVars (token-limited based on DEFAULT_AUTOCOMPLETE_OPTS)
		const prunedPrefixRaw = helper.prunedPrefix
		const prunedSuffix = helper.prunedSuffix

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

		return { formattedPrefix, prunedSuffix }
	}

	/**
	 * Execute FIM-based completion using the model
	 */
	async getFromFIM(
		model: GhostModel,
		formattedPrefix: string,
		prunedSuffix: string,
		autocompleteInput: AutocompleteInput,
		processSuggestion: (
			text: string,
			prefix: string,
			suffix: string,
			model: GhostModel,
		) => FillInAtCursorSuggestion,
	): Promise<FimCompletionResult> {
		let perflog = ""
		const logtime = (() => {
			let timestamp = performance.now()
			return (msg: string) => {
				const baseline = timestamp
				timestamp = performance.now()
				perflog += `${msg}: ${timestamp - baseline}\n`
			}
		})()

		// Get helper for full prefix/suffix (needed for processSuggestion)
		const { helper } = await this.contextProvider.getProcessedSnippets(
			autocompleteInput,
			autocompleteInput.filepath,
		)
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

		const fillInAtCursorSuggestion = processSuggestion(response, helper.fullPrefix, helper.fullSuffix, model)

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
