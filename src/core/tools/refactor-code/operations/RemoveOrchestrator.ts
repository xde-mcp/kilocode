import { Project, SourceFile, SyntaxKind } from "ts-morph"
import { RemoveOperation } from "../schema"
import { OperationResult } from "../engine"
import { SymbolResolver } from "../core/SymbolResolver"
import { SymbolRemover } from "../core/SymbolRemover"
import { ResolvedSymbol, RemovalResult } from "../core/types"
import { ProjectManager } from "../core/ProjectManager"

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
				console.log(`[DEBUG] Executing remove operation for symbol: ${operation.selector.name}`)
			}

			// 1. Find the source file
			// Standardize file path using ProjectManager
			const sourceFilePath = this.projectManager.getPathResolver().standardizePath(operation.selector.filePath)
			console.log(`[DEBUG REMOVE] Original file path: ${operation.selector.filePath}`)
			console.log(`[DEBUG REMOVE] Standardized file path: ${sourceFilePath}`)
			console.log(`[DEBUG REMOVE] Project root: ${this.projectManager.getPathResolver().getProjectRoot()}`)

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

			// Log information about the resolved symbol for better debugging
			if (process.env.NODE_ENV !== "test") {
				console.log(
					`[DEBUG] Found symbol '${symbol.name}' of type ${
						typeof symbol.node.getKindName === "function"
							? symbol.node.getKindName()
							: symbol.node.getKind
								? SyntaxKind[symbol.node.getKind()]
								: "unknown"
					}, exported: ${symbol.isExported}`,
				)
			}

			// 3. Validate symbol can be removed
			const validation = this.symbolResolver.validateForRemoval(symbol)

			// Display warnings even if we can proceed
			if (validation.warnings.length > 0 && process.env.NODE_ENV !== "test") {
				console.log(`[WARNING] Symbol removal warnings: ${validation.warnings.join(", ")}`)
			}

			// Check if force removal is enabled
			if (operation.options?.forceRemove) {
				if (process.env.NODE_ENV !== "test") {
					console.log(`[DEBUG] Force remove option detected, bypassing validation checks`)
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
			// Try to remove the symbol
			let removalResult = await this.symbolRemover.removeSymbol(symbol)

			// If removal succeeded but we need to save the file via ProjectManager
			if (removalResult.success) {
				try {
					console.log(`[DEBUG ORCHESTRATOR] About to save source file after removal`)
					// Override the save in SymbolRemover by saving via ProjectManager
					await this.projectManager.saveSourceFile(sourceFile, sourceFilePath)
					console.log(`[DEBUG ORCHESTRATOR] Successfully saved source file`)
				} catch (saveError) {
					console.log(`[DEBUG ORCHESTRATOR] Error saving source file: ${(saveError as Error).message}`)
					throw saveError
				}

				try {
					console.log(`[DEBUG ORCHESTRATOR] About to force refresh source file`)
					// Force refresh the source file to ensure AST synchronization
					// This is critical for method removal where tests verify AST state
					await this.projectManager.forceRefreshSourceFile(sourceFile, sourceFilePath)
					console.log(`[DEBUG ORCHESTRATOR] Successfully refreshed source file`)
				} catch (refreshError) {
					console.log(`[DEBUG ORCHESTRATOR] Error refreshing source file: ${(refreshError as Error).message}`)
					throw refreshError
				}
			}

			if (!removalResult.success) {
				// Try alternative removal methods if standard method fails
				if (operation.options?.fallbackToAggressive || operation.options?.forceRemove) {
					if (process.env.NODE_ENV !== "test") {
						console.log(
							`[DEBUG] Standard removal failed, attempting aggressive removal for: ${symbol.name}`,
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

			// 5. Ensure changes are written to disk
			try {
				console.log(`[DEBUG ORCHESTRATOR] About to save changes to disk (second save)`)
				// This is already handled above, but keeping for safety
				await this.projectManager.saveSourceFile(sourceFile, sourceFilePath)
				console.log(`[DEBUG ORCHESTRATOR] Successfully saved changes to disk (second save)`)
			} catch (saveError) {
				console.log(`[DEBUG ORCHESTRATOR] Error in second save: ${(saveError as Error).message}`)
				if (process.env.NODE_ENV !== "test") {
					console.error(`[ERROR] Failed to save changes to disk: ${saveError}`)
				}
				return {
					success: false,
					operation,
					error: `Successfully removed symbol in memory but failed to save changes to disk: ${saveError}`,
					affectedFiles: this.projectManager
						.getPathResolver()
						.standardizeAndDeduplicatePaths([sourceFilePath]),
				}
			}

			// 6. Check if any unreferenced dependencies can be removed as well
			console.log(`[DEBUG ORCHESTRATOR] About to check dependency cleanup`)
			if (operation.options?.cleanupDependencies) {
				console.log(`[DEBUG ORCHESTRATOR] Starting dependency cleanup`)
				try {
					await this.cleanupUnreferencedDependencies(sourceFile)
					console.log(`[DEBUG ORCHESTRATOR] Dependency cleanup completed`)
				} catch (cleanupError) {
					console.log(`[DEBUG ORCHESTRATOR] Error in dependency cleanup: ${(cleanupError as Error).message}`)
					throw cleanupError
				}

				// Save again after cleaning up dependencies
				try {
					console.log(`[DEBUG ORCHESTRATOR] Saving after dependency cleanup`)
					await this.projectManager.saveSourceFile(sourceFile, sourceFilePath)
					console.log(`[DEBUG ORCHESTRATOR] Successfully saved after dependency cleanup`)
				} catch (saveError) {
					console.log(
						`[DEBUG ORCHESTRATOR] Error saving after dependency cleanup: ${(saveError as Error).message}`,
					)
					if (process.env.NODE_ENV !== "test") {
						console.log(`[WARNING] Failed to save dependency cleanup changes: ${saveError}`)
					}
					// Don't fail the operation if just the cleanup fails
				}
			} else {
				console.log(`[DEBUG ORCHESTRATOR] Skipping dependency cleanup (not enabled)`)
			}

			// 7. Generate final result
			console.log(`[DEBUG ORCHESTRATOR] About to generate final result`)
			this.removalStats.succeeded++
			console.log(`[DEBUG ORCHESTRATOR] Updated removal stats, about to return success result`)
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
				console.error(`[ERROR] Remove operation failed:`, err)
			}

			// Provide more context in the error message
			const errorMessage = `Unexpected error during remove operation: ${err.message}`
			const stackContext = err.stack ? `\nStack trace: ${err.stack.split("\n").slice(0, 3).join("\n")}` : ""

			return {
				success: false,
				operation,
				error: errorMessage + stackContext,
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
			// Try aggressive removal strategy
			// Try aggressive removal
			let removalResult = await this.symbolRemover.removeSymbolAggressively(symbol)

			// If removal succeeded, ensure we save via ProjectManager
			if (removalResult.success) {
				await this.projectManager.saveSourceFile(sourceFile, sourceFilePath)
			}

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

			// Ensure changes are written to disk
			try {
				// This is already handled above, but keeping for safety
				await this.projectManager.saveSourceFile(sourceFile, sourceFilePath)
			} catch (saveError) {
				if (process.env.NODE_ENV !== "test") {
					console.error(`[ERROR] Failed to save aggressive removal changes to disk: ${saveError}`)
				}
				return {
					success: false,
					operation,
					error: `Successfully removed symbol aggressively in memory but failed to save changes to disk: ${saveError}`,
					affectedFiles: [sourceFilePath],
				}
			}

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
				console.log(`[DEBUG] Attempting forced removal of symbol: ${symbol.name} with forceRemove option`)
			}

			// Use manual removal as a last resort
			// Try manual removal
			let removalResult = await this.symbolRemover.removeSymbolManually(symbol)

			// If removal succeeded, ensure we save via ProjectManager
			if (removalResult.success) {
				await this.projectManager.saveSourceFile(sourceFile, sourceFilePath)
			}

			if (!removalResult.success) {
				this.removalStats.failed++
				return {
					success: false,
					operation,
					error: `Forced removal failed: ${removalResult.error || "Unknown error"}`,
					affectedFiles: [sourceFilePath],
				}
			}

			// Ensure changes are written to disk
			try {
				// This is already handled above, but keeping for safety
				await this.projectManager.saveSourceFile(sourceFile, sourceFilePath)
			} catch (saveError) {
				if (process.env.NODE_ENV !== "test") {
					console.error(`[ERROR] Failed to save forced removal changes to disk: ${saveError}`)
				}
				return {
					success: false,
					operation,
					error: `Successfully removed symbol forcibly in memory but failed to save changes to disk: ${saveError}`,
					affectedFiles: [sourceFilePath],
				}
			}

			this.removalStats.degraded++
			// Success with warning
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
				console.log(
					`[DEBUG] All removal methods failed, attempting direct file manipulation for ${symbol.name}`,
				)
			}

			try {
				const result = await this.removeSymbolByDirectFileManipulation(symbol, sourceFile, sourceFilePath)
				if (result.success) {
					return result
				}

				return {
					success: false,
					operation,
					error: `Forced removal failed with error: ${(error as Error).message}. Direct manipulation also failed: ${result.error}`,
					affectedFiles: [sourceFilePath],
				}
			} catch (directError) {
				return {
					success: false,
					operation,
					error: `Forced removal failed with error: ${(error as Error).message}. Direct manipulation error: ${(directError as Error).message}`,
					affectedFiles: [sourceFilePath],
				}
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
		console.log(`[DEBUG] Attempting direct file manipulation to remove symbol: ${symbol.name}`)

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

			console.log(`[DEBUG] Direct file system manipulation for ${symbol.name} at path: ${absolutePath}`)

			// Read the file content directly
			if (fs.existsSync(absolutePath)) {
				const fileContent = fs.readFileSync(absolutePath, "utf8")
				console.log(`[DEBUG] Original file size: ${fileContent.length} bytes`)

				// Create regexes to match the symbol declaration
				const functionRegex = new RegExp(
					`(export\\s+)?(async\\s+)?function\\s+${symbol.name}\\s*\\([^)]*\\)\\s*(:\\s*[^{;]+)?\\s*\\{[\\s\\S]*?\\n\\s*\\}`,
					"g",
				)

				// Apply replacement
				const newContent = fileContent.replace(functionRegex, "")

				if (newContent !== fileContent) {
					console.log(
						`[DEBUG] New content size: ${newContent.length} bytes (${fileContent.length - newContent.length} bytes removed)`,
					)

					// Write directly to the file system
					fs.writeFileSync(absolutePath, newContent, "utf8")
					console.log(`[DEBUG] Successfully wrote updated content to disk`)

					// Force the project to refresh
					try {
						sourceFile.refreshFromFileSystemSync()
					} catch (e) {
						console.log(`[DEBUG] Refresh error: ${(e as Error).message}`)
					}

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
						console.log(`[DEBUG] Symbol still found in content after direct file system write`)
					}
				} else {
					console.log(`[DEBUG] Regex replacement didn't change content`)
				}
			} else {
				console.log(`[DEBUG] File not found: ${absolutePath}`)
			}

			// Try other strategies as fallback

			// Strategy 1: Use node position information
			const pos = symbol.node.getPos()
			const end = symbol.node.getEnd()

			if (pos !== undefined && end !== undefined) {
				// Get the text to remove
				const symbolText = sourceFile.getFullText().substring(pos, end)
				if (symbolText) {
					console.log(
						`[DEBUG] Removing symbol text by position: ${symbolText.substring(0, 100)}${symbolText.length > 100 ? "..." : ""}`,
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
		console.log(`[DEBUG] Cleaning up unreferenced dependencies in ${sourceFile.getFilePath()}`)

		try {
			// Remove any unused imports
			const importDeclarations = sourceFile.getImportDeclarations()
			let removedCount = 0

			for (const importDecl of importDeclarations) {
				const namedImports = importDecl.getNamedImports()

				// Check if any named imports are unused
				for (const namedImport of namedImports) {
					try {
						const name = namedImport.getName()
						// Use SyntaxKind.Identifier to find all identifiers in the file
						const references = sourceFile.getDescendantsOfKind(SyntaxKind.Identifier).filter((node) => {
							try {
								return node.getText() === name
							} catch (e) {
								// If we can't get text from a node, it might be removed/forgotten
								// Skip this node and continue
								return false
							}
						})

						// If there's only one reference (the import itself), remove it
						if (references.length <= 1) {
							namedImport.remove()
							removedCount++
						}
					} catch (e) {
						// If we can't process this named import, skip it
						console.log(`[DEBUG] Skipping named import due to error: ${(e as Error).message}`)
						continue
					}
				}

				// If all named imports were removed, remove the entire import declaration
				try {
					if (importDecl.getNamedImports().length === 0) {
						importDecl.remove()
					}
				} catch (e) {
					// If we can't check or remove the import declaration, skip it
					console.log(`[DEBUG] Skipping import declaration removal due to error: ${(e as Error).message}`)
				}
			}

			console.log(`[DEBUG] Removed ${removedCount} unused imports`)
		} catch (error) {
			// If dependency cleanup fails entirely, log it but don't fail the operation
			console.log(`[DEBUG] Dependency cleanup failed, but continuing: ${(error as Error).message}`)
		}
	}

	/**
	 * Gets statistics about removal operations since this orchestrator was created
	 */
	public getRemovalStats(): { attempted: number; succeeded: number; failed: number; degraded: number } {
		return { ...this.removalStats }
	}
}
