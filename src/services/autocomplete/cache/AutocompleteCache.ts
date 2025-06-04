import { LRUCache } from "lru-cache"
import { CodeContext } from "../ContextGatherer"
import { processTextInsertion } from "../utils/CompletionTextProcessor"
import * as vscode from "vscode"

/**
 * Manages caching of code completions to improve response time and reduce API calls
 */
export class AutocompleteCache {
	private cache: LRUCache<string, string[]>
	private readonly maxCompletionsPerContext = 5
	private readonly maxLinesToConsider = 5

	/**
	 * Creates a new AutocompleteCache instance
	 * @param options Configuration options for the cache
	 */
	constructor(options?: { maxSize?: number; ttlMs?: number }) {
		this.cache = new LRUCache<string, string[]>({
			max: options?.maxSize ?? 50,
			ttl: options?.ttlMs ?? 1000 * 60 * 60 * 24, // Default: Cache for 24 hours
		})
	}

	/**
	 * Finds a matching completion from the cache that starts with the current line prefix
	 * @returns Processed text ready for insertion if found, null otherwise
	 */
	public findMatchingCompletion(
		context: CodeContext,
		document: vscode.TextDocument,
		position: vscode.Position,
	): { processedText: string; insertRange: vscode.Range } | null {
		const linePrefix = document
			.getText(new vscode.Range(new vscode.Position(position.line, 0), position))
			.trimStart()

		const cachedCompletions = this.getCompletionsInternal(context)

		for (const completion of cachedCompletions) {
			if (completion.startsWith(linePrefix)) {
				// Process the completion text to avoid duplicating existing text in the document
				const processedResult = processTextInsertion({
					document,
					position,
					textToInsert: completion,
				})

				if (processedResult) {
					return processedResult
				}
			}
		}

		return null
	}

	/**
	 * Adds a new completion to the cache
	 * @returns true if the completion was added, false if it was already in the cache
	 */
	public addCompletion(
		context: CodeContext,
		document: vscode.TextDocument,
		position: vscode.Position,
		completion: string,
	): boolean {
		const linePrefix = document
			.getText(new vscode.Range(new vscode.Position(position.line, 0), position))
			.trimStart()

		const fullCompletion = linePrefix + completion
		const key = this.generateKey(context)
		const completions = this.cache.get(key) ?? []

		// Add the new completion if it's not already in the list
		if (completions.includes(fullCompletion)) {
			return false
		}

		completions.push(fullCompletion)

		// Prune the array if it exceeds the maximum size
		// Keep the most recent completions (remove from the beginning)
		if (completions.length > this.maxCompletionsPerContext) {
			completions.splice(0, completions.length - this.maxCompletionsPerContext)
		}

		this.cache.set(key, completions)
		return true
	}

	/**
	 * Gets raw completions from the cache for a given context (private helper)
	 */
	private getCompletionsInternal(context: CodeContext): string[] {
		const key = this.generateKey(context)
		return this.cache.get(key) ?? []
	}

	/**
	 * Generates a cache key based on context's preceding and following lines
	 */
	private generateKey(context: CodeContext): string {
		const precedingContext = context.precedingLines.slice(-this.maxLinesToConsider).join("\n")
		const followingContext = context.followingLines.slice(0, this.maxLinesToConsider).join("\n")
		return `${precedingContext}|||${followingContext}`
	}

	/**
	 * Clears the entire cache
	 */
	public clear(): void {
		this.cache.clear()
	}
}
