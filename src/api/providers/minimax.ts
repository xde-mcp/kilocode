import { minimaxModels, minimaxDefaultModelId } from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"

import type { ApiStreamUsageChunk } from "../transform/stream"
import { getModelParams } from "../transform/model-params"

import { OpenAiHandler } from "./openai"

export class MiniMaxHandler extends OpenAiHandler {
	constructor(options: ApiHandlerOptions) {
		super({
			...options,
			openAiApiKey: options.minimaxApiKey ?? "not-provided",
			openAiModelId: options.apiModelId ?? minimaxDefaultModelId,
			openAiBaseUrl: options.minimaxBaseUrl ?? "https://api.minimax.io/v1",
			openAiStreamingEnabled: true,
			includeMaxTokens: true,
		})
	}

	override getModel() {
		const id = this.options.apiModelId ?? minimaxDefaultModelId
		const info = minimaxModels[id as keyof typeof minimaxModels] || minimaxModels[minimaxDefaultModelId]
		const params = getModelParams({ format: "openai", modelId: id, model: info, settings: this.options })
		return { id, info, ...params }
	}

	// Override to handle Minimax's usage metrics, including caching.
	protected override processUsageMetrics(usage: any): ApiStreamUsageChunk {
		return {
			type: "usage",
			inputTokens: usage?.prompt_tokens || 0,
			outputTokens: usage?.completion_tokens || 0,
			cacheWriteTokens: usage?.prompt_tokens_details?.cache_miss_tokens,
			cacheReadTokens: usage?.prompt_tokens_details?.cached_tokens,
		}
	}
}
