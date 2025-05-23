import * as vscode from "vscode"
import { Anthropic } from "@anthropic-ai/sdk"
import { EXPERIMENT_IDS, ExperimentId, experiments } from "../../shared/experiments"
import { AICommentData, WatchModeConfig, TriggerType } from "./types"
import { WatchModeUI } from "./ui"
import { ApiHandler, buildApiHandler } from "../../api"
import { ContextProxy } from "../../core/config/ContextProxy"
import { writePromptToDebugFile, writePromptResponseToDebugFile } from "../../utils/PromptDebugger"
import {
	detectAIComments,
	buildAIPrompt,
	processAIResponse,
	updateAICommentPatterns,
	updateCurrentAICommentPrefix,
	determineTriggerType,
	estimateTokenCount,
} from "./commentProcessor"
import { withReflection, buildWatchModeReflectionPrompt } from "../../utils/reflectionWrapper"
import { WatchModeHighlighter } from "./WatchModeHighlighter"
import { getContextFiles } from "./importParser"

/**
 * Service that watches files for changes and processes AI comments
 */
export class WatchModeService {
	private apiHandler: ApiHandler | null = null
	private pendingProcessing: Map<string, ReturnType<typeof setTimeout>> = new Map()
	private outputChannel?: vscode.OutputChannel
	private ui: WatchModeUI
	private highlighter: WatchModeHighlighter
	private processingFiles: Set<string> = new Set()
	private currentDebugId?: string
	private documentListeners: vscode.Disposable[] = []
	private quickCommandDocument?: vscode.TextDocument // Track the document that initiated a quick command

	// Track active files for context management
	private activeFiles: Set<string> = new Set()
	private maxActiveFiles: number = 10 // Maximum number of files to keep in active context
	private largeFileThreshold: number = 1000000 // ~1MB threshold for large files

	// Event emitters
	private readonly _onDidStartProcessingComment = new vscode.EventEmitter<{
		fileUri: vscode.Uri
		comment: AICommentData
	}>()
	private readonly _onDidFinishProcessingComment = new vscode.EventEmitter<{
		fileUri: vscode.Uri
		comment: AICommentData
		success: boolean
	}>()

	// Event handlers
	readonly onDidStartProcessingComment = this._onDidStartProcessingComment.event
	readonly onDidFinishProcessingComment = this._onDidFinishProcessingComment.event

	private readonly defaultConfig: WatchModeConfig = {
		model: "claude-3.7",
		commentPrefix: "KO!", // Default AI comment prefix
	}
	private config: WatchModeConfig

	/**
	 * Creates a new instance of the WatchModeService
	 * @param context The extension context
	 * @param outputChannel Optional output channel for logging
	 */
	constructor(
		private readonly context: vscode.ExtensionContext,
		outputChannel?: vscode.OutputChannel,
	) {
		this.log("Kilo WatchMode experiment active")

		this.outputChannel = outputChannel
		this.config = this.defaultConfig
		this.ui = new WatchModeUI(context)
		this.highlighter = new WatchModeHighlighter()

		this.setupApiHandler()

		// Listen to our own events to update the UI
		this.onDidStartProcessingComment(({ fileUri }) => {
			this.processingFiles.add(fileUri.toString())
			this.ui.showProcessing(this.processingFiles.size)
		})

		this.onDidFinishProcessingComment(({ fileUri, success }) => {
			this.processingFiles.delete(fileUri.toString())

			if (this.processingFiles.size === 0) {
				this.ui.hideProcessing()
			} else {
				this.ui.showProcessing(this.processingFiles.size)
			}

			const filePath = vscode.workspace.asRelativePath(fileUri)
			if (success) {
				this.ui.showSuccessNotification(filePath, 1)
			}
		})

		// Initialize if experiment is enabled
		if (this.isExperimentEnabled()) {
			this.initialize()
		}
	}

	private async setupApiHandler() {
		if (this.apiHandler) return

		const contextProxy = await ContextProxy.getInstance(this.context)
		const providerSettings = contextProxy.getProviderSettings()

		this.apiHandler = buildApiHandler(providerSettings)
	}

	/**
	 * Logs a message to the output channel if available
	 * @param message The message to log
	 */
	private log(message: string): void {
		if (this.outputChannel) {
			this.outputChannel.appendLine(`[WatchMode] ${message}`)
		}
	}

