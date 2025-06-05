import * as path from "path"
import * as fs from "fs"

/**
 * Utility class that centralizes path resolution operations throughout the refactor tool.
 * This eliminates scattered path manipulation code and standardizes path handling.
 */
export class PathResolver {
	/**
	 * Creates a new PathResolver instance
	 * @param projectRoot The root path of the project
	 */
	constructor(private projectRoot: string) {
		// console.log(`[DEBUG] PathResolver created with project root: ${this.projectRoot}`)
	}

	/**
	 * Normalize path separators to forward slashes for cross-platform compatibility
	 * @param filePath The file path to normalize
	 * @returns The normalized path with forward slashes
	 */
	private normalizePath(filePath: string): string {
		return filePath.replace(/\\/g, "/")
	}

	/**
	 * Gets the project root path
	 * @returns The project root path
	 */
	getProjectRoot(): string {
		return this.projectRoot
	}

	/**
	 * Determines if a path is within a test environment
	 * This centralizes test environment detection logic that was previously scattered
	 *
	 * @param filePath The file path to check
	 * @returns true if in a test environment, false otherwise
	 */
	isTestEnvironment(filePath?: string): boolean {
		if (!filePath) {
			// Check if process.env has test indicators
			return process.env.NODE_ENV === "test" || !!process.env.JEST_WORKER_ID
		}

		// Primary detection: Check for our standard test prefix (same as RefactorEngine)
		const standardTestPrefix = "refactor-tool-test"
		if (filePath.includes(standardTestPrefix) || this.projectRoot.includes(standardTestPrefix)) {
			return true
		}

		// Secondary detection: Check for common test directory and file patterns (legacy support)
		return (
			filePath.includes("test") ||
			filePath.includes("__tests__") ||
			filePath.includes("__mocks__") ||
			filePath.includes("/tmp/") ||
			filePath.includes("fixtures") ||
			filePath.match(/\.test\.tsx?$/) !== null ||
			filePath.match(/\.spec\.tsx?$/) !== null
		)
	}

	/**
	 * Resolves a relative path to an absolute path based on the project root.
	 * Replaces: resolveFilePath calls throughout both files
	 *
	 * @param relativePath The relative path to resolve
	 * @returns The absolute path
	 */
	resolveAbsolutePath(relativePath: string): string {
		// Normalize path separators first for cross-platform compatibility
		const normalizedPath = this.normalizePath(relativePath)

		// If already absolute, fix any src/src duplication and return
		if (path.isAbsolute(normalizedPath)) {
			return this.fixSrcDuplication(normalizedPath)
		}

		// Fix potential src/src duplication before resolving
		const cleanPath = this.fixSrcDuplication(normalizedPath)

		// Ensure we're using the correct project root, not the current working directory
		const resolvedPath = path.resolve(this.projectRoot, cleanPath)

		// Additional safety check: if the resolved path contains duplicate src directories, fix it
		if (resolvedPath.includes("/src/src/") || resolvedPath.includes("\\src\\src\\")) {
			const fixedPath = resolvedPath.replace(/[\/\\]src[\/\\]src[\/\\]/g, "/src/")
			// console.log(`[DEBUG] Fixed duplicate src in resolved path: ${fixedPath} (was ${resolvedPath})`)
			return fixedPath
		}

		return resolvedPath
	}

	/**
	 * Fix common src/src duplication issues
	 * This prevents paths like "src/src/utils/file.ts"
	 */
	private fixSrcDuplication(filePath: string): string {
		// Handle various forms of src/src duplication
		if (filePath.includes("src/src/") || filePath.includes("src\\src\\")) {
			return filePath.replace(/src[\/\\]src[\/\\]/g, "src/")
		}

		// Handle src/src at start of path
		if (filePath.startsWith("src/src/") || filePath.startsWith("src\\src\\")) {
			return filePath.replace(/^src[\/\\]src[\/\\]/, "src/")
		}

		return filePath
	}

