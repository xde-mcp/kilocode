import { z } from "zod"
import { getModelId, ProviderName, ProviderSettings } from "../provider-settings.js"

export const toolUseStyles = ["xml", "json"] as const

export const toolUseStylesSchema = z.enum(toolUseStyles)

export type ToolUseStyle = z.infer<typeof toolUseStylesSchema>

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

//Specific models, regardless of provider, that need JSON tool use.
const modelsDefaultingToJsonKeywords = [
	"claude-haiku-4.5",
	"claude-haiku-4-5", //Haiku struggles with XML
	"minimax-m2", // minimax needs the JSON calls to maintain reasoning coherance.
]

//Specific providers that default to JSON tool use, regardless of model.
const providersDefaultingToJsonKeywords = [
	"synthetic", //All synthetic models support JSON tools, and their pricing model strongly encourages their use
]

export function getActiveToolUseStyle(settings: ProviderSettings | undefined): ToolUseStyle {
	if (!settings) {
		console.error("getActiveToolUseStyle: settings missing, returning xml")
		return "xml"
	}

	const provider = settings.apiProvider as ProviderName

	if (!nativeFunctionCallingProviders.includes(provider)) {
		return "xml" //default to xml for providers that don't support native function calling
	}
	if (settings.toolStyle) {
		return settings.toolStyle //use explicitly set style if available.
	}
	const model = getModelId(settings)?.toLowerCase()
	if (!model) {
		console.error("getActiveToolUseStyle: model missing, returning xml")
		return "xml" //default to xml if model is missing
	}
	if (providersDefaultingToJsonKeywords.includes(provider)) {
		return "json" //providers that always use json
	}
	// models that specifically need json, otherwise default to XML.
	return modelsDefaultingToJsonKeywords.some((keyword) => model.includes(keyword)) ? "json" : "xml"
}
