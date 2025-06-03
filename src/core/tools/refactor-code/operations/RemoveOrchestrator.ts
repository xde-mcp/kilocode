import { Project, SourceFile, SyntaxKind } from "ts-morph"
import { RemoveOperation } from "../schema"
import { OperationResult } from "../engine"
import { PathResolver } from "../utils/PathResolver"
import { FileManager } from "../utils/FileManager"
import { SymbolResolver } from "../core/SymbolResolver"
import { SymbolRemover } from "../core/SymbolRemover"
import { ResolvedSymbol, RemovalResult } from "../core/types"

/**
 * Orchestrates the symbol removal operation
 */
/**
 * Orchestrates the symbol removal operation with enhanced error recovery
 * and graceful degradation when problems occur
 */
export class RemoveOrchestrator {
	private pathResolver: PathResolver
	private fileManager: FileManager
	private symbolResolver: SymbolResolver
	private symbolRemover: SymbolRemover
	private removalStats: {
		attempted: number
		succeeded: number
		failed: number
		degraded: number
	} = { attempted: 0, succeeded: 0, failed: 0, degraded: 0 }

	constructor(private project: Project) {
		// Safely get compiler options, with fallbacks for tests
		const compilerOptions = project.getCompilerOptions() || {}
		const projectRoot = compilerOptions.rootDir || process.cwd()

		this.pathResolver = new PathResolver(projectRoot)
		this.fileManager = new FileManager(project, this.pathResolver)
		this.symbolResolver = new SymbolResolver(project)
		this.symbolRemover = new SymbolRemover()
	}

	/**
	 * Execute a REMOVE refactoring operation
	 */
	/**
	 * Execute a REMOVE refactoring operation with enhanced error recovery
	 * and better error messages
	 */
	async executeRemoveOperation(operation: RemoveOperation): Promise<OperationResult> {
		try {
			this.removalStats.attempted++
			console.log(`[DEBUG] Executing remove operation for symbol: ${operation.selector.name}`)

			// 1. Find the source file
			const sourceFilePath = this.pathResolver.normalizeFilePath(operation.selector.filePath)
			const sourceFile = await this.fileManager.ensureFileInProject(sourceFilePath)

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
			console.log(
				`[DEBUG] Found symbol '${symbol.name}' of type ${
					typeof symbol.node.getKindName === "function"
						? symbol.node.getKindName()
						: symbol.node.getKind
							? SyntaxKind[symbol.node.getKind()]
							: "unknown"
				}, exported: ${symbol.isExported}`,
			)

			// 3. Validate symbol can be removed
			const validation = this.symbolResolver.validateForRemoval(symbol)

			// Display warnings even if we can proceed
			if (validation.warnings.length > 0) {
				console.log(`[WARNING] Symbol removal warnings: ${validation.warnings.join(", ")}`)
			}

			if (!validation.canProceed) {
				// If there are external references, offer specific guidance
				const hasExternalReferences = validation.blockers.some(
					(blocker) => blocker.includes("external reference") || blocker.includes("used in"),
				)

				let errorMessage = validation.blockers.join(", ")

				if (hasExternalReferences) {
					errorMessage +=
						". You may need to remove references to this symbol first, or use the force option to remove it anyway."

					// Check if there's a force option available
					if (operation.options?.forceRemove) {
						return this.attemptForcedRemoval(operation, symbol, sourceFile, sourceFilePath)
					}
				}

				this.removalStats.failed++
				return {
					success: false,
					operation,
					error: errorMessage,
					affectedFiles: [sourceFilePath],
				}
			}

			// 4. Remove the symbol
			// 4. Remove the symbol
			const removalResult = await this.symbolRemover.removeSymbol(symbol)

			if (!removalResult.success) {
				// Try alternative removal methods if standard method fails
				if (operation.options?.fallbackToAggressive || operation.options?.forceRemove) {
					console.log(`[DEBUG] Standard removal failed, attempting aggressive removal for: ${symbol.name}`)
					return this.attemptAggressiveRemoval(operation, symbol, sourceFile, sourceFilePath)
				}

				this.removalStats.failed++
				return {
					success: false,
					operation,
					error:
						removalResult.error ||
						`Failed to remove symbol: ${operation.selector.name}. You can try again with aggressive removal option.`,
					affectedFiles: [sourceFilePath],
				}
			}

			// 5. Check if any unreferenced dependencies can be removed as well
			if (operation.options?.cleanupDependencies) {
				await this.cleanupUnreferencedDependencies(sourceFile)
			}

			// 6. Generate final result
			this.removalStats.succeeded++
			return {
				success: true,
				operation,
				affectedFiles: [sourceFilePath],
				removalMethod: removalResult.method,
			}
		} catch (error) {
			this.removalStats.failed++
			const err = error as Error
			console.error(`[ERROR] Remove operation failed:`, err)

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
	 * when standard removal fails
	 */
	private async attemptAggressiveRemoval(
		operation: RemoveOperation,
		symbol: ResolvedSymbol,
		sourceFile: SourceFile,
		sourceFilePath: string,
	): Promise<OperationResult> {
		try {
			// Try aggressive removal strategy
			const removalResult = await this.symbolRemover.removeSymbolAggressively(symbol)

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
			console.log(`[DEBUG] Attempting forced removal of symbol: ${symbol.name}`)

			// Use manual removal as a last resort
			const removalResult = await this.symbolRemover.removeSymbolManually(symbol)

			if (!removalResult.success) {
				this.removalStats.failed++
				return {
					success: false,
					operation,
					error: `Forced removal failed: ${removalResult.error || "Unknown error"}`,
					affectedFiles: [sourceFilePath],
				}
			}

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
			return {
				success: false,
				operation,
				error: `Forced removal failed with error: ${(error as Error).message}`,
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

		// Remove any unused imports
		const importDeclarations = sourceFile.getImportDeclarations()
		let removedCount = 0

		for (const importDecl of importDeclarations) {
			const namedImports = importDecl.getNamedImports()

			// Check if any named imports are unused
			for (const namedImport of namedImports) {
				const name = namedImport.getName()
				// Use SyntaxKind.Identifier to find all identifiers in the file
				const references = sourceFile
					.getDescendantsOfKind(SyntaxKind.Identifier)
					.filter((node) => node.getText() === name)

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

		console.log(`[DEBUG] Removed ${removedCount} unused imports`)
	}

	/**
	 * Gets statistics about removal operations since this orchestrator was created
	 */
	public getRemovalStats(): { attempted: number; succeeded: number; failed: number; degraded: number } {
		return { ...this.removalStats }
	}
}
