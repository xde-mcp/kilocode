import * as fs from "fs/promises"
import * as path from "path"
import getFolderSize from "get-folder-size"

import {
	type AutoPurgeSettings,
	type TaskPurgeInfo,
	type PurgeResult,
	type PurgeError,
	TaskType,
	type PurgeOptions,
	type HistoryItem,
	TelemetryEventName,
} from "@roo-code/types"
import { TelemetryService } from "@roo-code/telemetry"

import { getTaskDirectoryPath } from "../../utils/storage"
import { fileExistsAtPath } from "../../utils/fs"
import { findLastIndex } from "../../shared/array"

/**
 * Service responsible for automatically purging old tasks to manage disk usage
 */
export class AutoPurgeService {
	private readonly globalStoragePath: string

	constructor(globalStoragePath: string) {
		this.globalStoragePath = globalStoragePath
	}

	/**
	 * Main method to purge old tasks based on settings
	 */
	async purgeOldTasks(
		settings: AutoPurgeSettings,
		taskHistory: HistoryItem[],
		currentTaskId?: string,
		options: PurgeOptions = {},
		onTaskPurged?: (taskId: string) => Promise<void>,
	): Promise<PurgeResult> {
		const startTime = Date.now()
		const result: PurgeResult = {
			totalTasksScanned: 0,
			tasksEligibleForPurge: 0,
			tasksSuccessfullyPurged: 0,
			tasksPurgeErrors: 0,
			diskSpaceFreedBytes: 0,
			errors: [],
			duration: 0,
			timestamp: startTime,
		}

		try {
			console.log(`[AutoPurgeService] Starting purge operation with settings:`, settings)

			// Get all tasks eligible for purging
			const eligibleTasks = await this.getTasksEligibleForPurge(settings, taskHistory, currentTaskId, options)

			result.totalTasksScanned = taskHistory.length
			result.tasksEligibleForPurge = eligibleTasks.length

			console.log(
				`[AutoPurgeService] Found ${eligibleTasks.length} tasks eligible for purging out of ${taskHistory.length} total tasks`,
			)

			// Process each eligible task
			for (const taskInfo of eligibleTasks) {
				if (options.maxTasksToProcess && result.tasksSuccessfullyPurged >= options.maxTasksToProcess) {
					console.log(`[AutoPurgeService] Reached max tasks limit: ${options.maxTasksToProcess}`)
					break
				}

				try {
					const taskSizeBytes = await this.getTaskSizeBytes(taskInfo.taskDirectoryPath)

					if (!options.dryRun) {
						await this.deleteTaskFiles(taskInfo.taskId)

						// Remove task from state if callback provided
						if (onTaskPurged) {
							await onTaskPurged(taskInfo.taskId)
						}

						console.log(
							`[AutoPurgeService] Successfully purged task ${taskInfo.taskId} (${taskSizeBytes} bytes)`,
						)
					} else {
						console.log(
							`[AutoPurgeService] [DRY RUN] Would purge task ${taskInfo.taskId} (${taskSizeBytes} bytes)`,
						)
					}

					result.tasksSuccessfullyPurged++
					result.diskSpaceFreedBytes += taskSizeBytes
				} catch (error) {
					const purgeError: PurgeError = {
						taskId: taskInfo.taskId,
						error: error instanceof Error ? error.message : String(error),
						operation: "delete_files",
					}
					result.errors.push(purgeError)
					result.tasksPurgeErrors++
					console.error(`[AutoPurgeService] Failed to purge task ${taskInfo.taskId}:`, error)
				}
			}

			result.duration = Date.now() - startTime

			// Log telemetry
			TelemetryService.instance.captureEvent(TelemetryEventName.AUTO_PURGE_COMPLETED, {
				totalTasksScanned: result.totalTasksScanned,
				tasksEligibleForPurge: result.tasksEligibleForPurge,
				tasksSuccessfullyPurged: result.tasksSuccessfullyPurged,
				tasksPurgeErrors: result.tasksPurgeErrors,
				diskSpaceFreedBytes: result.diskSpaceFreedBytes,
				duration: result.duration,
				dryRun: options.dryRun || false,
			})

			console.log(`[AutoPurgeService] Purge operation completed:`, {
				scanned: result.totalTasksScanned,
				eligible: result.tasksEligibleForPurge,
				purged: result.tasksSuccessfullyPurged,
				errors: result.tasksPurgeErrors,
				freedBytes: result.diskSpaceFreedBytes,
				duration: result.duration,
			})

			return result
		} catch (error) {
			result.duration = Date.now() - startTime
			const purgeError: PurgeError = {
				taskId: "SYSTEM",
				error: error instanceof Error ? error.message : String(error),
				operation: "delete_files",
			}
			result.errors.push(purgeError)

			TelemetryService.instance.captureEvent(TelemetryEventName.AUTO_PURGE_FAILED, {
				error: purgeError.error,
				duration: result.duration,
			})

			console.error(`[AutoPurgeService] Purge operation failed:`, error)
			throw error
		}
	}

