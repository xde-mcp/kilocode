import { z } from "zod"
import { getModelId, ProviderName, ProviderSettings } from "../provider-settings.js"
import { ToolProtocol, TOOL_PROTOCOL } from "../tool.js"

export const toolProtocols = ["xml", "native"] as const

export const toolProtocolsSchema = z.enum(toolProtocols)

// @deprecated Use ToolProtocol from tool.ts instead
export type ToolUseStyle = ToolProtocol

// a list of all provider slugs that have been tested to support native function calling
export const nativeFunctionCallingProviders = [
	"openrouter",
	"kilocode",
	"openai",
	"lmstudio",
	"chutes",
	"deepinfra",
	"xai",
	"zai",
	"synthetic",
	"human-relay",
	"qwen-code",
	"inception",
	"minimax",
	"anthropic",
	"moonshot",
] satisfies ProviderName[] as ProviderName[]

const modelsDefaultingToNativeKeywords = ["claude-haiku-4.5", "claude-haiku-4-5", "minimax-m2"]
//Specific providers that default to native tool use, regardless of model.
const providersDefaultingToNativeKeywords = [
	"synthetic", //All synthetic models support native tools, and their pricing model strongly encourages their use
]

export function getActiveToolUseStyle(settings: ProviderSettings | undefined): ToolProtocol {
	if (!settings) {
		console.error("getActiveToolUseStyle: settings missing, returning xml")
		return TOOL_PROTOCOL.XML
	}
	if (settings.apiProvider && !nativeFunctionCallingProviders.includes(settings.apiProvider as ProviderName)) {
		return TOOL_PROTOCOL.XML
	}
	if (settings.toolStyle) {
		return settings.toolStyle
	}
	const model = getModelId(settings)?.toLowerCase()
	if (!model) {
		console.error("getActiveToolUseStyle: model missing, returning xml")
		return TOOL_PROTOCOL.XML
	}
	if (providersDefaultingToNativeKeywords.includes(settings.apiProvider as ProviderName)) {
		return TOOL_PROTOCOL.NATIVE //providers that always use native
	}
	return modelsDefaultingToNativeKeywords.some((keyword) => model.includes(keyword))
		? TOOL_PROTOCOL.NATIVE
		: TOOL_PROTOCOL.XML
}
