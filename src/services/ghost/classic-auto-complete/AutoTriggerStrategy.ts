import { AutocompleteInput } from "../types"
import { CURSOR_MARKER } from "./ghostConstants"
import { isCommentLine, cleanComment } from "./CommentHelpers"
import type { TextDocument, Range } from "vscode"

export function getBaseSystemInstructions(): string {
	return `You are a Fill-In-the-Middle (FIM) code completion assistant.

CRITICAL OUTPUT FORMAT:
- Return ONLY the code that should go at the cursor position
- Do NOT include any prefix or suffix code that already exists
- Do NOT include explanations, markdown formatting, or XML tags
- Return just the raw code text that fills the gap
- Include necessary newlines and spacing at the start/end of your completion

GUIDELINES:
- Be conservative and minimal
- Complete only what appears to be in progress
- Match the existing code style and indentation
- Single line completions are preferred
- If nothing obvious to complete, return nothing
- If completing after a comment or line, start with a newline

`
}

export function addCursorMarker(document: TextDocument, range?: Range): string {
	if (!range) return document.getText()

	const fullText = document.getText()
	const cursorOffset = document.offsetAt(range.start)
	const beforeCursor = fullText.substring(0, cursorOffset)
	const afterCursor = fullText.substring(cursorOffset)

	return `${beforeCursor}${CURSOR_MARKER}${afterCursor}`
}

export class AutoTriggerStrategy {
	shouldTreatAsComment(prefix: string, languageId: string): boolean {
		const lines = prefix.split("\n")
		const currentLine = lines[lines.length - 1].trim() || ""
		const previousLine = lines.length > 1 ? lines[lines.length - 2].trim() : ""

		if (isCommentLine(currentLine, languageId)) {
			return true
		} else if (currentLine === "" && previousLine) {
			return isCommentLine(previousLine, languageId)
		} else {
			return false
		}
	}

	getPrompts(
		autocompleteInput: AutocompleteInput,
		prefix: string,
		suffix: string,
		languageId: string,
	): {
		systemPrompt: string
		userPrompt: string
	} {
		if (this.shouldTreatAsComment(prefix, languageId)) {
			return {
				systemPrompt: this.getCommentsSystemInstructions(),
				userPrompt: this.getCommentsUserPrompt(prefix, suffix, languageId),
			}
		} else {
			return {
				systemPrompt: this.getSystemInstructions(),
				userPrompt: this.getUserPrompt(autocompleteInput, prefix, suffix, languageId),
			}
		}
	}

	getSystemInstructions(): string {
		return (
			getBaseSystemInstructions() +
			`Task: Auto-Completion
Provide a subtle, non-intrusive completion after a typing pause.

`
		)
	}

	/**
	 * Build minimal prompt for auto-trigger
	 */
	getUserPrompt(autocompleteInput: AutocompleteInput, prefix: string, suffix: string, languageId: string): string {
		let prompt = `Language: ${languageId}\n\n`

		// FIM request structure
		prompt += "Fill in the missing code at the cursor position.\n\n"
		prompt += "## Code Before Cursor (PREFIX):\n"
		prompt += "```" + languageId + "\n"
		prompt += prefix
		prompt += "\n```\n\n"

		prompt += "## Code After Cursor (SUFFIX):\n"
		prompt += "```" + languageId + "\n"
		prompt += suffix
		prompt += "\n```\n\n"

		prompt += "Return ONLY the code that belongs at the cursor position.\n"
		prompt += "Include any necessary newlines or spacing at the beginning or end of your completion.\n"
		prompt += "No explanations, no markdown, just the raw code text.\n"

		return prompt
	}

	getCommentsSystemInstructions(): string {
		return (
			getBaseSystemInstructions() +
			`You are an expert code generation assistant that implements code based on comments.

## Core Responsibilities:
1. Read and understand the comment's intent
2. Generate complete, working code that fulfills the comment's requirements
3. Follow the existing code style and patterns

## Output Requirements:
- Return ONLY the code that implements the comment
- Match the indentation level of the comment
- Do not include the comment itself in your output
- Ensure the code is production-ready`
		)
	}

	getCommentsUserPrompt(prefix: string, suffix: string, languageId: string): string {
		// Extract the comment from the prefix
		const lines = prefix.split("\n")
		const lastLine = lines[lines.length - 1]
		const previousLine = lines.length > 1 ? lines[lines.length - 2] : ""

		// Determine which line contains the comment
		const commentLine = isCommentLine(lastLine, languageId) ? lastLine : previousLine
		const comment = cleanComment(commentLine, languageId)

		let prompt = `Language: ${languageId}\n\n`
		prompt += `Comment to implement: ${comment}\n\n`

		prompt += "## Code Before Cursor (PREFIX):\n"
		prompt += "```" + languageId + "\n"
		prompt += prefix
		prompt += "\n```\n\n"

		prompt += "## Code After Cursor (SUFFIX):\n"
		prompt += "```" + languageId + "\n"
		prompt += suffix
		prompt += "\n```\n\n"

		prompt += "Return ONLY the code that implements this comment.\n"
		prompt += "Include a newline at the start if the code should be on a new line.\n"
		prompt += "No explanations, just the raw code.\n"

		return prompt
	}
}
