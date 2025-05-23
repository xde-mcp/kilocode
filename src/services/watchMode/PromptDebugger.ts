import * as fs from "fs"
import * as path from "path"
import * as os from "os"

/**
 * Flag to enable/disable autocomplete prompt debugging
 * When enabled, prompts will be written to a debug file
 */
export const DEBUG_AUTOCOMPLETE_PROMPT = true

/**
 * Base directory for debug files
 */
const DEBUG_BASE_DIR = path.join(os.tmpdir(), "kilo_prompt_debug")

/**
 * Interface for debug session data
 */
interface DebugSession {
	id: string
	filePath: string
}

/**
 * Generates a unique ID for a debug session
 */
function generateDebugId(): string {
	return Date.now().toString()
}

/**
 * Creates a debug session and returns the file path
 * @returns Debug session information
 */
function createDebugSession(): DebugSession {
	const id = generateDebugId()

	// Create the directory if it doesn't exist
	if (!fs.existsSync(DEBUG_BASE_DIR)) {
		fs.mkdirSync(DEBUG_BASE_DIR, { recursive: true })
	}

	const filePath = path.join(DEBUG_BASE_DIR, `debug_${id}.txt`)
	console.log(`Debug file: ${filePath}`)

	return { id, filePath }
}

/**
 * Writes or appends content to a debug file
 * @param filePath The file path to write to
 * @param content The content to write
 * @param append Whether to append to the file
 */
function writeDebugFile(filePath: string, content: string, append: boolean = false): void {
	try {
		if (append) {
			fs.appendFileSync(filePath, content)
		} else {
			fs.writeFileSync(filePath, content)
		}
	} catch (err) {
		console.error(`Error writing debug file:`, err)
	}
}

/**
 * Writes autocomplete prompts to a debug file when debugging is enabled
 * @param systemPrompt The system prompt
 * @param userPrompt The user prompt
 * @returns The debug session ID if debugging is enabled, undefined otherwise
 */
export function writePromptToDebugFile(systemPrompt: string, userPrompt: string): string | undefined {
	if (!DEBUG_AUTOCOMPLETE_PROMPT) {
		return undefined
	}

	try {
		const session = createDebugSession()

		const timestamp = new Date().toISOString()
		const separator = "=".repeat(80)

		const debugContent = `${separator}
PROMPT DEBUG SESSION
Timestamp: ${timestamp}
${separator}

SYSTEM PROMPT:
${separator}
${systemPrompt}

USER PROMPT:
${separator}
${userPrompt.replaceAll("\\n", "\n")}

`

		writeDebugFile(session.filePath, debugContent)
		return session.id
	} catch (error) {
		console.error("Error in debug prompt writing:", error)
		return undefined
	}
}

/**
 * Writes prompt response to a debug file when debugging is enabled
 * @param response The response content
 * @param debugId The debug session ID (if available)
 */
export function writePromptResponseToDebugFile(response: string, debugId?: string): void {
	if (!DEBUG_AUTOCOMPLETE_PROMPT) {
		return
	}

	try {
		let filePath: string

		if (debugId) {
			// Use the existing debug session file
			filePath = path.join(DEBUG_BASE_DIR, `debug_${debugId}.txt`)
		} else {
			// Create a new session if no ID was provided
			const session = createDebugSession()
			filePath = session.filePath
		}

		const separator = "=".repeat(80)
		const debugContent = `AI RESPONSE:
${separator}
${response}

${separator}
END OF DEBUG SESSION
${separator}
`

		writeDebugFile(filePath, debugContent, true)
	} catch (error) {
		console.error("Error in debug response writing:", error)
	}
}
