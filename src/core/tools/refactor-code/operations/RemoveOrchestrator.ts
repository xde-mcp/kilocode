import { Project, SourceFile, SyntaxKind } from "ts-morph"
import { RemoveOperation } from "../schema"
import { OperationResult } from "../engine"
import { SymbolResolver } from "../core/SymbolResolver"
import { SymbolRemover } from "../core/SymbolRemover"
import { ResolvedSymbol, RemovalResult } from "../core/types"
import { ProjectManager } from "../core/ProjectManager"
import { refactorLogger } from "../utils/RefactorLogger"

/**
 * Orchestrates the symbol removal operation with enhanced error recovery
 * and graceful degradation when problems occur
 */
export class RemoveOrchestrator {
	private projectManager: ProjectManager
	private symbolResolver: SymbolResolver
	private symbolRemover: SymbolRemover
	private removalStats: {
		attempted: number
		succeeded: number
		failed: number
		degraded: number
	} = { attempted: 0, succeeded: 0, failed: 0, degraded: 0 }

	constructor(project: Project, projectRoot?: string) {
		this.projectManager = new ProjectManager(project, projectRoot)
		this.symbolResolver = new SymbolResolver(project)
		this.symbolRemover = new SymbolRemover()
	}

	/**
	 * Disposes of resources held by this RemoveOrchestrator instance.
	 * This cleans up memory by disposing the ProjectManager and its associated resources.
	 * Should be called after operations are complete, especially in test environments.
	 */
	dispose(): void {
		// Dispose the ProjectManager to clean up its resources
		if (this.projectManager) {
			this.projectManager.dispose()
		}

		// Clear references to help garbage collection
		this.symbolResolver = null as any
		this.symbolRemover = null as any

		// Reset stats
		this.removalStats = { attempted: 0, succeeded: 0, failed: 0, degraded: 0 }
	}

	/**
	 * Execute a REMOVE refactoring operation with enhanced error recovery
	 * and better error messages
	 */
	async executeRemoveOperation(operation: RemoveOperation): Promise<OperationResult> {
		try {
			this.removalStats.attempted++
			// Use debug logging only in non-test environments
			if (process.env.NODE_ENV !== "test") {
				refactorLogger.debug(`Executing remove operation for symbol: ${operation.selector.name}`)
			}

			// 1. Find the source file
			// Standardize file path using ProjectManager
			const sourceFilePath = this.projectManager.getPathResolver().standardizePath(operation.selector.filePath)
			refactorLogger.debug(`Original file path: ${operation.selector.filePath}`)
			refactorLogger.debug(`Standardized file path: ${sourceFilePath}`)
			refactorLogger.debug(`Project root: ${this.projectManager.getPathResolver().getProjectRoot()}`)

			// Load project files around the source file to ensure all references are detected
			await this.projectManager.loadRelevantProjectFiles(sourceFilePath)

			// Get the source file
			const sourceFile = await this.projectManager.ensureSourceFile(sourceFilePath)

			if (!sourceFile) {
				this.removalStats.failed++
				return {
					success: false,
					operation,
					error: `Source file not found: ${sourceFilePath}. Please check the file path and ensure the file exists.`,
					affectedFiles: [],
				}
			}

			// 2. Find the symbol
			const symbol = this.symbolResolver.resolveSymbol(operation.selector, sourceFile)
			if (!symbol) {
				this.removalStats.failed++
				return {
					success: false,
					operation,
					error: `Symbol '${operation.selector.name}' not found in ${sourceFilePath}. Check for typos in the symbol name or if it was already removed.`,
					affectedFiles: [],
				}
			}

			// 3. Validate symbol can be removed
			const validation = this.symbolResolver.validateForRemoval(symbol)

			// Display warnings even if we can proceed
			if (validation.warnings.length > 0 && process.env.NODE_ENV !== "test") {
				refactorLogger.warn(`Symbol removal warnings: ${validation.warnings.join(", ")}`)
			}

			// Check if force removal is enabled
			if (operation.options?.forceRemove) {
				if (process.env.NODE_ENV !== "test") {
					refactorLogger.debug(`Force remove option detected, bypassing validation checks`)
				}
				return this.attemptForcedRemoval(operation, symbol, sourceFile, sourceFilePath)
			}

			// For regular removal, check if we can proceed
			if (!validation.canProceed) {
				// If there are external references, offer specific guidance
				const hasExternalReferences = validation.blockers.some(
					(blocker) => blocker.includes("external reference") || blocker.includes("used in"),
				)

				let errorMessage = validation.blockers.join(", ")

				if (hasExternalReferences) {
					errorMessage +=
						". You may need to remove references to this symbol first, or use the force option to remove it anyway."
				}

				this.removalStats.failed++
				return {
					success: false,
					operation,
					error: errorMessage,
					affectedFiles: this.projectManager
						.getPathResolver()
						.standardizeAndDeduplicatePaths([sourceFilePath]),
				}
			}

			// 4. Remove the symbol
			let removalResult = await this.symbolRemover.removeSymbol(symbol)

			// If removal succeeded, save the file via ProjectManager
			if (removalResult.success) {
				refactorLogger.debug(`About to save source file after removal`)
				await this.projectManager.saveSourceFile(sourceFile, sourceFilePath)
				refactorLogger.debug(`Successfully saved source file`)

				// Force refresh the source file to ensure AST synchronization
				await this.projectManager.forceRefreshSourceFile(sourceFile, sourceFilePath)
			}

			if (!removalResult.success) {
				// Try alternative removal methods if standard method fails
				if (operation.options?.fallbackToAggressive || operation.options?.forceRemove) {
					if (process.env.NODE_ENV !== "test") {
						refactorLogger.debug(
							`Standard removal failed, attempting aggressive removal for: ${symbol.name}`,
						)
					}
					return this.attemptAggressiveRemoval(operation, symbol, sourceFile, sourceFilePath)
				}

				this.removalStats.failed++
				return {
					success: false,
					operation,
					error:
						removalResult.error ||
						`Failed to remove symbol: ${operation.selector.name}. You can try again with aggressive removal option.`,
					affectedFiles: this.projectManager
						.getPathResolver()
						.standardizeAndDeduplicatePaths([sourceFilePath]),
				}
			}

			// 5. Check if any unreferenced dependencies can be removed as well
			refactorLogger.debug(`About to check dependency cleanup`)
			if (operation.options?.cleanupDependencies) {
				refactorLogger.debug(`Starting dependency cleanup`)
				await this.cleanupUnreferencedDependencies(sourceFile)
				refactorLogger.debug(`Dependency cleanup completed`)

				// Save again after cleaning up dependencies
				await this.projectManager.saveSourceFile(sourceFile, sourceFilePath)
			}

			// 6. Generate final result
			refactorLogger.debug(`About to generate final result`)
			this.removalStats.succeeded++
			refactorLogger.debug(`Updated removal stats, about to return success result`)
			return {
				success: true,
				operation,
				affectedFiles: [sourceFilePath],
				removalMethod: removalResult.method,
			}
		} catch (error) {
			this.removalStats.failed++
			const err = error as Error
			if (process.env.NODE_ENV !== "test") {
				refactorLogger.error(`Remove operation failed: ${err}`)
			}

			return {
				success: false,
				operation,
				error: `Unexpected error during remove operation: ${err.message}`,
				affectedFiles: [],
			}
		}
	}

