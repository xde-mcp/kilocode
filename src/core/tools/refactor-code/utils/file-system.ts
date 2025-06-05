import * as path from "path"
import * as fs from "fs/promises"
import * as fsSync from "fs"
import { refactorLogger } from "./RefactorLogger"

/**
 * Utility functions for file system operations used by the refactor tool.
 * This centralizes all file operations to ensure consistency.
 */

/**
 * Resolves a relative file path to an absolute path using the project root.
 *
 * @deprecated Use PathResolver.resolveAbsolutePath instead for better path handling
 * across the codebase. This function will be removed in a future release.
 *
 * @example
 * // Instead of:
 * const absPath = resolveFilePath(filePath, projectRoot);
 *
 * // Use:
 * const pathResolver = new PathResolver(projectRoot);
 * const absPath = pathResolver.resolveAbsolutePath(filePath);
 *
 * @param filePath - The relative file path to resolve
 * @param projectRootPath - The project root path
 * @returns The absolute file path
 */
export function resolveFilePath(filePath: string, projectRootPath: string): string {
	// Log a warning about deprecated usage
	refactorLogger.warn(`resolveFilePath is deprecated. Use PathResolver.resolveAbsolutePath instead.`)
	// If already absolute, return as is
	if (path.isAbsolute(filePath)) {
		return filePath
	}

	// Normalize the path to ensure consistent handling across platforms
	const normalizedPath = filePath.replace(/\\/g, "/")

	// Use path.join for consistent path joining behavior
	// path.resolve can cause issues if projectRootPath is "/"
	return path.normalize(path.join(projectRootPath, normalizedPath))
}

/**
 * Ensures a directory exists, creating it if necessary.
 *
 * @param dirPath - The directory path to ensure
 */
export async function ensureDirectoryExists(dirPath: string): Promise<void> {
	try {
		await fs.mkdir(dirPath, { recursive: true })
	} catch (error) {
		const err = error as NodeJS.ErrnoException
		// Ignore if directory already exists
		if (err.code !== "EEXIST") {
			throw error
		}
	}
}

/**
 * Reads a file's content.
 *
 * @param filePath - The absolute path to the file
 * @returns The file content as a string
 */
export async function readFile(filePath: string): Promise<string> {
	try {
		return await fs.readFile(filePath, "utf-8")
	} catch (error) {
		refactorLogger.error(`Failed to read file: ${filePath} - ${error}`)
		throw error
	}
}

/**
 * Writes content to a file, ensuring the directory exists.
 *
 * @param filePath - The absolute path to the file
 * @param content - The content to write
 */
export async function writeFile(filePath: string, content: string): Promise<void> {
	try {
		await ensureDirectoryExists(path.dirname(filePath))
		await fs.writeFile(filePath, content, "utf-8")
	} catch (error) {
		refactorLogger.error(`Failed to write file: ${filePath} - ${error}`)
		throw error
	}
}

/**
 * Writes content to a file and verifies the write succeeded.
 *
 * @param filePath - The absolute path to the file
 * @param content - The content to write
 * @param retries - Number of retry attempts (default: 2)
 * @returns True if write and verification succeeded
 */
export async function writeFileWithVerification(filePath: string, content: string, retries = 2): Promise<boolean> {
	try {
		// Write the file
		await writeFile(filePath, content)

		// Small delay to ensure file system operations complete
		await new Promise((resolve) => setTimeout(resolve, 50))

		// Verify the write succeeded by reading back the content
		let attempts = 0
		let verified = false

		while (attempts <= retries && !verified) {
			try {
				const writtenContent = await readFile(filePath)
				verified = writtenContent === content

				if (!verified) {
					refactorLogger.warn(`File verification failed on attempt ${attempts + 1}. Content mismatch.`)
					// Wait a bit longer before retry
					await new Promise((resolve) => setTimeout(resolve, 100 * (attempts + 1)))
				}
			} catch (error) {
				refactorLogger.warn(`File verification failed on attempt ${attempts + 1}: ${error}`)
				// Wait a bit longer before retry
				await new Promise((resolve) => setTimeout(resolve, 100 * (attempts + 1)))
			}

			attempts++
		}

		if (!verified) {
			refactorLogger.error(`Failed to verify file write after ${retries + 1} attempts: ${filePath}`)
			return false
		}

		return true
	} catch (error) {
		refactorLogger.error(`Failed to write and verify file: ${filePath} - ${error}`)
		return false
	}
}

/**
 * Checks if a file exists.
 *
 * @param filePath - The absolute path to the file
 * @returns True if the file exists
 */
export function fileExists(filePath: string): boolean {
	return fsSync.existsSync(filePath)
}

/**
 * Creates a temporary diagnostic function to help identify file operation issues.
 *
 * @param projectRootPath - The project root path
 * @returns A diagnostic function that can be used during debugging
 */
export function createDiagnostic(projectRootPath: string) {
	// Create a PathResolver instance
	const { PathResolver } = require("./PathResolver")
	const pathResolver = new PathResolver(projectRootPath)

	return async function diagnoseFileOperation(filePath: string, operation: string): Promise<void> {
		const absolutePath = pathResolver.resolveAbsolutePath(filePath)
		const exists = pathResolver.pathExists(filePath)
		const size = exists ? fsSync.statSync(absolutePath).size : 0

		refactorLogger.debug(`${operation} - File: ${filePath}`)
		refactorLogger.debug(`Absolute path: ${absolutePath}`)
		refactorLogger.debug(`File exists: ${exists}, Size: ${size} bytes`)

		if (exists) {
			const content = await readFile(absolutePath)
			refactorLogger.debug(`Content length: ${content.length} bytes`)
		}
	}
}