	/**
	 * Checks if the watch mode experiment is enabled
	 */
	private isExperimentEnabled(): boolean {
		const experimentsConfig = (this.context.globalState.get("experiments") || {}) as Record<ExperimentId, boolean>
		const isEnabled = experiments.isEnabled(experimentsConfig, EXPERIMENT_IDS.WATCH_MODE)
		this.log(`Watch mode experiment enabled: ${isEnabled}`)
		return isEnabled
	}

	/**
	 * Loads configuration from settings
	 */
	private loadConfig(): void {
		const config = vscode.workspace.getConfiguration("kilo-code.watchMode")

		this.config = {
			model: config.get("model", this.defaultConfig.model),
			commentPrefix: config.get("commentPrefix", this.defaultConfig.commentPrefix),
		}

		// Update the AI comment patterns with the configured prefix
		const { commentPrefix } = this.config
		this.log(`Using AI comment prefix: ${commentPrefix}`)

		// Use the imported functions from commentProcessor

		// Update the patterns and prefix
		updateAICommentPatterns(commentPrefix)
		updateCurrentAICommentPrefix(commentPrefix)
	}

	/**
	 * Initializes the watch mode service
	 */
	private initialize(): void {
		this.log("Initializing watch mode")
		this.loadConfig()
		this.ui.showStatus(true)
		this.initializeWatchers()
	}

	/**
	 * Initializes file system watchers
	 */
	private initializeWatchers(): void {
		// Clean up any existing document listeners
		this.log(`Disposing ${this.documentListeners.length} document listeners`)
		for (const listener of this.documentListeners) {
			listener.dispose()
		}
		this.documentListeners = []
		this.highlighter.clearAllHighlights()

		// Set up document change listeners for real-time editing and document save listeners
		const changeListener = vscode.workspace.onDidChangeTextDocument((event) => {
			this.handleDocumentChange({ document: event.document, shouldProcessComments: false })
		})
		const saveListener = vscode.workspace.onDidSaveTextDocument((document) => {
			this.handleDocumentChange({ document: document, shouldProcessComments: true })
		})

		this.documentListeners.push(changeListener, saveListener)
		this.context.subscriptions.push(changeListener, saveListener)
	}

	/**
	 * Handles document change events (typing or saving)
	 */
	private handleDocumentChange(data: { document: vscode.TextDocument; shouldProcessComments: boolean }): void {
		const { document, shouldProcessComments } = data
		const fileUri = document.uri
		const fileKey = fileUri.toString()

		// For all document changes (typing or saving), immediately detect and highlight comments
		this.detectAndHighlightComments(document)

		// For save events, immediately process the comments with animation
		if (shouldProcessComments) {
			this.log(`Document saved, immediately processing: ${fileUri.toString()}`)

			// Cancel any pending processing for this file
			if (this.pendingProcessing.has(fileKey)) {
				clearTimeout(this.pendingProcessing.get(fileKey))
				this.pendingProcessing.delete(fileKey)
			}

			// Process the file immediately without debounce
			this.processFile(fileUri)
		}
	}

	/**
	 * Processes a file to find and handle AI comments
	 * @param fileUri URI of the file to process
	 */
	/**
	 * Adds a file to the active files list
	 * @param fileUri The URI of the file to add
	 */
	private addToActiveFiles(fileUri: vscode.Uri): void {
		const fileKey = fileUri.toString()

		// If already in the set, remove it so it can be added to the front (most recent)
		if (this.activeFiles.has(fileKey)) {
			this.activeFiles.delete(fileKey)
		}

		// Add to the active files set
		this.activeFiles.add(fileKey)

		// If we've exceeded the maximum, remove the oldest file
		if (this.activeFiles.size > this.maxActiveFiles) {
			const iterator = this.activeFiles.values()
			const oldest = iterator.next().value

			if (oldest) {
				this.activeFiles.delete(oldest)
				this.log(`Removed ${oldest} from active files (exceeded max of ${this.maxActiveFiles})`)
			}
		}

		this.log(`Active files (${this.activeFiles.size}): ${Array.from(this.activeFiles).join(", ")}`)
	}

	/**
	 * Gets a list of active files for context
	 * @returns Array of active file URIs
	 */
	private getActiveFiles(): vscode.Uri[] {
		return Array.from(this.activeFiles).map((uri) => vscode.Uri.parse(uri))
	}

