import * as fs from "fs"
import * as path from "path"
import { Project, SourceFile } from "ts-morph"
import { MoveOperation } from "../schema"
import { PathResolver } from "../utils/PathResolver"
import { FileManager } from "../utils/FileManager"
import { SymbolResolver } from "../core/SymbolResolver"
import { ResolvedSymbol } from "../core/types"

/**
 * Result of a validation operation.
 */
export interface ValidationResult {
	/** Whether the validation succeeded */
	success: boolean
	/** Error message if validation failed */
	error?: string
	/** List of affected files */
	affectedFiles: string[]
	/** Warnings about potential issues that don't block the operation */
	warnings: string[]
	/** The resolved symbol if validation included symbol resolution */
	symbol?: ResolvedSymbol
	/** The source file if validation included file resolution */
	sourceFile?: SourceFile
}

/**
 * Validates move operations before execution.
 *
 * The MoveValidator is responsible for validating all aspects of a move operation, including:
 * 1. Checking operation parameters (symbol name, source path, target path)
 * 2. Verifying source file existence and readability
 * 3. Finding and validating the symbol to be moved
 * 4. Checking for potential conflicts in the target location
 * 5. Validating that the operation is technically feasible
 *
 * It separates validation logic from execution logic, making the codebase more maintainable
 * and easier to test.
 */
export class MoveValidator {
	private pathResolver: PathResolver
	private fileManager: FileManager
	private symbolResolver: SymbolResolver

	/**
	 * Creates a new MoveValidator instance.
	 *
	 * @param project - The ts-morph Project instance for code analysis
	 */
	constructor(private project: Project) {
		// Safely get compiler options, with fallbacks for tests
		const compilerOptions = project.getCompilerOptions() || {}
		const projectRoot = compilerOptions.rootDir || process.cwd()

		this.pathResolver = new PathResolver(projectRoot)
		this.fileManager = new FileManager(project, this.pathResolver)
		this.symbolResolver = new SymbolResolver(project)
	}

	/**
	 * Validates a move operation by checking all prerequisites.
	 *
	 * This method performs a comprehensive validation of the move operation:
	 * 1. Validates basic operation parameters
	 * 2. Verifies the source file exists and can be accessed
	 * 3. Finds and validates the symbol to be moved
	 * 4. Checks if the target location is valid
	 *
	 * @param operation - The move operation to validate
	 * @returns A validation result object with detailed success/error information
	 */
	async validate(operation: MoveOperation): Promise<ValidationResult> {
		// Step 1: Validate operation parameters
		const paramValidation = this.validateParameters(operation)
		if (!paramValidation.success) {
			return paramValidation
		}

		// Step 2: Find and validate source file
		const sourceFileValidation = await this.validateSourceFile(operation)
		if (!sourceFileValidation.success) {
			return sourceFileValidation
		}

		const sourceFile = sourceFileValidation.sourceFile!

		// Step 3: Find and validate the symbol
		const symbolValidation = this.validateSymbol(operation, sourceFile)
		if (!symbolValidation.success) {
			return symbolValidation
		}

		const symbol = symbolValidation.symbol!

		// Step 4: Validate target location
		const targetValidation = await this.validateTargetLocation(operation)
		if (!targetValidation.success) {
			return targetValidation
		}

		// If all validations pass, return success with all collected information
		return {
			success: true,
			affectedFiles: [
				...paramValidation.affectedFiles,
				...sourceFileValidation.affectedFiles,
				...symbolValidation.affectedFiles,
				...targetValidation.affectedFiles,
			],
			warnings: [
				...paramValidation.warnings,
				...sourceFileValidation.warnings,
				...symbolValidation.warnings,
				...targetValidation.warnings,
			],
			sourceFile,
			symbol,
		}
	}

