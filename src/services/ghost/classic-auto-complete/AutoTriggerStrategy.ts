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
- Do NOT wrap your response in triple backticks (\`\`\`) or code blocks
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
	/**
	 * Remove trailing indentation from the prefix if the cursor is on an empty indented line.
	 * If the prefix ends with a newline followed by only whitespace (tabs/spaces),
	 * remove that whitespace.
	 *
	 * Example: 'POST',\n\t\t\t\n -> 'POST',\n
	 */
	private trimTrailingIndentation(prefix: string): string {
		// Match and remove: newline + whitespace + optional newline at the end
		return prefix.replace(/\n[\t ]+(\n)?$/, "\n")
	}

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
		// Trim trailing indentation if cursor is on empty indented line
		const trimmedPrefix = this.trimTrailingIndentation(prefix)

		let prompt = `Language: ${languageId}\n\n`

		// FIM request structure without markdown code blocks
		prompt += "Fill in the missing code at <<<FILL_HERE>>>.\n\n"
		prompt += "<CODE>\n"
		prompt += trimmedPrefix
		prompt += "<<<FILL_HERE>>>"
		prompt += suffix
		prompt += "\n</CODE>\n\n"

		prompt += "Return ONLY the code that belongs at <<<FILL_HERE>>>.\n"
		prompt += "Do NOT wrap your response in triple backticks (```) or any other formatting.\n"
		prompt += "Include any necessary newlines or spacing at the beginning or end of your completion.\n"
		prompt += "Just the raw code text, nothing else.\n"

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
- CRITICAL: Your response MUST start with a newline character (\\n)
- Return ONLY the code that implements the comment
- Match the indentation level of the comment
- Do not include the comment itself in your output
- Ensure the code is production-ready`
		)
	}

	getCommentsUserPrompt(prefix: string, suffix: string, languageId: string): string {
		// Trim trailing indentation if cursor is on empty indented line
		const trimmedPrefix = this.trimTrailingIndentation(prefix)

		// Extract the comment from the prefix
		const lines = trimmedPrefix.split("\n")
		const lastLine = lines[lines.length - 1]
		const previousLine = lines.length > 1 ? lines[lines.length - 2] : ""

		// Determine which line contains the comment
		const commentLine = isCommentLine(lastLine, languageId) ? lastLine : previousLine
		const comment = cleanComment(commentLine, languageId)

		let prompt = `Language: ${languageId}\n\n`
		prompt += `Comment to implement: ${comment}\n\n`

		prompt += "<CODE>\n"
		prompt += trimmedPrefix
		prompt += "<<<FILL_HERE>>>"
		prompt += suffix
		prompt += "\n</CODE>\n\n"

		prompt += "Return ONLY the code that belongs at <<<FILL_HERE>>>.\n"
		prompt += "Do NOT wrap your response in triple backticks (```) or any other formatting.\n"
		prompt += "CRITICAL: Your response MUST start with \\n (newline character).\n"
		prompt += "Just the raw code, nothing else.\n"

		return prompt
	}
}