	/**
	 * Get all tasks that are eligible for purging based on settings
	 */
	async getTasksEligibleForPurge(
		settings: AutoPurgeSettings,
		taskHistory: HistoryItem[],
		currentTaskId?: string,
		options: PurgeOptions = {},
	): Promise<TaskPurgeInfo[]> {
		const eligibleTasks: TaskPurgeInfo[] = []
		const now = Date.now()

		for (const historyItem of taskHistory) {
			// Skip current active task if requested
			if (options.skipActiveTask && historyItem.id === currentTaskId) {
				continue
			}

			try {
				const taskType = this.classifyTask(historyItem)
				const ageInDays = Math.floor((now - historyItem.ts) / (1000 * 60 * 60 * 24))
				const retentionDays = this.getRetentionDaysForTaskType(taskType, settings)
				const shouldPurge = retentionDays !== null && ageInDays > retentionDays
				const taskDirectoryPath = await getTaskDirectoryPath(this.globalStoragePath, historyItem.id)

				// Check if task directory actually exists
				const taskDirExists = await fileExistsAtPath(taskDirectoryPath)
				if (!taskDirExists) {
					continue
				}

				const taskInfo: TaskPurgeInfo = {
					taskId: historyItem.id,
					historyItem,
					taskType,
					ageInDays,
					shouldPurge,
					retentionDays: retentionDays || -1,
					taskDirectoryPath,
				}

				if (shouldPurge) {
					eligibleTasks.push(taskInfo)
				}
			} catch (error) {
				console.error(`[AutoPurgeService] Error processing task ${historyItem.id}:`, error)
			}
		}

		return eligibleTasks
	}

	/**
	 * Classify a task based on its properties and completion status
	 */
	private classifyTask(historyItem: HistoryItem): TaskType {
		// Check if task is favorited
		if (historyItem.isFavorited) {
			return TaskType.FAVORITED
		}

		// For now, we'll classify based on basic heuristics
		// In a full implementation, we might need to read the task messages
		// to determine if it's truly completed

		// Simple heuristic: if task has significant token usage, assume it's more complete
		const hasSignificantActivity = (historyItem.tokensOut || 0) > 100

		if (hasSignificantActivity) {
			return TaskType.COMPLETED
		}

		return TaskType.INCOMPLETE
	}

	/**
	 * Get retention days for a specific task type
	 */
	private getRetentionDaysForTaskType(taskType: TaskType, settings: AutoPurgeSettings): number | null {
		switch (taskType) {
			case TaskType.FAVORITED:
				return settings.favoritedTaskRetentionDays
			case TaskType.COMPLETED:
				return settings.completedTaskRetentionDays
			case TaskType.INCOMPLETE:
				return settings.incompleteTaskRetentionDays
			case TaskType.REGULAR:
			default:
				return settings.defaultRetentionDays
		}
	}

	/**
	 * Delete all files associated with a task
	 */
	private async deleteTaskFiles(taskId: string): Promise<void> {
		const taskDir = await getTaskDirectoryPath(this.globalStoragePath, taskId)

		if (await fileExistsAtPath(taskDir)) {
			await fs.rm(taskDir, { recursive: true, force: true })
		}
	}

	/**
	 * Get the size of a task directory in bytes
	 */
	private async getTaskSizeBytes(taskDirectoryPath: string): Promise<number> {
		try {
			if (await fileExistsAtPath(taskDirectoryPath)) {
				return await getFolderSize.loose(taskDirectoryPath)
			}
			return 0
		} catch (error) {
			console.warn(`[AutoPurgeService] Could not get size for ${taskDirectoryPath}:`, error)
			return 0
		}
	}

	/**
	 * Check if a task is currently active/running
	 */
	private isTaskActive(taskId: string, currentTaskId?: string): boolean {
		return taskId === currentTaskId
	}

	/**
	 * Get storage statistics for all tasks
	 */
	async getTaskStorageStats(taskHistory: HistoryItem[]): Promise<{
		totalTasks: number
		totalSizeBytes: number
		tasksByType: Record<TaskType, number>
		oldestTaskTimestamp: number
		newestTaskTimestamp: number
	}> {
		const stats = {
			totalTasks: taskHistory.length,
			totalSizeBytes: 0,
			tasksByType: {
				[TaskType.FAVORITED]: 0,
				[TaskType.COMPLETED]: 0,
				[TaskType.INCOMPLETE]: 0,
				[TaskType.REGULAR]: 0,
			},
			oldestTaskTimestamp: Date.now(),
			newestTaskTimestamp: 0,
		}

		for (const historyItem of taskHistory) {
			const taskType = this.classifyTask(historyItem)
			stats.tasksByType[taskType]++

			if (historyItem.ts < stats.oldestTaskTimestamp) {
				stats.oldestTaskTimestamp = historyItem.ts
			}
			if (historyItem.ts > stats.newestTaskTimestamp) {
				stats.newestTaskTimestamp = historyItem.ts
			}

			// Add task size if available
			if (historyItem.size) {
				stats.totalSizeBytes += historyItem.size
			}
		}

		return stats
	}
}
