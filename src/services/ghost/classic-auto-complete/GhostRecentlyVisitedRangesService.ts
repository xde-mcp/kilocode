import * as vscode from "vscode"
import { LRUCache } from "lru-cache"
import { AutocompleteCodeSnippet } from "../types"
import { isSecurityConcern } from "../../continuedev/core/indexing/ignore"

/**
 * Service to track recently visited ranges in files for Ghost autocomplete.
 * Adapted from continuedev's RecentlyVisitedRangesService to provide cross-file context.
 */
export class GhostRecentlyVisitedRangesService {
	private cache: LRUCache<string, Array<AutocompleteCodeSnippet & { timestamp: number }>>
	private numSurroundingLines = 20
	private maxRecentFiles = 3
	private maxSnippetsPerFile = 3
	private isEnabled = true
	private disposables: vscode.Disposable[] = []

	constructor() {
		this.cache = new LRUCache<string, Array<AutocompleteCodeSnippet & { timestamp: number }>>({
			max: this.maxRecentFiles,
		})

		this.initialize()
	}

	private initialize() {
		// Listen to text editor selection changes to track visited ranges
		const selectionDisposable = vscode.window.onDidChangeTextEditorSelection(this.cacheCurrentSelectionContext)
		this.disposables.push(selectionDisposable)
	}

	private cacheCurrentSelectionContext = async (event: vscode.TextEditorSelectionChangeEvent) => {
		if (!this.isEnabled) {
			return
		}

		const fsPath = event.textEditor.document.fileName
		if (isSecurityConcern(fsPath)) {
			return
		}

		const filepath = event.textEditor.document.uri.toString()
		const line = event.selections[0].active.line
		const startLine = Math.max(0, line - this.numSurroundingLines)
		const endLine = Math.min(line + this.numSurroundingLines, event.textEditor.document.lineCount - 1)

		try {
			const fileContents = event.textEditor.document.getText()
			const lines = fileContents.split("\n")
			const relevantLines = lines
				.slice(startLine, endLine + 1)
				.join("\n")
				.trim()

			if (!relevantLines) {
				return
			}

			const snippet: AutocompleteCodeSnippet & { timestamp: number } = {
				filepath,
				content: relevantLines,
				range: {
					start: { line: startLine, character: 0 },
					end: { line: endLine, character: lines[endLine]?.length || 0 },
				},
				timestamp: Date.now(),
			}

			const existing = this.cache.get(filepath) || []
			// Keep only the most recent snippets per file
			const newSnippets = [...existing, snippet]
				.sort((a, b) => b.timestamp - a.timestamp)
				.slice(0, this.maxSnippetsPerFile)

			this.cache.set(filepath, newSnippets)
		} catch (err) {
			console.error("Error caching recently visited ranges for Ghost autocomplete:", err)
		}
	}

	/**
	 * Returns up to {@link maxSnippetsPerFile} snippets from the {@link maxRecentFiles} most recently visited files.
	 * Excludes snippets from the currently active file.
	 * @returns Array of code snippets from recently visited files
	 */
	public getSnippets(): AutocompleteCodeSnippet[] {
		if (!this.isEnabled) {
			return []
		}

		const currentFilepath = vscode.window.activeTextEditor?.document.uri.toString()
		let allSnippets: Array<AutocompleteCodeSnippet & { timestamp: number }> = []

		// Get most recent snippets from each file in cache
		for (const filepath of Array.from(this.cache.keys())) {
			const snippets = (this.cache.get(filepath) || [])
				.sort((a, b) => b.timestamp - a.timestamp)
				.slice(0, this.maxSnippetsPerFile)
			allSnippets = [...allSnippets, ...snippets]
		}

		return allSnippets
			.filter(
				(s) =>
					!currentFilepath ||
					(s.filepath !== currentFilepath &&
						// Exclude Continue's own output
						!s.filepath.startsWith("output:extension-output-Continue.continue") &&
						// Exclude Kilo Code's own output
						!s.filepath.startsWith("output:extension-output-Roo.kilo-code")),
			)
			.sort((a, b) => b.timestamp - a.timestamp)
			.map(({ timestamp: _timestamp, ...snippet }) => snippet)
	}

	/**
	 * Enable or disable the tracking service
	 */
	public setEnabled(enabled: boolean) {
		this.isEnabled = enabled
	}

	/**
	 * Clear all cached snippets
	 */
	public clear() {
		this.cache.clear()
	}

	/**
	 * Dispose of all resources
	 */
	public dispose() {
		this.disposables.forEach((d) => d.dispose())
		this.disposables = []
		this.cache.clear()
	}
}
