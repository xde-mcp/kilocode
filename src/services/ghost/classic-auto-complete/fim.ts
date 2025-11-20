import { AutocompleteInput } from "../types"
import { GhostContextProvider } from "./GhostContextProvider"
import { getTemplateForModel } from "../../continuedev/core/autocomplete/templating/AutocompleteTemplate"

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
}
