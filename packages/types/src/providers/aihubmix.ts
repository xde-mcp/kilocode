// kilocode_change - new file
// AIhubmix is a dynamic provider, models are fetched from API
// Only fallback types are defined here

import type { ModelInfo } from "../model.js"

export type AihubmixModelId = string

export const aihubmixDefaultModelId = "claude-opus-4-5"

export const aihubmixDefaultModelInfo: ModelInfo = {
	maxTokens: 8192,
	contextWindow: 128000,
	supportsImages: true,
	supportsPromptCache: false,
	supportsNativeTools: true,
	defaultToolProtocol: "native" as const,
	inputPrice: 3,
	outputPrice: 15,
	description: "AIhubmix unified model provider",
}
