import { LLMClient } from "./llm-client.js"
import { AutoTriggerStrategy } from "../services/ghost/classic-auto-complete/AutoTriggerStrategy.js"
import { GhostSuggestionContext, AutocompleteInput } from "../services/ghost/types.js"
import { MockTextDocument } from "../services/mocking/MockTextDocument.js"
import { CURSOR_MARKER } from "../services/ghost/classic-auto-complete/ghostConstants.js"
import * as vscode from "vscode"
import crypto from "crypto"

export class StrategyTester {
	private llmClient: LLMClient
	private autoTriggerStrategy: AutoTriggerStrategy

	constructor(llmClient: LLMClient) {
		this.llmClient = llmClient
		this.autoTriggerStrategy = new AutoTriggerStrategy()
	}

	/**
	 * Converts test input to GhostSuggestionContext
	 * Extracts cursor position from CURSOR_MARKER in the code
	 */
	private createContext(code: string): GhostSuggestionContext {
		const lines = code.split("\n")
		let cursorLine = 0
		let cursorCharacter = 0

		// Find the cursor marker
		for (let i = 0; i < lines.length; i++) {
			const markerIndex = lines[i].indexOf(CURSOR_MARKER)
			if (markerIndex !== -1) {
				cursorLine = i
				cursorCharacter = markerIndex
				break
			}
		}

		// Remove the cursor marker from the code before creating the document
		// the code will add it back at the correct position
		const codeWithoutMarker = code.replace(CURSOR_MARKER, "")

		const uri = vscode.Uri.parse("file:///test.js")
		const document = new MockTextDocument(uri, codeWithoutMarker)
		const position = new vscode.Position(cursorLine, cursorCharacter)
		const range = new vscode.Range(position, position)

		return {
			document: document as any,
			range: range as any,
			recentOperations: [],
			diagnostics: [],
			openFiles: [],
			userInput: undefined,
		}
	}

	async getCompletion(code: string): Promise<string> {
		const context = this.createContext(code)

		// Extract prefix, suffix, and languageId
		const position = context.range?.start ?? new vscode.Position(0, 0)
		const offset = context.document.offsetAt(position)
		const text = context.document.getText()
		const prefix = text.substring(0, offset)
		const suffix = text.substring(offset)
		const languageId = context.document.languageId || "javascript"

		// Create AutocompleteInput
		const autocompleteInput: AutocompleteInput = {
			isUntitledFile: false,
			completionId: crypto.randomUUID(),
			filepath: context.document.uri.fsPath,
			pos: { line: position.line, character: position.character },
			recentlyVisitedRanges: [],
			recentlyEditedRanges: [],
		}

		const { systemPrompt, userPrompt } = this.autoTriggerStrategy.getPrompts(
			autocompleteInput,
			prefix,
			suffix,
			languageId,
		)

		const response = await this.llmClient.sendPrompt(systemPrompt, userPrompt)
		return response.content
	}

	parseCompletion(originalContent: string, fimResponse: string): string | null {
		try {
			// Extract prefix and suffix from original content
			const cursorIndex = originalContent.indexOf(CURSOR_MARKER)
			if (cursorIndex === -1) {
				console.warn("No cursor marker found in original content")
				return null
			}

			const prefix = originalContent.substring(0, cursorIndex)
			const suffix = originalContent.substring(cursorIndex + CURSOR_MARKER.length)

			// Check if response is empty (but preserve whitespace/newlines)
			if (!fimResponse || fimResponse.trim().length === 0) {
				console.warn("Empty FIM response")
				return null
			}

			// Reconstruct the complete content with the FIM text inserted
			// Don't trim - preserve leading/trailing whitespace as it may be intentional
			return prefix + fimResponse + suffix
		} catch (error) {
			console.warn("Failed to parse completion:", error)
			return null
		}
	}

	/**
	 * Get the type of the strategy (always auto-trigger now)
	 */
	getSelectedStrategyName(): string {
		return "auto-trigger"
	}
}
