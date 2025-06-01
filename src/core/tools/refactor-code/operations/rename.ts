import { Project, Node } from "ts-morph"
import { RenameOperation } from "../schema"
import { SymbolFinder } from "../utils/symbol-finder"
import { OperationResult } from "../engine"
import { readFile, writeFile } from "../utils/file-system"
import * as path from "path"
import * as fs from "fs/promises"

/**
 * Executes a RENAME refactoring operation
 *
 * This operation finds a symbol by its name and renames it, updating all references
 * across the project.
 */
export async function executeRenameOperation(
	project: Project,
	operation: RenameOperation,
): Promise<Partial<OperationResult>> {
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

		// Get project root path for file resolution
		const projectRoot = project.getCompilerOptions().rootDir || process.cwd()

		// Get source file - use let to allow reassignment
		let sourceFile = project.getSourceFile(operation.selector.filePath)

		// If file isn't in project, try to add it directly
		if (!sourceFile) {
			console.log(`[DEBUG] Source file not found in project, attempting to add it`)

			const absolutePath = path.isAbsolute(operation.selector.filePath)
				? operation.selector.filePath
				: path.join(projectRoot, operation.selector.filePath)

			console.log(`[DEBUG] Attempting to add file at absolute path: ${absolutePath}`)

			try {
				sourceFile = project.addSourceFileAtPath(absolutePath)
				if (!sourceFile) {
					console.error(`[ERROR] Failed to add file to project: ${absolutePath}`)
					return {
						success: false,
						operation,
						error: `Source file not found or couldn't be added: ${operation.selector.filePath}`,
						affectedFiles: [],
					}
				}
				console.log(`[DEBUG] Successfully added file to project`)
			} catch (error) {
				console.error(`[ERROR] Error adding file to project:`, error)
				return {
					success: false,
					operation,
					error: `Error adding file to project: ${(error as Error).message}`,
					affectedFiles: [],
				}
			}
		}

		// Load all potential reference files in the project directory
		// This is critical for finding cross-file references
		console.log(`[DEBUG] Loading all potentially related TypeScript files...`)
		try {
			// Get the directory of the source file
			const sourceDir = path.dirname(path.resolve(projectRoot, operation.selector.filePath))

			// Load TypeScript files in the project that might reference this file
			const projectFiles = project.addSourceFilesAtPaths([
				`${sourceDir}/**/*.ts`, // Files in the same directory and subdirectories
				`${projectRoot}/**/*.ts`, // All TypeScript files in the project
			])

			console.log(`[DEBUG] Loaded ${projectFiles.length} potential reference files into project`)
		} catch (error) {
			console.log(`[DEBUG] Error loading reference files: ${(error as Error).message}`)
			// Continue even if some files couldn't be loaded
		}

		// Note: We already loaded reference files above, no need to do it twice

		// Find the symbol using our non-recursive finder
		const finder = new SymbolFinder(sourceFile)
		const symbol = finder.findSymbol(operation.selector)

		if (!symbol) {
			console.error(`[ERROR] Symbol not found: ${operation.selector.name}`)
			return {
				success: false,
				operation,
				error: `Symbol '${operation.selector.name}' not found in ${operation.selector.filePath}`,
				affectedFiles: [],
			}
		}

		console.log(`[DEBUG] Found symbol: ${symbol.getText()}`)

		// Check if symbol is renameable
		if (!Node.isRenameable(symbol)) {
			console.error(`[ERROR] Symbol cannot be renamed: ${operation.selector.name}`)
			return {
				success: false,
				operation,
				error: `Symbol '${operation.selector.name}' cannot be renamed`,
				affectedFiles: [],
			}
		}

		// Find all references to track affected files
		const references = finder.getReferences(symbol)
		console.log(`[DEBUG] Found ${references.length} references to symbol`)

		const affectedFiles = new Set<string>()
		affectedFiles.add(operation.selector.filePath)

		// Add all files containing references
		for (const ref of references) {
			const refFile = ref.getSourceFile().getFilePath()
			affectedFiles.add(refFile)
		}

		// Check for naming conflicts
		const conflictCheck = checkNamingConflict(symbol, operation.newName)
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
		symbol.rename(operation.newName)

		// Save all affected files directly
		const affectedFilesArray = Array.from(affectedFiles)
		for (const filePath of affectedFilesArray) {
			const affectedFile = project.getSourceFile(filePath)
			if (affectedFile) {
				try {
					// Get absolute path for the file
					const projectRoot = project.getCompilerOptions().rootDir || process.cwd()
					const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath)

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

		console.log(`[DEBUG] Rename operation completed successfully. Affected files: ${affectedFilesArray.join(", ")}`)

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
 * Checks for naming conflicts that would prevent renaming
 */
function checkNamingConflict(symbol: Node, newName: string): { hasConflict: boolean; message?: string } {
	const sourceFile = symbol.getSourceFile()

	// Check if the new name already exists in the same scope
	if (Node.isFunctionDeclaration(symbol)) {
		const existingFunction = sourceFile.getFunction(newName)
		if (existingFunction && existingFunction !== symbol) {
			return {
				hasConflict: true,
				message: `Function '${newName}' already exists in the file`,
			}
		}
	}

	if (Node.isClassDeclaration(symbol)) {
		const existingClass = sourceFile.getClass(newName)
		if (existingClass && existingClass !== symbol) {
			return {
				hasConflict: true,
				message: `Class '${newName}' already exists in the file`,
			}
		}
	}

	if (Node.isInterfaceDeclaration(symbol)) {
		const existingInterface = sourceFile.getInterface(newName)
		if (existingInterface && existingInterface !== symbol) {
			return {
				hasConflict: true,
				message: `Interface '${newName}' already exists in the file`,
			}
		}
	}

	if (Node.isTypeAliasDeclaration(symbol)) {
		const existingType = sourceFile.getTypeAlias(newName)
		if (existingType && existingType !== symbol) {
			return {
				hasConflict: true,
				message: `Type '${newName}' already exists in the file`,
			}
		}
	}

	if (Node.isEnumDeclaration(symbol)) {
		const existingEnum = sourceFile.getEnum(newName)
		if (existingEnum && existingEnum !== symbol) {
			return {
				hasConflict: true,
				message: `Enum '${newName}' already exists in the file`,
			}
		}
	}

	// Check for variable name conflicts
	if (Node.isVariableDeclaration(symbol)) {
		const statements = sourceFile.getVariableStatements()
		for (const statement of statements) {
			const declarations = statement.getDeclarations()
			for (const decl of declarations) {
				if (decl.getName() === newName && decl !== symbol) {
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
