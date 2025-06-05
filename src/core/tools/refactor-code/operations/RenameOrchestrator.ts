import { Node, SourceFile, ImportDeclaration, ExportDeclaration, SyntaxKind, Project } from "ts-morph"
import { RenameOperation } from "../schema"
import { OperationResult } from "../engine"
import { SymbolResolver } from "../core/SymbolResolver"
import { ResolvedSymbol } from "../core/types"
import { ProjectManager } from "../core/ProjectManager"
import { refactorLogger } from "../utils/RefactorLogger"

/**
 * Orchestrates the symbol rename operation
 *
 * This operation finds a symbol by its name and renames it, updating all references
 * across the project.
 */
export class RenameOrchestrator {
	private projectManager: ProjectManager
	private symbolResolver: SymbolResolver

	constructor(project: Project, projectRoot?: string) {
		this.projectManager = new ProjectManager(project, projectRoot)
		this.symbolResolver = new SymbolResolver(project)
	}

	/**
	 * Execute a RENAME refactoring operation
	 */
	async executeRenameOperation(operation: RenameOperation): Promise<OperationResult> {
		refactorLogger.debug(`Starting rename operation: ${operation.selector.name} -> ${operation.newName}`)
		refactorLogger.debug(`File path: ${operation.selector.filePath}`)
		refactorLogger.debug(`Operation scope: ${operation.scope || "project"}`)

		try {
			// Validate operation
			const validationResult = this.validateRenameOperation(operation)
			if (!validationResult.isValid) {
				refactorLogger.error(`Invalid rename operation: ${validationResult.error}`)
				return {
					success: false,
					operation,
					error: validationResult.error,
					affectedFiles: [],
				}
			}

			// Find the source file
			const sourceFilePath = this.projectManager.getPathResolver().normalizeFilePath(operation.selector.filePath)
			const sourceFile = await this.projectManager.ensureSourceFile(sourceFilePath)

			if (!sourceFile) {
				return {
					success: false,
					operation,
					error: `Source file not found: ${sourceFilePath}. Please check the file path and ensure the file exists.`,
					affectedFiles: [],
				}
			}

			// Load all potential reference files in the project directory
			refactorLogger.debug(`Loading all potentially related TypeScript files...`)
			await this.projectManager.loadRelevantProjectFiles(sourceFilePath)

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

			refactorLogger.debug(`Found symbol: ${symbol.node.getText()}`)

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
			refactorLogger.debug(`Found ${references.length} references to symbol`)

			const affectedFiles = new Set<string>()
			// Ensure all paths are absolute for consistency
			// Use the source file's actual path from ts-morph which is already absolute
			const absoluteSourcePath = sourceFile.getFilePath()
			affectedFiles.add(absoluteSourcePath)

			// Add all files containing references
			for (const ref of references) {
				const refFile = ref.getSourceFile().getFilePath()
				// ts-morph already returns absolute paths for getFilePath()
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

			// Perform the rename operation using ts-morph's built-in rename functionality
			refactorLogger.debug(`About to rename symbol. Node type: ${symbol.node.getKindName()}`)
			refactorLogger.debug(`Current symbol name: ${symbol.name}`)
			refactorLogger.debug(`Target name: ${operation.newName}`)

			// Use ts-morph's rename method which handles all references automatically
			symbol.node.rename(operation.newName)
			refactorLogger.debug(`ts-morph rename completed successfully`)

			// Verify the rename worked in memory
			const updatedText = symbol.node.getText()
			refactorLogger.debug(`Symbol text after rename: ${updatedText}`)

			// Check if the source file is marked as modified
			const symbolSourceFile = symbol.node.getSourceFile()
			refactorLogger.debug(`Source file path: ${symbolSourceFile.getFilePath()}`)
			refactorLogger.debug(`Source file full text after rename:`)
			console.log(symbolSourceFile.getFullText().substring(0, 200) + "...")

			// Additional manual update for barrel file imports
			this.updateBarrelImports(affectedFiles, operation.selector.name, operation.newName)

			// Note: Files will be saved by the engine after this operation completes
			// No need to save here as it causes duplicate saves and path conflicts

			console.log(
				`[DEBUG] Rename operation completed successfully. Affected files: ${Array.from(affectedFiles).join(", ")}`,
			)

			return {
				success: true,
				operation,
				affectedFiles: Array.from(affectedFiles),
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
	 * Validates a rename operation before execution
	 */
	private validateRenameOperation(operation: RenameOperation): { isValid: boolean; error?: string } {
		// Check if new name is provided and not empty
		if (!operation.newName || operation.newName.trim() === "") {
			return { isValid: false, error: "New name cannot be empty" }
		}

		// Check if new name contains invalid characters
		const validNameRegex = /^[$A-Z_][0-9A-Z_$]*$/i
		if (!validNameRegex.test(operation.newName)) {
			return {
				isValid: false,
				error: `Invalid name: '${operation.newName}'. Names must start with a letter, $ or _ and contain only letters, numbers, $ or _.`,
			}
		}

		// New name shouldn't be the same as the old name
		if (operation.newName === operation.selector.name) {
			return { isValid: false, error: "New name must be different from the current name" }
		}

		return { isValid: true }
	}

	/**
	 * Gets all references to a symbol, including import and export declarations
	 */
	private getReferences(symbol: ResolvedSymbol, sourceFile: SourceFile): Node[] {
		if (!Node.isReferenceFindable(symbol.node)) {
			return []
		}

		// Get direct references to the symbol
		const directReferences = symbol.node.findReferencesAsNodes()

		// Additional logic to find references in import/export declarations that might be missed
		const additionalReferences = this.findImportExportReferences(symbol, sourceFile)

		// Combine all references and ensure uniqueness
		const allReferences = [...directReferences, ...additionalReferences]
		const uniqueReferences = this.removeDuplicateNodes(allReferences)

		console.log(
			`[DEBUG] Found ${uniqueReferences.length} total references (${directReferences.length} direct, ${additionalReferences.length} import/export)`,
		)

		return uniqueReferences
	}

	/**
	 * Finds references in import and export declarations that might be missed by regular reference finding
	 */
	private findImportExportReferences(symbol: ResolvedSymbol, sourceFile: SourceFile): Node[] {
		const references: Node[] = []
		const symbolName = symbol.name

		// Get all source files in the project
		const projectFiles = this.projectManager.getProject().getSourceFiles()

		for (const file of projectFiles) {
			// Process import declarations in all files (including source file for re-exports)
			const importDeclarations = file.getImportDeclarations()
			for (const importDecl of importDeclarations) {
				this.processImportDeclaration(importDecl, symbolName, references)
			}

			// Process export declarations in all files
			const exportDeclarations = file.getExportDeclarations()
			for (const exportDecl of exportDeclarations) {
				this.processExportDeclaration(exportDecl, symbolName, references)
			}

			// Process namespace imports that might reference our symbol
			const namespaceImports = file
				.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
				.filter((prop: any) => {
					const leftText = prop.getExpression().getText()
					const rightText = prop.getName()
					return rightText === symbolName && this.isNamespaceReference(leftText, file)
				})

			references.push(...namespaceImports)
		}

		return references
	}

	/**
	 * Process an import declaration to find references to the symbol
	 */
	private processImportDeclaration(importDecl: ImportDeclaration, symbolName: string, references: Node[]): void {
		// Check named imports
		const namedImports = importDecl.getNamedImports()
		for (const namedImport of namedImports) {
			// Check both the name and alias
			const importName = namedImport.getName()
			const importAlias = namedImport.getAliasNode()?.getText()

			if (importName === symbolName) {
				references.push(namedImport.getNameNode())
			} else if (importAlias === symbolName) {
				references.push(namedImport.getAliasNode()!)
			}
		}

		// Check namespace imports that might be importing the module containing our symbol
		const namespaceImport = importDecl.getNamespaceImport()
		if (namespaceImport) {
			// We can't directly add this as a reference, but we'll note it for potential namespace usage
			// This is handled in findImportExportReferences with PropertyAccessExpressions
		}
	}

	/**
	 * Process an export declaration to find references to the symbol
	 */
	private processExportDeclaration(exportDecl: ExportDeclaration, symbolName: string, references: Node[]): void {
		// Check named exports
		const namedExports = exportDecl.getNamedExports()
		for (const namedExport of namedExports) {
			// Check both the name and alias
			const exportName = namedExport.getName()
			const exportAlias = namedExport.getAliasNode()?.getText()

			if (exportName === symbolName) {
				references.push(namedExport.getNameNode())
			} else if (exportAlias === symbolName) {
				references.push(namedExport.getAliasNode()!)
			}
		}
	}

	/**
	 * Check if a name is a namespace reference in a file
	 */
	private isNamespaceReference(name: string, file: SourceFile): boolean {
		// Check if this name comes from a namespace import
		const namespaceImports = file
			.getImportDeclarations()
			.map((importDecl) => importDecl.getNamespaceImport())
			.filter(Boolean)
			.map((namespace) => namespace!.getText())

		return namespaceImports.includes(name)
	}

	/**
	 * Remove duplicate nodes from an array of nodes
	 */
	private removeDuplicateNodes(nodes: Node[]): Node[] {
		const seen = new Set<string>()
		return nodes.filter((node) => {
			const nodeId = `${node.getSourceFile().getFilePath()}:${node.getPos()}`
			if (seen.has(nodeId)) {
				return false
			}
			seen.add(nodeId)
			return true
		})
	}

	/**
	 * Updates imports in files that import through barrel files (index.ts)
	 * This handles the case where a symbol is imported via a barrel file and
	 * ts-morph doesn't track it as a direct reference
	 */
	private updateBarrelImports(affectedFiles: Set<string>, oldName: string, newName: string): void {
		// Get all source files in the project
		const projectFiles = this.projectManager.getProject().getSourceFiles()

		// Look for all import statements that might import our renamed symbol through barrel files
		for (const file of projectFiles) {
			let modified = false
			const importDeclarations = file.getImportDeclarations()

			for (const importDecl of importDeclarations) {
				// Get the module specifier (the path being imported from)
				const moduleSpecifier = importDecl.getModuleSpecifierValue()

				// If this import is from a likely barrel file (ends with a directory name or is index)
				if (
					moduleSpecifier.endsWith("/index") ||
					!moduleSpecifier.includes("/") || // Top-level import
					moduleSpecifier.split("/").pop()?.indexOf(".") === -1
				) {
					// Directory import

					// Check the named imports
					const namedImports = importDecl.getNamedImports()
					for (const namedImport of namedImports) {
						if (namedImport.getName() === oldName) {
							namedImport.setName(newName)
							modified = true
							refactorLogger.debug(`Updated barrel import in ${file.getFilePath()}`)
						}
					}
				}
			}

			// Check for usages of the old name in the file body
			if (modified) {
				const fileText = file.getFullText()
				if (fileText.includes(oldName)) {
					// Replace direct usages of the old name that were imported via barrel
					const replacedText = fileText.replace(new RegExp(`\\b${oldName}\\b(?!\\s*=|\\s*:)`, "g"), newName)

					if (replacedText !== fileText) {
						file.replaceWithText(replacedText)
						refactorLogger.debug(`Updated usages of barrel import in ${file.getFilePath()}`)
					}
				}

				// If file was modified, ensure it's in affected files
				affectedFiles.add(file.getFilePath())
			}
		}
	}

	/**
	 * Load index barrel files that might re-export the renamed symbol
	 */
	private loadBarrelFilesInProject(projectRoot: string): void {
		try {
			// Find all index.ts files that might be barrel files
			const barrelFiles = this.projectManager
				.getProject()
				.addSourceFilesAtPaths([`${projectRoot}/**/index.ts`, `${projectRoot}/**/index.tsx`])

			refactorLogger.debug(`Loaded ${barrelFiles.length} potential barrel files`)
		} catch (error) {
			refactorLogger.debug(`Error loading barrel files: ${(error as Error).message}`)
		}
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
