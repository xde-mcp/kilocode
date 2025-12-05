import { LLMClient } from "./llm-client.js"
import { HoleFiller } from "../services/ghost/classic-auto-complete/HoleFiller.js"
import { FimPromptBuilder } from "../services/ghost/classic-auto-complete/FillInTheMiddle.js"
import { extractPrefixSuffix, contextToAutocompleteInput, GhostContextProvider } from "../services/ghost/types.js"
import { createContext } from "./utils.js"
import {
	createTestGhostModel,
	createMockContextProviderWithContent,
	modelSupportsFim,
} from "./mock-context-provider.js"
import {
	GhostInlineCompletionProvider,
	findMatchingSuggestion,
	CostTrackingCallback,
} from "../services/ghost/classic-auto-complete/GhostInlineCompletionProvider.js"
import { GhostModel } from "../services/ghost/GhostModel.js"
import type { GhostServiceSettings } from "@roo-code/types"
import type { AutocompleteCodeSnippet } from "../services/continuedev/core/autocomplete/snippets/types.js"
import type { RecentlyEditedRange } from "../services/continuedev/core/autocomplete/util/types.js"

/**
 * Stub implementation of RecentlyVisitedRangesService for testing.
 * Always returns an empty array since we don't need this context in tests.
 */
class StubRecentlyVisitedRangesService {
	public getSnippets(): AutocompleteCodeSnippet[] {
		return []
	}

	public dispose(): void {
		// No-op
	}
}

/**
 * Stub implementation of RecentlyEditedTracker for testing.
 * Always returns an empty array since we don't need this context in tests.
 */
class StubRecentlyEditedTracker {
	public async getRecentlyEditedRanges(): Promise<RecentlyEditedRange[]> {
		return []
	}

	public dispose(): void {
		// No-op
	}
}

/**
 * Create a GhostInlineCompletionProvider for testing purposes.
 * This factory function creates an instance with a custom GhostContextProvider
 * without requiring VSCode extension context or ClineProvider.
 */
function createProviderForTesting(
	contextProvider: GhostContextProvider,
	costTrackingCallback: CostTrackingCallback = () => {},
	getSettings: () => GhostServiceSettings | null = () => null,
): GhostInlineCompletionProvider {
	const instance = Object.create(GhostInlineCompletionProvider.prototype) as GhostInlineCompletionProvider
	// Initialize private fields using Object.assign to bypass TypeScript private access
	Object.assign(instance, {
		suggestionsHistory: [],
		pendingRequests: [],
		model: contextProvider.model,
		costTrackingCallback,
		getSettings,
		holeFiller: new HoleFiller(contextProvider),
		fimPromptBuilder: new FimPromptBuilder(contextProvider),
		recentlyVisitedRangesService: new StubRecentlyVisitedRangesService(),
		recentlyEditedTracker: new StubRecentlyEditedTracker(),
		debounceTimer: null,
		isFirstCall: true,
		ignoreController: contextProvider.ignoreController,
		acceptedCommand: null,
		debounceDelayMs: 300, // INITIAL_DEBOUNCE_DELAY_MS
		latencyHistory: [],
	})
	return instance
}

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
