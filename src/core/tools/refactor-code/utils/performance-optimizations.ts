import * as fs from "fs/promises"
import * as path from "path"
import { Project, SourceFile } from "ts-morph"
import { RefactorOperation } from "../schema"
import { refactorLogger } from "./RefactorLogger"

/**
 * Performance optimization utilities for the refactoring engine
 *
 * This module provides optimizations to improve the performance of
 * refactoring operations, particularly for large projects and batch operations.
 */

// LRU Cache implementation for file content caching
class LRUCache<K, V> {
	private capacity: number
	private cache = new Map<K, V>()
	private keyTimestamps = new Map<K, number>()

	constructor(capacity: number) {
		this.capacity = capacity
	}

	get(key: K): V | undefined {
		if (!this.cache.has(key)) return undefined

		// Update access timestamp
		this.keyTimestamps.set(key, Date.now())
		return this.cache.get(key)
	}

	set(key: K, value: V): void {
		// If cache is full, remove least recently used item
		if (this.cache.size >= this.capacity && !this.cache.has(key)) {
			const oldestKey = this.findOldestKey()
			if (oldestKey) {
				this.cache.delete(oldestKey)
				this.keyTimestamps.delete(oldestKey)
			}
		}

		this.cache.set(key, value)
		this.keyTimestamps.set(key, Date.now())
	}

	has(key: K): boolean {
		return this.cache.has(key)
	}

	clear(): void {
		this.cache.clear()
		this.keyTimestamps.clear()
	}

	private findOldestKey(): K | undefined {
		let oldestKey: K | undefined
		let oldestTime = Infinity

		for (const [key, timestamp] of this.keyTimestamps.entries()) {
			if (timestamp < oldestTime) {
				oldestTime = timestamp
				oldestKey = key
			}
		}

		return oldestKey
	}
}

/**
 * File system cache to minimize I/O operations
 */
export class FileSystemCache {
	private contentCache = new LRUCache<string, string>(100) // Cache up to 100 files
	private existsCache = new LRUCache<string, boolean>(200) // Cache up to 200 existence checks

	/**
	 * Read file content with caching
	 */
	async readFile(filePath: string): Promise<string> {
		const absolutePath = path.resolve(filePath)

		// Check cache first
		const cachedContent = this.contentCache.get(absolutePath)
		if (cachedContent !== undefined) {
			return cachedContent
		}

		// Read from disk and cache
		try {
			const content = await fs.readFile(absolutePath, "utf-8")
			this.contentCache.set(absolutePath, content)
			return content
		} catch (error) {
			throw new Error(`Failed to read file: ${filePath} - ${(error as Error).message}`)
		}
	}

	/**
	 * Check if file exists with caching
	 */
	async fileExists(filePath: string): Promise<boolean> {
		const absolutePath = path.resolve(filePath)

		// Check cache first
		const cachedExists = this.existsCache.get(absolutePath)
		if (cachedExists !== undefined) {
			return cachedExists
		}

		// Check on disk and cache
		try {
			await fs.access(absolutePath)
			this.existsCache.set(absolutePath, true)
			return true
		} catch {
			this.existsCache.set(absolutePath, false)
			return false
		}
	}

	/**
	 * Invalidate cache entries for a specific file
	 */
	invalidateFile(filePath: string): void {
		const absolutePath = path.resolve(filePath)

		// Clear caches for this file
		if (this.contentCache.has(absolutePath)) {
			this.contentCache.set(absolutePath, "") // Force reload
		}

		if (this.existsCache.has(absolutePath)) {
			this.existsCache.set(absolutePath, true) // Assume it exists
		}
	}

	/**
	 * Clear all caches
	 */
	clearCache(): void {
		this.contentCache.clear()
		this.existsCache.clear()
	}
}

/**
 * Cache for ts-morph source files to reduce parsing overhead
 */
export class SourceFileCache {
	private project: Project
	private fileCache = new Map<string, SourceFile>()
	private modifiedFiles = new Set<string>()

