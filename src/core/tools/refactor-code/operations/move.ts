import { Project, Node, SourceFile, SyntaxKind } from "ts-morph"
import { MoveOperation } from "../schema"
import { OperationResult } from "../engine"
import { SymbolFinder } from "../utils/symbol-finder"
import { ImportManager } from "../utils/import-manager"
import * as path from "path"
import * as fsSync from "fs"
import { ensureDirectoryExists, writeFile, resolveFilePath } from "../utils/file-system"
import * as fs from "fs/promises"

/**
 * Verifies that a move operation succeeded
 */
interface VerificationResult {
	success: boolean
	error?: string
}

/**
 * Result of verifying that dependencies are properly imported
 */
interface DependencyVerificationResult {
	success: boolean
	error?: string
	missingImports?: string[]
}

function verifyMoveOperation(
	project: Project,
	symbolName: string,
	sourcePath: string,
	targetPath: string,
): VerificationResult {
	try {
		// Verify source file - symbol should be removed
		const sourceFile = project.getSourceFile(sourcePath)
		if (!sourceFile) {
			return {
				success: false,
				error: `Source file not found: ${sourcePath}`,
			}
		}

		// Verify target file - symbol should be added
		const targetFile = project.getSourceFile(targetPath)
		if (!targetFile) {
			return {
				success: false,
				error: `Target file not found: ${targetPath}`,
			}
		}

		// Check if the symbol still exists in source file
		const sourceSymbols = findSymbolsByName(sourceFile, symbolName)
		console.log(`[DEBUG] Verification - found ${sourceSymbols.length} instances of symbol in source file`)
		if (sourceSymbols.length > 0) {
			// Log details about the remaining symbols
			sourceSymbols.forEach((symbol, index) => {
				console.log(
					`[DEBUG] Remaining source symbol #${index + 1}: ${symbol.getKindName()} at line ${symbol.getStartLineNumber()}`,
				)
			})

			return {
				success: false,
				error: `Symbol '${symbolName}' still exists in source file (${sourceSymbols.length} instances found)`,
			}
		}

		// Check if the symbol exists in target file by examining the file text directly
		// This handles cases where the AST-based search might not find the symbol, but it's actually there
		const targetText = targetFile.getFullText()
		const functionRegex = new RegExp(`(export\\s+)?function\\s+${symbolName}\\s*\\(`, "g")
		const classRegex = new RegExp(`(export\\s+)?class\\s+${symbolName}(\\s|\\{)`, "g")
		const varRegex = new RegExp(`(export\\s+)?(const|let|var)\\s+${symbolName}\\s*=`, "g")

		const targetSymbols = findSymbolsByName(targetFile, symbolName)
		console.log(`[DEBUG] Verification - found ${targetSymbols.length} instances of symbol in target file`)

		// Log whether the text-based search finds the symbol
		const foundInText = functionRegex.test(targetText) || classRegex.test(targetText) || varRegex.test(targetText)

		console.log(`[DEBUG] Target file contains symbol via text search: ${foundInText}`)

		if (targetSymbols.length === 0 && !foundInText) {
			// Additional diagnostics for the target file
			console.log(`[DEBUG] Target file path: ${targetFile.getFilePath()}`)
			console.log(`[DEBUG] Target file size: ${targetFile.getFullText().length} bytes`)
			console.log(`[DEBUG] Target file contains symbol name: ${targetFile.getFullText().includes(symbolName)}`)

			return {
				success: false,
				error: `Symbol '${symbolName}' not found in target file`,
			}
		} else {
			// Log details about the target symbols found
			targetSymbols.forEach((symbol, index) => {
				console.log(
					`[DEBUG] Target symbol #${index + 1}: ${symbol.getKindName()} at line ${symbol.getStartLineNumber()}`,
				)
			})
		}

		// If we get here, we've verified the symbol is gone from source and exists in target
		return { success: true }
	} catch (error) {
		return {
			success: false,
			error: `Verification failed: ${(error as Error).message}`,
		}
	}
}

/**
 * Verifies that all dependencies required by a moved symbol are properly imported in the target file
 */
