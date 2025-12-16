import { postprocessCompletion } from "../../continuedev/core/autocomplete/postprocessing/index.js"

export type AutocompleteSuggestion = {
	/**
	 * The text being considered for insertion at the cursor position.
	 *
	 * Note: In this file we use this for both the raw model suggestion (pre-postprocess)
	 * and the postprocessed suggestion (when doing duplicate checks).
	 */
	suggestion: string
	prefix: string
	suffix: string
}

export function suggestionConsideredDuplication(params: AutocompleteSuggestion): boolean {
	const { suggestion, prefix, suffix } = params

	// First check with original params
	if (checkDuplication({ suggestion, prefix, suffix })) {
		return true
	}

	// When the suggestion isn't a full line or set of lines, normalize by including
	// the rest of the line in the prefix/suffix and check with the completed line(s)
	const normalized = normalizeToCompleteLine(prefix, suggestion, suffix)
	if (normalized) {
		return checkDuplication(normalized)
	}

	return false
}

/**
 * Core duplication check logic - checks if the suggestion is a duplication
 * based on prefix/suffix matching.
 */
function checkDuplication(params: AutocompleteSuggestion): boolean {
	const { suggestion, prefix, suffix } = params
	const trimmed = suggestion.trim()

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

	return false
}

/**
 * Normalizes partial-line suggestions by expanding them to the full current line:
 * (prefix line tail) + (suggestion first line) + (suffix line head).
 *
 * Returns null when the suggestion already starts/ends on line boundaries.
 */
function normalizeToCompleteLine(prefix: string, suggestion: string, suffix: string): AutocompleteSuggestion | null {
	const prefixNewlineIndex = prefix.lastIndexOf("\n")
	const suffixNewlineIndex = suffix.indexOf("\n")

	let prefixLineTail: string, normalizedPrefix: string, suffixLineHead: string, normalizedSuffix: string
	if (prefixNewlineIndex === -1) {
		prefixLineTail = prefix
		normalizedPrefix = ""
	} else {
		prefixLineTail = prefix.slice(prefixNewlineIndex + 1)
		normalizedPrefix = prefix.slice(0, prefixNewlineIndex + 1)
	}

	if (suffixNewlineIndex === -1) {
		suffixLineHead = suffix
		normalizedSuffix = ""
	} else {
		suffixLineHead = suffix.slice(0, suffixNewlineIndex)
		normalizedSuffix = suffix.slice(suffixNewlineIndex)
	}

	if (prefixLineTail.length === 0 && suffixLineHead.length === 0) {
		return null
	}

	return {
		prefix: normalizedPrefix,
		suggestion: prefixLineTail + suggestion + suffixLineHead,
		suffix: normalizedSuffix,
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
export function postprocessGhostSuggestion(
	params: AutocompleteSuggestion & {
		model: string
	},
): string | undefined {
	const { suggestion, prefix, suffix, model } = params

	// First, run through the continuedev postprocessing pipeline
	const processedSuggestion = postprocessCompletion({
		completion: suggestion,
		llm: { model },
		prefix,
		suffix,
	})

	if (processedSuggestion === undefined) {
		return undefined
	}

	if (suggestionConsideredDuplication({ suggestion: processedSuggestion, prefix, suffix })) {
		return undefined
	}

	return processedSuggestion
}