	/**
	 * Attempts to remove a symbol using more aggressive removal strategies
	 * when standard removal fails. Ensures changes are written to disk.
	 */
	private async attemptAggressiveRemoval(
		operation: RemoveOperation,
		symbol: ResolvedSymbol,
		sourceFile: SourceFile,
		sourceFilePath: string,
	): Promise<OperationResult> {
		try {
			let removalResult = await this.symbolRemover.removeSymbolAggressively(symbol)

			if (!removalResult.success) {
				this.removalStats.failed++
				return {
					success: false,
					operation,
					error:
						removalResult.error || `Aggressive removal also failed for symbol: ${operation.selector.name}`,
					affectedFiles: [sourceFilePath],
				}
			}

			// Save changes to disk
			await this.projectManager.saveSourceFile(sourceFile, sourceFilePath)

			this.removalStats.degraded++
			return {
				success: true,
				operation,
				affectedFiles: [sourceFilePath],
				removalMethod: removalResult.method,
				error: "Symbol removed using aggressive method. Some code structure may be affected.",
			}
		} catch (error) {
			this.removalStats.failed++
			return {
				success: false,
				operation,
				error: `Aggressive removal failed with error: ${(error as Error).message}`,
				affectedFiles: [sourceFilePath],
			}
		}
	}

