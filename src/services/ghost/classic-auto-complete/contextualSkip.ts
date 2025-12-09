/**
 * Contextual skip logic for autocomplete.
 *
 * This module provides smart skip logic to determine when autocomplete
 * should be skipped. main entry point is `shouldSkipAutocomplete`.
 */

// =============================================================================
// CONFIGURATION: Language-specific data
// =============================================================================

/**
 * Language family configuration.
 * Each config defines a language family with its members and statement terminators.
 */
interface LanguageFamilyConfig {
	/** Name of the language family */
	family: string
	/** VS Code language IDs that belong to this family */
	languages: string[]
	/** Statement terminators for this language family */
	terminators: string[]
}

/**
 * Language family configurations.
 * This is the source of truth for all language groupings and their terminators.
 */
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
 * Maps language families to their statement terminators.
 * Computed from LANGUAGE_CONFIGS for efficient lookup.
 */
const LANGUAGE_TERMINATORS: Record<string, Set<string>> = LANGUAGE_CONFIGS.reduce(
	(map, config) => {
		map[config.family] = new Set(config.terminators)
		return map
	},
	{} as Record<string, Set<string>>,
)

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

/**
 * Default terminators for unknown languages.
 */
const DEFAULT_TERMINATORS = new Set([";", "}", ")"])

// =============================================================================
// HELPER FUNCTIONS: Language lookups
// =============================================================================

/**
 * Gets the statement terminators for a given language.
 */
export function getTerminatorsForLanguage(languageId: string): Set<string> {
	const family = LANGUAGE_FAMILY_MAP[languageId]
	if (family) {
		return LANGUAGE_TERMINATORS[family]
	}
	return DEFAULT_TERMINATORS
}

// =============================================================================
// SKIP CHECKS: Individual conditions that prevent autocomplete
// =============================================================================

/**
 * Checks if cursor is at the end of a complete statement.
 *
 * Examples where this returns true:
 * - `console.log('foo');<CURSOR>` (JavaScript)
 * - `const x = 5;<CURSOR>` (TypeScript)
 * - `}<CURSOR>` (most languages)
 *
 * @returns true if autocomplete should be skipped
 */
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

	// Check multi-character terminators (like "end", "fi", "done")
	for (const terminator of terminators) {
		if (terminator.length > 1 && trimmedLinePrefix.endsWith(terminator)) {
			const beforeTerminator = trimmedLinePrefix.slice(0, -terminator.length)
			if (beforeTerminator.length === 0 || /\s$/.test(beforeTerminator)) {
				return true
			}
		}
	}

	return false
}

/**
 * Checks if the user is in the middle of typing a word.
 *
 * Mid-word typing is when the cursor is immediately after alphanumeric characters
 * and the user is likely still typing an identifier.
 *
 * @returns true if user is mid-word (autocomplete should be skipped for long words)
 */
function isMidWordTyping(prefix: string, suffix: string): { isMidWord: boolean; wordLength: number } {
	if (prefix.length === 0) {
		return { isMidWord: false, wordLength: 0 }
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

	// We're mid-word if:
	// 1. Last char is alphanumeric (typing a word), AND
	// 2. Either there's NO content after (end of word being typed) OR there IS alphanumeric content after (truly mid-word)
	return { isMidWord: isMidWord && !hasContentAfter, wordLength }
}

// =============================================================================
// MAIN ENTRY POINT
// =============================================================================

/**
 * Determines if autocomplete should be skipped at the current cursor position.
 *
 * This is the single entry point for all contextual skip logic. It checks
 * various conditions to decide whether to skip autocomplete.
 *
 * The logic is aggressive - we only skip in cases where we definitely don't want autocomplete:
 * 1. Skip if at end of a complete statement (e.g., after semicolon, closing brace, etc.)
 * 2. Skip if mid-word typing (unless word is very short, <= 2 chars)
 *
 * @param prefix - The text before the cursor position
 * @param suffix - The text after the cursor position
 * @param languageId - The VS Code language ID (optional)
 * @returns true if autocomplete should be skipped, false if it should be triggered
 */
export function shouldSkipAutocomplete(prefix: string, suffix: string, languageId?: string): boolean {
	// 1. Skip if at end of a complete statement
	if (isAtEndOfStatement(prefix, suffix, languageId)) {
		return true
	}

	// 2. Skip if mid-word typing (unless word is very short)
	const { isMidWord, wordLength } = isMidWordTyping(prefix, suffix)
	if (isMidWord && wordLength > 2) {
		return true
	}

	// Default: don't skip (be aggressive in offering autocomplete)
	return false
}
