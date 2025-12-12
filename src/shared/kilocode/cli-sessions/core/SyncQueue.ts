/**
 * SyncQueueItem - Represents a single item in the sync queue.
 *
 * Each item tracks a file update that needs to be synced to the cloud.
 */
export interface SyncQueueItem {
	/** The task ID this item belongs to */
	taskId: string
	/** The blob name (e.g., 'api_conversation_history', 'ui_messages', 'task_metadata') */
	blobName: string
	/** The local file path containing the blob data */
	blobPath: string
	/** Timestamp when this item was added to the queue */
	timestamp: number
}

/**
 * SyncQueue - Manages the queue of pending sync operations.
 *
 * This class encapsulates all queue operations for session synchronization,
 * providing a clean interface for:
 * - Adding items to the queue
 * - Querying items by task or blob name
 * - Removing processed items
 * - Queue state inspection
 *
 * Extracted from SessionManager as part of the refactoring effort to improve
 * maintainability and testability through separation of concerns.
 */
export class SyncQueue {
	static readonly QUEUE_FLUSH_THRESHOLD = 5

	private items: SyncQueueItem[] = []

	constructor(private flush: () => Promise<void>) {}

	/**
	 * Adds an item to the queue.
	 */
	enqueue(item: SyncQueueItem): void {
		this.items.push(item)

		if (this.length > SyncQueue.QUEUE_FLUSH_THRESHOLD) {
			this.flush()
		}
	}

	/**
	 * Gets all items currently in the queue.
	 * Returns a copy to prevent external mutation.
	 */
	getAll(): SyncQueueItem[] {
		return [...this.items]
	}

	/**
	 * Gets all items for a specific task.
	 */
	getItemsForTask(taskId: string): SyncQueueItem[] {
		return this.items.filter((item) => item.taskId === taskId)
	}

	/**
	 * Gets all unique task IDs in the queue.
	 */
	getUniqueTaskIds(): Set<string> {
		return new Set(this.items.map((item) => item.taskId))
	}

	/**
	 * Gets all unique blob names for items belonging to a specific task.
	 */
	getUniqueBlobNamesForTask(taskId: string): Set<string> {
		const taskItems = this.getItemsForTask(taskId)
		return new Set(taskItems.map((item) => item.blobName))
	}

	/**
	 * Gets the last item for a specific blob name within a task's items.
	 * Items are searched in reverse order to find the most recent one.
	 */
	getLastItemForBlob(taskId: string, blobName: string): SyncQueueItem | undefined {
		const taskItems = this.getItemsForTask(taskId)
		// Search in reverse to find the most recent item
		for (let i = taskItems.length - 1; i >= 0; i--) {
			if (taskItems[i].blobName === blobName) {
				return taskItems[i]
			}
		}
		return undefined
	}

	/**
	 * Gets the last item in the queue.
	 */
	getLastItem(): SyncQueueItem | undefined {
		return this.items[this.items.length - 1]
	}

	/**
	 * Removes all items matching the specified criteria that were added
	 * at or before the given timestamp.
	 *
	 * This is used after a successful blob upload to remove all queued
	 * items that were included in that upload.
	 */
	removeProcessedItems(taskId: string, blobName: string, beforeTimestamp: number): void {
		this.items = this.items.filter(
			(item) => !(item.taskId === taskId && item.blobName === blobName && item.timestamp <= beforeTimestamp),
		)
	}

	/**
	 * Clears all items from the queue.
	 */
	clear(): void {
		this.items = []
	}

	/**
	 * Gets the number of items in the queue.
	 */
	get length(): number {
		return this.items.length
	}

	/**
	 * Checks if the queue is empty.
	 */
	get isEmpty(): boolean {
		return this.items.length === 0
	}
}
