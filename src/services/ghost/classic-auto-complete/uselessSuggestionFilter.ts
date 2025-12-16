import { postprocessCompletion } from "../../continuedev/core/autocomplete/postprocessing/index.js"

export type AutocompleteSuggestion = {
	suggestion: string
	prefix: string
	suffix: string
}

export function suggestionConsideredDuplication(params: AutocompleteSuggestion): boolean {
	if (checkDuplication(params)) {
		return true
	}

	// When the suggestion isn't a full line or set of lines, normalize by including
	// the rest of the line in the prefix/suffix and check with the completed line(s)
	const normalized = normalizeToCompleteLine(params)
	if (normalized) {
		return checkDuplication(normalized)
	}

	return false
}

function checkDuplication(params: AutocompleteSuggestion): boolean {
	const trimmed = params.suggestion.trim()

	if (trimmed.length === 0) {
		return true
	}

	const trimmedPrefixEnd = params.prefix.trimEnd()
	if (trimmedPrefixEnd.endsWith(trimmed)) {
		return true
	}

	const trimmedSuffix = params.suffix.trimStart()
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
function normalizeToCompleteLine(params: AutocompleteSuggestion): AutocompleteSuggestion | null {
	const prefixNewlineIndex = params.prefix.lastIndexOf("\n")
	const suffixNewlineIndex = params.suffix.indexOf("\n")

	let prefixLineTail: string, normalizedPrefix: string, suffixLineHead: string, normalizedSuffix: string
	if (prefixNewlineIndex === -1) {
		prefixLineTail = params.prefix
		normalizedPrefix = ""
	} else {
		prefixLineTail = params.prefix.slice(prefixNewlineIndex + 1)
		normalizedPrefix = params.prefix.slice(0, prefixNewlineIndex + 1)
	}

	if (suffixNewlineIndex === -1) {
		suffixLineHead = params.suffix
		normalizedSuffix = ""
	} else {
		suffixLineHead = params.suffix.slice(0, suffixNewlineIndex)
		normalizedSuffix = params.suffix.slice(suffixNewlineIndex)
	}

	if (prefixLineTail.length === 0 && suffixLineHead.length === 0) {
		return null
	}

	return {
		prefix: normalizedPrefix,
		suggestion: prefixLineTail + params.suggestion + suffixLineHead,
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
	// First, run through the continuedev postprocessing pipeline
	const processedSuggestion = postprocessCompletion({
		completion: params.suggestion,
		llm: { model: params.model },
		prefix: params.prefix,
		suffix: params.suffix,
	})

	if (processedSuggestion === undefined) {
		return undefined
	}

	if (
		suggestionConsideredDuplication({
			suggestion: processedSuggestion,
			prefix: params.prefix,
			suffix: params.suffix,
		})
	) {
		return undefined
	}

	return processedSuggestion
}
