// kilocode_change - new file
import * as vscode from "vscode"
import { GhostServiceManager } from "./GhostServiceManager"
import { ClineProvider } from "../../core/webview/ClineProvider"
import { getKiloCodeWrapperProperties } from "../../core/kilocode/wrapper"
import { languageForFilepath } from "../continuedev/core/autocomplete/constants/AutocompleteLanguageInfo"
import { getUriFileExtension } from "../continuedev/core/util/uri"

const GET_INLINE_COMPLETIONS_COMMAND = "kilo-code.jetbrains.getInlineCompletions"

class GhostJetbrainsBridge {
	private ghost: GhostServiceManager

	constructor(ghost: GhostServiceManager) {
		this.ghost = ghost
	}

	/**
	 * Determines the VSCode language ID from a languageId string or file URI
	 * @param langId - The language ID provided by JetBrains (may be empty or generic)
	 * @param uri - The file URI to extract language from extension
	 * @returns VSCode-compatible language ID
	 */
	private determineLanguage(langId: string, uri: string): string {
		// If we have a valid language ID that's not generic, use it
		if (langId && langId !== "text" && langId !== "textmate") {
			return langId
		}

		// Use the languageForFilepath function to get language info from file extension
		const languageInfo = languageForFilepath(uri)
		const languageName = languageInfo.name.toLowerCase()

		// Map language names to VSCode language IDs
		const languageIdMap: { [key: string]: string } = {
			typescript: "typescript",
			javascript: "javascript",
			python: "python",
			java: "java",
			"c++": "cpp",
			"c#": "csharp",
			c: "c",
			scala: "scala",
			go: "go",
			rust: "rust",
			haskell: "haskell",
			php: "php",
			ruby: "ruby",
			"ruby on rails": "ruby",
			swift: "swift",
			kotlin: "kotlin",
			clojure: "clojure",
			julia: "julia",
			"f#": "fsharp",
			r: "r",
			dart: "dart",
			solidity: "solidity",
			yaml: "yaml",
			json: "json",
			markdown: "markdown",
			lua: "lua",
		}

		return languageIdMap[languageName] || languageName
	}