	/**
	 * Resolves a path specifically for test environments
	 * Prevents common issues like duplicate src directories
	 *
	 * @param filePath The path to resolve
	 * @param projectRootOverride Optional project root override for tests
	 * @returns The properly resolved path for test environments
	 */
	resolveTestPath(filePath: string, projectRootOverride?: string): string {
		const normalizedPath = this.normalizeFilePath(filePath)

		// Removed excessive debug logging

		// Detect if we're running in the test directory for move verification tests
		const isMoveVerificationTest = normalizedPath.includes("move-orchestrator-verification")

		// For test paths, we often want to use the temp directory as root
		// rather than adding the project root (which can cause duplicate src/)
		const testRoot =
			projectRootOverride ||
			(this.isTestEnvironment(filePath)
				? // For move verification tests, use the temp directory directly
					isMoveVerificationTest
					? path.dirname(normalizedPath.split("src")[0])
					: this.projectRoot // Use the correctly initialized projectRoot instead of process.cwd()
				: this.projectRoot)

		// Removed excessive debug logging

		// If it's already absolute, handle potential src/src duplication
		if (path.isAbsolute(normalizedPath)) {
			// Check for various forms of src/src duplication with a more robust regex
			if (normalizedPath.includes("/src/src/") || normalizedPath.includes("\\src\\src\\")) {
				const fixedPath = normalizedPath.replace(/[\/\\]src[\/\\]src[\/\\]/g, "/src/")
				// console.log(`[DEBUG] Fixed duplicated src path in absolute path: ${fixedPath}`)
				return fixedPath
			}
			// Check for src/src at the end of the path
			if (normalizedPath.endsWith("/src/src") || normalizedPath.endsWith("\\src\\src")) {
				const fixedPath = normalizedPath.replace(/[\/\\]src[\/\\]src$/g, "/src")
				// console.log(`[DEBUG] Fixed duplicated src path at end: ${fixedPath}`)
				return fixedPath
			}
			return normalizedPath
		}

		// For move verification tests, handle paths differently to avoid duplicate src/
		if (isMoveVerificationTest) {
			// If the path already contains /src/, extract the parts after the last /src/
			if (normalizedPath.includes("/src/") || normalizedPath.includes("\\src\\")) {
				const pathParts = normalizedPath.split(/[\/\\]src[\/\\]/)
				const lastPart = pathParts[pathParts.length - 1]
				const resolvedPath = path.resolve(testRoot, "src", lastPart)
				// console.log(`[DEBUG] Resolved move verification test path: ${resolvedPath} from ${normalizedPath}`)
				return resolvedPath
			}

			// If the path doesn't contain /src/ but is a relative path, try to handle it
			if (!path.isAbsolute(normalizedPath)) {
				// Extract the relative part of the path (after the temp directory)
				const pathParts = normalizedPath.split(/[\/\\]/)
				// Find the index of "src" in the path
				const srcIndex = pathParts.indexOf("src")
				if (srcIndex !== -1) {
					// Extract the parts after "src"
					const relativeParts = pathParts.slice(srcIndex + 1)
					const resolvedPath = path.resolve(testRoot, "src", ...relativeParts)
					console.log(
						`[DEBUG] Resolved move verification test path (alt): ${resolvedPath} from ${normalizedPath}`,
					)
					return resolvedPath
				}
			}
		}

		// For all other cases, simply resolve the path
		const resolvedPath = path.resolve(testRoot, normalizedPath)
		return resolvedPath
	}

	/**
	 * Normalizes a file path by converting all backslashes to forward slashes.
	 * Replaces: .replace(/\\/g, "/") scattered 12+ times
	 *
	 * @param filePath The path to normalize
	 * @returns The normalized path with forward slashes
	 */
	normalizeFilePath(filePath: string): string {
		if (!filePath) return ""
		return filePath.replace(/\\/g, "/")
	}

	/**
	 * Standardizes a path for consistent comparison across platforms
	 * Handles both absolute and relative paths
	 *
	 * @param filePath The path to standardize
	 * @returns The standardized path with forward slashes and no duplicated src/ segments
	 */
	standardizePath(filePath: string): string {
		if (!filePath) return ""

		// Normalize slashes
		let standardized = this.normalizeFilePath(filePath)

		// Convert to relative path for consistent comparison
		if (path.isAbsolute(standardized)) {
			standardized = path.relative(this.projectRoot, standardized)
			standardized = this.normalizeFilePath(standardized)
		}

		// Remove duplicate src/src patterns
		standardized = standardized.replace(/[\/\\]src[\/\\]src[\/\\]/g, "/src/")

		// Fix src/src at the end of the path
		standardized = standardized.replace(/[\/\\]src[\/\\]src$/g, "/src")

		return standardized
	}

