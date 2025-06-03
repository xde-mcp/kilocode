import { Project } from "ts-morph"
import * as fs from "fs"
import * as path from "path"
import { MoveOperation } from "../schema"
import { OperationResult } from "../engine"
import { PathResolver } from "../utils/PathResolver"
import { MoveValidator } from "./MoveValidator"
import { MoveExecutor } from "./MoveExecutor"
import { MoveVerifier } from "./MoveVerifier"
import { normalizePathForTests } from "../__tests__/utils/test-utilities"

/**
 * Orchestrates the symbol move operation
 *
 * The MoveOrchestrator coordinates the process of moving a symbol from one file to another
 * by delegating to specialized components:
 *
 * 1. MoveValidator - validates the operation parameters and feasibility
 * 2. MoveExecutor - performs the actual symbol extraction, addition, and removal
 * 3. MoveVerifier - verifies the move was successful
 *
 * This delegation pattern improves maintainability by separating concerns and allowing
 * each component to focus on its specific responsibility.
 */
export class MoveOrchestrator {
	private pathResolver: PathResolver
	private validator: MoveValidator
	private executor: MoveExecutor
	private verifier: MoveVerifier

	/**
	 * Creates a new MoveOrchestrator instance.
	 *
	 * @param project - The ts-morph Project instance
	 * @param validator - Optional MoveValidator instance (will create one if not provided)
	 * @param executor - Optional MoveExecutor instance (will create one if not provided)
	 * @param verifier - Optional MoveVerifier instance (will create one if not provided)
	 */
	constructor(
		private project: Project,
		validator?: MoveValidator,
		executor?: MoveExecutor,
		verifier?: MoveVerifier,
	) {
		// Safely get compiler options, with fallbacks for tests
		const compilerOptions = project.getCompilerOptions() || {}
		const projectRoot = compilerOptions.rootDir || process.cwd()

		this.pathResolver = new PathResolver(projectRoot)

		// Use provided components or create new instances
		this.validator = validator || new MoveValidator(project)
		this.executor = executor || new MoveExecutor(project)
		this.verifier = verifier || new MoveVerifier(project)
	}

	/**
	 * Execute a MOVE refactoring operation
	 *
	 * This method orchestrates the entire process of moving a symbol from one file to another
	 * by delegating to specialized components in a simple flow:
	 * 1. Validate the operation parameters using MoveValidator
	 * 2. Execute the move using MoveExecutor
	 * 3. Verify the move was successful using MoveVerifier
	 *
	 * Each step provides detailed error reporting and the overall process maintains
	 * backward compatibility with the original implementation.
	 *
	 * @param operation - The move operation to execute
	 * @returns A promise that resolves to the result of the operation
	 */
	async executeMoveOperation(operation: MoveOperation): Promise<OperationResult> {
		// Normalize paths to use forward slashes for consistent cross-platform handling
		const normalizedSourcePath = operation.selector.filePath.replace(/\\/g, "/")
		const normalizedTargetPath = operation.targetFilePath.replace(/\\/g, "/")

		// Resolve absolute paths to ensure consistent path handling
		const sourceFilePath = this.pathResolver.resolveAbsolutePath(
			this.pathResolver.normalizeFilePath(normalizedSourcePath),
		)
		const targetFilePath = this.pathResolver.resolveAbsolutePath(
			this.pathResolver.normalizeFilePath(normalizedTargetPath),
		)
		const symbolName = operation.selector.name

		console.log(`[DEBUG] Executing move operation for symbol: ${symbolName} to ${operation.targetFilePath}`)

		try {
			// Step 1: Validate the operation
			console.log(`[DEBUG] Validating move operation`)
			const validationResult = await this.validator.validate(operation)

			if (!validationResult.success) {
				return {
					success: false,
					operation,
					error: validationResult.error || "Invalid move operation",
					affectedFiles: validationResult.affectedFiles || [],
				}
			}

			// Step 2: Execute the operation
			console.log(`[DEBUG] Executing move operation`)
			const executionResult = await this.executor.execute(
				operation,
				{
					symbol: validationResult.symbol!,
					sourceFile: validationResult.sourceFile!,
				},
				{ copyOnly: false },
			)

			if (!executionResult.success) {
				return {
					success: false,
					operation,
					error: executionResult.error || "Failed to execute move operation",
					affectedFiles: executionResult.affectedFiles || [sourceFilePath, targetFilePath],
				}
			}

			// Force save all files to disk to ensure changes are persisted
			this.project.saveSync()

			// Refresh all files from disk to ensure we're working with the latest state
			this.refreshProjectFiles()

			// Step 3: Verify the operation
			console.log(`[DEBUG] Verifying move operation`)
			const verificationResult = await this.verifier.verify(operation, executionResult, { copyOnly: false })

			// Return result based on verification
			if (verificationResult.success) {
				// Ensure we're including both the source and target file in affected files
				// Use the PathResolver to normalize all paths consistently
				const normalizedPaths = this.pathResolver.normalizeFilePaths([
					...executionResult.affectedFiles,
					sourceFilePath,
					targetFilePath,
				])

				const affectedFiles = new Set<string>(normalizedPaths)

				return {
					success: true,
					operation,
					affectedFiles: Array.from(affectedFiles).map(normalizePathForTests),
					removalMethod: "standard",
				}
			} else {
				return {
					success: false,
					operation,
					error: verificationResult.error || "Symbol move operation failed verification",
					// Make sure we include both source and target paths in affected files
					affectedFiles: Array.from(
						new Set(
							this.pathResolver.normalizeFilePaths([
								...executionResult.affectedFiles,
								sourceFilePath,
								targetFilePath,
							]),
						),
					).map(normalizePathForTests),
					removalMethod: "failed",
				}
			}
		} catch (error) {
			// Handle unexpected errors
			console.error(`[ERROR] Unexpected error during move operation: ${error}`)

			return {
				success: false,
				operation,
				error: `Unexpected error during move operation: ${(error as Error).message}`,
				affectedFiles: this.pathResolver
					.normalizeFilePaths([sourceFilePath, targetFilePath])
					.map(normalizePathForTests),
			}
		}
	}

	/**
	 * Refreshes all source files in the project
	 * This is important for tests that verify file content on disk
	 */
	private refreshProjectFiles(): void {
		this.project.getSourceFiles().forEach((file) => {
			try {
				file.refreshFromFileSystemSync()
			} catch (e) {
				// Ignore refresh errors
			}
		})
	}
}
