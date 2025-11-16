import OpenAI from "openai"
import { config } from "dotenv"
import { DEFAULT_HEADERS } from "../api/providers/constants.js"
import { streamSse } from "../services/continuedev/core/fetch/stream.js"

config()

export interface LLMResponse {
	content: string
	provider: string
	model: string
	tokensUsed?: number
}

export interface FimResponse {
	completion: string
	provider: string
	model: string
	tokensUsed?: number
}

function getKiloBaseUriFromToken(kilocodeToken?: string): string {
	if (kilocodeToken) {
		try {
			const payload_string = kilocodeToken.split(".")[1]
			const payload_json = Buffer.from(payload_string, "base64").toString()
			const payload = JSON.parse(payload_json)
			// Note: this is UNTRUSTED, so we need to make sure we're OK with this being manipulated by an attacker
			if (payload.env === "development") return "http://localhost:3000"
		} catch (_error) {
			console.warn("Failed to get base URL from Kilo Code token")
		}
	}
	return "https://api.kilocode.ai"
}

export class LLMClient {
	private provider: string
	private model: string
	private openai: OpenAI
	private useFim: boolean
	private baseUrl: string

	constructor(useFim: boolean = false) {
		this.provider = process.env.LLM_PROVIDER || "kilocode"
		this.model = process.env.LLM_MODEL || "mistralai/codestral-2508"
		this.useFim = useFim

		if (this.provider !== "kilocode") {
			throw new Error(`Only kilocode provider is supported. Got: ${this.provider}`)
		}

		if (!process.env.KILOCODE_API_KEY) {
			throw new Error("KILOCODE_API_KEY is required for Kilocode provider")
		}

		this.baseUrl = getKiloBaseUriFromToken(process.env.KILOCODE_API_KEY)

		this.openai = new OpenAI({
			baseURL: `${this.baseUrl}/api/openrouter/`,
			apiKey: process.env.KILOCODE_API_KEY,
			defaultHeaders: {
				...DEFAULT_HEADERS,
				"X-KILOCODE-TESTER": "SUPPRESS",
			},
		})
	}

	isFimMode(): boolean {
		return this.useFim
	}

	async sendPrompt(systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
		try {
			const response = await this.openai.chat.completions.create({
				model: this.model,
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: userPrompt },
				],
				max_tokens: 1024,
			})

			return {
				content: response.choices[0].message.content || "",
				provider: this.provider,
				model: this.model,
				tokensUsed: response.usage?.total_tokens,
			}
		} catch (error) {
			console.error("LLM API Error:", error)
			throw error
		}
	}

	async sendFimCompletion(prefix: string, suffix: string): Promise<FimResponse> {
		try {
			const apiKey = process.env.KILOCODE_TOKEN!
			const baseUrl = getKiloBaseUriFromToken(apiKey)
			const url = `${baseUrl}/api/fim/completions`

			// Match the exact format from KilocodeOpenrouterHandler.streamFim
			// Note: KilocodeOpenrouterHandler uses model.temperature and model.topP from fetchModel()
			// Using defaults since we don't fetch model config in test
			const body = {
				model: this.model,
				prompt: prefix,
				suffix,
				max_tokens: 1000, // Match max_max_tokens in KilocodeOpenrouterHandler
				temperature: 0, // Default for non-DeepSeekR1 models
				// top_p is undefined for most models (only 0.95 for DeepSeekR1)
				stream: true,
			}

			const response = await fetch(url, {
				method: "POST",
				headers: {
					...DEFAULT_HEADERS,
					"Content-Type": "application/json",
					Accept: "application/json",
					"x-api-key": apiKey,
					Authorization: `Bearer ${apiKey}`,
					"X-KILOCODE-TESTER": "SUPPRESS",
				},
				body: JSON.stringify(body),
			})

			if (!response.ok) {
				const errorText = await response.text()
				console.error("FIM request failed:")
				console.error("  URL:", url)
				console.error("  Body:", JSON.stringify(body, null, 2))
				console.error("  Response:", errorText)
				throw new Error(`FIM API request failed: ${response.status} ${response.statusText} - ${errorText}`)
			}

			// Handle SSE streaming response using streamSse utility
			let completion = ""
			let usage: any = undefined

			for await (const data of streamSse(response)) {
				const content = data.choices?.[0]?.delta?.content || data.choices?.[0]?.text
				if (content) {
					completion += content
				}

				if (data.usage) {
					usage = data.usage
				}
			}

			return {
				completion,
				provider: this.provider,
				model: this.model,
				tokensUsed: usage?.total_tokens,
			}
		} catch (error) {
			console.error("FIM API Error:", error)
			throw error
		}
	}
}
