import { Project } from "ts-morph"
import * as path from "path"
import { RefactorEngine, OperationResult } from "./engine"
import { MoveOperation, RemoveOperation, BatchOperations, RefactorOperation } from "./schema"

/**
 * Configuration options for the refactor API
 */
export interface RefactorApiOptions {
	/**
	 * Root path of the project
	 */
	projectRootPath?: string

	/**
	 * Path to the project's tsconfig.json file
	 */
	tsConfigPath?: string

	/**
	 * Whether to stop batch operations on error
	 */
	stopOnError?: boolean
}

/**
 * Options for the moveSymbol operation
 */
export interface MoveSymbolOptions {
	/**
	 * The kind of symbol to move (function, class, interface, etc.)
	 * @default "function"
	 */
	symbolKind?: "function" | "class" | "variable" | "type" | "interface" | "enum" | "method" | "property"

	/**
	 * A short reason for the move, useful for documentation
	 */
	reason?: string

	/**
	 * The signature hint to disambiguate overloaded functions
	 */
	signatureHint?: string
}

/**
 * Options for the removeSymbol operation
 */
export interface RemoveSymbolOptions {
	/**
	 * The kind of symbol to remove (function, class, interface, etc.)
	 * @default "function"
	 */
	symbolKind?: "function" | "class" | "variable" | "type" | "interface" | "enum" | "method" | "property"

	/**
	 * Whether to force remove the symbol even if it has external references
	 * @default false
	 */
	forceRemove?: boolean

	/**
	 * Whether to fall back to aggressive removal if standard removal fails
	 * @default false
	 */
	fallbackToAggressive?: boolean

	/**
	 * Whether to clean up dependencies that are no longer referenced
	 * @default true
	 */
	cleanupDependencies?: boolean

	/**
	 * A short reason for the removal, useful for documentation
	 */
	reason?: string

	/**
	 * The signature hint to disambiguate overloaded functions
	 */
	signatureHint?: string
}

/**
 * Result of a refactoring operation
 */
export interface RefactorResult {
	/**
	 * Whether the operation was successful
	 */
	success: boolean

	/**
	 * Error message if the operation failed
	 */
	error?: string

	/**
	 * List of files that were affected by the operation
	 */
	affectedFiles: string[]

	/**
	 * Additional diagnostic information
	 */
	diagnostics?: {
		/**
		 * The method used for removal (for remove operations)
		 */
		removalMethod?: "standard" | "aggressive" | "manual" | "failed"

		/**
		 * Warnings that didn't prevent the operation but might be relevant
		 */
		warnings?: string[]
	}
}

/**
 * Result of a batch refactoring operation
 */
export interface BatchRefactorResult {
	/**
	 * Whether the overall batch was successful
	 */
	success: boolean

	/**
	 * Error message if the batch failed
	 */
	error?: string

	/**
	 * Results of individual operations
	 */
	results: RefactorResult[]

	/**
	 * Total number of operations in the batch
	 */
	totalOperations: number

	/**
	 * Number of successful operations
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
 * and updating all references.
 *
 * @example
 * ```typescript
 * // Move a function
 * const result = await moveSymbol(
 *   'src/utils/helpers.ts',
 *   'formatDate',
 *   'src/utils/dateUtils.ts'
 * );
 *
 * // Move a class with options
 * const result = await moveSymbol(
 *   'src/components/Button.tsx',
 *   'ButtonProps',
 *   'src/types/components.ts',
 *   { symbolKind: 'interface', reason: 'Consolidate component types' }
 * );
 * ```
 *
 * @param sourceFile - Path to the file containing the symbol (relative to project root)
 * @param symbolName - Name of the symbol to move
 * @param targetFile - Path to the file where the symbol should be moved (relative to project root)
 * @param options - Additional options for the move operation
 * @param apiOptions - Configuration options for the refactor API
 * @returns A promise that resolves to the result of the move operation
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

		console.log(`[API] Moving symbol ${symbolName} from ${normalizedSourceFile} to ${normalizedTargetFile}`)

		// Execute the operation
		const result = await engine.executeOperation(moveOperation)

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
 * export statements appropriately.
 *
 * @example
 * ```typescript
 * // Remove a function
 * const result = await removeSymbol(
 *   'src/utils/helpers.ts',
 *   'unusedFunction'
 * );
 *
 * // Remove a class with options
 * const result = await removeSymbol(
 *   'src/components/OldComponent.tsx',
 *   'OldComponent',
 *   {
 *     symbolKind: 'class',
 *     forceRemove: true,
 *     reason: 'Component is deprecated'
 *   }
 * );
 * ```
 *
 * @param sourceFile - Path to the file containing the symbol (relative to project root)
 * @param symbolName - Name of the symbol to remove
 * @param options - Additional options for the remove operation
 * @param apiOptions - Configuration options for the refactor API
 * @returns A promise that resolves to the result of the remove operation
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
				cleanupDependencies: options?.cleanupDependencies !== false, // default to true
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
 * batch, with control over how errors are handled.
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
 * ```
 *
 * @param operations - Array of operations to perform
 * @param apiOptions - Configuration options for the refactor API
 * @returns A promise that resolves to the result of the batch operation
 */
export async function batchOperation(
	operations: Array<
		| { type: "move"; sourceFile: string; symbolName: string; targetFile: string; options?: MoveSymbolOptions }
		| { type: "remove"; sourceFile: string; symbolName: string; options?: RemoveSymbolOptions }
	>,
	apiOptions?: RefactorApiOptions,
): Promise<BatchRefactorResult> {
	console.log(`[API] Executing batch operation with ${operations.length} operations`)
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
						cleanupDependencies: op.options?.cleanupDependencies !== false, // default to true
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

		// Convert to the public result format
		return {
			success: result.success,
			error: result.error,
			results: result.results.map(convertToRefactorResult),
			totalOperations: result.allOperations.length,
			successfulOperations: result.results.filter((r) => r.success).length,
		}
	} catch (error) {
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
 * between sets of operations.
 */
export function resetRefactorApi(): void {
	_engineInstance = null
}
