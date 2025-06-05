import { Project } from "ts-morph"
import * as path from "path"
import { RefactorEngine, OperationResult } from "./engine"
import { MoveOperation, RemoveOperation, BatchOperations, RefactorOperation } from "./schema"
import { refactorLogger } from "./utils/RefactorLogger"

/**
 * Configuration options for the refactor API
 *
 * These options control the behavior of the refactoring operations
 * and are passed to the underlying RefactorEngine.
 */
export interface RefactorApiOptions {
	/**
	 * Root path of the project
	 *
	 * This is used as the base directory for resolving relative paths.
	 * If not provided, the current working directory is used.
	 */
	projectRootPath?: string

	/**
	 * Path to the project's tsconfig.json file
	 *
	 * If not provided, it will look for tsconfig.json in the project root.
	 */
	tsConfigPath?: string

	/**
	 * Whether to stop batch operations on error
	 *
	 * If true (default), batch operations will stop on the first error.
	 * If false, batch operations will attempt to complete all operations
	 * even if some fail.
	 */
	stopOnError?: boolean
}

/**
 * Options for the moveSymbol operation
 *
 * These options provide additional control over how symbols are moved
 * between files.
 */
export interface MoveSymbolOptions {
	/**
	 * The kind of symbol to move (function, class, interface, etc.)
	 *
	 * This is used to disambiguate symbols with the same name but different kinds.
	 * For example, a variable and a function with the same name.
	 *
	 * @default "function"
	 */
	symbolKind?: "function" | "class" | "variable" | "type" | "interface" | "enum" | "method" | "property"

	/**
	 * A short reason for the move, useful for documentation
	 *
	 * This is included in logs and operation results to provide context
	 * for why the refactoring was performed.
	 */
	reason?: string

	/**
	 * The signature hint to disambiguate overloaded functions
	 *
	 * For overloaded functions, provide a portion of the function signature
	 * to identify which overload to move. For example, "(date: Date): string".
	 */
	signatureHint?: string
}

/**
 * Options for the removeSymbol operation
 *
 * These options provide additional control over how symbols are removed
 * from files, including handling of external references and cleanup.
 */
export interface RemoveSymbolOptions {
	/**
	 * The kind of symbol to remove (function, class, interface, etc.)
	 *
	 * This is used to disambiguate symbols with the same name but different kinds.
	 * For example, a variable and a function with the same name.
	 *
	 * @default "function"
	 */
	symbolKind?: "function" | "class" | "variable" | "type" | "interface" | "enum" | "method" | "property"

	/**
	 * Whether to force remove the symbol even if it has external references
	 *
	 * WARNING: Setting this to true can break code that depends on the removed symbol.
	 * Use with caution, especially for public APIs.
	 *
	 * @default false
	 */
	forceRemove?: boolean

	/**
	 * Whether to fall back to aggressive removal if standard removal fails
	 *
	 * Aggressive removal uses pattern matching and may affect code structure,
	 * but can succeed in cases where the standard AST-based removal fails.
	 *
	 * @default false
	 */
	fallbackToAggressive?: boolean

	/**
	 * Whether to clean up dependencies that are no longer referenced
	 *
	 * When true, the operation will attempt to remove imports that are
	 * no longer needed after the symbol is removed.
	 *
	 * @default true
	 */
	cleanupDependencies?: boolean

	/**
	 * A short reason for the removal, useful for documentation
	 *
	 * This is included in logs and operation results to provide context
	 * for why the refactoring was performed.
	 */
	reason?: string

	/**
	 * The signature hint to disambiguate overloaded functions
	 *
	 * For overloaded functions, provide a portion of the function signature
	 * to identify which overload to remove. For example, "(date: Date): string".
	 */
	signatureHint?: string
}

/**
 * Result of a refactoring operation
 *
 * This interface provides detailed information about the result of a
 * refactoring operation, including success/failure status, affected files,
 * and diagnostic information.
 */
export interface RefactorResult {
	/**
	 * Whether the operation was successful
	 *
	 * A value of true indicates the operation completed without critical errors.
	 * Even successful operations may include warnings in the diagnostics field.
	 */
	success: boolean

	/**
	 * Error message if the operation failed
	 *
	 * This provides a human-readable description of what went wrong.
	 * For more detailed information, check the diagnostics field.
	 */
	error?: string

