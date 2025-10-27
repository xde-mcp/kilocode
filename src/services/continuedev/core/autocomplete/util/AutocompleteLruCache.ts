import { Mutex } from "async-mutex"

interface CacheEntry {
	value: string
	timestamp: number
}

// TODO: (bmc) Re-implement w/ something that's not in memory
export class AutocompleteLruCache {
	private static capacity = 1000
	private mutex = new Mutex()
	private cache: Map<string, CacheEntry> = new Map()

	constructor() {}

	static async get(): Promise<AutocompleteLruCache> {
		return new AutocompleteLruCache()
	}

	async get(prefix: string): Promise<string | undefined> {
		// NOTE: Right now prompts with different suffixes will be considered the same

		// If the query is "co" and we have "c" -> "ontinue" in the cache,
		// we should return "ntinue" as the completion.
		// Have to make sure we take the key with longest length
		try {
			// Find all keys where prefix starts with the key
			let bestMatch: { key: string; entry: CacheEntry } | undefined

			for (const [key, entry] of this.cache.entries()) {
				// Check if prefix starts with this key (equivalent to SQL: prefix LIKE key || '%')
				if (prefix.startsWith(key)) {
					// Take the longest matching key (ORDER BY LENGTH(key) DESC LIMIT 1)
					if (!bestMatch || key.length > bestMatch.key.length) {
						bestMatch = { key, entry }
					}
				}
			}

			// Validate that the cached completion is a valid completion for the prefix
			if (bestMatch && bestMatch.entry.value.startsWith(prefix.slice(bestMatch.key.length))) {
				// Update timestamp on access
				bestMatch.entry.timestamp = Date.now()
				// And then truncate so we aren't writing something that's already there
				return bestMatch.entry.value.slice(prefix.length - bestMatch.key.length)
			}
		} catch (e) {
			console.error(e)
		}

		return undefined
	}

	async put(prefix: string, completion: string) {
		const release = await this.mutex.acquire()

		try {
			const existingEntry = this.cache.get(prefix)

			if (existingEntry) {
				// Update existing entry
				existingEntry.value = completion
				existingEntry.timestamp = Date.now()
			} else {
				// Check capacity and evict if necessary
				if (this.cache.size >= AutocompleteLruCache.capacity) {
					// Find and remove the entry with the oldest timestamp (LRU)
					let oldestKey: string | undefined
					let oldestTimestamp = Infinity

					for (const [key, entry] of this.cache.entries()) {
						if (entry.timestamp < oldestTimestamp) {
							oldestTimestamp = entry.timestamp
							oldestKey = key
						}
					}

					if (oldestKey) {
						this.cache.delete(oldestKey)
					}
				}

				// Insert new entry
				this.cache.set(prefix, {
					value: completion,
					timestamp: Date.now(),
				})
			}
		} catch (e) {
			console.error("Error updating cache: ", e)
		} finally {
			release()
		}
	}
}