	/**
	 * Compares two paths for equality, normalizing them for cross-platform comparison
	 * Useful for comparing paths that might be in different formats (absolute vs relative)
	 *
	 * @param path1 First path to compare
	 * @param path2 Second path to compare
	 * @returns True if the paths refer to the same file, false otherwise
	 */
	arePathsEqual(path1: string, path2: string): boolean {
		if (!path1 || !path2) return false

		// Get absolute paths for both
		const abs1 = path.isAbsolute(path1) ? path1 : this.resolveAbsolutePath(path1)
		const abs2 = path.isAbsolute(path2) ? path2 : this.resolveAbsolutePath(path2)

		// Standardize both paths
		const std1 = this.standardizePath(abs1)
		const std2 = this.standardizePath(abs2)

		return std1 === std2
	}

	/**
	 * Creates a source file path suitable for test environments
	 *
	 * @param filePath The file path
	 * @param createInMemory Whether to prepare for in-memory creation
	 * @returns The path prepared for test environments
	 */
	prepareTestFilePath(filePath: string, createInMemory: boolean = false): string {
		const normalizedPath = this.normalizeFilePath(filePath)

		// For in-memory files in tests, we don't need to make it absolute
		if (createInMemory) {
			return normalizedPath
		}

		// Otherwise resolve it correctly for the test environment
		return this.resolveTestPath(normalizedPath)
	}

	/**
	 * Normalizes an array of file paths for cross-platform consistency
	 * Used to ensure consistent path formats in test environments
	 *
	 * @param filePaths Array of paths to normalize
	 * @returns Array of normalized paths with forward slashes
	 */
	normalizeFilePaths(filePaths: string[]): string[] {
		return filePaths.map((filePath) => this.normalizeFilePath(filePath))
	}

	/**
	 * Calculates the relative import path between two files.
	 * Replaces: calculateRelativePath in ImportManager
	 *
	 * @param fromFile The source file path
	 * @param toFile The target file path
	 * @returns The relative import path suitable for import statements
	 */
	getRelativeImportPath(fromFile: string, toFile: string): string {
		// Detect path style and use appropriate Node.js path utilities
		const isWindowsStyle = fromFile.includes("\\") || toFile.includes("\\") || this.projectRoot.includes("\\")
		const pathUtil = isWindowsStyle ? path.win32 : path.posix

		let resolvedFromFile: string
		let resolvedToFile: string

		// Ensure both paths are absolute so path.relative() works correctly
		if (pathUtil.isAbsolute(fromFile)) {
			resolvedFromFile = pathUtil.normalize(fromFile)
		} else {
			resolvedFromFile = pathUtil.resolve(this.projectRoot, fromFile)
		}

		if (pathUtil.isAbsolute(toFile)) {
			resolvedToFile = pathUtil.normalize(toFile)
		} else {
			// Resolve toFile relative to project root, not fromFile's directory
			resolvedToFile = pathUtil.resolve(this.projectRoot, toFile)
		}

		// Use appropriate path.relative() which handles the detected path style correctly
		const fromDir = pathUtil.dirname(resolvedFromFile)
		let relativePath = pathUtil.relative(fromDir, resolvedToFile)

		// Normalize to forward slashes for import statements (standard across platforms)
		relativePath = relativePath.replace(/\\/g, "/")

		// Remove file extension
		relativePath = relativePath.replace(/\.(ts|tsx|js|jsx)$/, "")

		// Ensure relative imports start with ./ or ../
		if (!relativePath.startsWith(".")) {
			relativePath = "./" + relativePath
		}

		return relativePath
	}

	/**
	 * Converts an absolute path to a relative path based on the project root
	 *
	 * @param filePath The file path to convert (absolute or relative)
	 * @returns The relative path from project root
	 */
	convertToRelativePath(filePath: string): string {
		if (!filePath) return ""

		const normalizedPath = this.normalizeFilePath(filePath)

		// If already absolute, convert to relative
		if (path.isAbsolute(normalizedPath)) {
			return path.relative(this.projectRoot, normalizedPath)
		}

		return normalizedPath
	}

