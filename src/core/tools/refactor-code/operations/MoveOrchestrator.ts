import { Project, SourceFile } from "ts-morph"
import { MoveOperation } from "../schema"
import { OperationResult } from "../engine"
import { PathResolver } from "../utils/PathResolver"
import { FileManager } from "../utils/FileManager"
import { SymbolResolver } from "../core/SymbolResolver"
import { SymbolExtractor } from "../core/SymbolExtractor"
import { SymbolRemover } from "../core/SymbolRemover"
import { ImportManager } from "../utils/import-manager"
import { ResolvedSymbol, RemovalResult, ExtractedSymbol } from "../core/types"

/**
 * Orchestrates the symbol move operation
 */
export class MoveOrchestrator {
	private pathResolver: PathResolver
	private fileManager: FileManager
	private symbolResolver: SymbolResolver
	private symbolExtractor: SymbolExtractor
	private symbolRemover: SymbolRemover
	private importManager: ImportManager

	constructor(private project: Project) {
		// Safely get compiler options, with fallbacks for tests
		const compilerOptions = project.getCompilerOptions() || {}
		const projectRoot = compilerOptions.rootDir || process.cwd()

		this.pathResolver = new PathResolver(projectRoot)
		this.fileManager = new FileManager(project, this.pathResolver)
		this.symbolResolver = new SymbolResolver(project)
		this.symbolExtractor = new SymbolExtractor()
		this.symbolRemover = new SymbolRemover()
		this.importManager = new ImportManager(project)
	}

	/**
	 * Execute a MOVE refactoring operation
	 */
	async executeMoveOperation(operation: MoveOperation): Promise<OperationResult> {
		try {
			console.log(
				`[DEBUG] Executing move operation for symbol: ${operation.selector.name} to ${operation.targetFilePath}`,
			)

			// 1. Validate input parameters
			const validationResult = this.validateMoveOperation(operation)
			if (!validationResult.success) {
				return {
					success: false,
					operation,
					error: validationResult.error || "Invalid move operation",
					affectedFiles: validationResult.affectedFiles || [],
				}
			}

			// 2. Find and validate source file
			const sourceFileResult = await this.findSourceFile(operation)
			if (!sourceFileResult.success) {
				return {
					success: false,
					operation,
					error: sourceFileResult.error || "Failed to find source file",
					affectedFiles: sourceFileResult.affectedFiles || [],
				}
			}
			const sourceFile = sourceFileResult.sourceFile!

			// 3. Find and validate the symbol
			const symbolResult = this.resolveSymbol(operation, sourceFile)
			if (!symbolResult.success) {
				return {
					success: false,
					operation,
					error: symbolResult.error || "Failed to resolve symbol",
					affectedFiles: symbolResult.affectedFiles || [],
				}
			}
			const symbol = symbolResult.symbol!

			// 4. Validate the symbol can be moved
			const symbolValidationResult = this.validateSymbol(operation, symbol)
			if (!symbolValidationResult.success) {
				return {
					success: false,
					operation,
					error: symbolValidationResult.error || "Symbol cannot be moved",
					affectedFiles: symbolValidationResult.affectedFiles || [],
				}
			}

			// 5. Prepare the target file
			const targetFileResult = await this.prepareTargetFile(operation)
			if (!targetFileResult.success) {
				return {
					success: false,
					operation,
					error: targetFileResult.error || "Failed to prepare target file",
					affectedFiles: targetFileResult.affectedFiles || [],
				}
			}
			const targetFile = targetFileResult.targetFile!
			const targetFilePath = targetFileResult.targetFilePath!

			// 6. Extract the symbol and add it to target file
			const extractResult = await this.extractAndAddSymbol(symbol, targetFile, targetFilePath)
			if (!extractResult.success) {
				return {
					success: false,
					operation,
					error: extractResult.error || "Failed to extract and add symbol",
					affectedFiles: extractResult.affectedFiles || [],
				}
			}

			// 7. Remove the symbol from the source file
			const removalResult = await this.removeSymbolFromSource(symbol, operation)
			if (!removalResult.success) {
				return {
					success: false,
					operation,
					error: removalResult.error || "Failed to remove symbol from source file",
					affectedFiles: removalResult.affectedFiles || [],
				}
			}
			const removalMethod = removalResult.removalMethod

			// 8. Update imports across the project
			const sourceFilePath = this.pathResolver.normalizeFilePath(operation.selector.filePath)
			const importsResult = await this.updateProjectImports(
				operation.selector.name,
				sourceFilePath,
				targetFilePath,
			)

			// 9. Verify the move was successful
			const verificationResult = await this.verifyMoveOperation(
				operation,
				sourceFilePath,
				targetFilePath,
				importsResult.updatedFiles,
			)

			// 10. Generate final result
			return {
				success: verificationResult.success,
				operation,
				affectedFiles: verificationResult.affectedFiles,
				error: verificationResult.error,
				removalMethod,
			}
		} catch (error) {
			return {
				success: false,
				operation,
				error: `Unexpected error during move operation: ${(error as Error).message}`,
				affectedFiles: [],
			}
		}
	}

	/**
	 * Validate the move operation parameters
	 */
	private validateMoveOperation(operation: MoveOperation): {
		success: boolean
		error?: string
		affectedFiles?: string[]
	} {
		// Check if target file path is provided
		if (!operation.targetFilePath) {
			return {
				success: false,
				error: "Target file path is required for move operation",
				affectedFiles: [],
			}
		}

		// Check if moving to the same file
		if (operation.selector.filePath === operation.targetFilePath) {
			return {
				success: false,
				error: "Cannot move symbol to the same file",
				affectedFiles: [],
			}
		}

		return { success: true, affectedFiles: [] }
	}