function verifyDependencyImports(
	project: Project,
	symbolName: string,
	sourceFile: SourceFile,
	targetFile: SourceFile,
): DependencyVerificationResult {
	try {
		console.log(`[DEBUG] Verifying dependencies for ${symbolName} in target file: ${targetFile.getFilePath()}`)

		// Get all imports in the target file
		const targetImports = new Set<string>()
		targetFile.getImportDeclarations().forEach((imp) => {
			imp.getNamedImports().forEach((named) => {
				targetImports.add(named.getName())
			})
		})
		console.log(`[DEBUG] Found ${targetImports.size} imports in target file`)

		// Find all references to identifiers in the moved symbol
		const symbolNodes = findSymbolsByName(targetFile, symbolName)
		if (symbolNodes.length === 0) {
			return {
				success: false,
				error: `Symbol '${symbolName}' not found in target file`,
			}
		}

		// Collect all identifiers referenced in the symbol
		const referencedIdentifiers = new Set<string>()
		const symbolNode = symbolNodes[0]

		// Skip property names in object literals and property access expressions
		symbolNode.getDescendantsOfKind(SyntaxKind.Identifier).forEach((identifier) => {
			const name = identifier.getText()
			const parent = identifier.getParent()

			// Skip property names in object literals
			if (parent && Node.isPropertyAssignment(parent) && parent.getNameNode() === identifier) {
				return
			}

			// Skip property access expressions where this is the property name
			if (parent && Node.isPropertyAccessExpression(parent) && parent.getNameNode() === identifier) {
				return
			}

			// Skip if it's a common keyword or the symbol itself
			if (
				["string", "number", "boolean", "any", "void", "null", "undefined", "this", "super"].includes(name) ||
				name === symbolName
			) {
				return
			}

			referencedIdentifiers.add(name)
		})
		console.log(`[DEBUG] Found ${referencedIdentifiers.size} referenced identifiers in moved symbol`)

		// Find identifiers that don't have imports in the target file
		const missingImports: string[] = []
		referencedIdentifiers.forEach((id) => {
			// Check if it's declared in the target file (as a local declaration)
			const isLocalDeclaration =
				targetFile.getVariableDeclaration(id) ||
				targetFile.getFunction(id) ||
				targetFile.getClass(id) ||
				targetFile.getInterface(id) ||
				targetFile.getTypeAlias(id) ||
				targetFile.getEnum(id)

			if (!isLocalDeclaration && !targetImports.has(id)) {
				// Double check if it's an importable symbol (declared somewhere)
				// We don't want to report property names or method names that don't need imports
				const isImportable = sourceFile
					.getImportDeclarations()
					.some((imp) => imp.getNamedImports().some((named) => named.getName() === id))

				if (isImportable) {
					missingImports.push(id)
				}
			}
		})

		if (missingImports.length > 0) {
			console.log(`[DEBUG] Found ${missingImports.length} missing imports: ${missingImports.join(", ")}`)
			return {
				success: false,
				error: `Missing imports in target file: ${missingImports.join(", ")}`,
				missingImports,
			}
		}

		return { success: true }
	} catch (error) {
		return {
			success: false,
			error: `Dependency verification failed: ${(error as Error).message}`,
		}
	}
}

/**
 * Finds all symbols with a given name in a file
 */
function findSymbolsByName(file: SourceFile, name: string): Node[] {
	const symbols: Node[] = []

	// Check for function declarations
	symbols.push(...file.getFunctions().filter((f) => f.getName() === name))

	// Check for class declarations
	symbols.push(...file.getClasses().filter((c) => c.getName() === name))

	// Check for interface declarations
	symbols.push(...file.getInterfaces().filter((i) => i.getName() === name))

	// Check for type alias declarations
	symbols.push(...file.getTypeAliases().filter((t) => t.getName() === name))

	// Check for enum declarations
	symbols.push(...file.getEnums().filter((e) => e.getName() === name))

	// Check for variable declarations
	symbols.push(...file.getVariableDeclarations().filter((v) => v.getName() === name))

	return symbols
}

/**
 * Checks if a symbol is a top-level declaration that can be moved
 */
