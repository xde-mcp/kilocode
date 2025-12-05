import { LLMClient } from "./llm-client.js"
import { HoleFiller } from "../services/ghost/classic-auto-complete/HoleFiller.js"
import { FimPromptBuilder } from "../services/ghost/classic-auto-complete/FillInTheMiddle.js"
import { extractPrefixSuffix, contextToAutocompleteInput } from "../services/ghost/types.js"
import { createContext } from "./utils.js"
import {
	createTestGhostModel,
	createMockContextProviderWithContent,
	modelSupportsFim,
	createProviderForTesting,
} from "./mock-context-provider.js"
import {
	GhostInlineCompletionProvider,
	findMatchingSuggestion,
} from "../services/ghost/classic-auto-complete/GhostInlineCompletionProvider.js"
import { GhostModel } from "../services/ghost/GhostModel.js"

export class GhostProviderTester {
	private llmClient: LLMClient
	private modelId: string
	private ghostModel: GhostModel
	private provider: GhostInlineCompletionProvider

	constructor() {
		this.modelId = process.env.LLM_MODEL || "mistralai/codestral-2508"
		this.llmClient = new LLMClient()
		this.ghostModel = createTestGhostModel(this.llmClient, this.modelId)

		// Create a base context provider for the provider instance
		const baseContextProvider = createMockContextProviderWithContent("", "", "/test/file.ts", this.ghostModel)
		this.provider = createProviderForTesting(baseContextProvider)
	}

	async getCompletion(
		code: string,
		testCaseName: string = "test",
	): Promise<{ prefix: string; completion: string; suffix: string }> {
		const context = createContext(code, testCaseName)
		const { prefix, suffix } = extractPrefixSuffix(
			context.document,
			context.range?.start ?? context.document.positionAt(0),
		)
		const autocompleteInput = contextToAutocompleteInput(context)
		const languageId = context.document.languageId || "javascript"

		// Create context provider with the actual content for prompt building
		const contextProvider = createMockContextProviderWithContent(
			prefix,
			suffix,
			autocompleteInput.filepath,
			this.ghostModel,
		)

		// Build the prompt using the appropriate strategy
		const supportsFim = modelSupportsFim(this.modelId)
		const prompt = supportsFim
			? await new FimPromptBuilder(contextProvider).getFimPrompts(autocompleteInput, this.modelId)
			: await new HoleFiller(contextProvider).getPrompts(autocompleteInput, languageId)

		// Use the provider's fetchAndCacheSuggestion method directly
		await this.provider.fetchAndCacheSuggestion(prompt, prefix, suffix, languageId)

		// Retrieve the cached suggestion using findMatchingSuggestion
		// Access the public suggestionsHistory property directly
		const result = findMatchingSuggestion(prefix, suffix, this.provider.suggestionsHistory)

		return { prefix, completion: result?.text ?? "", suffix }
	}

	getName(): string {
		const supportsFim = modelSupportsFim(this.modelId)
		return supportsFim ? "ghost-provider-fim" : "ghost-provider-holefiller"
	}

	dispose(): void {
		this.provider.dispose()
	}
}
