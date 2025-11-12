/**
 * Postprocesses a Ghost autocomplete suggestion.
 * This will eventually use the continuedev postprocessing pipeline,
 * but for now reimplements the existing Ghost-specific checks.
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
	const { suggestion, prefix, suffix } = params
	// Note: model parameter will be used when we integrate with postprocessCompletion

	// For now, reimplement the existing logic with the new API shape
	const trimmedSuggestion = suggestion.trim()

	if (!trimmedSuggestion) {
		return undefined
	}

	const trimmedPrefixEnd = prefix.trimEnd()
	if (trimmedPrefixEnd.endsWith(trimmedSuggestion)) {
		return undefined
	}

	const trimmedSuffix = suffix.trimStart()
	if (trimmedSuffix.startsWith(trimmedSuggestion)) {
		return undefined
	}

	// The suggestion appears to be useful - return the original (not trimmed) suggestion
	return suggestion
}

/**
 * @deprecated Use postprocessGhostSuggestion instead
 * Filters out useless autocomplete suggestions that don't provide value to the user
 *
 * @param suggestion - The suggested text to insert
 * @param prefix - The text before the cursor position
 * @param suffix - The text after the cursor position
 * @returns true if the suggestion should be refused (is useless), false if it should be kept
 */
export function refuseUselessSuggestion(suggestion: string, prefix: string, suffix: string): boolean {
	// Delegate to the new API for backward compatibility
	const result = postprocessGhostSuggestion({ suggestion, prefix, suffix, model: "" })
	return result === undefined
}
