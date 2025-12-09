/**
 * Contextual skip logic for autocomplete.
 *
 * This module provides smart skip logic to determine when autocomplete
 */

interface LanguageFamilyConfig {
	/** Name of the language family */
	family: string
	/** VS Code language IDs that belong to this family */
	languages: string[]
	/** Statement terminators for this language family */
	terminators: string[]
}

const LANGUAGE_CONFIGS: LanguageFamilyConfig[] = [
	{
		family: "c-like",
		languages: [
			"javascript",
			"javascriptreact",
			"typescript",
			"typescriptreact",
			"c",
			"cpp",
			"csharp",
			"java",
			"kotlin",
			"scala",
			"swift",
			"php",
			"dart",
			"css",
			"scss",
			"less",
			"json",
			"jsonc",
		],
		terminators: [";", "}", ")"],
	},
	{
		family: "python",
		languages: ["python"],
		terminators: [")", "]", "}"],
	},
	{
		family: "ruby",
		languages: ["ruby"],
		terminators: [")", "]", "}", "end"],
	},
	{
		family: "go",
		languages: ["go"],
		terminators: [";", "}", ")"],
	},
	{
		family: "rust",
		languages: ["rust"],
		terminators: [";", "}", ")"],
	},
	{
		family: "shell",
		languages: ["shellscript", "bash", "zsh", "sh"],
		terminators: [";", "fi", "done", "esac"],
	},
	{
		family: "sql",
		languages: ["sql", "mysql", "postgresql", "plsql"],
		terminators: [";"],
	},
	{
		family: "lisp",
		languages: ["lisp", "clojure", "scheme", "elisp", "racket"],
		terminators: [],
	},
	{
		family: "markup",
		languages: ["html", "xml", "svg", "vue", "svelte"],
		terminators: [],
	},
]

/**
 * Maps VS Code language IDs to language families.
 * Computed from LANGUAGE_CONFIGS for efficient lookup.
 */
const LANGUAGE_FAMILY_MAP: Record<string, string> = LANGUAGE_CONFIGS.reduce(
	(map, config) => {
		for (const lang of config.languages) {
			map[lang] = config.family
		}
		return map
	},
	{} as Record<string, string>,
)

const DEFAULT_TERMINATORS = new Set([";", "}", ")"])

export function getTerminatorsForLanguage(languageId: string): Set<string> {
	const family = LANGUAGE_FAMILY_MAP[languageId]
	if (family) {
		const config = LANGUAGE_CONFIGS.find((c) => c.family === family)
		if (config) {
			return new Set(config.terminators)
		}
	}
	return DEFAULT_TERMINATORS
}

function isAtEndOfStatement(prefix: string, suffix: string, languageId?: string): boolean {
	// Get the current line's content after the cursor
	const suffixFirstLine = suffix.split("\n")[0]

	// If there's non-whitespace content after the cursor, we're not at end of line
	if (suffixFirstLine.trim().length > 0) {
		return false
	}

	// Get the last character before the cursor (excluding trailing whitespace)
	const prefixLines = prefix.split("\n")
	const currentLinePrefix = prefixLines[prefixLines.length - 1]
	const trimmedLinePrefix = currentLinePrefix.trimEnd()

	// Empty line - not at end of statement
	if (trimmedLinePrefix.length === 0) {
		return false
	}

	// Get language-specific terminators
	const terminators = languageId ? getTerminatorsForLanguage(languageId) : DEFAULT_TERMINATORS

	// Check single-character terminators
	const lastChar = trimmedLinePrefix[trimmedLinePrefix.length - 1]
	if (terminators.has(lastChar)) {
		return true
	}

	return false
}

function isMidWordTyping(prefix: string, suffix: string): boolean {
	if (prefix.length === 0) {
		return false
	}

	const lastChar = prefix[prefix.length - 1]
	const isMidWord = /[a-zA-Z0-9_]/.test(lastChar)

	// Check if there's alphanumeric content immediately after cursor
	// If there IS content after, we're truly mid-word (e.g., "con|sole" where | is cursor)
	// If there's NO content after, we're at the end of a word being typed
	const firstCharAfter = suffix.length > 0 ? suffix[0] : ""
	const hasContentAfter = /[a-zA-Z0-9_]/.test(firstCharAfter)

	// Extract the current word being typed
	const wordMatch = prefix.match(/([a-zA-Z_][a-zA-Z0-9_]*)$/)
	const wordLength = wordMatch ? wordMatch[1].length : 0

	// Skip if:
	// 1. Last char is alphanumeric (typing a word), AND
	// 2. There's NO content after (end of word being typed), AND
	// 3. Word length is > 2 chars
	return isMidWord && !hasContentAfter && wordLength > 2
}

export function shouldSkipAutocomplete(prefix: string, suffix: string, languageId?: string): boolean {
	if (isAtEndOfStatement(prefix, suffix, languageId)) {
		return true
	}

	if (isMidWordTyping(prefix, suffix)) {
		return true
	}

	return false
}
