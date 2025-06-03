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
	constructor(private projectRoot: string) {}

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

		// Check for common test directory and file patterns
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
		// If already absolute, return as is
		if (path.isAbsolute(relativePath)) {
			return relativePath
		}

		return path.resolve(this.projectRoot, relativePath)
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

		// If it's already absolute, don't change it
		if (path.isAbsolute(normalizedPath)) {
			return normalizedPath
		}

		// For test paths, we often want to use the temp directory as root
		// rather than adding the project root (which can cause duplicate src/)
		const testRoot = projectRootOverride || (this.isTestEnvironment(filePath) ? process.cwd() : this.projectRoot)

		return path.resolve(testRoot, normalizedPath)
	}

	/**
	 * Normalizes a file path by converting all backslashes to forward slashes.
	 * Replaces: .replace(/\\/g, "/") scattered 12+ times
	 *
	 * @param filePath The path to normalize
	 * @returns The normalized path with forward slashes
	 */
	normalizeFilePath(filePath: string): string {
		return filePath.replace(/\\/g, "/")
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
		const fromDir = path.dirname(this.normalizeFilePath(fromFile))
		let relativePath = path.relative(fromDir, this.normalizeFilePath(toFile))

		relativePath = this.normalizeFilePath(relativePath)
		relativePath = relativePath.replace(/\.(ts|tsx|js|jsx)$/, "")

		if (!relativePath.startsWith(".")) {
			relativePath = "./" + relativePath
		}

		return relativePath
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
}