	/**
	 * Processes a file to find and handle AI comments
	 * @param fileUri URI of the file to process
	 */
	private async processFile(fileUri: vscode.Uri): Promise<void> {
		try {
			this.log(`Processing file: ${fileUri.fsPath}`)

			// Read the file content
			const document = await vscode.workspace.openTextDocument(fileUri)
			const content = document.getText()

			// Add to active files list (even if large, we want to track it)
			this.addToActiveFiles(fileUri)

			// Skip processing if file is too large
			if (content.length > this.largeFileThreshold) {
				// Skip files larger than threshold
				this.log(`Skipping large file: ${fileUri.fsPath} (${content.length} bytes)`)
				return
			}

			// Detect AI comments in the file
			const result = detectAIComments({
				fileUri,
				content,
				languageId: document.languageId,
			})

			if (result.errors) {
				result.errors.forEach((error) => {
					this.log(`Error processing file: ${error.message}`)
					this.ui.showErrorNotification(error.message)
				})
			}

			if (result.comments.length === 0) {
				this.log(`No AI comments found in file: ${fileUri.fsPath}`)
				return // No comments found, nothing to do
			}

			this.log(`Found ${result.comments.length} AI comments in ${fileUri.fsPath}`)

			// Process each AI comment
			for (const comment of result.comments) {
				await this.processAIComment(document, comment)
			}
		} catch (error) {
			this.log(
				`Error processing file ${fileUri.fsPath}: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}

	/**
	 * Detects and highlights comments in a document without animation
	 * @param document The document to check
	 */
	/**
	 * Detects and highlights comments in a document without animation
	 * @param document The document to check
	 */
	private detectAndHighlightComments(document: vscode.TextDocument): void {
		try {
			const fileUri = document.uri
			// Clear any existing static highlights for this file
			this.highlighter.clearStaticHighlightsForFile(fileUri)

			this.addToActiveFiles(fileUri)

			// Skip files larger than threshold
			const content = document.getText()
			if (content.length > this.largeFileThreshold) {
				this.log(`Skipping large file: ${fileUri.fsPath} (${content.length} bytes)`)
				return
			}

			const result = detectAIComments({ fileUri, content, languageId: document.languageId })
			this.log(`Found ${result.comments.length} AI comments in ${fileUri.fsPath}`)

			if (result.errors) {
				result.errors.forEach((error) => {
					this.log(`Error detecting comments: ${error.message}`)
				})
			}

			for (const comment of result.comments) {
				this.highlighter.highlightCommentPrefixOnly(document, comment, this.config.commentPrefix)
			}
		} catch (error) {
			this.log(
				`Error detecting comments in ${document.uri.fsPath}: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}

	private async processAIComment(document: vscode.TextDocument, comment: AICommentData): Promise<void> {
		try {
			this.log(
				`Processing AI comment: "${comment.content.substring(0, 50)}${comment.content.length > 50 ? "..." : ""}"`,
			)

			// Highlight the AI comment with animation
			const clearHighlight = this.highlighter.highlightCommentForProcessing(document, comment)

			// Emit event that we're starting to process this comment
			this._onDidStartProcessingComment.fire({ fileUri: document.uri, comment })
			const triggerType = determineTriggerType(comment.content)
			this.log(`Trigger type determined: ${triggerType}`)

			await this.processWithReflection(document, comment, triggerType, clearHighlight)
		} catch (error) {
			this.log(`Error processing AI comment: ${error instanceof Error ? error.message : String(error)}`)
			this._onDidFinishProcessingComment.fire({
				fileUri: document.uri,
				comment,
				success: false,
			})
		}
	}

	/**
	 * Processes an AI comment with support for reflection on failed edits
	 * @param document The document containing the comment
	 * @param comment The AI comment data
	 * @param triggerType The trigger type (Edit or Ask)
	 * @param clearHighlight Function to clear the highlight
	 */
	private async processWithReflection(
		document: vscode.TextDocument,
		comment: AICommentData,
		triggerType: TriggerType,
		clearHighlight: () => void,
	): Promise<void> {
		const context = {
			document,
			comment,
			triggerType,
			activeFilesWithContent: await this.gatherActiveFilesContext(document),
		}

		const result = await withReflection(context, {
			buildPrompt: (ctx) => buildAIPrompt(ctx.comment, ctx.triggerType, ctx.activeFilesWithContent),
			buildReflectionPrompt: (ctx, originalResponse, errors) =>
				buildWatchModeReflectionPrompt(
					ctx.comment,
					originalResponse,
					errors,
					ctx.activeFilesWithContent,
					this.config.commentPrefix,
				),
			callAI: async (prompt) => await this.callAIModel(prompt),
			processResponse: async (ctx, response, attemptNumber) => {
				return await processAIResponse(ctx.document, ctx.comment, response, attemptNumber)
			},
			log: (message) => this.log(message),
		})

		this._onDidFinishProcessingComment.fire({ fileUri: document.uri, comment, success: result.success })
		clearHighlight()
	}

	/**
	 * Gathers content from active files for additional context
	 */
	private async gatherActiveFilesContext(
		document: vscode.TextDocument,
	): Promise<{ uri: vscode.Uri; content: string }[]> {
		const activeFilesWithContent: { uri: vscode.Uri; content: string }[] = []

		// Maximum token budget for additional context (roughly 50% of model's context window)
		const MAX_ADDITIONAL_CONTEXT_TOKENS = 50000
		let estimatedTokens = 0

		// First, estimate tokens for the base prompt
		const basePrompt = buildAIPrompt(
			{
				content: "",
				startPos: new vscode.Position(0, 0),
				endPos: new vscode.Position(0, 0),
				context: "",
				fileUri: document.uri,
			},
			TriggerType.Edit,
		)
		estimatedTokens += estimateTokenCount(basePrompt)

		// Get imported files from the current document
		const importedFiles = await getContextFiles(document.uri, document.getText(), 2)
		// this.log(`Found ${importedFiles.length} imported files for context`)

		// Get active files and sort by recency (most recent first)
		const activeFileUris = this.getActiveFiles()

		// Prioritize open editor tabs
		const openEditors = vscode.window.visibleTextEditors.map((editor) => editor.document.uri.toString())

		// Combine imported files with active files, removing duplicates
		const allContextFiles = new Set<string>()

		// Add imported files first (highest priority)
		importedFiles.forEach((uri) => allContextFiles.add(uri.toString()))

		// Add open editors next
		openEditors.forEach((uri) => allContextFiles.add(uri))

		// Add other active files last
		activeFileUris.forEach((uri) => allContextFiles.add(uri.toString()))

		// Convert back to URIs and sort by priority
		const sortedContextFiles = Array.from(allContextFiles).map((uriStr) => vscode.Uri.parse(uriStr))

		// Add content from context files until we reach the token limit
		for (const uri of sortedContextFiles) {
			// Skip the file with the comment (already included in the context)
			if (uri.toString() === document.uri.toString()) {
				continue
			}

			try {
				// Skip files that are too large
				if (uri.fsPath.endsWith(".min.js") || uri.fsPath.endsWith(".min.css")) {
					this.log(`Skipping minified file: ${uri.fsPath}`)
					continue
				}

				const doc = await vscode.workspace.openTextDocument(uri)
				const content = doc.getText()

				// Skip if file is too large
				if (content.length > this.largeFileThreshold) {
					this.log(`Skipping large file for context: ${uri.fsPath} (${content.length} bytes)`)
					continue
				}

				// Estimate tokens for this file
				const fileTokens = estimateTokenCount(content)

				// If adding this file would exceed our budget, skip it
				if (estimatedTokens + fileTokens > MAX_ADDITIONAL_CONTEXT_TOKENS) {
					this.log(`Skipping file due to token budget: ${uri.fsPath} (${fileTokens} tokens)`)
					continue
				}

				// Add file to context
				activeFilesWithContent.push({ uri, content })
				estimatedTokens += fileTokens

				this.log(`Added file to context: ${uri.fsPath} (${fileTokens} tokens)`)
			} catch (error) {
				this.log(`Error reading file ${uri.fsPath}: ${error instanceof Error ? error.message : String(error)}`)
			}
		}

		this.log(
			`Total context includes ${activeFilesWithContent.length} additional files (est. ${estimatedTokens} tokens)`,
		)

		return activeFilesWithContent
	}

	/**
	 * Makes an API call to the AI model
	 * @param prompt The prompt to send to the AI model
	 */
	private async callAIModel(prompt: string): Promise<string> {
		this.log(`Calling AI model with prompt length: ${prompt.length} characters`)

		try {
			// Get the API handler from the extension
			if (!this.apiHandler) {
				throw new Error("this.apiHandler not available")
			}

			// Call the model with the prompt using the streaming API
			this.log(`Using model: ${this.apiHandler?.getModel()?.id || "unknown"}`)

			// Create a system message and a user message with the prompt
			const systemPrompt =
				"You are Kilo Code, a highly skilled software engineer with extensive knowledge in many programming languages, frameworks, design patterns, and best practices."
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: prompt }]

			// Write prompt to debug file and store the debug ID
			this.currentDebugId = writePromptToDebugFile(systemPrompt, JSON.stringify(messages, null, 2))

			this.log("Creating message stream...")

			// Use the streaming API to get the response
			let fullResponse = ""
			let chunkCount = 0

			// Process the stream and collect the full response
			try {
				const messageStream = this.apiHandler?.createMessage(systemPrompt, messages)
				this.log("Message stream created successfully")

				for await (const chunk of messageStream) {
					chunkCount++
					if (chunk.type === "text") {
						fullResponse += chunk.text
					}
				}

				this.log(
					`Stream complete. Received ${chunkCount} chunks, total response length: ${fullResponse.length}`,
				)

				// Write the response to debug file using the same debug ID
				writePromptResponseToDebugFile(fullResponse, this.currentDebugId)
			} catch (streamError) {
				this.log(
					`Error processing stream: ${streamError instanceof Error ? streamError.message : String(streamError)}`,
				)
				throw streamError
			}

			return fullResponse
		} catch (error) {
			this.log(`Error in callAIModel: ${error instanceof Error ? error.message : String(error)}`)
			throw error
		}
	}

