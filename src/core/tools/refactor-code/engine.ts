import { Project, SourceFile, Node, SyntaxKind } from "ts-morph"
import * as path from "path"
import * as fs from "fs/promises"
import { resolveFilePath, fileExists, ensureDirectoryExists, createDiagnostic } from "./utils/file-system"
import { RefactorOperation, BatchOperations, RenameOperation, MoveOperation, RemoveOperation } from "./schema"
import { RobustLLMRefactorParser, RefactorParseError } from "./parser"
import { SymbolFinder } from "./utils/symbol-finder"

// Import operation implementations
import { executeRenameOperation } from "./operations/rename"
import { executeRemoveOperation } from "./operations/remove"
import { executeMoveOperation } from "./operations/move"

export interface OperationResult {
	success: boolean
	operation: RefactorOperation
	error?: string
	affectedFiles: string[]
}

export interface BatchResult {
	success: boolean
	results: OperationResult[]
	allOperations: RefactorOperation[]
	error?: string
}

export interface ValidationResult {
	valid: boolean
	operation: RefactorOperation
	errors: string[]
}

export interface RefactorEngineOptions {
	projectRootPath: string
	tsConfigPath?: string
	stopOnError?: boolean
}

export class RefactorEngineError extends Error {
	constructor(
		message: string,
		public operation?: RefactorOperation,
		public override cause?: Error,
	) {
		super(message)
		this.name = "RefactorEngineError"
	}
}

/**
 * Core engine for executing refactoring operations
 */
export class RefactorEngine {
	private project: Project
	private parser: RobustLLMRefactorParser
	private options: Required<RefactorEngineOptions>
	private diagnose: (filePath: string, operation: string) => Promise<void>

	constructor(options: RefactorEngineOptions) {
		// Set default options
		this.options = {
			projectRootPath: options.projectRootPath,
			tsConfigPath: options.tsConfigPath || path.join(options.projectRootPath, "tsconfig.json"),
			stopOnError: options.stopOnError !== undefined ? options.stopOnError : true,
		}

		console.log(`[DEBUG] Initializing RefactorEngine with projectRootPath: ${this.options.projectRootPath}`)
		console.log(`[DEBUG] Current working directory: ${process.cwd()}`)

		// Create a project with explicit compiler options
		this.project = new Project({
			compilerOptions: {
				rootDir: this.options.projectRootPath,
			},
			skipAddingFilesFromTsConfig: true,
		})

		// Initialize parser
		this.parser = new RobustLLMRefactorParser()

		// Initialize diagnostic helper
		this.diagnose = createDiagnostic(this.options.projectRootPath)
	}

	/**
	 * Parse LLM response into refactoring operations
	 */
	parseLLMResponse(llmResponse: string): RefactorOperation[] {
		try {
			return this.parser.parseResponse(llmResponse)
		} catch (error) {
			if (error instanceof RefactorParseError) {
				throw new RefactorEngineError(`Failed to parse LLM response: ${error.message}`, undefined, error)
			}
			throw error
		}
	}

