// kilocode_change - new file
// AIhubmix 是动态 provider，模型从 API 获取
// 这里只定义 fallback 类型

export type AihubmixModelId = string

export const aihubmixDefaultModelId = "claude-opus-4-5"

export const aihubmixDefaultModelInfo = {
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