function isTopLevelSymbol(symbol: Node): boolean {
	return (
		Node.isFunctionDeclaration(symbol) ||
		Node.isClassDeclaration(symbol) ||
		Node.isInterfaceDeclaration(symbol) ||
		Node.isTypeAliasDeclaration(symbol) ||
		Node.isEnumDeclaration(symbol) ||
		(Node.isVariableDeclaration(symbol) &&
			Node.isVariableStatement(symbol.getParent()?.getParent()) &&
			symbol.getParent()?.getParent()?.getParentIfKind(SyntaxKind.SourceFile) !== undefined)
	)
}

/**
 * Extracts a symbol's text from source file, including any associated comments
 */
function extractSymbolText(symbol: Node): string {
	// Get leading comments if any
	const fullText = symbol.getSourceFile().getFullText()
	const leadingComments = symbol.getLeadingCommentRanges()
	let text = ""

	// Include leading comments
	if (leadingComments && leadingComments.length > 0) {
		text =
			fullText.substring(leadingComments[0].getPos(), leadingComments[leadingComments.length - 1].getEnd()) + "\n"
	}

	// Get the actual symbol text
	if (Node.isVariableDeclaration(symbol)) {
		// For variable declarations, we need to get the entire variable statement
		const statement = symbol.getParent()?.getParent()
		if (statement) {
			// Check if this is an exported variable
			if (Node.isVariableStatement(statement) && statement.isExported()) {
				text += statement.getText()
			} else {
				// For non-exported variables, keep the export status
				const isExported = symbol.getFirstAncestorByKind(SyntaxKind.ExportKeyword) !== undefined
				if (isExported) {
					text += "export " + statement.getText()
				} else {
					text += statement.getText()
				}
			}
		} else {
			text += symbol.getText()
		}
	} else {
		text += symbol.getText()
	}

	return text
}

/**
 * Checks for naming conflicts in the target file
 */
function checkTargetFileConflicts(
	targetFile: SourceFile,
	symbolName: string,
): { hasConflict: boolean; message?: string } {
	// Check for existing declarations with the same name
	if (targetFile.getFunction(symbolName)) {
		return {
			hasConflict: true,
			message: `Function with name '${symbolName}' already exists in target file`,
		}
	}

	if (targetFile.getClass(symbolName)) {
		return {
			hasConflict: true,
			message: `Class with name '${symbolName}' already exists in target file`,
		}
	}

	if (targetFile.getInterface(symbolName)) {
		return {
			hasConflict: true,
			message: `Interface with name '${symbolName}' already exists in target file`,
		}
	}

	if (targetFile.getEnum(symbolName)) {
		return {
			hasConflict: true,
			message: `Enum with name '${symbolName}' already exists in target file`,
		}
	}

	if (targetFile.getTypeAlias(symbolName)) {
		return {
			hasConflict: true,
			message: `Type alias with name '${symbolName}' already exists in target file`,
		}
	}

	// Check variables
	const variableStatements = targetFile.getVariableStatements()
	for (const statement of variableStatements) {
		for (const declaration of statement.getDeclarations()) {
			if (declaration.getName() === symbolName) {
				return {
					hasConflict: true,
					message: `Variable with name '${symbolName}' already exists in target file`,
				}
			}
		}
	}

	return { hasConflict: false }
}

/**
 * Adds a symbol to the target file, preserving exports if needed
 */
function addSymbolToFile(targetFile: SourceFile, symbolText: string, isExported: boolean): void {
	// Add the symbol to the target file
	targetFile.addStatements(symbolText)

	// If the symbol was exported in the source file, add an export in the target file
	if (isExported) {
		// Check if the symbol is already exported in the text
		const isAlreadyExported = symbolText.trim().startsWith("export ")

		if (!isAlreadyExported) {
			// Add an export declaration
			// Extract the symbol name
			let symbolName = ""
			if (symbolText.includes("function ")) {
				symbolName = symbolText.split("function ")[1].split("(")[0].trim()
			} else if (symbolText.includes("class ")) {
				symbolName = symbolText.split("class ")[1].split(" ")[0].trim()
			} else if (symbolText.includes("interface ")) {
				symbolName = symbolText.split("interface ")[1].split(" ")[0].trim()
			} else if (symbolText.includes("enum ")) {
				symbolName = symbolText.split("enum ")[1].split(" ")[0].trim()
			} else if (symbolText.includes("type ")) {
				symbolName = symbolText.split("type ")[1].split(" ")[0].trim()
			} else if (symbolText.includes("const ")) {
				symbolName = symbolText.split("const ")[1].split(" ")[0].trim().replace(":", "").replace("=", "")
			} else if (symbolText.includes("let ")) {
				symbolName = symbolText.split("let ")[1].split(" ")[0].trim().replace(":", "").replace("=", "")
			}

			if (symbolName) {
				targetFile.addExportDeclaration({
					namedExports: [symbolName],
				})
			}
		}
	}
}