	/**
	 * List of files that were affected by the operation
	 *
	 * This includes:
	 * - The source file where the symbol was modified/removed
	 * - The target file for move operations
	 * - Any files where imports were updated
	 */
	affectedFiles: string[]

	/**
	 * Additional diagnostic information
	 *
	 * This provides more detailed information about the operation,
	 * including warnings and the removal method used.
	 */
	diagnostics?: {
		/**
		 * The method used for removal (for remove operations)
		 *
		 * - "standard": Normal AST-based removal (preferred)
		 * - "aggressive": Pattern-based removal (fallback)
		 * - "manual": Guided manual removal (complex cases)
		 * - "failed": Removal attempt that could not complete
		 */
		removalMethod?: "standard" | "aggressive" | "manual" | "failed"

		/**
		 * Warnings that didn't prevent the operation but might be relevant
		 *
		 * These may include information about potential issues or edge cases
		 * that were encountered during the operation.
		 */
		warnings?: string[]
	}
}

/**
 * Result of a batch refactoring operation
 *
 * This interface provides detailed information about the result of a
 * batch of refactoring operations, including individual operation results
 * and overall success/failure status.
 */
export interface BatchRefactorResult {
	/**
	 * Whether the overall batch was successful
	 *
	 * A value of true indicates all operations completed successfully.
	 * If stopOnError is false, the batch can still complete with some
	 * failed operations (check successfulOperations).
	 */
	success: boolean

	/**
	 * Error message if the batch failed
	 *
	 * This provides a high-level error message for the batch.
	 * For detailed errors of individual operations, check the results array.
	 */
	error?: string

	/**
	 * Results of individual operations
	 *
	 * This array contains the results of each operation in the batch,
	 * in the same order as they were specified in the input.
	 */
	results: RefactorResult[]

	/**
	 * Total number of operations in the batch
	 *
	 * This is the total number of operations that were attempted.
	 */
	totalOperations: number

	/**
	 * Number of successful operations
	 *
	 * This is the number of operations that completed successfully.
	 * If stopOnError is true, this will be either totalOperations or
	 * the index of the first failed operation.
	 */
	successfulOperations: number
}

// Keep a singleton instance of the engine for repeated operations
let _engineInstance: RefactorEngine | null = null

/**
 * Get or create a RefactorEngine instance
 * @param options - Options to configure the engine
 * @returns A RefactorEngine instance
 */
function getRefactorEngine(options?: RefactorApiOptions): RefactorEngine {
	if (_engineInstance) {
		return _engineInstance
	}

	const projectRootPath = options?.projectRootPath || process.cwd()

	_engineInstance = new RefactorEngine({
		projectRootPath,
		tsConfigPath: options?.tsConfigPath || path.join(projectRootPath, "tsconfig.json"),
		stopOnError: options?.stopOnError !== undefined ? options?.stopOnError : true,
	})

	return _engineInstance
}

/**
 * Converts an internal OperationResult to the public RefactorResult format
 */
function convertToRefactorResult(result: OperationResult): RefactorResult {
	return {
		success: result.success,
		error: result.error,
		affectedFiles: result.affectedFiles || [],
		diagnostics: result.removalMethod
			? {
					removalMethod: result.removalMethod,
					warnings: [
						...(result.warnings || []),
						...(result.removalMethod !== "standard"
							? ["Symbol was removed using a non-standard method which may affect code structure"]
							: []),
					],
				}
			: result.warnings && result.warnings.length > 0
				? { warnings: result.warnings }
				: undefined,
	}
}