	/**
	 * Attempts forced removal even when the symbol has external references
	 */
	private async attemptForcedRemoval(
		operation: RemoveOperation,
		symbol: ResolvedSymbol,
		sourceFile: SourceFile,
		sourceFilePath: string,
	): Promise<OperationResult> {
		try {
			if (process.env.NODE_ENV !== "test") {
				refactorLogger.debug(`Attempting forced removal of symbol: ${symbol.name} with forceRemove option`)
			}

			let removalResult = await this.symbolRemover.removeSymbolManually(symbol)

			if (!removalResult.success) {
				this.removalStats.failed++
				return {
					success: false,
					operation,
					error: `Forced removal failed: ${removalResult.error || "Unknown error"}`,
					affectedFiles: [sourceFilePath],
				}
			}

			// Save changes to disk
			await this.projectManager.saveSourceFile(sourceFile, sourceFilePath)

			this.removalStats.degraded++
			return {
				success: true,
				operation,
				affectedFiles: [sourceFilePath],
				removalMethod: "manual",
				error: "Symbol forcibly removed despite external references. This may cause compilation errors.",
			}
		} catch (error) {
			this.removalStats.failed++
			// If all other methods failed, attempt direct file manipulation as a last resort
			if (process.env.NODE_ENV !== "test") {
				refactorLogger.debug(
					`All removal methods failed, attempting direct file manipulation for ${symbol.name}`,
				)
			}

			const result = await this.removeSymbolByDirectFileManipulation(symbol, sourceFile, sourceFilePath)
			if (result.success) {
				return result
			}

			return {
				success: false,
				operation,
				error: `Forced removal failed: ${(error as Error).message}. Direct manipulation also failed: ${result.error}`,
				affectedFiles: [sourceFilePath],
			}
		}
	}

	/**
	 * Last resort method that directly manipulates file content to remove a symbol
	 * when all other removal methods have failed
	 */
	private async removeSymbolByDirectFileManipulation(
		symbol: ResolvedSymbol,
		sourceFile: SourceFile,
		sourceFilePath: string,
	): Promise<OperationResult> {
		refactorLogger.debug(`Attempting direct file manipulation to remove symbol: ${symbol.name}`)

		// Determine the symbol kind based on node kind or default to variable
		const inferSymbolKind = ():
			| "function"
			| "class"
			| "variable"
			| "type"
			| "interface"
			| "enum"
			| "method"
			| "property" => {
			const nodeKind = symbol.node.getKindName?.() || ""

			// Map ts-morph node kinds to our schema kinds
			if (nodeKind.includes("Function")) return "function"
			if (nodeKind.includes("Method")) return "method"
			if (nodeKind.includes("Class")) return "class"
			if (nodeKind.includes("Interface")) return "interface"
			if (nodeKind.includes("Enum")) return "enum"
			if (nodeKind.includes("Type")) return "type"
			if (nodeKind.includes("Property")) return "property"

			// Default fallback
			return "variable"
		}

		// Create a valid remove operation with correct selector type
		const operation: RemoveOperation = {
			operation: "remove", // Must be "remove" not "REMOVE"
			selector: {
				type: "identifier",
				name: symbol.name,
				kind: inferSymbolKind(),
				filePath: sourceFilePath,
			},
		}

		try {
			// Last resort: Read and write the file directly using node fs
			const fs = require("fs")
			const path = require("path")

			// Make sure we have an absolute path
			const absolutePath = path.isAbsolute(sourceFilePath)
				? sourceFilePath
				: this.projectManager.getPathResolver().resolveAbsolutePath(sourceFilePath)

			refactorLogger.debug(`Direct file system manipulation for ${symbol.name} at path: ${absolutePath}`)

			// Read the file content directly
			if (fs.existsSync(absolutePath)) {
				const fileContent = fs.readFileSync(absolutePath, "utf8")
				refactorLogger.debug(`Original file size: ${fileContent.length} bytes`)

				// Create regexes to match the symbol declaration
				const functionRegex = new RegExp(
					`(export\\s+)?(async\\s+)?function\\s+${symbol.name}\\s*\\([^)]*\\)\\s*(:\\s*[^{;]+)?\\s*\\{[\\s\\S]*?\\n\\s*\\}`,
					"g",
				)

				// Apply replacement
				const newContent = fileContent.replace(functionRegex, "")

				if (newContent !== fileContent) {
					refactorLogger.debug(
						`New content size: ${newContent.length} bytes (${fileContent.length - newContent.length} bytes removed)`,
					)

					// Write directly to the file system
					fs.writeFileSync(absolutePath, newContent, "utf8")
					refactorLogger.debug(`Successfully wrote updated content to disk`)

					// Force the project to refresh
					sourceFile.refreshFromFileSystemSync()

					// Read back the file to verify changes were saved
					const verificationContent = fs.readFileSync(absolutePath, "utf8")
					const stillContainsSymbol =
						verificationContent.includes(`function ${symbol.name}`) ||
						verificationContent.includes(`class ${symbol.name}`) ||
						verificationContent.includes(`const ${symbol.name}`) ||
						verificationContent.includes(`let ${symbol.name}`) ||
						verificationContent.includes(`var ${symbol.name}`)

					if (!stillContainsSymbol) {
						return {
							success: true,
							operation,
							affectedFiles: [sourceFilePath],
							removalMethod: "manual",
							error: "Symbol removed by direct file system manipulation.",
						}
					} else {
						refactorLogger.debug(`Symbol still found in content after direct file system write`)
					}
				} else {
					refactorLogger.debug(`Regex replacement didn't change content`)
				}
			} else {
				refactorLogger.debug(`File not found: ${absolutePath}`)
			}

			// Try other strategies as fallback

			// Strategy 1: Use node position information
			const pos = symbol.node.getPos()
			const end = symbol.node.getEnd()

			if (pos !== undefined && end !== undefined) {
				// Get the text to remove
				const symbolText = sourceFile.getFullText().substring(pos, end)
				if (symbolText) {
					refactorLogger.debug(
						`Removing symbol text by position: ${symbolText.substring(0, 100)}${symbolText.length > 100 ? "..." : ""}`,
					)

					// Modify the source file directly
					sourceFile.replaceText([pos, end], "")
					await this.projectManager.saveSourceFile(sourceFile, sourceFilePath)

					// Check if it worked
					const refreshedFile = await this.projectManager.ensureSourceFile(sourceFilePath)
					if (refreshedFile) {
						const symbolStillExists = refreshedFile
							.getDescendantsOfKind(SyntaxKind.Identifier)
							.some((id) => id.getText() === symbol.name)

						if (!symbolStillExists) {
							return {
								success: true,
								operation,
								affectedFiles: [sourceFilePath],
								removalMethod: "manual",
								error: "Symbol removed by direct position manipulation.",
							}
						}
					}
				}
			}

			// Final check if the symbol still exists
			const refreshedSourceFile = await this.projectManager.ensureSourceFile(sourceFilePath)

			if (!refreshedSourceFile) {
				return {
					success: false,
					operation,
					error: "Failed to reload source file after direct manipulation",
					affectedFiles: [sourceFilePath],
				}
			}

			// Try to determine if the symbol still exists by looking for identifiers with the same name
			const identifiers = refreshedSourceFile
				.getDescendantsOfKind(SyntaxKind.Identifier)
				.filter((id) => id.getText() === symbol.name)

			if (identifiers.length > 0) {
				return {
					success: false,
					operation,
					error: "Direct manipulation completed but symbol or references still exist in file",
					affectedFiles: [sourceFilePath],
				}
			}

			return {
				success: true,
				operation,
				affectedFiles: [sourceFilePath],
				removalMethod: "manual", // Using "manual" as it's a valid enum value
				error: "Symbol removed by direct file manipulation. This is a last resort method and may affect code structure.",
			}
		} catch (error) {
			return {
				success: false,
				operation: {
					operation: "remove", // Must be "remove" not "REMOVE"
					selector: {
						type: "identifier",
						name: symbol.name,
						kind: inferSymbolKind(), // Use the same inference function
						filePath: sourceFilePath,
					},
				},
				error: `Direct file manipulation failed: ${(error as Error).message}`,
				affectedFiles: [sourceFilePath],
			}
		}
	}