	constructor(project: Project) {
		this.project = project
	}

	/**
	 * Get source file with caching
	 */
	getSourceFile(filePath: string): SourceFile | undefined {
		// Convert to absolute path if relative
		let normalizedPath: string
		if (path.isAbsolute(filePath)) {
			normalizedPath = path.normalize(filePath)
		} else {
			// For relative paths, we need to resolve them properly
			// Try to get the project root from the project's compilerOptions or use current working directory
			const projectRoot = this.project.getCompilerOptions().rootDir || process.cwd()
			normalizedPath = path.resolve(projectRoot, filePath)
		}

		// If file is in cache and not modified, return it
		if (this.fileCache.has(normalizedPath) && !this.modifiedFiles.has(normalizedPath)) {
			return this.fileCache.get(normalizedPath)
		}

		// Otherwise, try to get from project
		try {
			const sourceFile = this.project.getSourceFile(normalizedPath)

			if (sourceFile) {
				// If file was modified, refresh it
				if (this.modifiedFiles.has(normalizedPath)) {
					sourceFile.refreshFromFileSystemSync()
					this.modifiedFiles.delete(normalizedPath)
				}

				this.fileCache.set(normalizedPath, sourceFile)
				return sourceFile
			}

			// If file not in project, try to add it
			const addedFile = this.project.addSourceFileAtPath(normalizedPath)
			if (addedFile) {
				this.fileCache.set(normalizedPath, addedFile)
				return addedFile
			}

			return undefined
		} catch (error) {
			refactorLogger.error(`Error getting source file ${normalizedPath}: ${error}`)
			return undefined
		}
	}

	/**
	 * Mark a file as modified, so it will be refreshed on next access
	 */
	markModified(filePath: string): void {
		const normalizedPath = path.normalize(filePath)
		this.modifiedFiles.add(normalizedPath)
	}

	/**
	 * Clear cache
	 */
	clearCache(): void {
		this.fileCache.clear()
		this.modifiedFiles.clear()
	}
}

/**
 * Batch operation optimization strategies
 */
export class BatchOptimizer {
	/**
	 * Analyzes and optimizes the order of operations in a batch to minimize
	 * potential conflicts and improve performance.
	 *
	 * This function:
	 * 1. Identifies dependencies between operations
	 * 2. Groups related operations together
	 * 3. Orders operations to minimize file system access
	 *
	 * @param operations Array of refactoring operations
	 * @returns Optimized array of operations
	 */
	static optimizeOperationOrder(operations: RefactorOperation[]): RefactorOperation[] {
		if (operations.length <= 1) {
			return operations
		}

		// Create file-based operation map for faster access
		const fileOperations = new Map<string, RefactorOperation[]>()

		// Group operations by file
		for (const op of operations) {
			if ("selector" in op && "filePath" in op.selector) {
				const filePath = op.selector.filePath

				if (!fileOperations.has(filePath)) {
					fileOperations.set(filePath, [])
				}

				fileOperations.get(filePath)!.push(op)
			}
		}

		// Create optimized operation sequence
		const optimizedOperations: RefactorOperation[] = []

		// Process removes first to avoid conflicts
		for (const [filePath, ops] of fileOperations.entries()) {
			// Extract remove operations for this file
			const removeOps = ops.filter((op) => op.operation === "remove")
			optimizedOperations.push(...removeOps)

			// Filter out the remove operations from the original array
			fileOperations.set(
				filePath,
				ops.filter((op) => op.operation !== "remove"),
			)
		}

		// Then process renames to avoid move conflicts
		for (const [filePath, ops] of fileOperations.entries()) {
			// Extract rename operations for this file
			const renameOps = ops.filter((op) => op.operation === "rename")
			optimizedOperations.push(...renameOps)

			// Filter out the rename operations from the original array
			fileOperations.set(
				filePath,
				ops.filter((op) => op.operation !== "rename"),
			)
		}

		// Finally, process move operations
		for (const [, ops] of fileOperations.entries()) {
			// All remaining operations should be moves or others
			optimizedOperations.push(...ops)
		}

		return optimizedOperations
	}

