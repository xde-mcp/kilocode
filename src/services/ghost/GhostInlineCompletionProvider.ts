import * as vscode from "vscode"
import { GhostSuggestionsState } from "./GhostSuggestions"
import { extractPrefixSuffix } from "./types"

export class GhostInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
	private suggestions: GhostSuggestionsState | null = null

	public updateSuggestions(suggestions: GhostSuggestionsState | null): void {
		this.suggestions = suggestions
	}

	public provideInlineCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		_context: vscode.InlineCompletionContext,
		_token: vscode.CancellationToken,
	): vscode.ProviderResult<vscode.InlineCompletionItem[] | vscode.InlineCompletionList> {
		const { prefix, suffix } = extractPrefixSuffix(document, position)

		const fillInAtCursor = this.suggestions?.getFillInAtCursor()
		if (!fillInAtCursor || prefix !== fillInAtCursor.prefix || suffix !== fillInAtCursor.suffix) {
			return []
		}

		const item: vscode.InlineCompletionItem = {
			insertText: fillInAtCursor.text,
			range: new vscode.Range(position, position),
		}

		return [item]
	}
}