	/**
	 * Processes a quick command by creating a temporary AI comment in the document
	 * @param document The document to process
	 * @param command The command text from the user
	 */
	public async processQuickCommand(document: vscode.TextDocument, command: string): Promise<void> {
		try {
			this.log(`Processing quick command: ${command}`)

			// Get the current cursor position
			const activeEditor = vscode.window.activeTextEditor
			if (!activeEditor || activeEditor.document !== document) {
				throw new Error("No active editor or document mismatch")
			}

			const cursorPosition = activeEditor.selection.active
			const line = document.lineAt(cursorPosition.line)

			// Determine the appropriate comment syntax based on language
			const languageId = document.languageId
			let commentPrefix = "//"
			let commentSuffix = ""

			// Adjust comment syntax for different languages
			switch (languageId) {
				case "python":
				case "ruby":
				case "perl":
				case "bash":
				case "shell":
				case "yaml":
				case "dockerfile":
					commentPrefix = "#"
					break
				case "html":
				case "xml":
				case "markdown":
					commentPrefix = "<!--"
					commentSuffix = "-->"
					break
				case "css":
				case "scss":
				case "less":
					commentPrefix = "/*"
					commentSuffix = "*/"
					break
				case "sql":
					commentPrefix = "--"
					break
			}

			// Create the AI comment with the configured prefix
			const aiCommentPrefix = this.config.commentPrefix
			const fullComment = `${commentPrefix} ${aiCommentPrefix} ${command}${commentSuffix ? " " + commentSuffix : ""}`

			// Insert the comment at the cursor position
			const edit = new vscode.WorkspaceEdit()
			const insertPosition = new vscode.Position(cursorPosition.line, line.text.length)

			// If the line is not empty, add a newline before the comment
			if (line.text.trim().length > 0) {
				edit.insert(document.uri, insertPosition, `\n${fullComment}`)
			} else {
				// If the line is empty, just insert the comment with proper indentation
				const indentation = line.text.match(/^\s*/)?.[0] || ""
				edit.replace(document.uri, line.range, `${indentation}${fullComment}`)
			}

			// Apply the edit
			const success = await vscode.workspace.applyEdit(edit)
			if (!success) {
				throw new Error("Failed to insert AI comment")
			}

			// Add this document to active files to ensure it's included in context
			this.addToActiveFiles(document.uri)

			// Save the document to trigger the watch mode processing
			await document.save()

			this.log(`Quick command processed successfully`)
		} catch (error) {
			this.log(`Error in processQuickCommand: ${error instanceof Error ? error.message : String(error)}`)
			throw error
		}
	}

	public dispose(): void {
		this.log("Disposing watch mode service")

		for (const timeout of this.pendingProcessing.values()) {
			clearTimeout(timeout)
		}
		this.pendingProcessing.clear()

		this.log(`Disposing ${this.documentListeners.length} document listeners`)
		for (const listener of this.documentListeners) {
			listener.dispose()
		}
		this.documentListeners = []

		this.highlighter.clearAllHighlights()

		this._onDidStartProcessingComment.dispose()
		this._onDidFinishProcessingComment.dispose()

		this.ui.showStatus(false)
	}
}