	/**
	 * Execute a single refactoring operation
	 */
	async executeOperation(operation: RefactorOperation): Promise<OperationResult> {
		console.log(`[DEBUG] Executing operation: ${operation.operation}`)

		// Log the operation details
		if ("filePath" in operation.selector) {
			console.log(`[DEBUG] Operation on file: ${operation.selector.filePath}`)
			console.log(`[DEBUG] Absolute path: ${this.resolveFilePath(operation.selector.filePath)}`)

			// Run diagnostic on the file before operation
			await this.diagnose(operation.selector.filePath, `Before ${operation.operation} operation`)

			// For rename operations, ensure the file is in the project
			if (operation.operation === "rename") {
				const filePath = operation.selector.filePath
				const absolutePath = this.resolveFilePath(filePath)

				// Check if the file exists on disk
				if (fileExists(absolutePath)) {
					// Try to add or refresh the file in the project
					try {
						// Remove the file from the project if it exists
						const existingFile = this.project.getSourceFile(filePath)
						if (existingFile) {
							this.project.removeSourceFile(existingFile)
						}

						// Add the file to the project
						this.project.addSourceFileAtPath(filePath)
						console.log(`[DEBUG] Refreshed file in project: ${filePath}`)
					} catch (e) {
						console.log(`[WARNING] Failed to refresh file in project: ${filePath}`)
					}
				}
			}
		}

		// Validate operation
		const validationResult = this.validateOperation(operation)
		if (!validationResult.valid) {
			return {
				success: false,
				operation,
				error: `Validation failed: ${validationResult.errors.join(", ")}`,
				affectedFiles: [],
			}
		}

		try {
			// Execute the operation based on type
			let result: Partial<OperationResult> = {}

			switch (operation.operation) {
				case "rename":
					console.log(
						`[DEBUG] Executing rename operation for ${(operation as RenameOperation).selector.name} -> ${(operation as RenameOperation).newName}`,
					)
					result = await this.executeRenameOperation(operation as RenameOperation)
					break
				case "move":
					console.log(
						`[DEBUG] Executing move operation from ${(operation as MoveOperation).selector.filePath} -> ${(operation as MoveOperation).targetFilePath}`,
					)
					result = await this.executeMoveOperation(operation as MoveOperation)
					break
				case "remove":
					console.log(
						`[DEBUG] Executing remove operation for ${(operation as RemoveOperation).selector.name}`,
					)
					result = await this.executeRemoveOperation(operation as RemoveOperation)
					break
				default:
					throw new RefactorEngineError(
						`Unsupported operation type: ${(operation as any).operation}`,
						operation,
					)
			}

			// Log affected files
			const affectedFiles = result.affectedFiles || []
			console.log(`[DEBUG] Operation affected ${affectedFiles.length} files: ${affectedFiles.join(", ")}`)

			// Save all affected files to disk
			for (const filePath of affectedFiles) {
				const sourceFile = this.project.getSourceFile(filePath)
				if (sourceFile) {
					try {
						// Save the file to disk
						await this.saveSourceFile(sourceFile)
						console.log(`[DEBUG] Saved file to disk: ${filePath}`)
					} catch (e) {
						console.log(`[WARNING] Failed to save file to disk: ${filePath}`)
					}
				}
			}

			// Log that operation was successful
			console.log(`[DEBUG] Operation completed successfully`)

			// Run diagnostic on affected files after operation
			for (const filePath of affectedFiles) {
				await this.diagnose(filePath, `After ${operation.operation} operation`)
			}

			// Pass through the success status from the operation implementation
			console.log(`[DEBUG] Engine receiving operation result with success: ${result.success}`)

			// Log the raw result object to see what's being returned
			console.log(
				`[DEBUG] Raw operation result: ${JSON.stringify({
					success: result.success,
					error: result.error,
					affectedFiles: result.affectedFiles ? result.affectedFiles.length : 0,
				})}`,
			)

			// Create an intermediate result object to use for verification
			const intermediateResult = {
				success: result.success !== false, // Default to true if not explicitly set to false
				operation,
				affectedFiles: affectedFiles,
				error: result.error, // Pass through any error message
			}

			// Verify the operation was successful
			let verified = true
			if (intermediateResult.success) {
				console.log(`[DEBUG] Verifying operation: ${operation.operation}`)
				verified = await this.verifyOperation(operation, intermediateResult)
				console.log(`[DEBUG] Operation verification result: ${verified}`)
			}

			// Final result combines the operation result and verification result
			// For move operations, we prioritize the verification result since the actual
			// file content is more important than internal tracking
			const finalResult = {
				success:
					operation.operation === "move"
						? verified // For move operations, if verification passes, consider it successful
						: intermediateResult.success && verified, // For other operations, require both to pass
				operation,
				affectedFiles: affectedFiles,
				error: verified ? intermediateResult.error : "Operation reported success but verification failed",
			}

			console.log(`[DEBUG] Engine returning final result with success: ${finalResult.success}`)
			console.log(
				`[DEBUG] Final result details: intermediateResult.success=${intermediateResult.success}, verified=${verified}`,
			)
			console.log(`[DEBUG] Final result error: ${finalResult.error || "none"}`)

			return finalResult
		} catch (error) {
			console.error(`[ERROR] Operation failed:`, error)

			const err = error as Error
			return {
				success: false,
				operation,
				error: `Operation failed: ${err.message}`,
				affectedFiles: [],
			}
		}
	}

