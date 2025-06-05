import { Project, SourceFile } from "ts-morph"
import * as path from "path"
import * as fs from "fs/promises"
import { existsSync } from "fs"
import { PathResolver } from "../utils/PathResolver"
import { FileManager } from "../utils/FileManager"
import { refactorLogger } from "../utils/RefactorLogger"

/**
 * Centralizes project-level operations for refactoring tools.
 *
 * This class provides a shared foundation for all orchestrators to handle:
 * - Project setup and initialization
 * - Path resolution and normalization
 * - File loading and management
 * - Source file loading with comprehensive error handling
 * - Project-wide file operations
 */
export class ProjectManager {
	protected project: Project
	protected pathResolver: PathResolver
	protected fileManager: FileManager
	private disposed = false

	/**
	 * Creates a new ProjectManager
	 *
	 * @param project The ts-morph Project instance
	 */
	constructor(project: Project, explicitProjectRoot?: string) {
		this.project = project

		// Safely get compiler options, with fallbacks for tests
		const compilerOptions = project.getCompilerOptions() || {}

		// Use explicit project root if provided, otherwise get from compiler options
		// Avoid using process.cwd() as fallback since it can be incorrect in test environments
		let projectRoot: string

		if (explicitProjectRoot) {
			// Use the explicitly provided project root
			projectRoot = explicitProjectRoot
		} else if (compilerOptions.rootDir) {
			// Use compiler options root directory
			projectRoot = compilerOptions.rootDir
		} else {
			// Try to infer project root from existing source files in the project
			const sourceFiles = project.getSourceFiles()
			if (sourceFiles.length > 0) {
				// Get the common directory of all source files
				const firstFile = sourceFiles[0].getFilePath()
				if (path.isAbsolute(firstFile)) {
					// For absolute paths, try to find the project root by looking for src directory
					const srcIndex = firstFile.indexOf("/src/")
					if (srcIndex !== -1) {
						projectRoot = firstFile.substring(0, srcIndex)
					} else {
						// Fallback: use the directory containing the first source file
						projectRoot = path.dirname(firstFile)
					}
				} else {
					// For relative paths, use current working directory as last resort
					projectRoot = process.cwd()
				}
			} else {
				// No source files, use current working directory
				projectRoot = process.cwd()
			}
		}

		// Ensure we have a valid project root
		if (!projectRoot) {
			throw new Error("Unable to determine project root directory")
		}

		// console.log(`[DEBUG] ProjectManager initialized with project root: ${projectRoot}`)
		// console.log(`[DEBUG] Creating PathResolver with project root: ${projectRoot}`)
		this.pathResolver = new PathResolver(projectRoot)
		this.fileManager = new FileManager(project, this.pathResolver)
	}

	/**
	 * Loads TypeScript files in the project that might be relevant for refactoring
	 * operations based on the source file path.
	 *
	 * @param sourceFilePath The path of the source file being refactored
	 * @returns The number of files loaded
	 */
	async loadRelevantProjectFiles(sourceFilePath: string): Promise<number> {
		const startTime = Date.now()

		try {
			const beforeCount = this.project.getSourceFiles().length

			// Get the directory of the source file
			const sourceDir = path.dirname(this.pathResolver.resolveAbsolutePath(sourceFilePath))

			// For test environments, only load the specific directory being tested
			const isTestEnv = this.pathResolver.isTestEnvironment(sourceFilePath)

			const patterns: string[] = []

			if (isTestEnv) {
				// In test environment, only load files in the test directory
				patterns.push(`${sourceDir}/**/*.ts`, `${sourceDir}/**/*.tsx`)
			} else {
				// In production, load files more selectively to avoid memory issues
				// Only load files in common source directories, excluding tests and node_modules
				const commonSourceDirs = ["src", "lib", "app", "components", "utils", "services", "types"]

				for (const dir of commonSourceDirs) {
					const dirPath = this.pathResolver.resolveAbsolutePath(dir)
					if (existsSync(dirPath)) {
						patterns.push(`${dirPath}/**/*.ts`, `${dirPath}/**/*.tsx`)
					}
				}

				// CRITICAL: Always load files in the same directory as the source file
				patterns.push(`${sourceDir}/**/*.ts`, `${sourceDir}/**/*.tsx`)

				// FALLBACK: If no common directories exist, load from project root
				if (patterns.length === 2) {
					// Only sourceDir patterns added
					const projectRoot = this.pathResolver.getProjectRoot()
					patterns.push(`${projectRoot}/**/*.ts`, `${projectRoot}/**/*.tsx`)
				}
			}

			// Filter patterns to exclude unwanted directories
			const filteredPatterns = patterns.filter((pattern) => {
				const shouldInclude =
					!pattern.includes("node_modules") &&
					!pattern.includes("__tests__") &&
					!pattern.includes("dist") &&
					!pattern.includes("build")
				return shouldInclude
			})

			// Convert patterns to absolute paths to ensure correct resolution
			const absolutePatterns = filteredPatterns.map((pattern) => {
				if (path.isAbsolute(pattern)) {
					return pattern
				}
				return path.resolve(this.pathResolver.getProjectRoot(), pattern)
			})

			// Check if files are already loaded to avoid reloading and losing in-memory changes
			const existingFiles = this.project.getSourceFiles()

			// If we already have files loaded (like in tests), skip the expensive file loading
			// This prevents reloading files from disk which would overwrite in-memory changes
			let projectFiles
			if (existingFiles.length > 0) {
				projectFiles = existingFiles
			} else {
				projectFiles = this.project.addSourceFilesAtPaths(absolutePatterns)

				// CRITICAL FIX: If no files were loaded by patterns, try direct file loading
				if (projectFiles.length === 0 && !isTestEnv) {
					const projectRoot = this.pathResolver.getProjectRoot()
					const directPattern = `${projectRoot}/*.ts`
					projectFiles = this.project.addSourceFilesAtPaths([directPattern])
				}
			}

			const afterCount = this.project.getSourceFiles().length
			const filesAdded = afterCount - beforeCount

			// Special handling for barrel files (index.ts) - they often re-export symbols
			// but ts-morph might not catch these references automatically
			this.loadBarrelFilesInProject(this.pathResolver.getProjectRoot())

			return projectFiles.length
		} catch (error) {
			// console.log(`[DEBUG] Error loading reference files: ${(error as Error).message}`)
			return 0
		}
	}