	/**
	 * Groups batch operations by file to minimize file system access
	 *
	 * @param operations Array of refactoring operations
	 * @returns Map of file paths to operations that affect that file
	 */
	static groupOperationsByFile(operations: RefactorOperation[]): Map<string, RefactorOperation[]> {
		const fileOperations = new Map<string, RefactorOperation[]>()

		for (const op of operations) {
			if ("selector" in op && "filePath" in op.selector) {
				const filePath = op.selector.filePath

				if (!fileOperations.has(filePath)) {
					fileOperations.set(filePath, [])
				}

				fileOperations.get(filePath)!.push(op)
			}

			// For move operations, also track the target file
			if (op.operation === "move" && "targetFilePath" in op) {
				const targetPath = op.targetFilePath

				if (!fileOperations.has(targetPath)) {
					fileOperations.set(targetPath, [])
				}

				// Don't add the operation again, just ensure the file is tracked
			}
		}

		return fileOperations
	}
}

/**
 * Parallel execution utilities for batch operations
 * Only used for operations that can be safely parallelized
 */
export class ParallelExecutor {
	/**
	 * Maximum number of concurrent operations
	 */
	private static readonly MAX_CONCURRENT = 4

	/**
	 * Executes compatible operations in parallel to improve performance
	 * Only used for operations that don't have dependencies on each other
	 *
	 * @param operations Array of functions that return promises
	 * @param concurrentLimit Maximum number of concurrent operations
	 * @returns Promise that resolves when all operations are complete
	 */
	static async executeInBatches<T>(
		operations: Array<() => Promise<T>>,
		concurrentLimit = this.MAX_CONCURRENT,
	): Promise<T[]> {
		const results: T[] = []

		// Process in batches to limit concurrency
		for (let i = 0; i < operations.length; i += concurrentLimit) {
			const batch = operations.slice(i, i + concurrentLimit)
			const batchPromises = batch.map((op) => op())
			const batchResults = await Promise.all(batchPromises)

			results.push(...batchResults)
		}

		return results
	}

	/**
	 * Checks if an array of operations can be safely parallelized
	 *
	 * @param operations Array of refactoring operations
	 * @returns Whether the operations can be parallelized
	 */
	static canParallelize(operations: RefactorOperation[]): boolean {
		// Operation type checks
		const hasUnsafeOperations = operations.some((op) => op.operation === "move" || op.operation === "refactor")

		if (hasUnsafeOperations) {
			return false
		}

		// File dependency checks
		const filePaths = new Set<string>()

		for (const op of operations) {
			if ("selector" in op && "filePath" in op.selector) {
				const filePath = op.selector.filePath

				// If we've seen this file before, operations might conflict
				if (filePaths.has(filePath)) {
					return false
				}

				filePaths.add(filePath)
			}
		}

		return true
	}
}

/**
 * Memory usage optimization for large projects
 */
export class MemoryOptimizer {
	/**
	 * Reduces memory usage by unloading source files that aren't needed
	 *
	 * @param project ts-morph Project instance
	 * @param activeFilePaths Array of file paths that are currently being used
	 */
	static optimizeMemoryUsage(project: Project, activeFilePaths: string[]): void {
		const activeFiles = new Set(activeFilePaths.map((p) => path.normalize(p)))

		// Unload source files that aren't in the active set
		const sourceFiles = project.getSourceFiles()

		for (const file of sourceFiles) {
			const filePath = file.getFilePath()

			if (!activeFiles.has(filePath)) {
				project.removeSourceFile(file)
			}
		}
	}

	/**
	 * Performs garbage collection to free memory
	 * Note: This is a hint to the V8 engine and may not have immediate effect
	 */
	static requestGarbageCollection(): void {
		if (global.gc) {
			try {
				global.gc()
			} catch (error) {
				refactorLogger.warn(`Failed to trigger garbage collection: ${error}`)
			}
		}
	}
}
