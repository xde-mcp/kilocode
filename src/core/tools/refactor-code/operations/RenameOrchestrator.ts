import { Project, Node, SourceFile } from "ts-morph"
import { RenameOperation } from "../schema"
import { OperationResult } from "../engine"
import { PathResolver } from "../utils/PathResolver"
import { FileManager } from "../utils/FileManager"
import { SymbolResolver } from "../core/SymbolResolver"
import { ResolvedSymbol } from "../core/types"
import * as path from "path"
import * as fs from "fs/promises"

/**
 * Orchestrates the symbol rename operation
 *
 * This operation finds a symbol by its name and renames it, updating all references
 * across the project.
 */
export class RenameOrchestrator {
	private pathResolver: PathResolver
	private fileManager: FileManager
	private symbolResolver: SymbolResolver

	constructor(private project: Project) {
		// Safely get compiler options, with fallbacks for tests
		const compilerOptions = project.getCompilerOptions() || {}
		const projectRoot = compilerOptions.rootDir || process.cwd()

		this.pathResolver = new PathResolver(projectRoot)
		this.fileManager = new FileManager(project, this.pathResolver)
		this.symbolResolver = new SymbolResolver(project)
	}

	/**
	 * Execute a RENAME refactoring operation
	 */
	async executeRenameOperation(operation: RenameOperation): Promise<OperationResult> {
		console.log(`[DEBUG] Starting rename operation: ${operation.selector.name} -> ${operation.newName}`)
		console.log(`[DEBUG] File path: ${operation.selector.filePath}`)

		try {
			// Validate operation
			if (!operation.newName || operation.newName.trim() === "") {
				console.log(`[ERROR] Invalid rename operation: new name cannot be empty`)
				return {
					success: false,
					operation,
					error: "New name cannot be empty",
					affectedFiles: [],
				}
			}

			// Find the source file
			const sourceFilePath = this.pathResolver.normalizeFilePath(operation.selector.filePath)
			const sourceFile = await this.fileManager.ensureFileInProject(sourceFilePath)

			if (!sourceFile) {
				return {
					success: false,
					operation,
					error: `Source file not found: ${sourceFilePath}. Please check the file path and ensure the file exists.`,
					affectedFiles: [],
				}
			}

			// Load all potential reference files in the project directory
			console.log(`[DEBUG] Loading all potentially related TypeScript files...`)
			try {
				// Get the directory of the source file
				const projectRoot = this.project.getCompilerOptions().rootDir || process.cwd()
				const sourceDir = path.dirname(path.resolve(projectRoot, sourceFilePath))

				// Load TypeScript files in the project that might reference this file
				const projectFiles = this.project.addSourceFilesAtPaths([
					`${sourceDir}/**/*.ts`, // Files in the same directory and subdirectories
					`${projectRoot}/**/*.ts`, // All TypeScript files in the project
				])

				console.log(`[DEBUG] Loaded ${projectFiles.length} potential reference files into project`)
			} catch (error) {
				console.log(`[DEBUG] Error loading reference files: ${(error as Error).message}`)
				// Continue even if some files couldn't be loaded
			}

			// Find the symbol
			const symbol = this.symbolResolver.resolveSymbol(operation.selector, sourceFile)
			if (!symbol) {
				return {
					success: false,
					operation,
					error: `Symbol '${operation.selector.name}' not found in ${sourceFilePath}. Check for typos in the symbol name.`,
					affectedFiles: [],
				}
			}

			console.log(`[DEBUG] Found symbol: ${symbol.node.getText()}`)

			// Check if symbol is renameable
			if (!Node.isRenameable(symbol.node)) {
				console.error(`[ERROR] Symbol cannot be renamed: ${operation.selector.name}`)
				return {
					success: false,
					operation,
					error: `Symbol '${operation.selector.name}' cannot be renamed`,
					affectedFiles: [],
				}
			}

			// Find all references to track affected files
			const references = this.getReferences(symbol, sourceFile)
			console.log(`[DEBUG] Found ${references.length} references to symbol`)

			const affectedFiles = new Set<string>()
			affectedFiles.add(sourceFilePath)

			// Add all files containing references
			for (const ref of references) {
				const refFile = ref.getSourceFile().getFilePath()
				affectedFiles.add(refFile)
			}

			// Check for naming conflicts
			const conflictCheck = this.checkNamingConflict(symbol, operation.newName, sourceFile)
			if (conflictCheck.hasConflict) {
				console.error(`[ERROR] Naming conflict: ${conflictCheck.message}`)
				return {
					success: false,
					operation,
					error: `Naming conflict: ${conflictCheck.message}`,
					affectedFiles: Array.from(affectedFiles),
				}
			}

			// Perform the rename operation directly
			symbol.node.rename(operation.newName)

			// Save all affected files directly
			const affectedFilesArray = Array.from(affectedFiles)
			for (const filePath of affectedFilesArray) {
				const affectedFile = this.project.getSourceFile(filePath)
				if (affectedFile) {
					try {
						// Get absolute path for the file
						const absolutePath = this.pathResolver.resolveAbsolutePath(filePath)

						// Ensure in-memory changes are saved within the project
						affectedFile.saveSync()

						// Get the content
						const content = affectedFile.getFullText()

						// Save to disk
						console.log(`[DEBUG] Saving file to disk: ${absolutePath}`)
						await fs.writeFile(absolutePath, content, "utf-8")
					} catch (error) {
						console.error(`[ERROR] Failed to save file ${filePath}:`, error)
					}
				}
			}

			console.log(
				`[DEBUG] Rename operation completed successfully. Affected files: ${affectedFilesArray.join(", ")}`,
			)

			return {
				success: true,
				operation,
				affectedFiles: affectedFilesArray,
			}
		} catch (error) {
			const err = error as Error
			console.error(`[ERROR] Rename operation failed:`, err)
			return {
				success: false,
				operation,
				error: `Rename operation failed: ${err.message}`,
				affectedFiles: [],
			}
		}
	}

