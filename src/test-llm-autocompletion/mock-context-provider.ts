import { GhostContextProvider } from "../services/ghost/types.js"
import { GhostModel } from "../services/ghost/GhostModel.js"
import { LLMClient } from "./llm-client.js"

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
