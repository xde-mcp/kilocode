import { IDE, RangeInFileWithContents } from "../index"
import { AutocompleteLanguageInfo } from "./constants/AutocompleteLanguageInfo"
import { AutocompleteCodeSnippet } from "./snippets/types"

/**
 * A snippet with range information and an optional relevance score.
 * Used for ranking and selecting context snippets in autocomplete.
 */
export type RankedSnippet = RangeInFileWithContents & {
	score?: number
}

export type GetLspDefinitionsFunction = (
	filepath: string,
	contents: string,
	cursorIndex: number,
	ide: IDE,
	lang: AutocompleteLanguageInfo,
) => Promise<AutocompleteCodeSnippet[]>
