import { Project, SourceFile } from "ts-morph"
import * as fsSync from "fs"
import * as path from "path"
import { PathResolver } from "./PathResolver"
import { ensureDirectoryExists, writeFile } from "./file-system" // Changed path

/**
 * Manages file operations for the refactor tool, centralizing file access, creation, and modifications.
 * This class handles complex file finding/adding logic and standardizes file operations.
 */
export class FileManager {
	private fileCache: Map<string, boolean> = new Map()
	private sourceFileCache: Map<string, SourceFile | null> = new Map()

	constructor(
		private project: Project,
		private pathResolver: PathResolver,
	) {}

	/**
	 * Clears all internal caches.
	 * Call this when you need to ensure fresh data from the filesystem.
	 */
	public clearCache(): void {
		this.fileCache.clear()
		this.sourceFileCache.clear()
	}

	/**
	 * Ensures a file is loaded in the project, trying multiple strategies to add it.
	 * Uses caching to improve performance for repeated calls with the same file.
	 *
	 * @param filePath - The path of the file to ensure is in the project
	 * @returns The SourceFile if found or added, null otherwise
	 */
	async ensureFileInProject(filePath: string): Promise<SourceFile | null> {
		const normalizedPath = this.pathResolver.normalizeFilePath(filePath)

		// Check cache first
		if (this.sourceFileCache.has(normalizedPath)) {
			return this.sourceFileCache.get(normalizedPath) || null
		}

		// Try to get existing file first
		let sourceFile = this.project.getSourceFile(normalizedPath)
		if (sourceFile) {
			// Cache the result
			this.sourceFileCache.set(normalizedPath, sourceFile)
			return sourceFile
		}

		// Check if file exists on disk
		const absolutePath = this.pathResolver.resolveAbsolutePath(normalizedPath)

		// Use file existence cache if available
		let fileExists = this.fileCache.get(absolutePath)
		if (fileExists === undefined) {
			fileExists = fsSync.existsSync(absolutePath)
			this.fileCache.set(absolutePath, fileExists)
		}

		if (!fileExists) {
			this.sourceFileCache.set(normalizedPath, null)
			return null
		}

		// Try multiple strategies to add file to project
		const pathsToTry = [
			{ path: normalizedPath, description: "normalized path" },
			{ path: absolutePath, description: "absolute path" },
			{ path: filePath, description: "original path" },
		]

		for (const { path: pathToTry, description } of pathsToTry) {
			try {
				sourceFile = this.project.addSourceFileAtPath(pathToTry)
				console.log(`[DEBUG] Added source file using ${description}: ${pathToTry}`)
				return sourceFile
			} catch (error) {
				console.log(`[DEBUG] Failed to add with ${description}: ${(error as Error).message}`)
			}
		}

		// Case-insensitive search fallback
		try {
			const dirPath = path.dirname(absolutePath)
			if (fsSync.existsSync(dirPath)) {
				const files = fsSync.readdirSync(dirPath)
				const fileName = path.basename(absolutePath)
				const lowerFileName = fileName.toLowerCase()

				// Look for case-insensitive match
				const matchingFile = files.find((f) => f.toLowerCase() === lowerFileName)
				if (matchingFile) {
					const fullPath = path.join(dirPath, matchingFile)
					sourceFile = this.project.addSourceFileAtPath(fullPath)
					console.log(`[DEBUG] Added source file using case-insensitive match: ${fullPath}`)
					return sourceFile
				}
			}
		} catch (error) {
			console.log(`[DEBUG] Case-insensitive fallback failed: ${(error as Error).message}`)
		}

		// Cache the result before returning
		this.sourceFileCache.set(normalizedPath, sourceFile || null)
		return sourceFile || null
	}

	/**
	 * Creates a new file if needed or returns an existing one from the project.
	 *
	 * @param filePath - The path of the file to create
	 * @param content - The initial content for the file if it doesn't exist
	 * @returns The SourceFile for the created or existing file
	 */
	async createFileIfNeeded(filePath: string, content: string = ""): Promise<SourceFile> {
		const normalizedPath = this.pathResolver.normalizeFilePath(filePath)

		// Check if the file already exists in the project
		let sourceFile = this.project.getSourceFile(normalizedPath)
		if (sourceFile) {
			return sourceFile
		}

		// Ensure the directory exists
		const absolutePath = this.pathResolver.resolveAbsolutePath(normalizedPath)
		await ensureDirectoryExists(path.dirname(absolutePath))

		// Create the file on disk if it doesn't exist
		if (!fsSync.existsSync(absolutePath)) {
			await writeFile(absolutePath, content)
			console.log(`[DEBUG] Created new file on disk: ${absolutePath}`)
		}

		// Try to add the file to the project using multiple strategies
		try {
			sourceFile = this.project.addSourceFileAtPath(normalizedPath)
			console.log(`[DEBUG] Added new file to project: ${normalizedPath}`)
		} catch (error) {
			console.log(`[DEBUG] Failed to add with normalized path: ${(error as Error).message}`)

			try {
				sourceFile = this.project.addSourceFileAtPath(absolutePath)
				console.log(`[DEBUG] Added new file to project with absolute path: ${absolutePath}`)
			} catch (error) {
				console.log(`[DEBUG] Failed to add with absolute path: ${(error as Error).message}`)

				// Last resort: create the file in the project
				sourceFile = this.project.createSourceFile(normalizedPath, content)
				console.log(`[DEBUG] Created source file directly in project: ${normalizedPath}`)
			}
		}

		return sourceFile
	}

	/**
	 * Writes content to a file and updates the project source file if it exists.
	 *
	 * @param filePath - The path of the file to write to
	 * @param content - The content to write
	 * @returns True if the write operation was successful, false otherwise
	 */
	async writeToFile(filePath: string, content: string): Promise<boolean> {
		try {
			const absolutePath = this.pathResolver.resolveAbsolutePath(filePath)
			await writeFile(absolutePath, content)

			// Refresh the file in the project if it exists
			const sourceFile = this.project.getSourceFile(filePath)
			if (sourceFile) {
				sourceFile.replaceWithText(content)
				sourceFile.saveSync()
			}

			// Update caches
			this.fileCache.set(absolutePath, true)
			if (sourceFile) {
				this.sourceFileCache.set(filePath, sourceFile)
			} else {
				// Remove from cache to force re-fetch next time
				this.sourceFileCache.delete(filePath)
			}

			return true
		} catch (error) {
			console.error(`[ERROR] Failed to write to file ${filePath}: ${(error as Error).message}`)
			return false
		}
	}

	/**
	 * Reads content from a file with error handling.
	 *
	 * @param filePath - The path of the file to read
	 * @param useCache - Whether to use cached file existence information (default: true)
	 * @returns The file content as a string, or null if the file doesn't exist or can't be read
	 */
	readFile(filePath: string, useCache: boolean = true): string | null {
		try {
			const absolutePath = this.pathResolver.resolveAbsolutePath(filePath)

			// Check if file exists using cache if requested
			if (useCache) {
				const fileExists = this.fileCache.get(absolutePath)
				if (fileExists === false) {
					return null
				}
			}

			const content = fsSync.readFileSync(absolutePath, "utf8")

			// Update cache
			this.fileCache.set(absolutePath, true)

			return content
		} catch (error) {
			console.error(`[ERROR] Failed to read file ${filePath}: ${(error as Error).message}`)

			// Update cache on failure
			const absolutePath = this.pathResolver.resolveAbsolutePath(filePath)
			this.fileCache.set(absolutePath, false)

			return null
		}
	}
}
