import type { ExtensionChatMessage } from "../../../types/messages.js"
import type { ToolData, McpServerData, FollowUpData, ApiReqInfo, ImageData } from "./types.js"

/**
 * Parse JSON from message text safely
 */
export function parseMessageJson<T = any>(text?: string): T | null {
	if (!text) return null
	try {
		return JSON.parse(text) as T
	} catch {
		return null
	}
}

/**
 * Parse tool data from message
 */
export function parseToolData(message: ExtensionChatMessage): ToolData | null {
	return parseMessageJson<ToolData>(message.text)
}

/**
 * Type guard to check if an object is valid McpServerData
 */
export function isMcpServerData(obj: any): obj is McpServerData {
	if (!obj || typeof obj !== "object") return false

	// Check required fields
	if (!obj.type || typeof obj.serverName !== "string") return false

	// Validate type field
	if (obj.type !== "use_mcp_tool" && obj.type !== "access_mcp_resource") return false

	// Type-specific validation
	if (obj.type === "use_mcp_tool") {
		// Tool use should have toolName
		if (obj.toolName !== undefined && typeof obj.toolName !== "string") return false
	} else if (obj.type === "access_mcp_resource") {
		// Resource access should have uri
		if (obj.uri !== undefined && typeof obj.uri !== "string") return false
	}

	// Validate optional fields if present
	if (obj.arguments !== undefined && typeof obj.arguments !== "string") return false

	return true
}

/**
 * Parse MCP server data from message with validation
 */
export function parseMcpServerData(message: ExtensionChatMessage): McpServerData | null {
	const parsed = parseMessageJson<McpServerData>(message.text)
	if (!parsed || !isMcpServerData(parsed)) return null
	return parsed
}

/**
 * Parse follow-up data from message
 * Checks both text and metadata fields
 */
export function parseFollowUpData(message: ExtensionChatMessage): FollowUpData | null {
	// Try parsing from text first
	const fromText = parseMessageJson<FollowUpData>(message.text)
	if (fromText) return fromText

	// Try parsing from metadata
	if (message.metadata) {
		// If metadata is already an object, return it
		if (typeof message.metadata === "object" && message.metadata !== null) {
			return message.metadata as FollowUpData
		}
		// If metadata is a string, try parsing it
		if (typeof message.metadata === "string") {
			return parseMessageJson<FollowUpData>(message.metadata)
		}
	}

	return null
}

/**
 * Parse API request info from message
 */
export function parseApiReqInfo(message: ExtensionChatMessage): ApiReqInfo | null {
	return parseMessageJson<ApiReqInfo>(message.text)
}

/**
 * Parse image data from message
 */
export function parseImageData(message: ExtensionChatMessage): ImageData | null {
	return parseMessageJson<ImageData>(message.text)
}

/**
 * Get icon for message type
 */
export function getMessageIcon(type: "ask" | "say", subtype?: string): string {
	if (type === "ask") {
		switch (subtype) {
			case "tool":
				return "⚙"
			case "mistake_limit_reached":
				return "✖"
			case "command":
				return "$"
			case "use_mcp_server":
				return "⚙"
			case "completion_result":
				return "✓"
			case "followup":
				return "?"
			case "condense":
				return "📦"
			case "payment_required_prompt":
				return "💳"
			case "invalid_model":
				return "⚠"
			case "report_bug":
				return "🐛"
			case "auto_approval_max_req_reached":
				return "⚠"
			default:
				return "?"
		}
	} else {
		switch (subtype) {
			case "error":
				return "✖"
			case "diff_error":
				return "⚠"
			case "completion_result":
				return "✓"
			case "api_req_started":
				return "⟳"
			case "checkpoint_saved":
				return "💾"
			case "codebase_search_result":
				return "🔍"
			case "image":
				return "🖼"
			default:
				return ">"
		}
	}
}

/**
 * Get color for message type
 */
export function getMessageColor(type: "ask" | "say", subtype?: string): string {
	if (type === "ask") {
		return "yellow"
	}

	switch (subtype) {
		case "error":
		case "diff_error":
			return "red"
		case "completion_result":
			return "green"
		case "api_req_started":
			return "cyan"
		default:
			return "green"
	}
}

/**
 * Get tool icon
 */
