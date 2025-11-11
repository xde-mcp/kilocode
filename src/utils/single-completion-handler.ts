import type { ProviderSettings } from "@roo-code/types"
import { buildApiHandler, SingleCompletionHandler, ApiHandler } from "../api" //kilocode_change

/**
 * Result from single completion handler with optional usage information
 */
export interface SingleCompletionResult {
	text: string
	usage?: {
		inputTokens: number
		outputTokens: number
		cacheWriteTokens?: number
		cacheReadTokens?: number
		totalCost?: number
	}
}

/**
 * Enhances a prompt using the configured API without creating a full Cline instance or task history.
 * This is a lightweight alternative that only uses the API's completion functionality.
 *
 * @param apiConfiguration - The API provider configuration
 * @param promptText - The user prompt text
 * @param systemPrompt - Optional system prompt for the completion
 * @returns Promise resolving to completion result with text and optional usage information
 */
export async function singleCompletionHandler(
	apiConfiguration: ProviderSettings,
	promptText: string,
	systemPrompt?: string,
): Promise<SingleCompletionResult> {
	if (!promptText) {
		throw new Error("No prompt text provided")
	}
	if (!apiConfiguration || !apiConfiguration.apiProvider) {
		throw new Error("No valid API configuration provided")
	}

	const handler = buildApiHandler(apiConfiguration)

	// Initialize handler if it has an initialize method
	if ("initialize" in handler && typeof handler.initialize === "function") {
		await handler.initialize()
	}

	// Check if handler supports single completions
	if (!("completePrompt" in handler)) {
		// kilocode_change start - stream responses for handlers without completePrompt
		// throw new Error("The selected API provider does not support prompt enhancement")
		const text = await streamResponseFromHandler(handler, promptText, systemPrompt)
		return { text }
		// kilocode_change end
	}

	const result = await (handler as SingleCompletionHandler).completePrompt(promptText, systemPrompt)

	// Handle both string and object responses
	if (typeof result === "string") {
		return { text: result }
	}

	return {
		text: result.text,
		usage: result.usage,
	}
}

// kilocode_change start - Stream responses using createMessage
async function streamResponseFromHandler(
	handler: ApiHandler,
	promptText: string,
	systemPrompt?: string,
): Promise<string> {
	const stream = handler.createMessage(systemPrompt || "", [
		{ role: "user", content: [{ type: "text", text: promptText }] },
	])

	let response: string = ""
	for await (const chunk of stream) {
		if (chunk.type === "text") {
			response += chunk.text
		}
	}
	return response
}
// kilocode_change end - streamResponseFromHandler