/**
 * Move a symbol from one file to another
 *
 * This function provides a simple interface to move TypeScript symbols (functions,
 * classes, interfaces, etc.) between files while maintaining their functionality
 * and updating all references. It handles the complex process of:
 *
 * 1. Extracting the symbol and its dependencies from the source file
 * 2. Adding the symbol to the target file with proper formatting
 * 3. Removing the symbol from the source file
 * 4. Updating imports across the project to reflect the new location
 * 5. Validating the operation to ensure it completed successfully
 *
 * @example
 * ```typescript
 * // Simple move operation
 * const result = await moveSymbol(
 *   'src/utils/helpers.ts',
 *   'formatDate',
 *   'src/utils/dateUtils.ts'
 * );
 *
 * // Move with additional options
 * const result = await moveSymbol(
 *   'src/components/Button.tsx',
 *   'ButtonProps',
 *   'src/types/components.ts',
 *   {
 *     symbolKind: 'interface',
 *     reason: 'Consolidate component types',
 *     signatureHint: '{color?: string}' // For disambiguation
 *   }
 * );
 *
 * // Error handling
 * if (!result.success) {
 *   console.error(`Failed to move symbol: ${result.error}`);
 *   // Handle errors as appropriate for your application
 * } else {
 *   console.log(`Successfully moved symbol to ${result.affectedFiles[1]}`);
 *   // Check for warnings
 *   if (result.diagnostics?.warnings?.length) {
 *     console.warn('Operation completed with warnings:', result.diagnostics.warnings);
 *   }
 * }
 * ```
 *
 * @param sourceFile - Path to the file containing the symbol (relative to project root)
 * @param symbolName - Name of the symbol to move
 * @param targetFile - Path to the file where the symbol should be moved (relative to project root)
 * @param options - Additional options for the move operation
 * @param apiOptions - Configuration options for the refactor API
 * @returns A promise that resolves to the result of the move operation, including success status, affected files, and diagnostic information
 */
export async function moveSymbol(
	sourceFile: string,
	symbolName: string,
	targetFile: string,
	options?: MoveSymbolOptions,
	apiOptions?: RefactorApiOptions,
): Promise<RefactorResult> {
	try {
		const engine = getRefactorEngine(apiOptions)

		// Normalize paths - this is critical for integration tests
		const normalizedSourceFile = path.isAbsolute(sourceFile)
			? sourceFile
			: path.resolve(engine.getProjectRoot(), sourceFile)

		const normalizedTargetFile = path.isAbsolute(targetFile)
			? targetFile
			: path.resolve(engine.getProjectRoot(), targetFile)

		// Construct the move operation
		const moveOperation: MoveOperation = {
			operation: "move",
			selector: {
				type: "identifier",
				name: symbolName,
				kind: options?.symbolKind || "function",
				filePath: normalizedSourceFile,
				signatureHint: options?.signatureHint,
			},
			targetFilePath: normalizedTargetFile,
			reason: options?.reason,
		}

		refactorLogger.operationStart(`Move Symbol: ${symbolName}`, {
			sourceFile: normalizedSourceFile,
			targetFile: normalizedTargetFile,
			symbolKind: options?.symbolKind || "function",
		})

		// Show the output channel so user can see the operation progress
		refactorLogger.show()

		// Execute the operation
		const result = await engine.executeOperation(moveOperation)

		if (result.success) {
			refactorLogger.operationSuccess(`Move Symbol: ${symbolName}`, {
				affectedFiles: result.affectedFiles,
			})
		} else {
			refactorLogger.operationFailure(`Move Symbol: ${symbolName}`, result.error)
		}

		// Convert to the public result format
		return convertToRefactorResult(result)
	} catch (error) {
		return {
			success: false,
			error: `Failed to move symbol: ${(error as Error).message}`,
			affectedFiles: [],
		}
	}
}

/**
 * Remove a symbol from a file
 *
 * This function provides a simple interface to safely remove TypeScript symbols
 * (functions, classes, interfaces, etc.) from files, handling dependencies and
 * export statements appropriately. It implements multiple removal strategies and
 * includes validation to prevent breaking changes. The process includes:
 *
 * 1. Validating that the symbol can be safely removed
 * 2. Checking for external references to prevent breaking changes
 * 3. Removing the symbol with appropriate handling of exports
 * 4. Cleaning up related dependencies if requested
 * 5. Verifying the removal was successful
 *
 * @example
 * ```typescript
 * // Basic removal
 * const result = await removeSymbol(
 *   'src/utils/helpers.ts',
 *   'unusedFunction'
 * );
 *
 * // Removal with options
 * const result = await removeSymbol(
 *   'src/components/OldComponent.tsx',
 *   'OldComponent',
 *   {
 *     symbolKind: 'class',
 *     forceRemove: true,
 *     fallbackToAggressive: true,
 *     cleanupDependencies: true,
 *     reason: 'Component is deprecated'
 *   }
 * );
 *
 * // Error handling
 * if (!result.success) {
 *   if (result.error?.includes('external reference')) {
 *     console.error('Cannot remove symbol with external references');
 *     // Handle external reference error
 *   } else {
 *     console.error(`Failed to remove symbol: ${result.error}`);
 *   }
 * } else {
 *   console.log(`Successfully removed symbol from ${result.affectedFiles[0]}`);
 *   // Check the removal method
 *   if (result.diagnostics?.removalMethod && result.diagnostics.removalMethod !== 'standard') {
 *     console.warn(`Used ${result.diagnostics.removalMethod} removal method`);
 *   }
 * }
 * ```
 *
 * @param sourceFile - Path to the file containing the symbol (relative to project root)
 * @param symbolName - Name of the symbol to remove
 * @param options - Additional options for the remove operation
 * @param apiOptions - Configuration options for the refactor API
 * @returns A promise that resolves to the result of the remove operation, including success status, affected files, and diagnostic information
 */
