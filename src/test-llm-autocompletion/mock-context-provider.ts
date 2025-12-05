import { GhostContextProvider } from "../services/ghost/types.js"
import { GhostModel } from "../services/ghost/GhostModel.js"
import { LLMClient } from "./llm-client.js"
import {
	GhostInlineCompletionProvider,
	CostTrackingCallback,
} from "../services/ghost/classic-auto-complete/GhostInlineCompletionProvider.js"
import { HoleFiller } from "../services/ghost/classic-auto-complete/HoleFiller.js"
import { FimPromptBuilder } from "../services/ghost/classic-auto-complete/FillInTheMiddle.js"
import type { GhostServiceSettings } from "@roo-code/types"
import type { AutocompleteCodeSnippet } from "../services/continuedev/core/autocomplete/snippets/types.js"
import type { RecentlyEditedRange } from "../services/continuedev/core/autocomplete/util/types.js"

/**
 * Check if a model supports FIM (Fill-In-Middle) completions.
 * This mirrors the logic in KilocodeOpenrouterHandler.supportsFim()
 */
export function modelSupportsFim(modelId: string): boolean {
	return modelId.includes("codestral")
}

/**
 * Create a mock GhostModel that wraps an LLMClient for testing.
 * This allows testing the GhostInlineCompletionProvider without VSCode dependencies.
 */
export function createTestGhostModel(llmClient: LLMClient, modelId: string): GhostModel {
	const supportsFim = modelSupportsFim(modelId)

	// Create a mock GhostModel that delegates to LLMClient
	const mockModel = {
		loaded: true,
		profileName: "test-profile",
		profileType: "autocomplete",

		supportsFim: () => supportsFim,
		getModelName: () => modelId,
		getProviderDisplayName: () => "kilocode",
		hasValidCredentials: () => true,
		getRolloutHash_IfLoggedInToKilo: () => undefined,

		generateFimResponse: async (
			prefix: string,
			suffix: string,
			onChunk: (text: string) => void,
			_taskId?: string,
		) => {
			const response = await llmClient.sendFimCompletion(prefix, suffix)
			onChunk(response.completion)
			return {
				cost: 0,
				inputTokens: response.tokensUsed ?? 0,
				outputTokens: 0,
				cacheWriteTokens: 0,
				cacheReadTokens: 0,
			}
		},

		generateResponse: async (
			systemPrompt: string,
			userPrompt: string,
			onChunk: (chunk: { type: string; text?: string }) => void,
		) => {
			const response = await llmClient.sendPrompt(systemPrompt, userPrompt)
			onChunk({ type: "text", text: response.content })
			return {
				cost: 0,
				inputTokens: response.tokensUsed ?? 0,
				outputTokens: 0,
				cacheWriteTokens: 0,
				cacheReadTokens: 0,
			}
		},

		reload: async () => true,
		dispose: () => {},
	} as unknown as GhostModel

	return mockModel
}

/**
 * Create a mock GhostContextProvider for standalone testing.
 * This provider simulates the context retrieval without requiring VSCode services.
 */
export function createMockContextProvider(ghostModel: GhostModel): GhostContextProvider {
	return {
		ide: {
			readFile: async () => "",
			getWorkspaceDirs: async () => [],
			getClipboardContent: async () => ({ text: "", copiedAt: new Date().toISOString() }),
		},
		contextService: {
			initializeForFile: async () => {},
			getRootPathSnippets: async () => [],
			getSnippetsFromImportDefinitions: async () => [],
			getStaticContextSnippets: async () => [],
		},
		model: ghostModel,
	} as unknown as GhostContextProvider
}

/**
 * Create a mock GhostContextProvider with prefix/suffix for prompt building.
 * This is used by the prompt builders to get context.
 */
export function createMockContextProviderWithContent(
	prefix: string,
	suffix: string,
	filepath: string,
	ghostModel: GhostModel,
): GhostContextProvider {
	return {
		ide: {
			readFile: async () => prefix + suffix,
			getWorkspaceDirs: async () => [],
			getClipboardContent: async () => ({ text: "", copiedAt: new Date().toISOString() }),
		},
		contextService: {
			initializeForFile: async () => {},
			getRootPathSnippets: async () => [],
			getSnippetsFromImportDefinitions: async () => [],
			getStaticContextSnippets: async () => [],
		},
		model: ghostModel,
	} as unknown as GhostContextProvider
}

/**
 * Stub implementation of RecentlyVisitedRangesService for testing.
 * Always returns an empty array since we don't need this context in tests.
 */
export class StubRecentlyVisitedRangesService {
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
export class StubRecentlyEditedTracker {
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
export function createProviderForTesting(
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