	/**
	 * Validates the basic parameters of a move operation.
	 *
	 * Checks:
	 * - Source file path is provided and valid
	 * - Symbol name is provided and valid
	 * - Target file path is provided and valid
	 * - Source and target paths are different
	 *
	 * @param operation - The move operation to validate
	 * @returns A validation result object
	 */
	private validateParameters(operation: MoveOperation): ValidationResult {
		const errors: string[] = []
		const warnings: string[] = []
		const affectedFiles: string[] = []

		// Check if source file path is provided and valid
		if (!operation.selector.filePath || !operation.selector.filePath.trim()) {
			// Handle both undefined and empty string cases with the same error message
			// This matches what the tests expect
			errors.push("Source file path cannot be empty")
		} else {
			// Normalize path for validation and resolve to absolute path
			const normalizedSourcePath = this.pathResolver.normalizeFilePath(operation.selector.filePath)
			const absoluteSourcePath = this.pathResolver.resolveAbsolutePath(normalizedSourcePath)
			affectedFiles.push(normalizedSourcePath)

			// Verify file exists - check both normalized and absolute paths
			const sourceFileExists = fs.existsSync(normalizedSourcePath) || fs.existsSync(absoluteSourcePath)
			if (!sourceFileExists) {
				console.log(
					`[DEBUG] Source file check: normalized=${normalizedSourcePath}, absolute=${absoluteSourcePath}`,
				)
				console.log(
					`[DEBUG] File exists check: normalized=${fs.existsSync(normalizedSourcePath)}, absolute=${fs.existsSync(absoluteSourcePath)}`,
				)
				errors.push(`Source file does not exist: ${operation.selector.filePath}`)
			} else if (!normalizedSourcePath.endsWith(".ts") && !normalizedSourcePath.endsWith(".tsx")) {
				warnings.push(`Source file does not appear to be a TypeScript file: ${normalizedSourcePath}`)
			}
		}

		// Check if symbol name is provided and valid
		if (!operation.selector.name || !operation.selector.name.trim()) {
			// Handle both undefined and empty string cases with the same error message
			errors.push("Symbol name cannot be empty")
		} else if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(operation.selector.name)) {
			warnings.push(`Symbol name '${operation.selector.name}' may not be a valid TypeScript identifier`)
		}

		// Check if target file path is provided and valid
		if (!operation.targetFilePath || !operation.targetFilePath.trim()) {
			// Handle both undefined and empty string cases with the same error message
			errors.push("Target file path cannot be empty")
		} else {
			// Normalize path for validation and resolve to absolute path
			const normalizedTargetPath = this.pathResolver.normalizeFilePath(operation.targetFilePath)
			const absoluteTargetPath = this.pathResolver.resolveAbsolutePath(normalizedTargetPath)
			affectedFiles.push(normalizedTargetPath)

			// Check if moving to the same file (using both normalized and absolute paths)
			const normalizedSourcePath = this.pathResolver.normalizeFilePath(operation.selector.filePath)
			const absoluteSourcePath = this.pathResolver.resolveAbsolutePath(normalizedSourcePath)

			if (normalizedSourcePath === normalizedTargetPath || absoluteSourcePath === absoluteTargetPath) {
				errors.push("Cannot move symbol to the same file")
			}

			// Check file extension
			if (!normalizedTargetPath.endsWith(".ts") && !normalizedTargetPath.endsWith(".tsx")) {
				warnings.push(`Target file does not appear to be a TypeScript file: ${normalizedTargetPath}`)
			}

			// Verify target directory exists or is creatable
			const targetDir = path.dirname(normalizedTargetPath)
			if (!fs.existsSync(targetDir)) {
				try {
					// Check if we can create the directory (by testing parent directory write access)
					const parentDir = path.dirname(targetDir)
					if (!fs.existsSync(parentDir)) {
						warnings.push(`Target directory's parent does not exist: ${parentDir}`)
					}
				} catch (error) {
					warnings.push(`Cannot verify target directory: ${targetDir}, Error: ${(error as Error).message}`)
				}
			}
		}

		// If we have errors, fail the validation
		if (errors.length > 0) {
			return {
				success: false,
				error: errors.join("; "),
				affectedFiles: [...new Set(affectedFiles)],
				warnings,
			}
		}

