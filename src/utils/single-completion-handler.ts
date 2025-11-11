import type { ProviderSettings } from "@roo-code/types"
import { buildApiHandler, SingleCompletionHandler, ApiHandler, SingleCompletionResult } from "../api" // kilocode_change

/**
 * Enhances a prompt using the configured API without creating a full Cline instance or task history.
 * This is a lightweight alternative that only uses the API's completion functionality.
 */
export async function singleCompletionHandler(
	apiConfiguration: ProviderSettings,
	promptText: string,
	systemPrompt?: string, // kilocode_change
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

	// kilocode_change start - stream responses for handlers without completePrompt
	// Check if handler supports single completions
	if (!("completePrompt" in handler)) {
		// throw new Error("The selected API provider does not support prompt enhancement")
		const text = await streamResponseFromHandler(handler, promptText, systemPrompt)
		return { text }
	}

	const result = await (handler as SingleCompletionHandler).completePrompt(promptText, systemPrompt)

	return result
	// kilocode_change end
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