export function getToolIcon(tool: string): string {
	switch (tool) {
		case "editedExistingFile":
		case "appliedDiff":
			return "±"
		case "insertContent":
			return "+"
		case "searchAndReplace":
			return "⇄"
		case "newFileCreated":
			return "📄"
		case "readFile":
			return "📝"
		case "generateImage":
			return "🖼"
		case "listFilesTopLevel":
		case "listFilesRecursive":
			return "📁"
		case "listCodeDefinitionNames":
			return "📝"
		case "searchFiles":
		case "codebaseSearch":
			return "🔍"
		case "updateTodoList":
			return "☐"
		case "switchMode":
			return "⚡"
		case "newTask":
			return "📋"
		case "finishTask":
			return "✓✓"
		case "fetchInstructions":
			return "📖"
		case "runSlashCommand":
			return "▶"
		default:
			return "⚙"
	}
}

/**
 * Truncate text to max length
 */
export function truncateText(text: string, maxLength: number = 100): string {
	if (text.length <= maxLength) return text
	return text.substring(0, maxLength - 3) + "..."
}

/**
 * Format file path for display
 */
export function formatFilePath(path: string): string {
	// Remove leading ./ if present
	return path.replace(/^\.\//, "")
}

/**
 * Check if message has JSON content
 */
export function hasJsonContent(message: ExtensionChatMessage): boolean {
	if (!message.text) return false
	try {
		JSON.parse(message.text)
		return true
	} catch {
		return false
	}
}

/**
 * Format JSON string with indentation
 */
export function formatJson(jsonString: string, indent: number = 2): string | null {
	try {
		const parsed = JSON.parse(jsonString)
		return JSON.stringify(parsed, null, indent)
	} catch {
		return null
	}
}

/**
 * Calculate byte size of string without creating full byte array for large strings
 * Uses chunked approach for strings over 10KB to avoid memory spike
 *
 * @param str - The string to measure
 * @returns The byte size in UTF-8 encoding
 */
function calculateByteSize(str: string): number {
	const CHUNK_THRESHOLD = 10000
	const CHUNK_SIZE = 10000

	// For small strings, use TextEncoder directly (faster)
	if (str.length < CHUNK_THRESHOLD) {
		return new TextEncoder().encode(str).length
	}

	// For large strings, chunk it to avoid memory spike
	const encoder = new TextEncoder()
	let totalBytes = 0

	for (let i = 0; i < str.length; i += CHUNK_SIZE) {
		const chunk = str.slice(i, Math.min(i + CHUNK_SIZE, str.length))
		totalBytes += encoder.encode(chunk).length
	}

	return totalBytes
}

/**
 * Format content with JSON detection and optional preview
 */
export interface FormattedContent {
	isJson: boolean
	content: string
	lineCount: number
	charCount: number
	byteSize: number
	isPreview: boolean
	hiddenLines: number
}

export function formatContentWithMetadata(
	text: string,
	maxLines: number = 20,
	previewLines: number = 5
): FormattedContent {
	if (!text) {
		return {
			isJson: false,
			content: "",
			lineCount: 0,
			charCount: 0,
			byteSize: 0,
			isPreview: false,
			hiddenLines: 0,
		}
	}

	// Try to format as JSON
	let content = text
	let isJson = false
	const formatted = formatJson(text)
	if (formatted) {
		content = formatted
		isJson = true
	}

	// Count lines
	const lines = content.split("\n")
	const lineCount = lines.length
	const charCount = content.length
	const byteSize = calculateByteSize(content)

	// Determine if preview is needed
	const isPreview = lineCount > maxLines
	const hiddenLines = isPreview ? lineCount - previewLines : 0

	// Create preview if needed
	if (isPreview) {
		const previewContent = lines.slice(0, previewLines).join("\n")
		content = previewContent
	}

	return {
		isJson,
		content,
		lineCount,
		charCount,
		byteSize,
		isPreview,
		hiddenLines,
	}
}

/**
 * Format byte size for display
 */
export function formatByteSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Build metadata string for content
 */
export function buildMetadataString(metadata: FormattedContent): string {
	const parts: string[] = []

	// Content type
	parts.push(metadata.isJson ? "JSON" : "Text")

	// Line count
	parts.push(`${metadata.lineCount} line${metadata.lineCount !== 1 ? "s" : ""}`)

	// Size if > 1KB
	if (metadata.byteSize >= 1024) {
		parts.push(formatByteSize(metadata.byteSize))
	}

	return parts.join(", ")
}