		return {
			success: true,
			affectedFiles: [...new Set(affectedFiles)],
			warnings,
		}
	}

	/**
	 * Validates that the source file exists and can be loaded into the project.
	 *
	 * @param operation - The move operation containing the source file path
	 * @returns A validation result with the source file if successful
	 */
	private async validateSourceFile(operation: MoveOperation): Promise<ValidationResult> {
		const sourceFilePath = this.pathResolver.resolveAbsolutePath(
			this.pathResolver.normalizeFilePath(operation.selector.filePath),
		)
		const warnings: string[] = []

		// Implement retry logic for file access with exponential backoff
		const maxRetries = 3
		let retryCount = 0
		let lastError: Error | undefined

		while (retryCount <= maxRetries) {
			try {
				const sourceFile = await this.fileManager.ensureFileInProject(sourceFilePath)

				if (sourceFile) {
					// Success
					return {
						success: true,
						sourceFile,
						affectedFiles: [sourceFilePath],
						warnings,
					}
				}

				// If file wasn't found but no error was thrown, increment retry counter
				retryCount++

				if (retryCount <= maxRetries) {
					// Use exponential backoff for retries
					const delayMs = 100 * Math.pow(2, retryCount - 1)
					await new Promise((resolve) => setTimeout(resolve, delayMs))
				}
			} catch (error) {
				lastError = error as Error
				retryCount++

				if (retryCount <= maxRetries) {
					const delayMs = 100 * Math.pow(2, retryCount - 1)
					await new Promise((resolve) => setTimeout(resolve, delayMs))
				}
			}
		}

		// If we exhausted all retries, return a detailed error message
		return {
			success: false,
			error: `Source file not found after ${maxRetries} attempts: ${sourceFilePath}. ${
				lastError ? `Last error: ${lastError.message}` : ""
			}\nSuggestion: Verify the file exists and you have read permissions.`,
			affectedFiles: [sourceFilePath],
			warnings,
		}
	}

	/**
	 * Validates that the symbol exists in the source file and can be moved.
	 *
	 * @param operation - The move operation
	 * @param sourceFile - The source file containing the symbol
	 * @returns A validation result with the resolved symbol if successful
	 */
	private validateSymbol(operation: MoveOperation, sourceFile: SourceFile): ValidationResult {
		const warnings: string[] = []

		// Find the symbol
		const symbol = this.symbolResolver.resolveSymbol(operation.selector, sourceFile)
		if (!symbol) {
			return {
				success: false,
				error: `Symbol '${operation.selector.name}' not found in ${operation.selector.filePath}`,
				affectedFiles: [sourceFile.getFilePath()],
				warnings,
			}
		}

		// Validate if the symbol can be moved
		const validation = this.symbolResolver.validateForMove(symbol)
		if (!validation.canProceed) {
			return {
				success: false,
				error: validation.blockers.join(", "),
				affectedFiles: [symbol.filePath],
				warnings: [...warnings, ...validation.warnings],
			}
		}

		// Check if the content actually contains the symbol (sanity check)
		const sourceContent = sourceFile.getFullText()
		if (!sourceContent.includes(operation.selector.name)) {
			warnings.push(`Symbol '${operation.selector.name}' might not exist in source file, proceeding with caution`)
		}

		return {
			success: true,
			symbol,
			affectedFiles: [symbol.filePath],
			warnings,
		}
	}

	/**
	 * Validates that the target location is valid for receiving the moved symbol.
	 *
	 * @param operation - The move operation with target file path
	 * @returns A validation result
	 */
	private async validateTargetLocation(operation: MoveOperation): Promise<ValidationResult> {
		const warnings: string[] = []
		const targetFilePath = this.pathResolver.resolveAbsolutePath(
			this.pathResolver.normalizeFilePath(operation.targetFilePath),
		)

		// Verify target directory exists or can be created
		try {
			const targetDir = path.dirname(targetFilePath)
			if (!fs.existsSync(targetDir)) {
				// Check write permissions on parent directory
				const parentDir = path.dirname(targetDir)
				if (fs.existsSync(parentDir)) {
					try {
						// Test file write access on parent directory
						const testFilePath = path.join(parentDir, ".write-test-" + Date.now())
						fs.writeFileSync(testFilePath, "")
						fs.unlinkSync(testFilePath)
					} catch (error) {
						return {
							success: false,
							error: `Cannot create target directory due to permission issues: ${targetDir}. Suggestion: Check write permissions or use a different target location.`,
							affectedFiles: [targetFilePath],
							warnings,
						}
					}
				}
			}
		} catch (error) {
			warnings.push(`Error checking target directory: ${(error as Error).message}`)
		}

		// Check for potential naming conflicts in target file
		const potentialTargetFile = this.project.getSourceFile(targetFilePath)
		if (potentialTargetFile) {
			const potentialTargetContent = potentialTargetFile.getFullText()

			// Simple check for symbol with same name
			if (potentialTargetContent.includes(operation.selector.name)) {
				warnings.push(`Symbol with name '${operation.selector.name}' may already exist in target file`)
			}

			// Check for potential import conflicts
			const existingImports = potentialTargetFile.getImportDeclarations()
			const potentialConflicts = existingImports.filter((imp) =>
				imp.getNamedImports().some((named) => named.getName() === operation.selector.name),
			)

			if (potentialConflicts.length > 0) {
				warnings.push(`Potential import conflicts found in target file for '${operation.selector.name}'`)
			}
		}

		return {
			success: true,
			affectedFiles: [targetFilePath],
			warnings,
		}
	}
}