	/**
	 * Load index barrel files that might re-export symbols
	 */
	private loadBarrelFilesInProject(projectRoot: string): void {
		try {
			// Find all index.ts files that might be barrel files
			const barrelFiles = this.project.addSourceFilesAtPaths([
				`${projectRoot}/**/index.ts`,
				`${projectRoot}/**/index.tsx`,
			])

			if (process.env.NODE_ENV !== "test") {
				// console.log(`[DEBUG] Loaded ${barrelFiles.length} potential barrel files`)
			}
		} catch (error) {
			if (process.env.NODE_ENV !== "test") {
				// console.log(`[DEBUG] Error loading barrel files: ${(error as Error).message}`)
			}
		}
	}

	/**
	 * Ensures a source file is loaded and available in the project
	 *
	 * @param filePath The path to the source file
	 * @returns The source file if found, null otherwise
	 */
	async ensureSourceFile(filePath: string): Promise<SourceFile | null> {
		const normalizedPath = this.pathResolver.normalizeFilePath(filePath)
		// console.log(`[DEBUG ENSURE FILE] Original path: ${filePath}`)
		// console.log(`[DEBUG ENSURE FILE] Normalized path: ${normalizedPath}`)

		// Get the absolute path for the file
		const absolutePath = this.pathResolver.resolveAbsolutePath(normalizedPath)
		// console.log(`[DEBUG ENSURE FILE] Absolute path: ${absolutePath}`)

		// Try to find the file by iterating through all source files in the project
		// This is necessary because ts-morph might have stored the file with a different path
		const allSourceFiles = this.project.getSourceFiles()
		// console.log(`[DEBUG ENSURE FILE] Searching through ${allSourceFiles.length} source files`)

		for (const sourceFile of allSourceFiles) {
			const sourceFilePath = sourceFile.getFilePath()
			// console.log(`[DEBUG ENSURE FILE] Checking source file: ${sourceFilePath}`)

			// Check if this source file matches our target file
			// Use exact path matching first
			if (sourceFilePath === absolutePath) {
				return sourceFile
			}

			// Check if the resolved paths match
			try {
				if (path.resolve(sourceFilePath) === path.resolve(absolutePath)) {
					return sourceFile
				}
			} catch (error) {
				// Ignore path resolution errors
			}
		}
		return this.fileManager.ensureFileInProject(normalizedPath)
	}

	/**
	 * Saves a source file to disk
	 *
	 * @param sourceFile The source file to save
	 * @param filePath The path where the file should be saved
	 * @returns True if the save was successful, false otherwise
	 */
	async saveSourceFile(sourceFile: SourceFile, filePath: string): Promise<boolean> {
		try {
			// Get absolute path for the file
			const absolutePath = this.pathResolver.resolveAbsolutePath(filePath)

			// Ensure in-memory changes are saved within the project
			sourceFile.saveSync()

			// Get the content
			const content = sourceFile.getFullText()

			// Save to disk
			await fs.writeFile(absolutePath, content, "utf-8")

			return true
		} catch (error) {
			if (process.env.NODE_ENV !== "test") {
				refactorLogger.error(`Failed to save file ${filePath}: ${error}`)
			}
			return false
		}
	}

