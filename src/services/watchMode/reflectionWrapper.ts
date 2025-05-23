import * as vscode from "vscode"
import { REFLECTION_ENABLED, MAX_REFLECTION_ATTEMPTS } from "./config"
import { AICommentData } from "./types"
import { estimateTokenCount } from "./commentProcessor"

/**
 * Error thrown when reflection is needed
 */
export class ReflectionNeededError extends Error {
	constructor(
		public attemptNumber: number,
		public errors: string[],
		public originalResponse: string,
	) {
		super(`REFLECTION_NEEDED:${attemptNumber}:${errors.join("|")}`)
		this.name = "ReflectionNeededError"
	}
}

/**
 * Options for the reflection wrapper
 */
export interface ReflectionWrapperOptions<TContext> {
	/**
	 * Function to build the initial prompt
	 */
	buildPrompt: (context: TContext) => string

	/**
	 * Function to build the reflection prompt when errors occur
	 */
	buildReflectionPrompt: (context: TContext, originalResponse: string, errors: string[]) => string

	/**
	 * Function to call the AI model with a prompt
	 */
	callAI: (prompt: string) => Promise<string>

	/**
	 * Function to process the AI response
	 * Should throw ReflectionNeededError if reflection is needed
	 * Should return true if successful, false if failed
	 */
	processResponse: (context: TContext, response: string, attemptNumber: number) => Promise<boolean>

	/**
	 * Optional logger function
	 */
	log?: (message: string) => void
}

/**
 * Generic reflection wrapper that can wrap any prompt/response cycle
 *
 * @param context The context data needed for the operation
 * @param options The options for the reflection wrapper
 * @returns Promise that resolves to true if successful, false if failed
 */
export async function withReflection<TContext>(
	context: TContext,
	options: ReflectionWrapperOptions<TContext>,
): Promise<{ success: boolean; response: string | null }> {
	const { buildPrompt, buildReflectionPrompt, callAI, processResponse, log = console.log } = options

	let currentAttempt = 0
	let lastResponse: string | null = null
	let success = false

	// If reflection is disabled, just run once
	const maxAttempts = REFLECTION_ENABLED ? MAX_REFLECTION_ATTEMPTS : 0

	while (currentAttempt <= maxAttempts) {
		try {
			// Build the appropriate prompt
			const prompt =
				currentAttempt === 0 ? buildPrompt(context) : buildReflectionPrompt(context, lastResponse!, []) // Errors will be passed from the catch block

			log(`Building prompt (attempt ${currentAttempt})...`)

			// Call the AI model
			const response = await callAI(prompt)
			lastResponse = response

			if (!response) {
				log("No response from AI model")
				return { success: false, response: null }
			}

			log(`Processing response (attempt ${currentAttempt})...`)

			// Process the response
			try {
				success = await processResponse(context, response, currentAttempt)

				if (success) {
					return { success: true, response }
				}

				// If we've reached the maximum attempts, break out
				if (currentAttempt >= maxAttempts) {
					break
				}

				currentAttempt++
			} catch (error) {
				// Check if this is a reflection request
				if (error instanceof ReflectionNeededError) {
					log(`Reflection needed, attempt ${error.attemptNumber} of ${maxAttempts}`)
					log(`Error messages: ${error.errors.join(", ")}`)

					// If reflection is disabled or we've exceeded attempts, fail
					if (!REFLECTION_ENABLED || error.attemptNumber > maxAttempts) {
						log("Reflection disabled or max attempts exceeded")
						return { success: false, response: lastResponse }
					}

					// Update the attempt counter
					currentAttempt = error.attemptNumber

					// In the next iteration, we'll build a reflection prompt
					// The errors are already captured in the error object
					const reflectionPrompt = buildReflectionPrompt(context, error.originalResponse, error.errors)

					// Call AI with reflection prompt
					const reflectionResponse = await callAI(reflectionPrompt)
					lastResponse = reflectionResponse

					if (!reflectionResponse) {
						log("No response from AI model for reflection")
						return { success: false, response: null }
					}

					// Process the reflection response
					success = await processResponse(context, reflectionResponse, currentAttempt)

					if (success) {
						return { success: true, response: reflectionResponse }
					}

					// Move to next attempt
					currentAttempt++
				} else {
					// Other errors should bubble up
					throw error
				}
			}
		} catch (error) {
			log(`Error in reflection loop: ${error instanceof Error ? error.message : String(error)}`)
			return { success: false, response: lastResponse }
		}
	}

	return { success, response: lastResponse }
}