	/**
	 * Gets all references to a symbol
	 */
	private getReferences(symbol: ResolvedSymbol, sourceFile: SourceFile): Node[] {
		if (!Node.isReferenceFindable(symbol.node)) {
			return []
		}

		// Cast the references to Identifier[] - we'll handle non-identifiers later if needed
		return symbol.node.findReferencesAsNodes()
	}

	/**
	 * Checks for naming conflicts that would prevent renaming
	 */
	private checkNamingConflict(
		symbol: ResolvedSymbol,
		newName: string,
		sourceFile: SourceFile,
	): { hasConflict: boolean; message?: string } {
		// Check if the new name already exists in the same scope
		if (Node.isFunctionDeclaration(symbol.node)) {
			const existingFunction = sourceFile.getFunction(newName)
			if (existingFunction && existingFunction !== symbol.node) {
				return {
					hasConflict: true,
					message: `Function '${newName}' already exists in the file`,
				}
			}
		}

		if (Node.isClassDeclaration(symbol.node)) {
			const existingClass = sourceFile.getClass(newName)
			if (existingClass && existingClass !== symbol.node) {
				return {
					hasConflict: true,
					message: `Class '${newName}' already exists in the file`,
				}
			}
		}

		if (Node.isInterfaceDeclaration(symbol.node)) {
			const existingInterface = sourceFile.getInterface(newName)
			if (existingInterface && existingInterface !== symbol.node) {
				return {
					hasConflict: true,
					message: `Interface '${newName}' already exists in the file`,
				}
			}
		}

		if (Node.isTypeAliasDeclaration(symbol.node)) {
			const existingType = sourceFile.getTypeAlias(newName)
			if (existingType && existingType !== symbol.node) {
				return {
					hasConflict: true,
					message: `Type '${newName}' already exists in the file`,
				}
			}
		}

		if (Node.isEnumDeclaration(symbol.node)) {
			const existingEnum = sourceFile.getEnum(newName)
			if (existingEnum && existingEnum !== symbol.node) {
				return {
					hasConflict: true,
					message: `Enum '${newName}' already exists in the file`,
				}
			}
		}

		// Check for variable name conflicts
		if (Node.isVariableDeclaration(symbol.node)) {
			const statements = sourceFile.getVariableStatements()
			for (const statement of statements) {
				const declarations = statement.getDeclarations()
				for (const decl of declarations) {
					if (decl.getName() === newName && decl !== symbol.node) {
						return {
							hasConflict: true,
							message: `Variable '${newName}' already exists in the file`,
						}
					}
				}
			}
		}

		// Check for reserved keywords
		const reservedKeywords = [
			"break",
			"case",
			"catch",
			"class",
			"const",
			"continue",
			"debugger",
			"default",
			"delete",
			"do",
			"else",
			"enum",
			"export",
			"extends",
			"false",
			"finally",
			"for",
			"function",
			"if",
			"import",
			"in",
			"instanceof",
			"new",
			"null",
			"return",
			"super",
			"switch",
			"this",
			"throw",
			"true",
			"try",
			"typeof",
			"var",
			"void",
			"while",
			"with",
			"let",
			"static",
			"yield",
			"implements",
			"interface",
			"package",
			"private",
			"protected",
			"public",
		]

		if (reservedKeywords.includes(newName)) {
			return {
				hasConflict: true,
				message: `'${newName}' is a reserved keyword`,
			}
		}

		return { hasConflict: false }
	}
}
