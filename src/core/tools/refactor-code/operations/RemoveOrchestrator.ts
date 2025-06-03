import { Project, SourceFile } from "ts-morph"
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
export class RemoveOrchestrator {
	private pathResolver: PathResolver
	private fileManager: FileManager
	private symbolResolver: SymbolResolver
	private symbolRemover: SymbolRemover

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
	async executeRemoveOperation(operation: RemoveOperation): Promise<OperationResult> {
		try {
			console.log(`[DEBUG] Executing remove operation for symbol: ${operation.selector.name}`)

			// 1. Find the source file
			const sourceFilePath = this.pathResolver.normalizeFilePath(operation.selector.filePath)
			const sourceFile = await this.fileManager.ensureFileInProject(sourceFilePath)

			if (!sourceFile) {
				return {
					success: false,
					operation,
					error: `Source file not found: ${sourceFilePath}`,
					affectedFiles: [],
				}
			}

			// 2. Find the symbol
			const symbol = this.symbolResolver.resolveSymbol(operation.selector, sourceFile)
			if (!symbol) {
				return {
					success: false,
					operation,
					error: `Symbol '${operation.selector.name}' not found in ${sourceFilePath}`,
					affectedFiles: [],
				}
			}

			// 3. Validate symbol can be removed
			const validation = this.symbolResolver.validateForRemoval(symbol)
			if (!validation.canProceed) {
				return {
					success: false,
					operation,
					error: validation.blockers.join(", "),
					affectedFiles: [sourceFilePath],
				}
			}

			// 4. Remove the symbol
			const removalResult = await this.symbolRemover.removeSymbol(symbol)

			if (!removalResult.success) {
				return {
					success: false,
					operation,
					error: removalResult.error || `Failed to remove symbol: ${operation.selector.name}`,
					affectedFiles: [sourceFilePath],
				}
			}

			// 5. Generate final result
			return {
				success: true,
				operation,
				affectedFiles: [sourceFilePath],
				removalMethod: removalResult.method,
			}
		} catch (error) {
			return {
				success: false,
				operation,
				error: `Unexpected error during remove operation: ${(error as Error).message}`,
				affectedFiles: [],
			}
		}
	}
}
