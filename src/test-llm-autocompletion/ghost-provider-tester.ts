import { LLMClient } from "./llm-client.js"
import { HoleFiller, parseGhostResponse } from "../services/ghost/classic-auto-complete/HoleFiller.js"
import { FimPromptBuilder } from "../services/ghost/classic-auto-complete/FillInTheMiddle.js"
import { AutocompleteInput } from "../services/ghost/types.js"
import * as vscode from "vscode"
import crypto from "crypto"
import { createContext } from "./utils.js"

// Mock context provider for standalone testing
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

/**
 * Check if a model supports FIM (Fill-In-Middle) completions.
 * This mirrors the logic in KilocodeOpenrouterHandler.supportsFim()
 */
function modelSupportsFim(modelId: string): boolean {
	return modelId.includes("codestral")
}

export class GhostProviderTester {
	private llmClient: LLMClient
	private model: string

	constructor() {
		this.model = process.env.LLM_MODEL || "mistralai/codestral-2508"
		this.llmClient = new LLMClient()
	}

	async getCompletion(
		code: string,
		testCaseName: string = "test",
	): Promise<{ prefix: string; completion: string; suffix: string }> {
		const context = createContext(code, testCaseName)

		const position = context.range?.start ?? new vscode.Position(0, 0)
		const offset = context.document.offsetAt(position)
		const text = context.document.getText()
		const prefix = text.substring(0, offset)
		const suffix = text.substring(offset)
		const languageId = context.document.languageId || "javascript"
		const filepath = context.document.uri.fsPath

		// Auto-detect strategy based on model capabilities
		const supportsFim = modelSupportsFim(this.model)

		if (supportsFim) {
			// Use FIM strategy with FimPromptBuilder
			const mockContextProvider = createMockContextProvider(prefix, suffix, filepath)
			const fimPromptBuilder = new FimPromptBuilder(mockContextProvider)

			const autocompleteInput: AutocompleteInput = {
				isUntitledFile: false,
				completionId: crypto.randomUUID(),
				filepath,
				pos: { line: position.line, character: position.character },
				recentlyVisitedRanges: [],
				recentlyEditedRanges: [],
			}

			const prompt = await fimPromptBuilder.getFimPrompts(autocompleteInput, this.model)

			// Use the formatted prefix/suffix from FimPromptBuilder
			const fimResponse = await this.llmClient.sendFimCompletion(prompt.formattedPrefix, prompt.prunedSuffix)

			return {
				prefix,
				completion: fimResponse.completion,
				suffix,
			}
		} else {
			// Use HoleFiller strategy
			const mockContextProvider = createMockContextProvider(prefix, suffix, filepath)
			const holeFiller = new HoleFiller(mockContextProvider)

			const autocompleteInput: AutocompleteInput = {
				isUntitledFile: false,
				completionId: crypto.randomUUID(),
				filepath,
				pos: { line: position.line, character: position.character },
				recentlyVisitedRanges: [],
				recentlyEditedRanges: [],
			}

			const { systemPrompt, userPrompt } = await holeFiller.getPrompts(autocompleteInput, languageId)

			const response = await this.llmClient.sendPrompt(systemPrompt, userPrompt)

			const parseResult = parseGhostResponse(response.content, prefix, suffix)

			return {
				prefix,
				completion: parseResult.text,
				suffix,
			}
		}
	}

	getName(): string {
		const supportsFim = modelSupportsFim(this.model)
		return supportsFim ? "ghost-provider-fim" : "ghost-provider-holefiller"
	}

	dispose(): void {
		// No resources to dispose
	}
}
