// kilocode_change - new file
import * as vscode from "vscode"
import { z } from "zod"
import { GhostServiceManager } from "./GhostServiceManager"
import { ClineProvider } from "../../core/webview/ClineProvider"
import { getKiloCodeWrapperProperties } from "../../core/kilocode/wrapper"
import { languageForFilepath } from "../continuedev/core/autocomplete/constants/AutocompleteLanguageInfo"

const GET_INLINE_COMPLETIONS_COMMAND = "kilo-code.jetbrains.getInlineCompletions"

// Zod schemas for validation
const PositionSchema = z.object({
	line: z.number().int().nonnegative(),
	character: z.number().int().nonnegative(),
})

const InlineCompletionArgsSchema = z.tuple([
	z.union([z.string(), z.any()]).transform((val) => String(val)), // documentUri - coerce to string
	z.union([PositionSchema, z.any()]), // position (can be object or any)
	z.union([z.string(), z.any()]).transform((val) => String(val)), // fileContent - coerce to string
	z.union([z.string(), z.any()]).transform((val) => String(val)), // languageId - coerce to string
	z.union([z.string(), z.any()]).transform((val) => String(val)), // requestId - coerce to string
])

type InlineCompletionArgs = z.infer<typeof InlineCompletionArgsSchema>

interface DocumentParams {
	uri: string
	position: { line: number; character: number }
	content: string
	languageId: string
	requestId: string
}

interface NormalizedContent {
	normalizedContent: string
	lines: string[]
}

interface CompletionResult {
	requestId: string
	items: Array<{
		insertText: string
		range: {
			start: { line: number; character: number }
			end: { line: number; character: number }
		} | null
	}>
	error: string | null
}

export class GhostJetbrainsBridge {
	private ghost: GhostServiceManager

	constructor(ghost: GhostServiceManager) {
		this.ghost = ghost
	}

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

	/**
	 * Parse and validate the RPC arguments using Zod schemas
	 */
	private parseAndValidateArgs(...args: any[]): DocumentParams {
		// RPC passes all arguments as a single array in args[0]
		const argsArray = Array.isArray(args[0]) ? args[0] : args

		// Parse with Zod schema
		const parsed = InlineCompletionArgsSchema.parse(argsArray)
		const [documentUri, position, fileContent, languageId, requestId] = parsed

		// Safely extract and normalize parameters
		const uri = typeof documentUri === "string" ? documentUri : String(documentUri)
		const pos =
			typeof position === "object" && position !== null && "line" in position && "character" in position
				? { line: position.line, character: position.character }
				: { line: 0, character: 0 }
		const content = typeof fileContent === "string" ? fileContent : String(fileContent)
		const langId = typeof languageId === "string" ? languageId : String(languageId || "")
		const reqId = typeof requestId === "string" ? requestId : String(requestId || "")

		return {
			uri,
			position: pos,
			content,
			languageId: langId,
			requestId: reqId,
		}
	}

	/**
	 * Normalize content line endings to LF for consistent processing
	 * JetBrains may send content with different line endings
	 */
	private normalizeContent(content: string): NormalizedContent {
		const normalizedContent = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
		const lines = normalizedContent.split("\n")

		return {
			normalizedContent,
			lines,
		}
	}