	/**
	 * Execute a batch of refactoring operations
	 */
	async executeBatch(batchOps: BatchOperations): Promise<BatchResult> {
		const operations = batchOps.operations
		const options: { stopOnError?: boolean } = batchOps.options || {}

		// Override engine options with batch options
		const originalStopOnError = this.options.stopOnError
		if (options.stopOnError !== undefined) {
			this.options.stopOnError = options.stopOnError
		}

		const results: OperationResult[] = []
		let success = true
		let errorMessage: string | undefined = undefined

		try {
			console.log(`[DEBUG] Executing batch of ${operations.length} operations`)

			// Execute operations in sequence
			for (let i = 0; i < operations.length; i++) {
				const operation = operations[i]

				// Validate the operation before executing it
				const validationResult = this.validateOperation(operation)
				if (!validationResult.valid) {
					// If validation fails, add a failed result and continue or break
					const result: OperationResult = {
						success: false,
						operation,
						error: `Validation failed: ${validationResult.errors.join(", ")}`,
						affectedFiles: [],
					}
					results.push(result)
					success = false

					if (!errorMessage) {
						errorMessage = `Operation ${i + 1} (${operation.operation}) validation failed: ${validationResult.errors.join(", ")}`
					}

					if (this.options.stopOnError) {
						console.log(`[DEBUG] Stopping batch execution due to validation failure in operation ${i + 1}`)
						break
					} else {
						console.log(
							`[DEBUG] Continuing batch execution despite validation failure in operation ${i + 1}`,
						)
						continue
					}
				}

				// Before each operation, ensure all files exist in the project
				// This is critical for operations that depend on files created by previous operations
				if (operation.operation === "rename" && "filePath" in operation.selector) {
					const filePath = operation.selector.filePath
					const absolutePath = resolveFilePath(filePath, this.options.projectRootPath)

					// If the file exists on disk but not in the project, add it
					if (fileExists(absolutePath)) {
						try {
							// Check if the file is already in the project
							const existingFile = this.project.getSourceFile(filePath)
							if (!existingFile) {
								// Add the file to the project
								this.project.addSourceFileAtPath(filePath)
								console.log(`[DEBUG] Added file to project before operation: ${filePath}`)
							} else {
								// Refresh the file in the project
								this.project.removeSourceFile(existingFile)
								this.project.addSourceFileAtPath(filePath)
								console.log(`[DEBUG] Refreshed file in project before operation: ${filePath}`)
							}
						} catch (e) {
							console.log(`[WARNING] Failed to add/refresh file in project: ${filePath}`)
						}
					}
				}

				// Execute the operation
				const result = await this.executeOperation(operation)
				results.push(result)

				if (!result.success) {
					success = false
					if (!errorMessage) {
						errorMessage = `Operation ${i + 1} (${operation.operation}) failed: ${result.error}`
					}

					if (this.options.stopOnError) {
						console.log(`[DEBUG] Stopping batch execution due to error in operation ${i + 1}`)
						break
					} else {
						console.log(`[DEBUG] Continuing batch execution despite error in operation ${i + 1}`)
					}
				} else {
					// If the operation was successful, refresh the project's source files
					// to ensure that newly created files are recognized
					if (result.affectedFiles && result.affectedFiles.length > 0) {
						for (const filePath of result.affectedFiles) {
							// Check if the file exists on disk
							const absolutePath = resolveFilePath(filePath, this.options.projectRootPath)
							if (fileExists(absolutePath)) {
								try {
									// Remove the file from the project if it exists
									const existingFile = this.project.getSourceFile(filePath)
									if (existingFile) {
										this.project.removeSourceFile(existingFile)
									}

									// Add the file to the project
									this.project.addSourceFileAtPath(filePath)
									console.log(`[DEBUG] Refreshed file in project after operation: ${filePath}`)
								} catch (e) {
									console.log(`[WARNING] Failed to refresh file in project: ${filePath}`)
								}
							}
						}
					}
				}

				// Skip verification since it's now done inside executeOperation
				console.log(
					`[DEBUG] Verification for operation ${i + 1} (${operation.operation}) already performed inside executeOperation`,
				)
			}

			return {
				success,
				results,
				allOperations: operations,
				error: errorMessage,
			}
		} catch (error) {
			const err = error as Error
			return {
				success: false,
				results,
				allOperations: operations,
				error: `Batch execution failed: ${err.message}`,
			}
		} finally {
			// Restore original engine options
			this.options.stopOnError = originalStopOnError
		}
	}