/**
 * Force removes a symbol from a source file using multiple strategies
 * This is a fallback when normal node removal fails
 */
export async function forceRemoveSymbol(sourceFile: SourceFile, symbolName: string): Promise<boolean> {
	// Try multiple strategies to remove the symbol
	let removed = false

	// Try to remove function declarations
	const functions = sourceFile.getFunctions().filter((f) => f.getName() === symbolName)
	for (const func of functions) {
		try {
			func.remove()
			console.log(`[DEBUG] Removed function declaration for ${symbolName}`)
			removed = true
		} catch (e) {
			console.error(`[ERROR] Failed to remove function: ${(e as Error).message}`)
		}
	}

	// Try to remove variable declarations
	const variables = sourceFile.getVariableDeclarations().filter((v) => v.getName() === symbolName)
	for (const variable of variables) {
		try {
			// For variable declarations, check if it's the only one in its statement
			const statement = variable.getParent()?.getParent()
			if (statement && Node.isVariableStatement(statement)) {
				const declarations = statement.getDeclarations()
				if (declarations.length === 1) {
					// Remove the entire statement
					statement.remove()
				} else {
					// Remove just this declaration
					variable.remove()
				}
			} else {
				variable.remove()
			}
			console.log(`[DEBUG] Removed variable declaration for ${symbolName}`)
			removed = true
		} catch (e) {
			console.error(`[ERROR] Failed to remove variable: ${(e as Error).message}`)
		}
	}

	// Try to remove class declarations
	const classes = sourceFile.getClasses().filter((c) => c.getName() === symbolName)
	for (const cls of classes) {
		try {
			cls.remove()
			console.log(`[DEBUG] Removed class declaration for ${symbolName}`)
			removed = true
		} catch (e) {
			console.error(`[ERROR] Failed to remove class: ${(e as Error).message}`)
		}
	}

	// Manual text-based removal as a fallback strategy
	if (!removed) {
		try {
			const fullText = sourceFile.getFullText()
			const regex = new RegExp(
				`(export)?\\s*(function|const|let|class|interface|type|enum)\\s+${symbolName}\\s*[\\(\\{\\:]`,
			)

			if (regex.test(fullText)) {
				// Find the declaration in the source text
				const match = regex.exec(fullText)
				if (match) {
					const startPos = match.index

					// Simple approach to remove the symbol
					const lines = fullText.split("\n")
					const newLines = []
					let skip = false

					for (let i = 0; i < lines.length; i++) {
						const line = lines[i]
						// If this line contains the start of the symbol declaration
						if (!skip && line.includes(match[0])) {
							skip = true
							continue
						}

						// If we're skipping and reached a line that looks like the end of a declaration
						if (skip && /^(export|function|const|let|class|interface|type|enum|\/\/)/.test(line.trim())) {
							skip = false
						}

						if (!skip) {
							newLines.push(line)
						}
					}

					const newText = newLines.join("\n")
					sourceFile.replaceWithText(newText)
					console.log(`[DEBUG] Removed symbol using text replacement`)
					removed = true
				}
			}
		} catch (e) {
			console.error(`[ERROR] Failed text-based removal: ${(e as Error).message}`)
		}
	}

	// Save the file immediately
	try {
		sourceFile.saveSync()
		console.log(`[DEBUG] Saved source file after removing symbol ${symbolName}`)
	} catch (e) {
		console.error(`[ERROR] Failed to save source file: ${(e as Error).message}`)
	}

	return removed
}

/**
 * Executes a MOVE refactoring operation
 *
 * This operation moves a symbol from one file to another, updating all imports
 * and exports as needed.
 */