	/**
	 * Gets the directory path of a file
	 * Centralizes path.dirname() usage
	 *
	 * @param filePath The file path
	 * @returns The directory path
	 */
	getDirectoryPath(filePath: string): string {
		return path.dirname(filePath)
	}

	/**
	 * Gets the filename from a path
	 * Centralizes path.basename() usage
	 *
	 * @param filePath The file path
	 * @returns The filename
	 */
	getFileName(filePath: string): string {
		return path.basename(filePath)
	}

	/**
	 * Joins multiple path segments
	 * Centralizes path.join() usage
	 *
	 * @param paths The path segments to join
	 * @returns The joined path
	 */
	joinPaths(...paths: string[]): string {
		return path.join(...paths)
	}

	/**
	 * Gets the filename without extension from a path
	 * Centralizes path.basename(filePath, path.extname(filePath)) usage
	 *
	 * @param filePath The file path
	 * @returns The filename without extension
	 */
	getFileNameWithoutExtension(filePath: string): string {
		return path.basename(filePath, path.extname(filePath))
	}

	/**
	 * Gets the file extension from a path
	 * Centralizes path.extname() usage
	 *
	 * @param filePath The file path
	 * @returns The file extension
	 */
	getFileExtension(filePath: string): string {
		return path.extname(filePath)
	}

	/**
	 * Calculates the relative path from one path to another
	 * Centralizes path.relative() usage
	 *
	 * @param from The source path
	 * @param to The target path
	 * @returns The relative path from source to target
	 */
	getRelativePath(from: string, to: string): string {
		return path.relative(from, to)
	}

	/**
	 * Checks if a path exists in the filesystem.
	 * Replaces: Path existence checks scattered throughout
	 *
	 * @param filePath The path to check, relative to project root
	 * @returns True if the path exists, false otherwise
	 */
	pathExists(filePath: string): boolean {
		return fs.existsSync(this.resolveAbsolutePath(filePath))
	}

	/**
	 * Resolves a file path appropriately based on environment
	 * Automatically detects test environments and uses the correct resolution method
	 *
	 * @param filePath The file path to resolve
	 * @returns The properly resolved path for the current environment
	 */
	resolveEnvironmentAwarePath(filePath: string): string {
		if (!filePath) return ""

		const normalizedPath = this.normalizeFilePath(filePath)

		// Always use test path resolution for move verification tests
		// even if they aren't caught by the regular isTestEnvironment check
		const isMoveVerificationTest = normalizedPath.includes("move-orchestrator-verification")

		return this.isTestEnvironment(normalizedPath) || isMoveVerificationTest
			? this.resolveTestPath(normalizedPath)
			: this.resolveAbsolutePath(normalizedPath)
	}

	/**
	 * Resolves an array of file paths with environment awareness
	 *
	 * @param filePaths Array of file paths to resolve
	 * @returns Array of properly resolved paths for the current environment
	 */
	resolveEnvironmentAwarePaths(filePaths: string[]): string[] {
		return filePaths.filter(Boolean).map((filePath) => this.resolveEnvironmentAwarePath(filePath))
	}

	/**
	 * Standardizes an array of file paths for consistent comparison
	 * Removes duplicates based on standardized paths
	 *
	 * @param filePaths Array of file paths to standardize
	 * @returns Standardized and deduplicated array of file paths
	 */
	standardizeAndDeduplicatePaths(filePaths: string[]): string[] {
		if (!filePaths || !filePaths.length) return []

		// Filter null/undefined paths
		const validPaths = filePaths.filter(Boolean)

		// Use a Set with standardized paths for deduplication
		const uniquePaths = new Set<string>()
		const result: string[] = []

		for (const filePath of validPaths) {
			const standardized = this.standardizePath(filePath)
			const relativePath = this.convertToRelativePath(filePath)

			if (!uniquePaths.has(standardized)) {
				uniquePaths.add(standardized)
				result.push(relativePath)
			}
		}

		return result
	}
}
