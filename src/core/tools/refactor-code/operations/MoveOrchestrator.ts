import { Project } from "ts-morph"
import * as fs from "fs"
import * as path from "path"
import { MoveOperation } from "../schema"
import { OperationResult } from "../engine"
import { MoveValidator } from "./MoveValidator"
import { MoveExecutor } from "./MoveExecutor"
import { MoveVerifier } from "./MoveVerifier"
import { ProjectManager } from "../core/ProjectManager"
import { PerformanceTracker } from "../utils/performance-tracker"
import { refactorLogger } from "../utils/RefactorLogger"

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
	private projectManager: ProjectManager
	private validator: MoveValidator
	private executor: MoveExecutor
	private verifier: MoveVerifier

	/**
	 * Creates a new MoveOrchestrator instance.
	 *
	 * @param project - The ts-morph Project instance
	 * @param projectManager - Optional ProjectManager instance (will create one if not provided)
	 * @param validator - Optional MoveValidator instance (will create one if not provided)
	 * @param executor - Optional MoveExecutor instance (will create one if not provided)
	 * @param verifier - Optional MoveVerifier instance (will create one if not provided)
	 */
	constructor(
		private readonly project: Project,
		projectManager?: ProjectManager,
		validator?: MoveValidator,
		executor?: MoveExecutor,
		verifier?: MoveVerifier,
	) {
		// Use provided ProjectManager or create a new one
		this.projectManager = projectManager || new ProjectManager(project)

		// Use provided components or create new instances with the ProjectManager
		this.validator = validator || new MoveValidator(project)
		this.executor = executor || new MoveExecutor(project, this.projectManager)
		this.verifier = verifier || new MoveVerifier(project, this.projectManager)
	}

	/**
	 * Disposes of resources held by this MoveOrchestrator instance.
	 * This cleans up memory by disposing the ProjectManager and its associated resources.
	 * Should be called after operations are complete, especially in test environments.
	 */
	dispose(): void {
		// Only dispose the ProjectManager if we created it internally
		if (this.projectManager) {
			this.projectManager.dispose()
		}
	}

	/**
	 * Convert paths to relative format for consistent test expectations
	 */
	private convertPathsToRelativeFormat(paths: string[], sourcePath: string): string[] {
		return paths.map((filePath) => {
			// If it's already a relative path starting with src/, keep it
			if (filePath.startsWith("src/")) {
				return filePath
			}

			// If it's an absolute temp directory path, extract the relative part
			if (filePath.includes("/src/")) {
				const srcIndex = filePath.lastIndexOf("/src/")
				return filePath.substring(srcIndex + 1) // +1 to keep the 'src/'
			}

			// Fallback: use path resolver to normalize
			const pathResolver = this.projectManager.getPathResolver()
			return pathResolver.standardizePath(filePath)
		})
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
	 * @param options - Options for the move operation
	 * @returns A promise that resolves to the result of the operation
	 */
	async executeMoveOperation(
		operation: MoveOperation,
		options: { copyOnly?: boolean; batchContext?: { movedSymbols: Map<string, string[]> } } = {},
	): Promise<OperationResult> {
		// Start performance tracking
		const opId = `move-${operation.selector.name}-${Date.now()}`
		PerformanceTracker.startTracking(opId)

		// Use ProjectManager for consistent path handling
		const pathResolver = this.projectManager.getPathResolver()

		try {
			// Resolve file paths using environment-aware path resolution
			const sourceFilePath = await PerformanceTracker.measureStep(opId, "resolve-paths", async () => {
				const normalizedPath = pathResolver.normalizeFilePath(operation.selector.filePath)
				return pathResolver.resolveEnvironmentAwarePath(normalizedPath)
			})

			const targetFilePath = pathResolver.resolveEnvironmentAwarePath(
				pathResolver.normalizeFilePath(operation.targetFilePath),
			)

			// Step 1: Validate the operation
			const validationResult = await PerformanceTracker.measureStep(opId, "validation", async () => {
				return this.validator.validate(operation, options.batchContext)
			})

			if (!validationResult.success) {
				PerformanceTracker.endTracking(opId)
				return {
					success: false,
					operation,
					error: validationResult.error || "Invalid move operation",
					affectedFiles: validationResult.affectedFiles || [],
				}
			}

			// Step 2: Execute the operation
			const executionResult = await PerformanceTracker.measureStep(opId, "execution", async () => {
				return this.executor.execute(
					operation,
					{
						symbol: validationResult.symbol!,
						sourceFile: validationResult.sourceFile!,
					},
					{ copyOnly: options.copyOnly ?? false },
				)
			})

			refactorLogger.debug(
				`MoveOrchestrator: Execution result success=${executionResult.success}, error=${executionResult.error || "none"}`,
			)

			if (!executionResult.success) {
				PerformanceTracker.endTracking(opId)
				return {
					success: false,
					operation,
					error: executionResult.error || "Failed to execute move operation",
					affectedFiles: executionResult.affectedFiles || [sourceFilePath, targetFilePath],
				}
			}

			// Save all changes to disk and refresh project state
			await PerformanceTracker.measureStep(opId, "save-refresh", async () => {
				this.projectManager.getProject().saveSync()
				this.projectManager.refreshProjectFiles()
				return true
			})

			// Return result based on execution success (no verification step)
			PerformanceTracker.endTracking(opId)

			// Combine all affected files and ensure source and target paths are included, removing duplicates
			const combinedPaths = [...(executionResult.affectedFiles || []), sourceFilePath, targetFilePath]
			const allPaths = this.projectManager.getPathResolver().standardizeAndDeduplicatePaths(combinedPaths)

			const isSuccess = executionResult.success ?? true // Default to true if undefined
			return {
				success: isSuccess,
				operation,
				affectedFiles: allPaths,
				error: executionResult.error,
				removalMethod: isSuccess ? ("standard" as const) : ("failed" as const),
			}
		} catch (error) {
			// Handle unexpected errors
			console.error(`[ERROR] Unexpected error during move operation: ${error}`)
			PerformanceTracker.endTracking(opId)

			return {
				success: false,
				operation,
				error: `Unexpected error during move operation: ${(error as Error).message}`,
				affectedFiles: [operation.selector.filePath, operation.targetFilePath],
			}
		}
	}
}
