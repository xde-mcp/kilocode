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