	/**
	 * Attempts to clean up any dependencies that are no longer referenced
	 * after the main symbol removal
	 */
	private async cleanupUnreferencedDependencies(sourceFile: SourceFile): Promise<void> {
		// This would identify and remove any imports or helper functions that were only used
		// by the removed symbol and are now unreferenced
		refactorLogger.debug(`Cleaning up unreferenced dependencies in ${sourceFile.getFilePath()}`)

		// Remove any unused imports
		const importDeclarations = sourceFile.getImportDeclarations()
		let removedCount = 0

		for (const importDecl of importDeclarations) {
			const namedImports = importDecl.getNamedImports()

			// Check if any named imports are unused
			for (const namedImport of namedImports) {
				const name = namedImport.getName()
				// Use SyntaxKind.Identifier to find all identifiers in the file
				const references = sourceFile.getDescendantsOfKind(SyntaxKind.Identifier).filter((node) => {
					try {
						return node.getText() === name
					} catch (e) {
						// If we can't get text from a node, it might be removed/forgotten
						return false
					}
				})

				// If there's only one reference (the import itself), remove it
				if (references.length <= 1) {
					namedImport.remove()
					removedCount++
				}
			}

			// If all named imports were removed, remove the entire import declaration
			if (importDecl.getNamedImports().length === 0) {
				importDecl.remove()
			}
		}

		refactorLogger.debug(`Removed ${removedCount} unused imports`)
	}

	/**
	 * Gets statistics about removal operations since this orchestrator was created
	 */
	public getRemovalStats(): { attempted: number; succeeded: number; failed: number; degraded: number } {
		return { ...this.removalStats }
	}
}