export async function removeSymbol(
	sourceFile: string,
	symbolName: string,
	options?: RemoveSymbolOptions,
	apiOptions?: RefactorApiOptions,
): Promise<RefactorResult> {
	try {
		const engine = getRefactorEngine(apiOptions)

		// Normalize paths - this is critical for integration tests
		const normalizedSourceFile = path.isAbsolute(sourceFile)
			? sourceFile
			: path.resolve(engine.getProjectRoot(), sourceFile)

		// Construct the remove operation
		const removeOperation: RemoveOperation = {
			operation: "remove",
			selector: {
				type: "identifier",
				name: symbolName,
				kind: options?.symbolKind || "function",
				filePath: normalizedSourceFile,
				signatureHint: options?.signatureHint,
			},
			reason: options?.reason,
			options: {
				forceRemove: options?.forceRemove || false,
				fallbackToAggressive: options?.fallbackToAggressive || false,
				cleanupDependencies: options?.cleanupDependencies === true, // default to false for now due to AST node access issues
			},
		}

		console.log(`[API] Removing symbol ${symbolName} from ${normalizedSourceFile}`)

		// Execute the operation
		const result = await engine.executeOperation(removeOperation)

		console.log(`[API] Remove operation result: ${result.success ? "Success" : "Failure"}`)
		if (!result.success) {
			console.error(`[API] Error: ${result.error}`)
		}

		// Convert to the public result format
		return convertToRefactorResult(result)
	} catch (error) {
		return {
			success: false,
			error: `Failed to remove symbol: ${(error as Error).message}`,
			affectedFiles: [],
		}
	}
}

/**
 * Execute a batch of refactoring operations
 *
 * This function allows you to perform multiple refactoring operations as a single
 * batch, with control over how errors are handled. Batch operations provide several
 * advantages:
 *
 * 1. Better performance by reusing the same project instance
 * 2. Atomic transactions with all-or-nothing behavior when stopOnError is true
 * 3. Simplified error handling with aggregated results
 * 4. Better organization of related refactoring tasks
 *
 * @example
 * ```typescript
 * // Batch multiple operations
 * const result = await batchOperation([
 *   {
 *     type: 'move',
 *     sourceFile: 'src/utils/helpers.ts',
 *     symbolName: 'formatDate',
 *     targetFile: 'src/utils/dateUtils.ts',
 *     options: { symbolKind: 'function' }
 *   },
 *   {
 *     type: 'remove',
 *     sourceFile: 'src/components/OldComponent.tsx',
 *     symbolName: 'OldComponent',
 *     options: { symbolKind: 'class', forceRemove: true }
 *   }
 * ], { stopOnError: false });
 *
 * // Error handling for batch operations
 * if (!result.success) {
 *   console.error(`Batch operation failed: ${result.error}`);
 *   console.log(`Completed ${result.successfulOperations} of ${result.totalOperations} operations`);
 *
 *   // Examine individual operation results
 *   result.results.forEach((opResult, index) => {
 *     if (!opResult.success) {
 *       console.error(`Operation ${index + 1} failed: ${opResult.error}`);
 *     }
 *   });
 * } else {
 *   console.log(`All ${result.totalOperations} operations completed successfully`);
 *
 *   // List all affected files
 *   const allAffectedFiles = new Set<string>();
 *   result.results.forEach(opResult => {
 *     opResult.affectedFiles.forEach(file => allAffectedFiles.add(file));
 *   });
 *   console.log(`Affected files: ${Array.from(allAffectedFiles).join(', ')}`);
 * }
 * ```
 *
 * @param operations - Array of operations to perform
 * @param apiOptions - Configuration options for the refactor API
 * @returns A promise that resolves to the result of the batch operation, including individual operation results and overall success status
 */
