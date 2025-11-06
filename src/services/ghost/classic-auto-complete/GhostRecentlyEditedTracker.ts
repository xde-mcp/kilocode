import * as vscode from "vscode"
import { RecentlyEditedRange } from "../types"
import { getSymbolsForSnippet } from "../../continuedev/core/autocomplete/context/ranking"
import { isSecurityConcern } from "../../continuedev/core/indexing/ignore"

type GhostRecentlyEditedRange = {
	uri: vscode.Uri
	range: vscode.Range
} & Omit<RecentlyEditedRange, "filepath" | "range">

/**
 * Tracks recently edited code ranges to provide context about what the user is actively working on.
 * Adapted from continuedev's RecentlyEditedTracker.
 */
export class GhostRecentlyEditedTracker {
	private static staleTime = 1000 * 60 * 2 // 2 minutes
	private static maxRecentlyEditedRanges = 3
	private recentlyEditedRanges: GhostRecentlyEditedRange[] = []
	private disposables: vscode.Disposable[] = []
	private cleanupInterval: NodeJS.Timeout | null = null

	constructor() {
		this.initialize()
	}

	private initialize() {
		// Listen to document changes
		const changeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
			event.contentChanges.forEach((change) => {
				const editedRange = {
					uri: event.document.uri,
					range: new vscode.Range(
						new vscode.Position(change.range.start.line, 0),
						new vscode.Position(change.range.end.line + 1, 0),
					),
					timestamp: Date.now(),
				}
				void this.insertRange(editedRange)
			})
		})
		this.disposables.push(changeDisposable)

		// Periodically remove old entries
		this.cleanupInterval = setInterval(() => {
			this.removeOldEntries()
		}, 1000 * 15) // Every 15 seconds
	}

	private async insertRange(editedRange: Omit<GhostRecentlyEditedRange, "lines" | "symbols">): Promise<void> {
		if (editedRange.uri.scheme !== "file") {
			return
		}

		const fsPath = editedRange.uri.fsPath
		if (isSecurityConcern(fsPath)) {
			return
		}

		// Check for overlap with any existing ranges
		for (let i = 0; i < this.recentlyEditedRanges.length; i++) {
			let range = this.recentlyEditedRanges[i]
			if (range.uri.toString() === editedRange.uri.toString() && range.range.intersection(editedRange.range)) {
				const union = range.range.union(editedRange.range)
				const contents = await this.getContentsForRange({
					...range,
					range: union,
				})
				range = {
					...range,
					range: union,
					timestamp: Date.now(),
					lines: contents.split("\n"),
					symbols: getSymbolsForSnippet(contents),
				}
				this.recentlyEditedRanges[i] = range
				return
			}
		}

		// Otherwise, add the new range and maintain max size
		const contents = await this.getContentsForRange(editedRange)
		this.recentlyEditedRanges.unshift({
			...editedRange,
			lines: contents.split("\n"),
			symbols: getSymbolsForSnippet(contents),
		})

		if (this.recentlyEditedRanges.length > GhostRecentlyEditedTracker.maxRecentlyEditedRanges) {
			this.recentlyEditedRanges = this.recentlyEditedRanges.slice(
				0,
				GhostRecentlyEditedTracker.maxRecentlyEditedRanges,
			)
		}
	}

	private removeOldEntries() {
		this.recentlyEditedRanges = this.recentlyEditedRanges.filter(
			(entry) => entry.timestamp > Date.now() - GhostRecentlyEditedTracker.staleTime,
		)
	}

	private async getContentsForRange(entry: Omit<GhostRecentlyEditedRange, "lines" | "symbols">): Promise<string> {
		try {
			const document = await vscode.workspace.openTextDocument(entry.uri)
			const lines = document.getText().split("\n")
			return lines.slice(entry.range.start.line, entry.range.end.line + 1).join("\n")
		} catch (err) {
			console.error("Error getting contents for range:", err)
			return ""
		}
	}

	public async getRecentlyEditedRanges(): Promise<RecentlyEditedRange[]> {
		return this.recentlyEditedRanges.map((entry) => ({
			filepath: entry.uri.toString(),
			range: {
				start: { line: entry.range.start.line, character: entry.range.start.character },
				end: { line: entry.range.end.line, character: entry.range.end.character },
			},
			timestamp: entry.timestamp,
			lines: entry.lines,
			symbols: entry.symbols,
		}))
	}

	public dispose() {
		this.disposables.forEach((d) => d.dispose())
		this.disposables = []
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval)
			this.cleanupInterval = null
		}
		this.recentlyEditedRanges = []
	}
}