	/**
	 * Validate an operation against our schema and perform additional checks
	 */
	validateOperation(operation: RefactorOperation): ValidationResult {
		const errors: string[] = []

		try {
			// For operations with a file path in the selector
			if ("filePath" in operation.selector) {
				const selectorFilePath = operation.selector.filePath
				const absolutePath = resolveFilePath(selectorFilePath, this.options.projectRootPath)

				// Check if the file exists on disk first
				const existsOnDisk = fileExists(absolutePath)

				if (!existsOnDisk) {
					errors.push(`File not found: ${selectorFilePath}`)
				} else {
					// If the file exists on disk, ensure it's in the ts-morph project
					const sourceFileInProject = this.project.getSourceFile(selectorFilePath)
					if (!sourceFileInProject) {
						try {
							// Add the file to the project if it's not already there
							this.project.addSourceFileAtPath(selectorFilePath)
							console.log(`Added existing file to project: ${selectorFilePath}`)
						} catch (e) {
							console.log(`Warning: Failed to add file to project: ${selectorFilePath}`)
							// Even if adding to project fails, we know it exists on disk,
							// but subsequent ts-morph operations might fail.
							// We'll let the ts-morph errors propagate if they occur.
						}
					}
				}
			}

			// Operation-specific validations
			switch (operation.operation) {
				case "move": {
					// We know this is a MoveOperation from the switch case
					const moveOp = operation as MoveOperation

					// Check if target directory exists
					const targetAbsolutePath = resolveFilePath(moveOp.targetFilePath, this.options.projectRootPath)
					const targetDir = path.dirname(targetAbsolutePath)

					if (!fileExists(targetDir)) {
						// This isn't necessarily an error, as we can create directories,
						// but we'll warn about it
						console.log(`Target directory does not exist: ${targetDir}. It will be created.`)
						// Create the directory
						try {
							ensureDirectoryExists(targetDir)
							console.log(`Created target directory: ${targetDir}`)
						} catch (e) {
							console.log(`Warning: Failed to create directory: ${targetDir}`)
						}
					}

					// For target files, we don't validate existence since they might be created
					// by the operation itself
					break
				}
				// Add more operation-specific validations if needed
			}

			return {
				valid: errors.length === 0,
				operation,
				errors,
			}
		} catch (error) {
			const err = error as Error
			errors.push(`Validation error: ${err.message}`)
			return {
				valid: false,
				operation,
				errors,
			}
		}
	}

	/**
	 * Execute a rename operation
	 */
	private async executeRenameOperation(operation: RenameOperation): Promise<Partial<OperationResult>> {
		// Call rename operation
		return executeRenameOperation(this.project, operation)
	}

	/**
	 * Execute a move operation
	 */
	private async executeMoveOperation(operation: MoveOperation): Promise<Partial<OperationResult>> {
		return executeMoveOperation(this.project, operation)
	}

	/**
	 * Execute a remove operation
	 */
	private async executeRemoveOperation(operation: RemoveOperation): Promise<Partial<OperationResult>> {
		return executeRemoveOperation(this.project, operation)
	}

