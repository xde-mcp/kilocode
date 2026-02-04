// kilocode_change - new file
import axios from "axios"

import type { ModelInfo } from "@roo-code/types"

/**
 * 解析 features 字段（可能是逗号分隔的字符串或数组）
 */
function parseFeatures(features: string | string[] | undefined): string[] {
	if (!features) return []
	if (Array.isArray(features)) return features
	return features.split(",").map((f) => f.trim())
}

/**
 * 解析 input_modalities 字段（可能是逗号分隔的字符串或数组）
 */
function parseModalities(modalities: string | string[] | undefined): string[] {
	if (!modalities) return []
	if (Array.isArray(modalities)) return modalities
	return modalities.split(",").map((m) => m.trim())
}

export interface GetAihubmixModelsOptions {
	baseUrl?: string
	apiKey?: string
}

/**
 * 从 AIhubmix API 获取可用模型列表
 * API: https://aihubmix.com/api/v1/models?type=llm&sort_by=coding
 */
export async function getAihubmixModels(options?: GetAihubmixModelsOptions): Promise<Record<string, ModelInfo>> {
	const models: Record<string, ModelInfo> = {}
	const baseUrl = options?.baseUrl || "https://aihubmix.com"

	try {
		const response = await axios.get(`${baseUrl}/api/v1/models?type=llm&sort_by=coding`)

		if (!response.data?.success || !Array.isArray(response.data?.data)) {
			console.error("Invalid response from AIhubmix API:", response.data)
			return models
		}

		const rawModels = response.data.data

		let preferredIndex = 0
		for (const rawModel of rawModels) {
			if (!rawModel.model_id || typeof rawModel.model_id !== "string") {
				continue
			}

			const features = parseFeatures(rawModel.features)
			const inputModalities = parseModalities(rawModel.input_modalities)
			const pricing = rawModel.pricing || {}

			// 检查是否支持图片
			const supportsImages = inputModalities.includes("image")

			// 检查是否支持 thinking/reasoning
			const supportsThinking = features.includes("thinking")

			// 检查是否支持 prompt cache：cache_read 价格与 input 价格不同
			const supportsPromptCache =
				pricing.cache_read !== undefined && pricing.input !== undefined && pricing.cache_read !== pricing.input

			const modelInfo: ModelInfo = {
				maxTokens: rawModel.max_output ?? 8192,
				contextWindow: rawModel.context_length ?? 128000,
				supportsImages,
				supportsPromptCache,
				supportsNativeTools: true,
				defaultToolProtocol: "native",
				inputPrice: pricing.input,
				outputPrice: pricing.output,
				cacheWritesPrice: pricing.cache_write,
				cacheReadsPrice: pricing.cache_read,
				description: rawModel.desc || "",
				preferredIndex, // 保持 API 返回的顺序（sort_by=coding）
				// 如果支持 thinking，可能需要设置 reasoning 相关属性
				...(supportsThinking && rawModel.thinking_config
					? {
							supportsReasoningBudget: true,
						}
					: {}),
			}

			models[rawModel.model_id] = modelInfo
			preferredIndex++
		}

		console.log(`Fetched ${Object.keys(models).length} AIhubmix models`)
	} catch (error) {
		console.error(`Error fetching AIhubmix models: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`)
	}

	return models
}
