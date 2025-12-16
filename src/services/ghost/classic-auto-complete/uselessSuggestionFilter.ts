import { postprocessCompletion } from "../../continuedev/core/autocomplete/postprocessing/index.js"

export type SuggestionConsideredDuplicationParams = {
	processed: string
	prefix: string
	suffix: string
}

export function suggestionConsideredDuplication(params: SuggestionConsideredDuplicationParams): boolean {
	;(globalThis as any).__kiloTestHooks?.onSuggestionConsideredDuplication?.(params)

	const { processed, prefix, suffix } = params

	const trimmed = processed.trim()

	if (trimmed.length === 0) {
		return true
	}

	const trimmedPrefixEnd = prefix.trimEnd()
	if (trimmedPrefixEnd.endsWith(trimmed)) {
		return true
	}

	const trimmedSuffix = suffix.trimStart()
	if (trimmedSuffix.startsWith(trimmed)) {
		return true
	}

	// When the suggestion isn't a full line or set of lines, normalize by including
	// the rest of the line in the prefix/suffix and check recursively with the completed line(s)
	const normalized = normalizeToCompleteLine(prefix, processed, suffix)
	if (normalized) {
		return suggestionConsideredDuplication({
			processed: normalized.completedLine,
			prefix: normalized.normalizedPrefix,
			suffix: normalized.normalizedSuffix,
		})
	}

	return false
}

/**
 * When the suggestion doesn't start and end at line boundaries, normalize by including
 * the rest of the line in the prefix and/or suffix.
 *
 * Returns the normalized prefix/suffix and the completed first line, or null if already normalized.
 *
 * For example:
 * - prefix: "console.info('foo')\nconsole.info", suggestion: "('foo')"
 *   -> normalizedPrefix: "console.info('foo')\n", completedLine: "console.info('foo')"
 * - prefix: "console.info", suggestion: "('foo')", suffix: "\nconsole.info('foo')"
 *   -> normalizedSuffix: "\nconsole.info('foo')", completedLine: "console.info('foo')"
 */
function normalizeToCompleteLine(
	prefix: string,
	suggestion: string,
	suffix: string,
): { normalizedPrefix: string; completedLine: string; normalizedSuffix: string } | null {
	// Get the partial line before the suggestion (from the last newline in prefix)
	const lastPrefixNewline = prefix.lastIndexOf("\n")
	const lineStartInPrefix = lastPrefixNewline === -1 ? prefix : prefix.slice(lastPrefixNewline + 1)

	// Get the partial line after the suggestion (up to the first newline in suffix)
	const firstSuffixNewline = suffix.indexOf("\n")
	const lineEndInSuffix = firstSuffixNewline === -1 ? suffix : suffix.slice(0, firstSuffixNewline)

	// If the suggestion already starts and ends at line boundaries, no normalization needed
	if (lineStartInPrefix.length === 0 && lineEndInSuffix.length === 0) {
		return null
	}

	// Build the complete line by combining: lineStartInPrefix + suggestion's first line + lineEndInSuffix
	const suggestionLines = suggestion.split("\n")
	const suggestionFirstLine = suggestionLines[0]
	const completedFirstLine = lineStartInPrefix + suggestionFirstLine + lineEndInSuffix

	// Get the prefix content before the current line (complete lines only, including trailing newline)
	const normalizedPrefix = lastPrefixNewline === -1 ? "" : prefix.slice(0, lastPrefixNewline + 1)

	// Get the suffix content after the current line (complete lines only, including leading newline)
	const normalizedSuffix = firstSuffixNewline === -1 ? "" : suffix.slice(firstSuffixNewline)

	return {
		normalizedPrefix,
		completedLine: completedFirstLine,
		normalizedSuffix,
	}
}

/**
 * Postprocesses a Ghost autocomplete suggestion using the continuedev postprocessing pipeline
 * and applies some of our own duplicate checks.
 *
 * @param params - Object containing suggestion parameters
 * @param params.suggestion - The suggested text to insert
 * @param params.prefix - The text before the cursor position
 * @param params.suffix - The text after the cursor position
 * @param params.model - The model string (e.g., "codestral", "qwen3", etc.)
 * @returns The processed suggestion text, or undefined if it should be filtered out
 */
export function postprocessGhostSuggestion(params: {
	suggestion: string
	prefix: string
	suffix: string
	model: string
}): string | undefined {
	const { suggestion, prefix, suffix, model } = params

	// First, run through the continuedev postprocessing pipeline
	const processed = postprocessCompletion({
		completion: suggestion,
		llm: { model },
		prefix,
		suffix,
	})

	if (processed === undefined) {
		return undefined
	}

	if (suggestionConsideredDuplication({ processed, prefix, suffix })) {
		return undefined
	}

	return processed
}
