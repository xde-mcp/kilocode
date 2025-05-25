import axios from "axios"
import pLimit from "p-limit"

import { Context, McpToolCallResponse, ToolHandler } from "../types.js"

/**
 * Expert Panel Tool for code opinions
 * Queries multiple LLM models for their expert opinions on code
 */
class QueryExpertPanelTool implements ToolHandler {
	name = "query_expert_panel"
	description =
		"Query a panel of LLM experts for opinions on code quality, refactoring suggestions, or architectural decisions"
	inputSchema = {
		type: "object",
		properties: {
			code: {
				type: "string",
				description: "The code snippet to analyze",
			},
			question: {
				type: "string",
				description: "The specific question or aspect to analyze about the code",
			},
			language: {
				type: "string",
				description: "The programming language of the code (optional)",
			},
			context: {
				type: "string",
				description: "Additional context about the codebase or requirements (optional)",
			},
			models: {
				type: "array",
				items: {
					type: "string",
				},
				description: "Specific models to use (optional, defaults to a predefined set of models)",
			},
		},
		required: ["code", "question"],
	}

	async execute(args: any, context: Context): Promise<McpToolCallResponse> {
		console.error("🔍 DEBUG: Expert panel request received with args:", JSON.stringify(args, null, 2))

		const { code, question, language = "", context: codeContext = "", models = [] } = args

		if (!code || typeof code !== "string" || code.trim() === "") {
			return {
				content: [
					{
						type: "text",
						text: "Error: No code provided for analysis. Please provide a code snippet in the 'code' parameter.",
					},
				],
				isError: true,
			}
		}

		if (!question || typeof question !== "string" || question.trim() === "") {
			return {
				content: [
					{
						type: "text",
						text: "Error: No question provided. Please specify what you want the expert panel to analyze about the code.",
					},
				],
				isError: true,
			}
		}

		try {
			// Define the default models to use if not specified
			const defaultModels = [
				"anthropic/claude-3.7-sonnet", // Anthropic model with thinking capability
				"openai/gpt-4o", // OpenAI model with thinking capability
				"google/gemini-2.5-pro-preview", // Google model with thinking capability
			]

			// Use specified models or defaults
			const modelsToUse = models.length > 0 ? models : defaultModels

			console.error(`🤖 Using models: ${modelsToUse.join(", ")}`)

			// Query all models in parallel with a concurrency limit of 3
			const limit = pLimit(3)
			const expertOpinions = await Promise.all(
				modelsToUse.map((model: string) =>
					limit(() =>
						this.queryExpert(code, question, language, codeContext, model, context.OPENROUTER_API_KEY),
					),
				),
			)

			// Combine the expert opinions
			const combinedOpinion = this.combineExpertOpinions(expertOpinions, modelsToUse)

			return {
				content: [
					{
						type: "text",
						text: combinedOpinion,
					},
				],
			}
		} catch (error) {
			console.error(`❌ Error querying expert panel: ${error instanceof Error ? error.message : String(error)}`)
			return {
				content: [
					{
						type: "text",
						text: `Error querying expert panel: ${error instanceof Error ? error.message : String(error)}`,
					},
				],
				isError: true,
			}
		}
	}

	/**
	 * Query a single expert model for its opinion
	 */
	private async queryExpert(
		code: string,
		question: string,
		language: string,
		codeContext: string,
		model: string,
		apiKey: string,
	): Promise<string> {
		console.error(`🔍 Querying model: ${model}`)

		// Skip if no API key
		if (!apiKey || apiKey.trim() === "") {
			throw new Error("OpenRouter API key is required. Please set OPENROUTER_API_KEY in .env.local file.")
		}

		try {
			// Get expert instructions
			const instructions = this.getExpertInstructions()

			// Format the message with code and question
			const message = `${instructions}

${language ? `Programming Language: ${language}` : ""}

${codeContext ? `Context: ${codeContext}` : ""}

Code to analyze:
\`\`\`
${code}
\`\`\`

Question: ${question}

Please provide your expert opinion:`

			const response = await axios.post(
				"https://openrouter.ai/api/v1/chat/completions",
				{
					model,
					messages: [
						{
							role: "user",
							content: message,
						},
					],
				},
				{
					headers: {
						Authorization: `Bearer ${apiKey}`,
						"Content-Type": "application/json",
						"HTTP-Referer": "https://code-expert-panel.tool",
						"X-Title": "code-expert-panel-mcp",
					},
				},
			)

			if (response.data && response.data.choices && response.data.choices.length > 0) {
				const opinion = response.data.choices[0].message.content.trim()
				console.error(`✅ Received opinion from ${model} (${opinion.length} chars)`)
				return opinion
			} else {
				throw new Error(`Invalid response from ${model}`)
			}
		} catch (error) {
			if (axios.isAxiosError(error)) {
				const message = error.response?.data?.error?.message || error.message
				throw new Error(`${model} API error: ${message}`)
			}
			throw error
		}
	}

	/**
	 * Combine opinions from multiple experts into a coherent response
	 */
	private combineExpertOpinions(opinions: string[], models: string[]): string {
		console.error(`🔄 Combining ${opinions.length} expert opinions`)

		// Format each opinion with the model name
		const formattedOpinions = opinions.map((opinion, index) => {
			const modelName = this.getModelDisplayName(models[index])
			return `## Expert Opinion from ${modelName}\n\n${opinion}\n`
		})

		// Create a summary section
		const summary = `# Expert Panel Analysis\n\nThe following is a combined analysis from multiple AI expert models regarding your code question.\n\n`

		// Combine all sections
		return `${summary}${formattedOpinions.join("\n---\n\n")}`
	}

	/**
	 * Get a display-friendly name for a model
	 */
	private getModelDisplayName(model: string): string {
		// Extract the model name from the provider/model format
		const parts = model.split("/")
		if (parts.length !== 2) return model

		const [provider, modelName] = parts

		// Format provider names nicely
		const providerMap: Record<string, string> = {
			anthropic: "Anthropic",
			openai: "OpenAI",
			google: "Google",
			meta: "Meta",
			mistral: "Mistral AI",
			cohere: "Cohere",
		}

		const formattedProvider = providerMap[provider] || provider

		// Format model names nicely
		let formattedModel = modelName.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())

		return `${formattedProvider} ${formattedModel}`
	}

	/**
	 * Get expert instructions as a string
	 */
	private getExpertInstructions(): string {
		return `You are an expert software engineer with deep knowledge of best practices, design patterns, and code quality. 
Your task is to analyze the provided code and answer the specific question about it.

Please follow these guidelines:
1. Focus specifically on answering the question asked
2. Consider code quality, readability, maintainability, and performance
3. Provide concrete, actionable suggestions for improvement when appropriate
4. Include code examples if they would help illustrate your points
5. Be thorough but concise in your analysis
6. Use markdown formatting to structure your response clearly

Think step by step about:
- The intent and functionality of the code
- Potential bugs or edge cases
- Design patterns and architectural considerations
- Performance implications
- Readability and maintainability`
	}
}

// Export the tool
export default new QueryExpertPanelTool()