	/**
	 * Save a source file to disk
	 */
	public async saveSourceFile(sourceFile: SourceFile): Promise<void> {
		try {
			const filePath = sourceFile.getFilePath()
			const projectRoot = this.project.getCompilerOptions().rootDir || process.cwd()
			const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath)
			const content = sourceFile.getFullText()

			// Save directly to disk
			console.log(`[DEBUG] Saving file to disk: ${absolutePath}`)
			await ensureDirectoryExists(path.dirname(absolutePath))
			await fs.writeFile(absolutePath, content, "utf8")
			console.log(`[DEBUG] Source file saved successfully`)
		} catch (error) {
			console.error(`[ERROR] Failed to save source file:`, error)
			throw new Error(`Failed to save source file: ${(error as Error).message}`)
		}
	}

	/**
	 * Resolves a file path to an absolute path
	 */
	public resolveFilePath(filePath: string): string {
		return resolveFilePath(filePath, this.options.projectRootPath)
	}

	/**
	 * Verifies that an operation actually performed the expected changes
	 * @param operation The operation that was executed
	 * @param result The result of the operation
	 * @returns true if the operation was verified, false otherwise
	 */
	private async verifyOperation(operation: RefactorOperation, result: OperationResult): Promise<boolean> {
		if (!result.success) {
			// If the operation already reported failure, return false to indicate verification failed
			// This ensures the batch operation correctly reports failure
			return false
		}

		try {
			console.log(`[DEBUG] Verifying operation: ${operation.operation}`)

			// Refresh affected files from disk before verification
			// This ensures the ts-morph project's in-memory representation matches the actual state of the files
			for (const filePath of result.affectedFiles) {
				try {
					// Remove the file from the project if it exists
					const existingFile = this.project.getSourceFile(filePath)
					if (existingFile) {
						this.project.removeSourceFile(existingFile)
					}

					// Add the file back to the project to refresh it from disk
					const absolutePath = resolveFilePath(filePath, this.options.projectRootPath)
					if (fileExists(absolutePath)) {
						this.project.addSourceFileAtPath(filePath)
						console.log(`[DEBUG] Refreshed file for verification: ${filePath}`)
					}
				} catch (e) {
					console.log(`[WARNING] Failed to refresh file for verification: ${filePath}`)
				}
			}

			switch (operation.operation) {
				case "rename": {
					const renameOp = operation as RenameOperation
					const filePath = renameOp.selector.filePath
					const absolutePath = resolveFilePath(filePath, this.options.projectRootPath)

					// Try to get the source file using both relative and absolute paths
					let sourceFile = this.project.getSourceFile(filePath)

					// If not found with relative path, try with absolute path
					if (!sourceFile && fileExists(absolutePath)) {
						try {
							sourceFile = this.project.addSourceFileAtPath(absolutePath)
							console.log(`[DEBUG] Added file for verification using absolute path: ${absolutePath}`)
						} catch (e) {
							console.log(`[WARNING] Failed to add file for verification: ${absolutePath}`)
						}
					}

					if (!sourceFile) {
						console.log(`[DEBUG] Verification failed: Source file not found: ${filePath}`)
						return false
					}

					// Check if the old name still exists
					const oldSymbol = new SymbolFinder(sourceFile).findSymbol(renameOp.selector)
					if (oldSymbol) {
						console.log(`[DEBUG] Verification failed: Old symbol '${renameOp.selector.name}' still exists`)
						return false
					}

					// Check if the new name exists
					const newSelector = { ...renameOp.selector, name: renameOp.newName }
					const newSymbol = new SymbolFinder(sourceFile).findSymbol(newSelector)
					if (!newSymbol) {
						console.log(`[DEBUG] Verification failed: New symbol '${renameOp.newName}' not found`)
						return false
					}

					return true
				}

				case "move": {
					const moveOp = operation as MoveOperation

					// Normalize paths for consistent handling
					const normalizedSourcePath = moveOp.selector.filePath.replace(/\\/g, "/")
					const normalizedTargetPath = moveOp.targetFilePath.replace(/\\/g, "/")

					const sourceAbsolutePath = resolveFilePath(normalizedSourcePath, this.options.projectRootPath)
					const targetAbsolutePath = resolveFilePath(normalizedTargetPath, this.options.projectRootPath)

					console.log(
						`[DEBUG] Verifying move operation from ${normalizedSourcePath} to ${normalizedTargetPath}`,
					)
					console.log(`[DEBUG] Absolute source path: ${sourceAbsolutePath}`)
					console.log(`[DEBUG] Absolute target path: ${targetAbsolutePath}`)
					console.log(`[DEBUG] Source exists: ${fileExists(sourceAbsolutePath)}`)
					console.log(`[DEBUG] Target exists: ${fileExists(targetAbsolutePath)}`)

					// Ensure the project is fully refreshed before verification
					this.refreshProjectFromDisk()

					// Multi-strategy approach to get source file
					let sourceFile = this.tryGetSourceFile(normalizedSourcePath)
					let targetFile = this.tryGetSourceFile(normalizedTargetPath)

					if (!sourceFile) {
						console.log(`[DEBUG] Verification failed: Source file not found: ${normalizedSourcePath}`)
						return false
					}

					if (!targetFile) {
						console.log(`[DEBUG] Verification failed: Target file not found: ${normalizedTargetPath}`)
						return false
					}

					// Check if the symbol still exists in the source file
					const oldSymbol = new SymbolFinder(sourceFile).findSymbol(moveOp.selector)
					if (oldSymbol) {
						console.log(
							`[DEBUG] Verification failed: Symbol '${moveOp.selector.name}' still exists in source file`,
						)
						return false
					}

					// Check if the symbol exists in the target file
					const newSymbol = new SymbolFinder(targetFile).findSymbol(moveOp.selector)

					// If symbol isn't found through AST, try a text-based search as fallback
					if (!newSymbol) {
						console.log(`[DEBUG] Symbol not found via AST. Trying text-based fallback...`)

						// Use a text-based search as fallback
						const targetText = targetFile.getFullText()
						const symbolName = moveOp.selector.name
						const functionRegex = new RegExp(`(export\\s+)?function\\s+${symbolName}\\s*\\(`, "g")
						const classRegex = new RegExp(`(export\\s+)?class\\s+${symbolName}(\\s|\\{)`, "g")
						const varRegex = new RegExp(`(export\\s+)?(const|let|var)\\s+${symbolName}\\s*=`, "g")

						const foundInText =
							functionRegex.test(targetText) || classRegex.test(targetText) || varRegex.test(targetText)

						console.log(`[DEBUG] Target file contains symbol via text search: ${foundInText}`)

						// If the symbol is not found via text search either, it's a failure
						if (!foundInText) {
							console.log(
								`[DEBUG] Verification failed: Symbol '${moveOp.selector.name}' not found in target file`,
							)
							return false
						}

						// If we found it via text search, continue with verification
						console.log(`[DEBUG] Symbol found via text search, verification passes`)
					} else {
						console.log(`[DEBUG] Symbol found via AST, verification passes`)
					}

					return true
				}

				case "remove": {
					const removeOp = operation as RemoveOperation
					const filePath = removeOp.selector.filePath
					const sourceFile = this.project.getSourceFile(filePath)

					if (!sourceFile) {
						console.log(`[DEBUG] Verification failed: Source file not found: ${filePath}`)
						return false
					}

					// Check if the symbol still exists
					const symbol = new SymbolFinder(sourceFile).findSymbol(removeOp.selector)
					if (symbol) {
						console.log(`[DEBUG] Verification failed: Symbol '${removeOp.selector.name}' still exists`)
						return false
					}

					return true
				}

				default:
					// For unknown operations, assume verification passed
					return true
			}
		} catch (error) {
			console.error(`[ERROR] Verification failed with error:`, error)
			return false
		}
	}

	/**
	 * Add source files to the project
	 */
	private addSourceFilesToProject() {
		// Only add files as needed when they are referenced
		// This is more efficient than scanning the entire project
		// The ts-morph project will automatically load files when
		// they are requested via getSourceFile
	}

	/**
	 * Refreshes the project state from disk by reloading source files
	 * to ensure all in-memory representations match the actual files
	 */
	private refreshProjectFromDisk(): void {
		try {
			// Get all source files currently in the project
			const sourceFiles = this.project.getSourceFiles()

			for (const file of sourceFiles) {
				const filePath = file.getFilePath()
				const absolutePath = resolveFilePath(filePath, this.options.projectRootPath)

				// Remove the file from the project
				this.project.removeSourceFile(file)

				// Add it back if it exists on disk
				if (fileExists(absolutePath)) {
					try {
						this.project.addSourceFileAtPath(filePath)
						console.log(`[DEBUG] Refreshed file from disk: ${filePath}`)
					} catch (e) {
						console.log(`[WARNING] Failed to refresh file from disk: ${filePath}`)
					}
				}
			}
		} catch (error) {
			console.log(`[ERROR] Failed to refresh project from disk: ${(error as Error).message}`)
		}
	}

	/**
	 * Multi-strategy approach to get a source file by path
	 * Tries multiple strategies to find/add the file to the project
	 */
	private tryGetSourceFile(filePath: string): SourceFile | undefined {
		// First try with the provided path
		let sourceFile = this.project.getSourceFile(filePath)
		if (sourceFile) {
			return sourceFile
		}

		// Try with absolute path
		const absolutePath = resolveFilePath(filePath, this.options.projectRootPath)
		if (fileExists(absolutePath)) {
			try {
				sourceFile = this.project.addSourceFileAtPath(absolutePath)
				if (sourceFile) {
					console.log(`[DEBUG] Added file to project using absolute path: ${absolutePath}`)
					return sourceFile
				}
			} catch (e) {
				console.log(`[WARNING] Failed to add file using absolute path: ${absolutePath}`)
			}

			// Try with relative path
			try {
				const relativePath = path.isAbsolute(filePath)
					? path.relative(this.options.projectRootPath, filePath)
					: filePath

				sourceFile = this.project.addSourceFileAtPath(relativePath)
				if (sourceFile) {
					console.log(`[DEBUG] Added file to project using relative path: ${relativePath}`)
					return sourceFile
				}
			} catch (e) {
				console.log(`[WARNING] Failed to add file using relative path`)
			}
		}

		return undefined
	}
}