/**
 * Helper function to check if reflection should be attempted
 */
export function shouldAttemptReflection(currentAttempt: number): boolean {
	return REFLECTION_ENABLED && currentAttempt < MAX_REFLECTION_ATTEMPTS
}

/**
 * Builds a reflection prompt for the AI model when edits fail
 * This is specific to watch mode comment processing
 */
export function buildWatchModeReflectionPrompt(
	commentData: AICommentData,
	originalResponse: string,
	errors: string[],
	activeFiles: { uri: vscode.Uri; content: string }[] = [],
	currentAICommentPrefix: string = "KO!",
): string {
	console.log("[WatchMode DEBUG] Building reflection prompt")
	const { content, context, fileUri } = commentData
	const filePath = vscode.workspace.asRelativePath(fileUri)

	// Extract the prefix without the exclamation mark for display in the prompt
	const displayPrefix = currentAICommentPrefix.endsWith("!")
		? currentAICommentPrefix.slice(0, -1)
		: currentAICommentPrefix

	// Create the reflection prompt with escaped markers
	let prompt = `
You are Kilo Code, a highly skilled software engineer with extensive knowledge in many programming languages, frameworks, design patterns, and best practices.

# Task

${content}

I've written your instructions in comments in the code and marked them with "${displayPrefix}"
You can see the "${displayPrefix}" comments shown below.
Find them in the code files I've shared with you, and follow their instructions.

# Code to modify

\`\`\`
${context || "No context available"}
\`\`\`

# Previous response

Your previous response failed to apply correctly. Here's what you provided:

\`\`\`
${originalResponse}
\`\`\`

# Errors

The following errors occurred when trying to apply your changes:

${errors.join("\n\n")}
`

	// Add content from active files for additional context
	if (activeFiles.length > 0) {
		prompt += `\n\n# Additional context from open files\n\n`

		for (const file of activeFiles) {
			if (file.uri.toString() !== fileUri.toString()) {
				// Skip the file with the comment
				const relativePath = vscode.workspace.asRelativePath(file.uri)
				prompt += `## ${relativePath}\n\n\`\`\`\n${file.content}\n\`\`\`\n\n`
			}
		}
	}

	prompt += `
# Response format

Please correct your previous response to address these errors. Make sure your SEARCH blocks exactly match the code in the file.
You MUST respond with SEARCH/REPLACE blocks for each edit. Format your changes as follows:

${filePath}
\<\<\<\<\<\<\< SEARCH
exact original code
\=\=\=\=\=\=\=
replacement code
\>\>\>\>\>\>\> REPLACE

IMPORTANT: You MUST ALWAYS include the file path (${filePath}) before each SEARCH/REPLACE block.
You can include multiple SEARCH/REPLACE blocks for the same file, and you can edit multiple files.
Make sure to include enough context in the SEARCH block to uniquely identify the code to replace.
After completing the instructions, also BE SURE to remove all the "${displayPrefix}" comments from the code.

NEVER use generic file names like "Code", "file", or similar placeholders. ALWAYS use the actual file path: ${filePath}

If you need to explain your changes, please do so before or after the code blocks.
`

	const finalPrompt = prompt.trim()

	// Log the full reflection prompt for debugging
	console.log("[WatchMode DEBUG] === FULL REFLECTION PROMPT ===")
	console.log(finalPrompt)
	console.log("[WatchMode DEBUG] === END REFLECTION PROMPT ===")

	// Debug log the full reflection prompt string
	console.debug(
		"[WatchMode DEBUG] Full reflection prompt string:",
		JSON.stringify({
			prompt: finalPrompt,
			length: finalPrompt.length,
			estimatedTokens: estimateTokenCount(finalPrompt),
			originalResponseLength: originalResponse.length,
			errorsCount: errors.length,
			timestamp: new Date().toISOString(),
		}),
	)

	return finalPrompt
}