	/**
	 * Find and validate the source file
	 */
	private async findSourceFile(operation: MoveOperation): Promise<{
		success: boolean
		sourceFile?: SourceFile
		error?: string
		affectedFiles?: string[]
	}> {
		const sourceFilePath = this.pathResolver.normalizeFilePath(operation.selector.filePath)
		const sourceFile = await this.fileManager.ensureFileInProject(sourceFilePath)

		if (!sourceFile) {
			return {
				success: false,
				error: `Source file not found: ${sourceFilePath}`,
				affectedFiles: [],
			}
		}

		return { success: true, sourceFile, affectedFiles: [] }
	}

	/**
	 * Resolve the symbol from the source file
	 */
	private resolveSymbol(
		operation: MoveOperation,
		sourceFile: SourceFile,
	): {
		success: boolean
		symbol?: ResolvedSymbol
		error?: string
		affectedFiles?: string[]
	} {
		const symbol = this.symbolResolver.resolveSymbol(operation.selector, sourceFile)
		if (!symbol) {
			return {
				success: false,
				error: `Symbol '${operation.selector.name}' not found in ${operation.selector.filePath}`,
				affectedFiles: [],
			}
		}

		return { success: true, symbol, affectedFiles: [] }
	}

	/**
	 * Validate if the symbol can be moved
	 */
	private validateSymbol(
		operation: MoveOperation,
		symbol: ResolvedSymbol,
	): {
		success: boolean
		error?: string
		affectedFiles?: string[]
	} {
		const validation = this.symbolResolver.validateForMove(symbol)
		if (!validation.canProceed) {
			return {
				success: false,
				error: validation.blockers.join(", "),
				affectedFiles: [symbol.filePath],
			}
		}

		return { success: true, affectedFiles: [] }
	}

	/**
	 * Prepare the target file for receiving the symbol
	 */
	private async prepareTargetFile(operation: MoveOperation): Promise<{
		success: boolean
		targetFile?: SourceFile
		targetFilePath?: string
		error?: string
		affectedFiles?: string[]
	}> {
		const targetFilePath = this.pathResolver.normalizeFilePath(operation.targetFilePath)
		const targetFile = await this.fileManager.createFileIfNeeded(targetFilePath)

		if (!targetFile) {
			return {
				success: false,
				error: `Failed to create or access target file: ${targetFilePath}`,
				affectedFiles: [],
			}
		}

		return { success: true, targetFile, targetFilePath, affectedFiles: [] }
	}

	/**
	 * Extract the symbol and add it to the target file
	 */
	private async extractAndAddSymbol(
		symbol: ResolvedSymbol,
		targetFile: SourceFile,
		targetFilePath: string,
	): Promise<{
		success: boolean
		error?: string
		affectedFiles?: string[]
	}> {
		// Extract the symbol
		const extractedSymbol = this.symbolExtractor.extractSymbol(symbol)

		// Add the symbol to the target file with a newline separator
		const writeResult = await this.fileManager.writeToFile(
			targetFilePath,
			targetFile.getFullText() + "\n\n" + extractedSymbol.text,
		)

		if (!writeResult) {
			return {
				success: false,
				error: `Failed to write symbol to target file: ${targetFilePath}`,
				affectedFiles: [symbol.filePath, targetFilePath],
			}
		}

		// Refresh the target file in the project
		await this.fileManager.ensureFileInProject(targetFilePath)

		return { success: true, affectedFiles: [targetFilePath] }
	}

	/**
	 * Remove the symbol from the source file
	 */
	private async removeSymbolFromSource(
		symbol: ResolvedSymbol,
		operation: MoveOperation,
	): Promise<{
		success: boolean
		error?: string
		affectedFiles?: string[]
		removalMethod?: "standard" | "aggressive" | "manual" | "failed"
	}> {
		const removalResult = await this.symbolRemover.removeSymbol(symbol)

		if (!removalResult.success) {
			return {
				success: false,
				error: removalResult.error || `Failed to remove symbol from source file after moving`,
				affectedFiles: [symbol.filePath, operation.targetFilePath],
			}
		}

		return {
			success: true,
			removalMethod: removalResult.method,
			affectedFiles: [symbol.filePath],
		}
	}

	/**
	 * Update imports across the project
	 */
	private async updateProjectImports(
		symbolName: string,
		sourceFilePath: string,
		targetFilePath: string,
	): Promise<{
		success: boolean
		updatedFiles: string[]
	}> {
		await this.importManager.updateImportsAfterMove(symbolName, sourceFilePath, targetFilePath)

		const updatedFiles = this.importManager.getUpdatedFiles()
		return { success: true, updatedFiles }
	}

	/**
	 * Verify the move operation was successful
	 */
	private async verifyMoveOperation(
		operation: MoveOperation,
		sourceFilePath: string,
		targetFilePath: string,
		updatedFiles: string[],
	): Promise<{
		success: boolean
		affectedFiles: string[]
		error?: string
	}> {
		// Refresh the target file to ensure we have the latest content
		const targetFileUpdated = await this.fileManager.ensureFileInProject(targetFilePath)

		// Check if the symbol is now in the target file
		const moveSuccessful = targetFileUpdated && targetFileUpdated.getFullText().includes(operation.selector.name)

		if (!moveSuccessful) {
			return {
				success: false,
				error: `Move operation failed: Symbol not found in target file after move`,
				affectedFiles: [sourceFilePath, targetFilePath, ...updatedFiles],
			}
		}

		// Deduplicate affected files
		const affectedFiles = [...new Set([sourceFilePath, targetFilePath, ...updatedFiles])]

		return {
			success: true,
			affectedFiles,
		}
	}
}
