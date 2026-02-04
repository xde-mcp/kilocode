// kilocode_change - new file
import { Anthropic } from "@anthropic-ai/sdk"

import type { ModelInfo } from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"
import { ApiStream } from "../transform/stream"
import { BaseProvider } from "./base-provider"
import type { ApiHandler, SingleCompletionHandler, ApiHandlerCreateMessageMetadata } from "../index"

// 复用现有的 Handler
import { AnthropicHandler } from "./anthropic"
import { OpenAiHandler } from "./openai"
import { GeminiHandler } from "./gemini"
import { OpenAiCompatibleResponsesHandler } from "./openai-responses"

const AIHUBMIX_DEFAULT_BASE_URL = "https://aihubmix.com"
const AIHUBMIX_DEFAULT_MODEL = "claude-3-5-sonnet-20241022"

type ModelRoute = "anthropic" | "openai" | "openai-responses" | "gemini"

/**
 * AIhubmix Handler - 多模型聚合平台
 *
 * 采用委托模式，根据模型 ID 前缀路由到对应的现有 Handler：
 * - claude-* → AnthropicHandler
 * - gemini-* → GeminiHandler
 * - 其他 (gpt-*, o1-*, deepseek-*, etc.) → OpenAiHandler
 *
 * 这种设计的优点：
 * 1. 零重复代码 - 完全复用现有 Handler 的流式处理逻辑
 * 2. 自动受益 - 当现有 Handler 更新时，AihubmixHandler 自动受益
 * 3. 易于维护 - 不用担心流式处理逻辑不同步
 */
export class AihubmixHandler extends BaseProvider implements SingleCompletionHandler {
	private options: ApiHandlerOptions
	private delegateHandler: ApiHandler | null = null
	private lastModelId: string | null = null

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options
	}

	/**
	 * 根据模型 ID 前缀路由到对应的 Handler
	 */
	private routeModel(modelId: string): ModelRoute {
		const id = modelId.toLowerCase()
		if (id.startsWith("claude")) {
			return "anthropic"
		}
		if (id.startsWith("gemini") && !id.endsWith("-nothink") && !id.endsWith("-search")) {
			return "gemini"
		}
		// gpt-5-pro 和 gpt-5-codex 需要使用 OpenAI Responses API
		if (id === "gpt-5-pro" || id === "gpt-5-codex") {
			return "openai-responses"
		}
		return "openai"
	}

	/**
	 * 创建委托 Handler - 复用现有的 Handler 实现
	 * 通过配置映射，将 aihubmix 配置转换为对应 Handler 的配置
	 */
	private getDelegateHandler(): ApiHandler {
		const modelId = this.options.aihubmixModelId || AIHUBMIX_DEFAULT_MODEL

		// 缓存：同一模型复用同一 handler
		if (this.delegateHandler && this.lastModelId === modelId) {
			return this.delegateHandler
		}

		const baseUrl = this.options.aihubmixBaseUrl || AIHUBMIX_DEFAULT_BASE_URL
		const route = this.routeModel(modelId)

		switch (route) {
			case "anthropic":
				// 复用 AnthropicHandler，映射配置
				this.delegateHandler = new AnthropicHandler({
					...this.options,
					apiKey: this.options.aihubmixApiKey,
					anthropicBaseUrl: baseUrl,
					apiModelId: this.options.aihubmixModelId,
				})
				break

			case "gemini":
				// 复用 GeminiHandler，映射配置
				this.delegateHandler = new GeminiHandler({
					...this.options,
					geminiApiKey: this.options.aihubmixApiKey,
					googleGeminiBaseUrl: `${baseUrl}/gemini`,
					apiModelId: this.options.aihubmixModelId,
				})
				break

			case "openai-responses":
				// 复用 OpenAiCompatibleResponsesHandler，用于 gpt-5-pro/gpt-5-codex 等模型
				console.log("[aihubmix] Routing to OpenAI Responses API")
				console.log("[aihubmix] baseUrl:", `${baseUrl}/v1`)
				console.log("[aihubmix] modelId:", modelId)
				this.delegateHandler = new OpenAiCompatibleResponsesHandler({
					...this.options,
					openAiApiKey: this.options.aihubmixApiKey,
					openAiBaseUrl: `${baseUrl}/v1`,
					openAiModelId: this.options.aihubmixModelId,
				})
				break

			case "openai":
			default:
				// 复用 OpenAiHandler，映射配置
				this.delegateHandler = new OpenAiHandler({
					...this.options,
					openAiApiKey: this.options.aihubmixApiKey,
					openAiBaseUrl: `${baseUrl}/v1`,
					openAiModelId: this.options.aihubmixModelId,
				})
				break
		}

		this.lastModelId = modelId
		return this.delegateHandler
	}

	// ==================== 委托给对应的 Handler ====================

	async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		yield* this.getDelegateHandler().createMessage(systemPrompt, messages, metadata)
	}

	getModel(): { id: string; info: ModelInfo } {
		return this.getDelegateHandler().getModel()
	}

	override async countTokens(content: Array<Anthropic.Messages.ContentBlockParam>): Promise<number> {
		return this.getDelegateHandler().countTokens(content)
	}

	async completePrompt(prompt: string): Promise<string> {
		const handler = this.getDelegateHandler()
		if ("completePrompt" in handler) {
			return (handler as SingleCompletionHandler).completePrompt(prompt)
		}
		throw new Error("completePrompt not supported for this model")
	}
}