	/**
	 * Refreshes all source files in the project from the file system
	 * This is important for tests that verify file content on disk
	 */
	refreshProjectFiles(): void {
		this.project.getSourceFiles().forEach((file) => {
			try {
				file.refreshFromFileSystemSync()
			} catch (e) {
				// Ignore refresh errors
			}
		})
	}

	/**
	 * Force complete reload of specific files from disk
	 * This is critical for batch operations where files change between operations
	 */
	forceReloadFiles(filePaths: string[]): void {
		try {
			for (const filePath of filePaths) {
				const normalizedPath = this.pathResolver.normalizeFilePath(filePath)

				// Remove file from project if it exists
				const existingFile = this.project.getSourceFile(normalizedPath)
				if (existingFile) {
					this.project.removeSourceFile(existingFile)
				}

				// Re-add file if it exists on disk
				if (this.pathResolver.pathExists(normalizedPath)) {
					try {
						const newFile = this.project.addSourceFileAtPath(normalizedPath)
						if (newFile) {
							newFile.refreshFromFileSystemSync()
						}
					} catch (e) {
						// Ignore reload errors for individual files
					}
				}
			}
		} catch (error) {
			// Ignore force reload errors
		}
	}

	/**
	 * Clear all internal caches and force project refresh
	 * Use this when project state may be inconsistent
	 */
	clearCachesAndRefresh(): void {
		try {
			// Clear any internal project caches
			const projectAny = this.project as any
			if (projectAny._moduleResolutionCache) {
				projectAny._moduleResolutionCache.clear?.()
			}
			if (projectAny._typeChecker) {
				projectAny._typeChecker = undefined
			}

			// Refresh all files from disk
			this.refreshProjectFiles()
		} catch (error) {
			// Ignore cache clearing errors
		}
	}

	/**
	 * Forces the ts-morph project to refresh a specific source file from disk.
	 * This ensures that AST queries reflect the actual file state after modifications.
	 * Critical for method removal operations where the AST must be synchronized.
	 *
	 * @param sourceFile The source file to refresh
	 * @param filePath The file path for logging purposes
	 */
	async forceRefreshSourceFile(sourceFile: SourceFile, filePath?: string): Promise<SourceFile | null> {
		try {
			const absolutePath = sourceFile.getFilePath()
			const displayPath = filePath || absolutePath

			// First, save any pending changes to ensure file is up to date
			await sourceFile.save()

			// Remove the file from project to clear all cached AST data
			this.project.removeSourceFile(sourceFile)

			// Re-add the file to project to force complete reload
			const refreshedFile = this.project.addSourceFileAtPath(absolutePath)

			if (refreshedFile) {
				// Force refresh from file system to ensure latest content
				refreshedFile.refreshFromFileSystemSync()
				return refreshedFile
			} else {
				return null
			}
		} catch (error) {
			return null
		}
	}

	/**
	 * Gets the PathResolver instance
	 */
	getPathResolver(): PathResolver {
		return this.pathResolver
	}

	/**
	 * Gets the FileManager instance
	 */
	getFileManager(): FileManager {
		return this.fileManager
	}

	/**
	 * Gets the Project instance
	 */
	getProject(): Project {
		return this.project
	}

	/**
	 * Disposes of resources held by this ProjectManager instance.
	 * This method aggressively cleans up memory to prevent leaks:
	 * - Removes all source files from the project
	 * - Clears all internal caches
	 * - Destroys circular references
	 * - Sets large objects to null
	 */
	dispose(): void {
		if (this.disposed) {
			return
		}

		try {
			// First, remove all source files from the project to release their memory
			const sourceFiles = this.project.getSourceFiles()
			for (const file of sourceFiles) {
				try {
					// Don't use forEach here to avoid closures that might retain memory
					this.project.removeSourceFile(file)
				} catch (e) {
					// Ignore errors during cleanup
				}
			}

			// Clear any project-level caches that might exist
			// Access internal project properties carefully
			if (this.project && (this.project as any)._moduleResolutionCache) {
				;(this.project as any)._moduleResolutionCache = null
			}

			// Dispose of FileManager to clear its caches
			if (this.fileManager) {
				this.fileManager.dispose()
			}

			// Release references to help garbage collection
			this.project = null as any
			this.pathResolver = null as any
			this.fileManager = null as any

			// Suggest garbage collection if available
			if (global.gc) {
				global.gc()
			}
		} catch (e) {
			// Don't let cleanup errors prevent setting the disposed flag
		} finally {
			this.disposed = true
		}
	}
}