export async function batchOperation(
	operations: Array<
		| { type: "move"; sourceFile: string; symbolName: string; targetFile: string; options?: MoveSymbolOptions }
		| { type: "remove"; sourceFile: string; symbolName: string; options?: RemoveSymbolOptions }
	>,
	apiOptions?: RefactorApiOptions,
): Promise<BatchRefactorResult> {
	refactorLogger.operationStart(`Batch Refactor Operations`, {
		operationCount: operations.length,
	})
	refactorLogger.show()
	try {
		const engine = getRefactorEngine(apiOptions)

		// Convert the simplified operations to the internal format
		const refactorOperations: RefactorOperation[] = operations.map((op) => {
			if (op.type === "move") {
				// Normalize paths
				const engine = getRefactorEngine(apiOptions)
				const normalizedSourceFile = path.isAbsolute(op.sourceFile)
					? op.sourceFile
					: path.resolve(engine.getProjectRoot(), op.sourceFile)

				const normalizedTargetFile = path.isAbsolute(op.targetFile)
					? op.targetFile
					: path.resolve(engine.getProjectRoot(), op.targetFile)

				return {
					operation: "move",
					selector: {
						type: "identifier",
						name: op.symbolName,
						kind: op.options?.symbolKind || "function",
						filePath: normalizedSourceFile,
						signatureHint: op.options?.signatureHint,
					},
					targetFilePath: normalizedTargetFile,
					reason: op.options?.reason,
				} as MoveOperation
			} else {
				// Normalize path
				const engine = getRefactorEngine(apiOptions)
				const normalizedSourceFile = path.isAbsolute(op.sourceFile)
					? op.sourceFile
					: path.resolve(engine.getProjectRoot(), op.sourceFile)

				return {
					operation: "remove",
					selector: {
						type: "identifier",
						name: op.symbolName,
						kind: op.options?.symbolKind || "function",
						filePath: normalizedSourceFile,
						signatureHint: op.options?.signatureHint,
					},
					reason: op.options?.reason,
					options: {
						forceRemove: op.options?.forceRemove || false,
						fallbackToAggressive: op.options?.fallbackToAggressive || false,
						cleanupDependencies: op.options?.cleanupDependencies === true, // default to false for now due to AST node access issues
					},
				} as RemoveOperation
			}
		})

		// Create the batch operations object
		const batchOps: BatchOperations = {
			operations: refactorOperations,
			options: {
				stopOnError: apiOptions?.stopOnError !== undefined ? apiOptions.stopOnError : true,
			},
		}

		// Execute the batch
		const result = await engine.executeBatch(batchOps)

		// Log the result
		const successfulCount = result.results.filter((r) => r.success).length
		if (result.success) {
			refactorLogger.operationSuccess(`Batch Refactor Operations`, {
				totalOperations: result.allOperations.length,
				successfulOperations: successfulCount,
			})
		} else {
			refactorLogger.operationFailure(`Batch Refactor Operations`, result.error)
		}

		// Convert to the public result format
		return {
			success: result.success,
			error: result.error,
			results: result.results.map(convertToRefactorResult),
			totalOperations: result.allOperations.length,
			successfulOperations: successfulCount,
		}
	} catch (error) {
		refactorLogger.operationFailure(`Batch Refactor Operations`, error)
		return {
			success: false,
			error: `Failed to execute batch operation: ${(error as Error).message}`,
			results: [],
			totalOperations: operations.length,
			successfulOperations: 0,
		}
	}
}

/**
 * Reset the refactor API, clearing any cached engine instances
 *
 * This is primarily useful for testing or when you need to change configuration
 * between sets of operations. In normal usage, the singleton engine instance
 * provides better performance by reusing the same project.
 *
 * @example
 * ```typescript
 * // Change project root between operations
 * await moveSymbol('src/utils/helpers.ts', 'formatDate', 'src/utils/dateUtils.ts');
 *
 * // Reset the API to use a different project
 * resetRefactorApi();
 *
 * // Now use a different project root
 * await moveSymbol('lib/common/utils.ts', 'parseConfig', 'lib/config/parser.ts',
 *   undefined, { projectRootPath: '/different/project' });
 * ```
 */
export function resetRefactorApi(): void {
	_engineInstance = null
}