	/**
	 * Create a mock VSCode TextDocument from the provided parameters
	 */
	private createMockDocument(
		uri: string,
		normalizedContent: string,
		lines: string[],
		language: string,
	): vscode.TextDocument {
		const mockDocument = {
			uri: vscode.Uri.parse(uri),
			fileName: uri,
			isUntitled: false, // Set to false to match real file behavior
			languageId: language,
			version: 1,
			isDirty: false,
			isClosed: false,
			eol: vscode.EndOfLine.LF,
			lineCount: lines.length,
			save: async () => false,
			getText: (range?: vscode.Range) => {
				if (!range) return normalizedContent
				// Extract text within the specified range
				if (range.start.line === range.end.line) {
					// Single line range
					return lines[range.start.line]?.substring(range.start.character, range.end.character) || ""
				}
				// Multi-line range
				const startLine = Math.max(0, range.start.line)
				const endLine = Math.min(lines.length - 1, range.end.line)
				if (startLine > endLine) return ""

				const rangeLines: string[] = []
				for (let i = startLine; i <= endLine; i++) {
					let lineText = lines[i] || ""
					if (i === startLine && i === endLine) {
						// Single line, extract substring
						lineText = lineText.substring(range.start.character, range.end.character)
					} else if (i === startLine) {
						// First line, extract from start character to end
						lineText = lineText.substring(range.start.character)
					} else if (i === endLine) {
						// Last line, extract from beginning to end character
						lineText = lineText.substring(0, range.end.character)
					}
					rangeLines.push(lineText)
				}
				return rangeLines.join("\n")
			},
			getWordRangeAtPosition: () => undefined,
			validateRange: (range: vscode.Range) => range,
			validatePosition: (position: vscode.Position) => position,
			lineAt: (line: number | vscode.Position) => {
				const lineNum = typeof line === "number" ? line : line.line
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
				let offset = 0
				for (let i = 0; i < position.line && i < lines.length; i++) {
					offset += lines[i].length + 1 // +1 for newline character
				}
				offset += Math.min(position.character, lines[position.line]?.length || 0)
				return offset
			},
			positionAt: (offset: number) => {
				let currentOffset = 0
				for (let i = 0; i < lines.length; i++) {
					const lineLength = lines[i].length
					// Check if offset is within this line
					if (currentOffset + lineLength >= offset) {
						return new vscode.Position(i, offset - currentOffset)
					}
					// Move to next line (account for newline character)
					currentOffset += lineLength + 1
				}
				// If offset is beyond document, return end position
				return new vscode.Position(lines.length - 1, lines[lines.length - 1]?.length || 0)
			},
		} as any as vscode.TextDocument

		return mockDocument
	}

	/**
	 * Serialize completion results to a format suitable for RPC response
	 */
	private serializeCompletionResult(
		completions: vscode.InlineCompletionItem[] | vscode.InlineCompletionList | undefined,
		requestId: string,
	): CompletionResult {
		const items = Array.isArray(completions) ? completions : completions?.items || []

		return {
			requestId,
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
	}

	public async getInlineCompletions(...args: any[]): Promise<CompletionResult> {
		try {
			// Parse and validate arguments
			const params = this.parseAndValidateArgs(...args)

			// Normalize content
			const { normalizedContent, lines } = this.normalizeContent(params.content)

			// Determine language from languageId or file extension
			const language = this.determineLanguage(params.languageId, params.uri)

			// Create mock document
			const mockDocument = this.createMockDocument(params.uri, normalizedContent, lines, language)

			// Create VSCode position and context
			const vscodePosition = new vscode.Position(params.position.line, params.position.character)
			const context: vscode.InlineCompletionContext = {
				triggerKind: vscode.InlineCompletionTriggerKind.Invoke,
				selectedCompletionInfo: undefined,
			}
			const tokenSource = new vscode.CancellationTokenSource()

			// Get completions from the provider
			const completions = await this.ghost.inlineCompletionProvider.provideInlineCompletionItems(
				mockDocument,
				vscodePosition,
				context,
				tokenSource.token,
			)

			tokenSource.dispose()

			// Serialize and return the result
			return this.serializeCompletionResult(completions, params.requestId)
		} catch (error) {
			return {
				requestId: "",
				items: [],
				error: error instanceof Error ? error.message : String(error),
			}
		}
	}
}

export const registerGhostJetbrainsBridge = (
	context: vscode.ExtensionContext,
	_cline: ClineProvider,
	ghost: GhostServiceManager,
) => {
	// Check if we are running inside JetBrains IDE
	const { kiloCodeWrapped, kiloCodeWrapperJetbrains } = getKiloCodeWrapperProperties()
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