export async function executeMoveOperation(
	project: Project,
	operation: MoveOperation,
): Promise<Partial<OperationResult>> {
	try {
		// Get project root path for file resolution
		const projectRoot = project.getCompilerOptions().rootDir || process.cwd()

		// Validate inputs
		if (!operation.targetFilePath) {
			return {
				success: false,
				operation,
				error: "Target file path is required for move operation",
				affectedFiles: [],
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

		// Check if moving to the same file
		if (operation.selector.filePath === operation.targetFilePath) {
			return {
				success: false,
				operation,
				error: "Cannot move symbol to the same file",
				affectedFiles: [],
			}
		}

		// Get source file
		// Normalize file paths for consistent handling
		const normalizedSourcePath = operation.selector.filePath.replace(/\\/g, "/")
		let sourceFile = project.getSourceFile(normalizedSourcePath)

		// If the file wasn't found in the project, check if it exists on disk
		if (!sourceFile) {
			const absoluteSourcePath = resolveFilePath(normalizedSourcePath, projectRoot)

			// Check if the file exists on disk
			if (fsSync.existsSync(absoluteSourcePath)) {
				// Add the file to the project using correct path
				try {
					// First try with the original path
					sourceFile = project.addSourceFileAtPath(normalizedSourcePath)
					console.log(`[DEBUG] Added existing source file to project: ${normalizedSourcePath}`)
				} catch (e) {
					// If that fails, try with absolute path
					try {
						sourceFile = project.addSourceFileAtPath(absoluteSourcePath)
						console.log(
							`[DEBUG] Added existing source file to project using absolute path: ${absoluteSourcePath}`,
						)
					} catch (e2) {
						// If absolute path fails, try converting to relative path
						try {
							const relativeSourcePath = path.isAbsolute(normalizedSourcePath)
								? path.relative(projectRoot, normalizedSourcePath)
								: normalizedSourcePath

							sourceFile = project.addSourceFileAtPath(relativeSourcePath)
							console.log(
								`[DEBUG] Added existing source file to project using relative path: ${relativeSourcePath}`,
							)
						} catch (e3) {
							console.log(
								`[WARNING] Failed to add source file to project using all path strategies: ${normalizedSourcePath}`,
							)
						}
					}
				}
			}

			// If still not found, return error
			if (!sourceFile) {
				return {
					success: false,
					operation,
					error: `Source file not found: ${normalizedSourcePath}. Absolute path: ${resolveFilePath(normalizedSourcePath, projectRoot)}`,
					affectedFiles: [],
				}
			}
		}

		// Find the symbol
		const finder = new SymbolFinder(sourceFile)
		const symbol = finder.findSymbol(operation.selector)

		if (!symbol) {
			return {
				success: false,
				operation,
				error: `Symbol '${operation.selector.name}' not found in ${operation.selector.filePath}`,
				affectedFiles: [],
			}
		}

		// Check if symbol is moveable (only top-level symbols)
		if (!isTopLevelSymbol(symbol)) {
			return {
				success: false,
				operation,
				error: `Symbol '${operation.selector.name}' is not a top-level symbol and cannot be moved`,
				affectedFiles: [],
			}
		}

		// Check if symbol is exported
		const isExported = finder.isExported(symbol)

		// Track affected files
		const affectedFiles = new Set<string>([operation.selector.filePath, operation.targetFilePath])

		// Normalize target path
		const normalizedTargetPath = operation.targetFilePath.replace(/\\/g, "/")

		// Ensure target directory exists
		const absoluteTargetPath = resolveFilePath(normalizedTargetPath, projectRoot)
		const targetDir = path.dirname(absoluteTargetPath)
		await ensureDirectoryExists(targetDir)

		// Get or create target file
		let targetFile = project.getSourceFile(normalizedTargetPath)

		// If the file wasn't in the project, add it now
		if (!targetFile) {
			// Check if the file exists on disk
			const fileExistsOnDisk = fsSync.existsSync(absoluteTargetPath)

			if (!fileExistsOnDisk) {
				// Create an empty file on disk
				await writeFile(absoluteTargetPath, "")
				console.log(`[DEBUG] Created empty target file: ${absoluteTargetPath}`)
			}

			// Try several strategies to add the file to the project
			try {
				// First try with normalized path
				targetFile = project.addSourceFileAtPath(normalizedTargetPath)
				console.log(`[DEBUG] Added target file to project: ${normalizedTargetPath}`)
			} catch (e) {
				// If that fails, try with absolute path
				try {
					targetFile = project.addSourceFileAtPath(absoluteTargetPath)
					console.log(`[DEBUG] Added target file to project using absolute path: ${absoluteTargetPath}`)
				} catch (e2) {
					// If absolute path fails, try with relative path
					try {
						const relativeTargetPath = path.isAbsolute(normalizedTargetPath)
							? path.relative(projectRoot, normalizedTargetPath)
							: normalizedTargetPath

						targetFile = project.addSourceFileAtPath(relativeTargetPath)
						console.log(`[DEBUG] Added target file to project using relative path: ${relativeTargetPath}`)
					} catch (e3) {
						// Last resort: create the file from scratch in the project
						try {
							const relativeTargetPath = path.isAbsolute(normalizedTargetPath)
								? path.relative(projectRoot, normalizedTargetPath)
								: normalizedTargetPath

							targetFile = project.createSourceFile(relativeTargetPath, "", {
								overwrite: true,
							})
							console.log(`[DEBUG] Created target file in project from scratch: ${relativeTargetPath}`)

							// Ensure the file exists on disk
							await writeFile(absoluteTargetPath, "")
						} catch (e4) {
							console.log(
								`[ERROR] All strategies failed to add/create target file: ${normalizedTargetPath}`,
							)
						}
					}
				}
			}
		}

		// Final check - we need a valid target file to continue
		if (!targetFile) {
			return {
				success: false,
				operation,
				error: `Failed to create or access target file: ${operation.targetFilePath}`,
				affectedFiles: [operation.selector.filePath],
			}
		}

		// Extract the symbol text with comments
		const symbolText = extractSymbolText(symbol)

		// Check for naming conflicts in target file
		const conflictCheck = checkTargetFileConflicts(targetFile, operation.selector.name)
		if (conflictCheck.hasConflict) {
			return {
				success: false,
				operation,
				error: `Naming conflict in target file: ${conflictCheck.message}`,
				affectedFiles: Array.from(affectedFiles),
			}
		}

		// Add to target file
		console.log(`[DEBUG] Adding symbol to target file: ${normalizedTargetPath}`)
		console.log(`[DEBUG] Symbol text length: ${symbolText.length} bytes`)
		console.log(
			`[DEBUG] Symbol text preview: ${symbolText.substring(0, 100)}${symbolText.length > 100 ? "..." : ""}`,
		)
		addSymbolToFile(targetFile, symbolText, isExported)

		// Save target file immediately after adding symbol
		try {
			targetFile.saveSync()
			console.log(`[DEBUG] Target file saved after adding symbol (${targetFile.getFilePath()})`)

			// Double-check the symbol was actually added by reading file from disk
			const targetFilePath = resolveFilePath(normalizedTargetPath, projectRoot)
			const targetContent = fsSync.readFileSync(targetFilePath, "utf8")
			console.log(`[DEBUG] Target file size on disk: ${targetContent.length} bytes`)
			console.log(`[DEBUG] Target file contains symbol name: ${targetContent.includes(operation.selector.name)}`)
		} catch (e) {
			console.error(`[ERROR] Failed to save target file: ${(e as Error).message}`)
		}

		// Create import manager
		const importManager = new ImportManager(project)

		// Update all imports before removing the symbol
		console.log(
			`[DEBUG] Updating imports for move: ${operation.selector.name} from ${operation.selector.filePath} to ${operation.targetFilePath}`,
		)

		// Add any referenced files to the project to ensure proper import updating
		try {
			// Find all files that might reference these files
			const projectFiles = project.addSourceFilesAtPaths([
				`${projectRoot}/**/*.ts`,
				`${projectRoot}/**/*.tsx`,
				`${projectRoot}/**/*.js`,
				`${projectRoot}/**/*.jsx`,
			])
			console.log(`[DEBUG] Added ${projectFiles.length} potential reference files to project for import updating`)
		} catch (e) {
			console.log(`[DEBUG] Error adding reference files: ${(e as Error).message}`)
		}

		// Enhanced import updating with dependency management
		console.log(`[DEBUG] Starting enhanced import handling for dependencies`)
		await importManager.updateImportsAfterMove(operation.selector.name, normalizedSourcePath, normalizedTargetPath)

		// Add additional affected files from import updates
		const updatedFiles = importManager.getUpdatedFiles()
		for (const file of updatedFiles) {
			console.log(`[DEBUG] Import updated in file: ${file}`)
			affectedFiles.add(file)
		}

		// Remove the symbol from the source file
		console.log(`[DEBUG] Removing symbol '${operation.selector.name}' from source file: ${normalizedSourcePath}`)

		let symbolRemoved = false

		// First try standard removal
		try {
			if (Node.isVariableDeclaration(symbol)) {
				// For variable declarations, check if it's the only one in its statement
				const statement = symbol.getParent()?.getParent()
				if (statement && Node.isVariableStatement(statement)) {
					const declarations = statement.getDeclarations()
					if (declarations.length === 1) {
						// Remove the entire statement
						console.log(`[DEBUG] Removing entire variable statement containing ${operation.selector.name}`)
						statement.remove()
					} else {
						// Remove just this declaration
						console.log(`[DEBUG] Removing only the declaration for ${operation.selector.name}`)
						if (Node.isRenameable(symbol)) {
							;(symbol as any).remove()
						}
					}
				}
			} else if (Node.isFunctionDeclaration(symbol)) {
				// For function declarations
				console.log(`[DEBUG] Removing function declaration for ${operation.selector.name}`)
				symbol.remove()
			} else {
				// For other declarations
				console.log(`[DEBUG] Removing declaration for ${operation.selector.name}`)
				if (Node.isRenameable(symbol)) {
					;(symbol as any).remove()
				}
			}

			// Save the source file immediately to ensure changes are applied
			sourceFile.saveSync()

			// Double-check the symbol was actually removed by reading file from disk
			const sourceFilePath = resolveFilePath(normalizedSourcePath, projectRoot)
			const sourceContent = fsSync.readFileSync(sourceFilePath, "utf8")
			const stillContainsSymbol =
				sourceContent.includes(`function ${operation.selector.name}`) ||
				sourceContent.includes(`const ${operation.selector.name}`) ||
				sourceContent.includes(`let ${operation.selector.name}`)

			console.log(`[DEBUG] Source file saved after symbol removal (standard approach)`)
			console.log(`[DEBUG] Source file path: ${sourceFilePath}`)
			console.log(`[DEBUG] Source file size on disk: ${sourceContent.length} bytes`)
			console.log(`[DEBUG] Source file still contains symbol after save: ${stillContainsSymbol}`)

			symbolRemoved = !stillContainsSymbol
		} catch (error) {
			console.error(`[ERROR] Standard removal failed: ${(error as Error).message}`)
		}

		// If standard approach failed, use the enhanced force removal
		if (!symbolRemoved) {
			console.log(`[DEBUG] Using enhanced force removal for ${operation.selector.name}`)
			await forceRemoveSymbol(sourceFile, operation.selector.name)
		}

		// Verify the symbol was removed
		const symbolsRemaining = findSymbolsByName(sourceFile, operation.selector.name)
		if (symbolsRemaining.length > 0) {
			console.log(
				`[WARNING] Symbol still exists after removal attempts: ${symbolsRemaining.length} instances found`,
			)

			// Last resort: direct file manipulation
			try {
				// Get file content and manually filter out the symbol
				const fileContent = await fs.readFile(resolveFilePath(normalizedSourcePath, projectRoot), "utf8")
				const lines = fileContent.split("\n")
				const filteredLines = lines.filter(
					(line) =>
						!line.includes(`function ${operation.selector.name}`) &&
						!line.includes(`const ${operation.selector.name}`) &&
						!line.includes(`let ${operation.selector.name}`),
				)

				// Write back the filtered content
				await fs.writeFile(resolveFilePath(normalizedSourcePath, projectRoot), filteredLines.join("\n"))
				console.log(`[DEBUG] Directly modified source file to remove symbol`)

				// Refresh the sourceFile
				sourceFile = project.addSourceFileAtPath(normalizedSourcePath)
			} catch (e) {
				console.error(`[ERROR] Failed direct file manipulation: ${(e as Error).message}`)
			}
		}

		// If the symbol was exported directly, remove the export as well
		if (isExported) {
			const exports = sourceFile.getExportDeclarations()
			for (const exportDecl of exports) {
				const namedExports = exportDecl.getNamedExports()
				const symbolExport = namedExports.find((exp) => exp.getName() === operation.selector.name)

				if (symbolExport) {
					if (namedExports.length === 1) {
						// Remove the entire export declaration if this is the only export
						exportDecl.remove()
					} else {
						// Check if the node can be safely removed
						// For export specifiers, we can use the node manipulation methods
						if (Node.isExportSpecifier(symbolExport)) {
							symbolExport.remove()
						} else {
							// If we can't directly remove it, we can manipulate the export declaration
							// by recreating it without the specific export
							const remainingExports = namedExports
								.filter((exp) => exp.getName() !== operation.selector.name)
								.map((exp) => exp.getName())

							exportDecl.remove()
							sourceFile.addExportDeclaration({
								namedExports: remainingExports,
							})
						}
					}
				}
			}
		}

		// Save all affected files to ensure changes are applied
		for (const filePath of affectedFiles) {
			const file = project.getSourceFile(filePath)
			if (file) {
				try {
					file.saveSync()
					console.log(`[DEBUG] Saved affected file: ${filePath}`)
				} catch (e) {
					console.log(`[WARNING] Failed to save affected file: ${filePath}`)
				}
			}
		}

		// Refresh files from disk to ensure we're using the latest content
		try {
			// Force refresh the source file
			project.removeSourceFile(sourceFile)
			sourceFile = project.addSourceFileAtPath(normalizedSourcePath)
			console.log(`[DEBUG] Refreshed source file from disk before verification`)

			// Force refresh the target file
			project.removeSourceFile(targetFile)
			targetFile = project.addSourceFileAtPath(normalizedTargetPath)
			console.log(`[DEBUG] Refreshed target file from disk before verification`)
		} catch (e) {
			console.error(`[ERROR] Failed to refresh files: ${(e as Error).message}`)
		}

		// Verify the move was successful
		console.log(`[DEBUG] Running verification for move operation:`)
		console.log(`[DEBUG] Symbol: ${operation.selector.name}`)
		console.log(`[DEBUG] Source path: ${normalizedSourcePath}`)
		console.log(`[DEBUG] Target path: ${normalizedTargetPath}`)

		const verificationResult = verifyMoveOperation(
			project,
			operation.selector.name,
			normalizedSourcePath,
			normalizedTargetPath,
		)

		if (!verificationResult.success) {
			console.log(`[DEBUG] Move verification failed: ${verificationResult.error}`)
			return {
				success: false,
				operation,
				error: `Move operation failed verification: ${verificationResult.error}`,
				affectedFiles: Array.from(affectedFiles),
			}
		}

		// Verify that dependencies are properly imported in target file
		console.log(`[DEBUG] Verifying dependency imports in target file`)
		const dependencyVerificationResult = verifyDependencyImports(
			project,
			operation.selector.name,
			sourceFile,
			targetFile,
		)

		if (!dependencyVerificationResult.success) {
			console.log(`[DEBUG] Dependency verification failed: ${dependencyVerificationResult.error}`)
			return {
				success: false,
				operation,
				error: `Move operation failed dependency verification: ${dependencyVerificationResult.error}`,
				affectedFiles: Array.from(affectedFiles),
			}
		}

		// Debug log to ensure we're explicitly setting success to true
		console.log(`[DEBUG] Move operation explicitly setting success: true`)

		const result = {
			success: true,
			operation,
			affectedFiles: Array.from(affectedFiles),
		}

		console.log(
			`[DEBUG] Move operation returning result: ${JSON.stringify({
				success: result.success,
				affectedFilesCount: result.affectedFiles.length,
			})}`,
		)

		return result
	} catch (error) {
		const err = error as Error
		return {
			success: false,
			operation,
			error: `Move operation failed: ${err.message}`,
			affectedFiles: [],
		}
	}
}
