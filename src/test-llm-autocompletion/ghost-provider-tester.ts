import * as vscode from "vscode"
import { GhostModel } from "../services/ghost/GhostModel.js"
import { HoleFiller, parseGhostResponse } from "../services/ghost/classic-auto-complete/HoleFiller.js"
import { FimPromptBuilder } from "../services/ghost/classic-auto-complete/FillInTheMiddle.js"
import { KilocodeOpenrouterHandler } from "../api/providers/kilocode-openrouter.js"
import { createContext } from "./utils.js"
import { AutocompleteInput, extractPrefixSuffix, contextToAutocompleteInput } from "../services/ghost/types.js"
import crypto from "crypto"

/**
 * Creates a GhostModel with a KilocodeOpenrouterHandler for testing
 */
function createGhostModel(kilocodeToken: string, model: string): GhostModel {
	const handler = new KilocodeOpenrouterHandler({
		kilocodeToken,
		kilocodeModel: model,
	})

	// Create GhostModel with the handler
	const ghostModel = new GhostModel(handler)
	return ghostModel
}

/**
 * Creates a mock context provider for standalone testing
 */
function createMockContextProvider(prefix: string, suffix: string, filepath: string) {
	return {
		getProcessedSnippets: async () => ({
			filepathUri: `file://${filepath}`,
			helper: {
				filepath: `file://${filepath}`,
				lang: { name: "typescript", singleLineComment: "//" },
				prunedPrefix: prefix,
				prunedSuffix: suffix,
			},
			snippetsWithUris: [],
			workspaceDirs: [],
		}),
	} as any
}

export class GhostProviderTester {
	private ghostModel: GhostModel
	private totalCost: number = 0
	private totalInputTokens: number = 0
	private totalOutputTokens: number = 0

	constructor() {
		const kilocodeToken = process.env.KILOCODE_API_KEY
		if (!kilocodeToken) {
			throw new Error("KILOCODE_API_KEY is required")
		}

		const model = process.env.LLM_MODEL || "mistralai/codestral-2508"

		this.ghostModel = createGhostModel(kilocodeToken, model)
	}

	async getCompletion(
		code: string,
		testCaseName: string = "test",
	): Promise<{ prefix: string; completion: string; suffix: string }> {
		const context = createContext(code, testCaseName)

		const document = context.document as vscode.TextDocument
		const position = context.range?.start ?? new vscode.Position(0, 0)

		// Get prefix and suffix
		const { prefix, suffix } = extractPrefixSuffix(document, position)
		const languageId = document.languageId || "javascript"
		const filepath = document.uri.fsPath

		// Create mock context provider
		const mockContextProvider = createMockContextProvider(prefix, suffix, filepath)

		// Create autocomplete input
		const autocompleteInput: AutocompleteInput = {
			isUntitledFile: false,
			completionId: crypto.randomUUID(),
			filepath,
			pos: { line: position.line, character: position.character },
			recentlyVisitedRanges: [],
			recentlyEditedRanges: [],
		}

		// Determine strategy based on model capabilities
		const supportsFim = this.ghostModel.supportsFim()
		let completion = ""

		if (supportsFim) {
			// Use FIM strategy
			const fimPromptBuilder = new FimPromptBuilder(mockContextProvider)
			const modelName = this.ghostModel.getModelName() ?? "codestral"
			const prompt = await fimPromptBuilder.getFimPrompts(autocompleteInput, modelName)

			let responseText = ""
			const result = await this.ghostModel.generateFimResponse(
				prompt.formattedPrefix,
				prompt.prunedSuffix,
				(chunk) => {
					responseText += chunk
				},
			)

			this.totalCost += result.cost
			this.totalInputTokens += result.inputTokens
			this.totalOutputTokens += result.outputTokens

			completion = responseText
		} else {
			// Use HoleFiller strategy
			const holeFiller = new HoleFiller(mockContextProvider)
			const { systemPrompt, userPrompt } = await holeFiller.getPrompts(autocompleteInput, languageId)

			let responseText = ""
			const result = await this.ghostModel.generateResponse(systemPrompt, userPrompt, (chunk) => {
				if (chunk.type === "text") {
					responseText += chunk.text
				}
			})

			this.totalCost += result.cost
			this.totalInputTokens += result.inputTokens
			this.totalOutputTokens += result.outputTokens

			// Parse the response to extract the completion
			const parseResult = parseGhostResponse(responseText, prefix, suffix)
			completion = parseResult.text
		}

		return {
			prefix,
			completion,
			suffix,
		}
	}

	getName(): string {
		const supportsFim = this.ghostModel.supportsFim()
		return supportsFim ? "ghost-provider-fim" : "ghost-provider-holefiller"
	}

	dispose(): void {
		// No resources to dispose in this simplified version
	}

	getCostStats(): { totalCost: number; totalInputTokens: number; totalOutputTokens: number } {
		return {
			totalCost: this.totalCost,
			totalInputTokens: this.totalInputTokens,
			totalOutputTokens: this.totalOutputTokens,
		}
	}
}