	public async getInlineCompletions(...args: any[]) {
		console.log("[JetBrains Inline Completion] ===== START =====")
		console.log("[JetBrains Inline Completion] Arguments received:", args.length)
		console.log("[JetBrains Inline Completion] args[0] type:", typeof args[0])
		console.log("[JetBrains Inline Completion] args[0] is array:", Array.isArray(args[0]))

		try {
			// RPC passes all arguments as a single array in args[0]
			let documentUri: any, position: any, fileContent: any, languageId: any

			if (Array.isArray(args[0])) {
				// Arguments are in an array
				;[documentUri, position, fileContent, languageId] = args[0]
				console.log("[JetBrains Inline Completion] Extracted from array:")
			} else {
				// Arguments are separate
				;[documentUri, position, fileContent, languageId] = args
				console.log("[JetBrains Inline Completion] Using separate args:")
			}

			console.log("  documentUri:", documentUri)
			console.log("  position:", position)
			console.log("  fileContent length:", fileContent?.length || 0)
			console.log("  languageId:", languageId)

			// Safely extract parameters
			const uri = typeof documentUri === "string" ? documentUri : String(documentUri)
			const pos = typeof position === "object" && position !== null ? position : { line: 0, character: 0 }
			const content = typeof fileContent === "string" ? fileContent : String(fileContent)
			const langId = typeof languageId === "string" ? languageId : String(languageId || "")

			console.log("[JetBrains Inline Completion] Final extracted parameters:")
			console.log("  uri:", uri)
			console.log("  position:", JSON.stringify(pos))
			console.log("  content length:", content.length)
			console.log("  languageId:", langId)

			// Determine language from languageId or file extension using the comprehensive language info
			const language = this.determineLanguage(langId, uri)

			console.log("[JetBrains Inline Completion] Final language:", language)

			// Create a mock TextDocument that Ghost service can use
			// This avoids triggering tryOpenDocument
			console.log("[JetBrains Inline Completion] Creating mock document...")

			const mockDocument = {
				uri: vscode.Uri.parse(uri),
				fileName: uri,
				isUntitled: true,
				languageId: language,
				version: 1,
				isDirty: false,
				isClosed: false,
				eol: vscode.EndOfLine.LF,
				lineCount: content.split("\n").length,
				save: async () => false,
				getText: (range?: vscode.Range) => {
					if (!range) return content
					// Simple range extraction
					const lines = content.split("\n")
					if (range.start.line === range.end.line) {
						return lines[range.start.line]?.substring(range.start.character, range.end.character) || ""
					}
					return content // Simplified for now
				},
				getWordRangeAtPosition: () => undefined,
				validateRange: (range: vscode.Range) => range,
				validatePosition: (position: vscode.Position) => position,
				lineAt: (line: number | vscode.Position) => {
					const lineNum = typeof line === "number" ? line : line.line
					const lines = content.split("\n")
					const text = lines[lineNum] || ""
					return {
						lineNumber: lineNum,
						text,
						range: new vscode.Range(lineNum, 0, lineNum, text.length),
						rangeIncludingLineBreak: new vscode.Range(lineNum, 0, lineNum + 1, 0),
						firstNonWhitespaceCharacterIndex: text.search(/\S/),
						isEmptyOrWhitespace: text.trim().length === 0,
					}
				},
				offsetAt: (position: vscode.Position) => {
					const lines = content.split("\n")
					let offset = 0
					for (let i = 0; i < position.line && i < lines.length; i++) {
						offset += lines[i].length + 1 // +1 for newline
					}
					offset += position.character
					return offset
				},
				positionAt: (offset: number) => {
					const lines = content.split("\n")
					let currentOffset = 0
					for (let i = 0; i < lines.length; i++) {
						const lineLength = lines[i].length + 1
						if (currentOffset + lineLength > offset) {
							return new vscode.Position(i, offset - currentOffset)
						}
						currentOffset += lineLength
					}
					return new vscode.Position(lines.length - 1, lines[lines.length - 1]?.length || 0)
				},
			} as any as vscode.TextDocument

			console.log("[JetBrains Inline Completion] Mock document created")

			const vscodePosition = new vscode.Position(pos.line, pos.character)
			console.log("[JetBrains Inline Completion] VSCode position:", vscodePosition.line, vscodePosition.character)

			const context: vscode.InlineCompletionContext = {
				triggerKind: vscode.InlineCompletionTriggerKind.Invoke,
				selectedCompletionInfo: undefined,
			}

			const tokenSource = new vscode.CancellationTokenSource()

			console.log("[JetBrains Inline Completion] Calling Ghost service...")

			// Clear suggestions history before each JetBrains request
			// JetBrains sends full file content each time, so cache matching doesn't work correctly
			// Each request is independent, unlike VSCode where the document persists
			this.ghost.inlineCompletionProvider.suggestionsHistory = []

			const completions = await this.ghost.inlineCompletionProvider.provideInlineCompletionItems_Internal(
				mockDocument,
				vscodePosition,
				context,
				tokenSource.token,
			)

			tokenSource.dispose()

			console.log("[JetBrains Inline Completion] Ghost service returned:", completions)
			console.log("[JetBrains Inline Completion] Completions type:", typeof completions)
			console.log("[JetBrains Inline Completion] Is array:", Array.isArray(completions))

			// Convert to serializable format
			const items = Array.isArray(completions) ? completions : completions?.items || []
			console.log("[JetBrains Inline Completion] Items count:", items.length)

			if (items.length > 0) {
				console.log("[JetBrains Inline Completion] First item:", items[0])
			}

			const result = {
				items: items.map((item) => ({
					insertText: typeof item.insertText === "string" ? item.insertText : item.insertText.value,
					range: item.range
						? {
								start: {
									line: item.range.start.line,
									character: item.range.start.character,
								},
								end: { line: item.range.end.line, character: item.range.end.character },
							}
						: null,
				})),
				error: null,
			}

			console.log("[JetBrains Inline Completion] Returning result:", JSON.stringify(result))
			console.log("[JetBrains Inline Completion] ===== END =====")
			return result
		} catch (error) {
			console.error("[JetBrains Inline Completion] Error:", error)
			console.error(
				"[JetBrains Inline Completion] Error stack:",
				error instanceof Error ? error.stack : "No stack",
			)
			console.log("[JetBrains Inline Completion] ===== END (ERROR) =====")
			return {
				items: [],
				error: error instanceof Error ? error.message : String(error),
			}
		}
	}
}

export const registerGhostJetbrainsBridge = (
	context: vscode.ExtensionContext,
	cline: ClineProvider,
	ghost: GhostServiceManager,
) => {
	// Check if we are running inside JetBrains IDE
	const { kiloCodeWrapped, kiloCodeWrapperJetbrains } = getKiloCodeWrapperProperties()
	console.log()
	if (!kiloCodeWrapped || !kiloCodeWrapperJetbrains) {
		return
	}

	// Initialize the JetBrains Bridge
	const bridge = new GhostJetbrainsBridge(ghost)

	// Register JetBrains inline completion command
	context.subscriptions.push(
		vscode.commands.registerCommand(GET_INLINE_COMPLETIONS_COMMAND, bridge.getInlineCompletions.bind(bridge)),
	)
}
