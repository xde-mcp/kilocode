import { Project, SourceFile, Node, ImportDeclaration, SyntaxKind } from "ts-morph"
import * as path from "path"
import * as fs from "fs"
import { MoveOperation } from "../schema"
import { PathResolver } from "../utils/PathResolver"
import { FileManager } from "../utils/FileManager"
import { SymbolResolver } from "../core/SymbolResolver"
import { ResolvedSymbol } from "../core/types"
import { ImportManager } from "../utils/import-manager"
import { ProjectManager } from "../core/ProjectManager"
import { PerformanceTracker } from "../utils/performance-tracker"
import { refactorLogger } from "../utils/RefactorLogger"

/**
 * Result of a move operation execution.
 */
export interface MoveExecutionResult {
	/** Whether the operation was successful */
	success: boolean
	/** Error message if operation failed */
	error?: string
	/** Files affected by the operation */
	affectedFiles: string[]
	/** Warning messages about potential issues */
	warnings: string[]
	/** Detailed information about the move operation */
	details?: {
		/** The original source file path */
		sourceFilePath: string
		/** The target file path */
		targetFilePath: string
		/** The name of the moved symbol */
		symbolName: string
		/** Files that had references updated */
		updatedReferenceFiles: string[]
		/** Whether the operation was copy-only (no removal from source) */
		copyOnly: boolean
	}
}

/**
 * Executes move operations by transferring symbols between files
 * and updating all necessary references.
 *
 * This class handles the core execution logic for moving a symbol:
 * 1. Extracting the symbol and its dependencies from the source file
 * 2. Adding the symbol to the target file
 * 3. Updating imports in the target file
 * 4. Removing the symbol from the source (unless copy-only)
 * 5. Updating imports in other files that reference the moved symbol
 */
export class MoveExecutor {
	private pathResolver: PathResolver
	private fileManager: FileManager
	private symbolResolver: SymbolResolver

	/**
	 * Creates a new MoveExecutor instance.
	 *
	 * @param project - The ts-morph Project instance for code analysis and manipulation
	 */
	constructor(
		private project: Project,
		private projectManager?: ProjectManager,
	) {
		if (projectManager) {
			// Use the ProjectManager's components if provided
			this.pathResolver = projectManager.getPathResolver()
			this.fileManager = projectManager.getFileManager()
		} else {
			// Create our own instances if no ProjectManager is provided
			const compilerOptions = project.getCompilerOptions() || {}
			// Avoid using process.cwd() as fallback since it can be incorrect in test environments
			const projectRoot = compilerOptions.rootDir || "."

			this.pathResolver = new PathResolver(projectRoot)
			this.fileManager = new FileManager(project, this.pathResolver)
		}

		// Always create a new SymbolResolver with the project
		this.symbolResolver = new SymbolResolver(project)
	}

	/**
	 * Executes a validated move operation.
	 *
	 * @param operation - The move operation to execute
	 * @param validationData - Pre-validated data including resolved symbol and source file
	 * @param options - Additional options for the operation
	 * @returns A result object with details about the execution
	 */
	async execute(
		operation: MoveOperation,
		validationData: {
			symbol: ResolvedSymbol
			sourceFile: SourceFile
		},
		options: {
			copyOnly?: boolean
		} = {},
	): Promise<MoveExecutionResult> {
		// Start performance tracking for this operation
		const opId = `move-exec-${operation.selector.name}-${Date.now()}`
		PerformanceTracker.startTracking(opId)

		const { symbol, sourceFile } = validationData
		const { copyOnly = false } = options
		const warnings: string[] = []

		try {
			// Ensure we have all required properties for symbol data
			if (!symbol.filePath || typeof symbol.filePath !== "string") {
				// Use the operation data if symbol data is incomplete
				symbol.filePath = operation.selector.filePath
			}

			// Normalize paths for consistent handling - measure this step
			const { normalizedSourcePath, absoluteSourcePath, normalizedTargetPath, absoluteTargetPath } =
				await PerformanceTracker.measureStep(opId, "normalize-paths", async () => {
					// Ensure we have valid paths, especially in test environments
					const sourcePath = symbol.filePath || operation.selector.filePath
					const targetPath = operation.targetFilePath

					// Standardize and normalize the paths
					const normalizedSourcePath = this.pathResolver.standardizePath(sourcePath)
					const absoluteSourcePath = this.pathResolver.resolveAbsolutePath(normalizedSourcePath)
					const normalizedTargetPath = this.pathResolver.standardizePath(targetPath)
					const absoluteTargetPath = this.pathResolver.resolveAbsolutePath(normalizedTargetPath)

					return { normalizedSourcePath, absoluteSourcePath, normalizedTargetPath, absoluteTargetPath }
				})

			// Use standardized paths to avoid duplicates
			const initialAffectedFiles = [
				symbol.filePath,
				normalizedSourcePath,
				absoluteSourcePath,
				operation.targetFilePath,
				normalizedTargetPath,
				absoluteTargetPath,
			]

			// Use simple array for affected files
			const affectedFiles = initialAffectedFiles

			// Step 1: Ensure target file exists and is in the project
			const targetFile = await PerformanceTracker.measureStep(opId, "prepare-target", async () => {
				return this.prepareTargetFile(operation.targetFilePath)
			})

			if (!targetFile) {
				PerformanceTracker.endTracking(opId)
				return {
					success: false,
					error: `Failed to prepare target file: ${operation.targetFilePath}`,
					affectedFiles,
					warnings,
				}
			}

			// Step 2: Extract symbol text and required imports from source file
			const { symbolText, requiredImports, relatedTypes } = await PerformanceTracker.measureStep(
				opId,
				"extract-symbol",
				() => this.extractSymbolWithDependencies(symbol, sourceFile),
			)

			// Step 3: Add symbol to target file with proper imports
			const targetUpdated = await PerformanceTracker.measureStep(opId, "add-to-target", async () => {
				return this.addSymbolToTargetFile(targetFile, symbolText, requiredImports, sourceFile, relatedTypes)
			})

			if (!targetUpdated) {
				PerformanceTracker.endTracking(opId)
				return {
					success: false,
					error: `Failed to add symbol to target file: ${operation.targetFilePath}`,
					affectedFiles,
					warnings,
				}
			}

			// Step 4: Remove symbol from source file (unless copy-only)
			if (!copyOnly) {
				const removeResult = await PerformanceTracker.measureStep(opId, "remove-from-source", async () => {
					return this.removeSymbolFromSourceFile(symbol, sourceFile)
				})

				if (!removeResult.success) {
					warnings.push(`Symbol may not have been fully removed from source: ${removeResult.error}`)
				}
			}

			// STEP 4: Update imports using centralized ImportManager (replaces duplicate logic)
			const importUpdatedFiles = await this.updateReferencingFiles(symbol, operation.targetFilePath)
			let updatedReferenceFiles: string[] = importUpdatedFiles

			// Save files - measure this step
			await PerformanceTracker.measureStep(opId, "save-files", async () => {
				// Save files and refresh project
				if (this.projectManager) {
					this.project.saveSync()
					this.projectManager.refreshProjectFiles()
				} else {
					this.project.saveSync()
				}
				return true
			})

			// Add all referenced files to affected files list and standardize
			const allAffectedFiles = [...affectedFiles, ...updatedReferenceFiles]
			const finalAffectedFiles = this.pathResolver.standardizeAndDeduplicatePaths(allAffectedFiles)

			// Ensure all paths are absolute for engine compatibility
			const absoluteAffectedFiles = finalAffectedFiles.map((filePath) => {
				// If it's already absolute, use it as-is
				if (path.isAbsolute(filePath)) {
					return filePath
				}
				// Convert relative paths to absolute using the project root
				return this.pathResolver.resolveAbsolutePath(filePath)
			})

			// Return successful result with details
			PerformanceTracker.endTracking(opId)
			return {
				success: true,
				affectedFiles: absoluteAffectedFiles,
				warnings,
				details: {
					sourceFilePath: symbol.filePath,
					targetFilePath: operation.targetFilePath,
					symbolName: symbol.name,
					updatedReferenceFiles,
					copyOnly,
				},
			}
		} catch (error) {
			refactorLogger.error(`MoveExecutor: Exception during execution: ${(error as Error).message}`)
			PerformanceTracker.endTracking(opId)

			return {
				success: false,
				error: `Move operation failed: ${(error as Error).message}`,
				affectedFiles: [symbol.filePath, operation.targetFilePath],
				warnings,
			}
		}
	}

	/**
	 * Prepares the target file by ensuring it exists and is loaded in the project.
	 *
	 * @param targetFilePath - Path to the target file
	 * @returns The target SourceFile object
	 */

	private async prepareTargetFile(targetFilePath: string): Promise<SourceFile | null> {
		try {
			// Use ProjectManager if available for more consistent file handling
			if (this.projectManager) {
				const result = await this.projectManager.ensureSourceFile(targetFilePath)
				if (result) {
					return result
				}
			}

			// Fall back to original implementation
			const normalizedPath = this.pathResolver.normalizeFilePath(targetFilePath)

			// Check if the file already exists in the project first
			let targetFile = this.project.getSourceFile(normalizedPath)
			if (targetFile) {
				return targetFile
			}

			// Try to add existing file first, then create if needed
			try {
				// First, try to add the existing file to the project if it exists on disk
				const absoluteTargetPath = this.pathResolver.resolveAbsolutePath(normalizedPath)

				if (fs.existsSync(absoluteTargetPath)) {
					try {
						targetFile = this.project.addSourceFileAtPath(absoluteTargetPath)
						if (targetFile) {
							return targetFile
						}
					} catch (addError) {
						// Continue to fallback options
					}
				}

				// If file doesn't exist or couldn't be added, create it
				// Ensure the directory exists
				const dirName = this.pathResolver.getDirectoryPath(absoluteTargetPath)
				if (!fs.existsSync(dirName)) {
					fs.mkdirSync(dirName, { recursive: true })
				}

				// Create the file in the project using absolute path to avoid working directory issues
				// CRITICAL FIX: Create truly empty files to prevent false naming conflicts in batch operations
				targetFile = this.project.createSourceFile(absoluteTargetPath, "", {
					overwrite: true,
				})

				if (targetFile) {
					return targetFile
				}
			} catch (error) {
				refactorLogger.error(`Failed to prepare file: ${(error as Error).message}`)
				// Continue to fallback options
			}

			// For non-test environments, use the FileManager
			const absolutePath = this.pathResolver.resolveAbsolutePath(normalizedPath)
			return await this.fileManager.createFileIfNeeded(absolutePath, "")
		} catch (error) {
			refactorLogger.error(`Failed to prepare target file: ${(error as Error).message}`)

			// As a last resort, try a simplified approach
			try {
				const normalizedPath = this.pathResolver.normalizeFilePath(targetFilePath)
				// CRITICAL FIX: Emergency fallback should also create empty files
				const emergencyFile = this.project.createSourceFile(normalizedPath, "", {
					overwrite: true,
				})
				return emergencyFile
			} catch (e) {
				refactorLogger.error(`Final fallback file creation failed: ${e}`)
			}

			return null
		}
	}

	/**
	 * Extracts the symbol text and identifies required imports.
	 *
	 * @param symbol - The resolved symbol to extract
	 * @param sourceFile - The source file containing the symbol
	 * @returns The symbol text and required imports
	 */
	private extractSymbolWithDependencies(
		symbol: ResolvedSymbol,
		sourceFile: SourceFile,
	): { symbolText: string; requiredImports: ImportDeclaration[]; relatedTypes: string[] } {
		// Get the text of the symbol node
		const symbolText = symbol.node.getText()

		// Find all imports that might be required by this symbol
		const importDependencies = this.findImportDependencies(symbol.node, sourceFile)

		// Extract related type dependencies that should be moved with the symbol
		const relatedTypes: string[] = []
		const referencedTypeNames = new Set<string>()

		// Check for interfaces defined in the same file
		sourceFile.getInterfaces().forEach((interfaceDecl) => {
			const interfaceName = interfaceDecl.getName()
			// Check if this interface is referenced by the symbol
			if (symbolText.includes(interfaceName)) {
				// refactorLogger.debug(`Found referenced interface: ${interfaceName}`)
				relatedTypes.push(interfaceDecl.getText())
				referencedTypeNames.add(interfaceName)
			}
		})

		// Look for type references in the symbol
		symbol.node.forEachDescendant((node) => {
			if (node.getKindName() === "TypeReference") {
				const identifier = node.getFirstDescendantByKind(SyntaxKind.Identifier)
				if (identifier) {
					const typeName = identifier.getText()
					referencedTypeNames.add(typeName)
				}
			} else if (node.getKindName() === "PropertySignature" || node.getKindName() === "Parameter") {
				// Extract type references from properties and parameters
				const typeNode = (node as any).getTypeNode?.()
				if (typeNode) {
					const typeName = typeNode.getText()
					// Simple heuristic to identify type references
					if (/^[A-Z][a-zA-Z0-9]*$/.test(typeName)) {
						referencedTypeNames.add(typeName)
					}
				}
			}
		})

		// Find declarations for these type references
		const processedTypes = new Set<string>()
		const findTypeDependencies = (typeName: string) => {
			if (processedTypes.has(typeName)) return // Avoid circular references

			processedTypes.add(typeName)

			// Find the type declaration
			let typeNode: Node | undefined

			// Look for interface declarations
			sourceFile.getInterfaces().forEach((interfaceDecl) => {
				if (interfaceDecl.getName() === typeName) {
					typeNode = interfaceDecl

					// Check for extends clauses which may reference other interfaces
					const extendsClause = interfaceDecl.getExtends()
					extendsClause.forEach((ext) => {
						const extName = ext.getText().split("<")[0].trim() // Handle generics
						if (!processedTypes.has(extName)) {
							referencedTypeNames.add(extName)
							findTypeDependencies(extName)
						}
					})

					// Add the interface to related types
					relatedTypes.push(interfaceDecl.getText())
				}
			})

			// Look for type aliases
			if (!typeNode) {
				sourceFile.getTypeAliases().forEach((typeAlias) => {
					if (typeAlias.getName() === typeName) {
						typeNode = typeAlias

						// Add the type alias to related types
						relatedTypes.push(typeAlias.getText())

						// Look for references to other types in the type alias
						typeAlias.forEachDescendant((node) => {
							if (node.getKindName() === "TypeReference") {
								const id = node.getFirstDescendantByKind(SyntaxKind.Identifier)
								if (id && id.getText() !== typeName) {
									// Avoid self-reference
									const referencedType = id.getText()
									if (!processedTypes.has(referencedType)) {
										referencedTypeNames.add(referencedType)
										findTypeDependencies(referencedType)
									}
								}
							}
						})
					}
				})
			}

			// Look for enums
			if (!typeNode) {
				sourceFile.getEnums().forEach((enumDecl) => {
					if (enumDecl.getName() === typeName) {
						typeNode = enumDecl
						relatedTypes.push(enumDecl.getText())
					}
				})
			}
		}

		// Process all referenced types
		referencedTypeNames.forEach((typeName) => findTypeDependencies(typeName))

		// Removed excessive dependency logging

		return {
			symbolText,
			requiredImports: importDependencies,
			relatedTypes,
		}
	}

	/**
	 * Identifies import statements needed by the symbol.
	 *
	 * @param symbolNode - The node representing the symbol
	 * @param sourceFile - The source file containing the symbol
	 * @returns Array of import declarations needed by the symbol
	 */
	private findImportDependencies(symbolNode: Node, sourceFile: SourceFile): ImportDeclaration[] {
		// Get all import declarations from the source file
		const allImports = sourceFile.getImportDeclarations()
		const requiredImports: ImportDeclaration[] = []

		// Get the symbol text to analyze for dependencies
		const symbolText = symbolNode.getText()

		// Find imports that are used in the symbol text
		for (const importDecl of allImports) {
			let isImportUsed = false

			// Check named imports
			const namedImports = importDecl.getNamedImports()
			for (const namedImport of namedImports) {
				const importName = namedImport.getName()
				// Use word boundary regex to avoid false positives
				const regex = new RegExp(`\\b${importName}\\b`, "g")
				if (regex.test(symbolText)) {
					isImportUsed = true
					break
				}
			}

			// Check default imports
			if (!isImportUsed) {
				const defaultImport = importDecl.getDefaultImport()
				if (defaultImport) {
					const importName = defaultImport.getText()
					const regex = new RegExp(`\\b${importName}\\b`, "g")
					if (regex.test(symbolText)) {
						isImportUsed = true
					}
				}
			}

			// Check namespace imports
			if (!isImportUsed) {
				const namespaceImport = importDecl.getNamespaceImport()
				if (namespaceImport) {
					const importName = namespaceImport.getText()
					const regex = new RegExp(`\\b${importName}\\b`, "g")
					if (regex.test(symbolText)) {
						isImportUsed = true
					}
				}
			}

			if (isImportUsed) {
				requiredImports.push(importDecl)
			}
		}

		// Also check for dependencies on other functions in the same file
		const localDependencies = this.findLocalFunctionDependencies(symbolNode, sourceFile)
		requiredImports.push(...localDependencies)

		return requiredImports
	}

	/**
	 * Finds dependencies on other functions within the same source file.
	 * Creates import statements for these local dependencies.
	 */
	private findLocalFunctionDependencies(symbolNode: Node, sourceFile: SourceFile): ImportDeclaration[] {
		const symbolText = symbolNode.getText()
		const localImports: ImportDeclaration[] = []

		// Get all exported functions from the source file (excluding the symbol being moved)
		const exportedFunctions = sourceFile.getExportedDeclarations()
		const symbolName = this.getSymbolName(symbolNode)

		for (const [exportName, declarations] of exportedFunctions) {
			// Skip the symbol being moved
			if (exportName === symbolName) continue

			// Check if this exported symbol is used in the symbol being moved
			const regex = new RegExp(`\\b${exportName}\\b`, "g")
			if (regex.test(symbolText)) {
				// Check if it's a function declaration
				const declaration = declarations[0]
				if (declaration && declaration.getKind() === 255) {
					// SyntaxKind.FunctionDeclaration = 255
					// Create a synthetic import declaration for this local dependency
					const sourceFilePath = sourceFile.getFilePath()

					// Get the file name without extension for the import path
					const path = require("path")
					const fileName = path.basename(sourceFilePath, path.extname(sourceFilePath))
					const relativeImportPath = `./${fileName}`

					// Create import text
					const importText = `import { ${exportName} } from '${relativeImportPath}';`

					// Create a temporary source file to parse the import
					const tempProject = new (require("ts-morph").Project)()
					const tempFile = tempProject.createSourceFile("temp.ts", importText)
					const importDecl = tempFile.getImportDeclarations()[0]

					if (importDecl) {
						localImports.push(importDecl)
					}
				}
			}
		}
		return localImports
	}

	/**
	 * Extracts the symbol name from a node.
	 */
	private getSymbolName(node: Node): string {
		// Handle different node types
		if (node.getKind() === 255) {
			// FunctionDeclaration (SyntaxKind.FunctionDeclaration = 255)
			const funcDecl = node as any
			return funcDecl.getName?.() || ""
		}
		// Add other node types as needed
		return ""
	}

	/**
	 * Adds the symbol to the target file and ensures imports are properly set up.
	 *
	 * @param targetFile - The target file to add the symbol to
	 * @param symbolText - The text of the symbol to add
	 * @param requiredImports - Import declarations needed by the symbol
	 * @param sourceFile - The original source file
	 * @returns Whether the operation was successful
	 */
	private async addSymbolToTargetFile(
		targetFile: SourceFile,
		symbolText: string,
		requiredImports: ImportDeclaration[],
		sourceFile: SourceFile,
		relatedTypes: string[] = [],
	): Promise<boolean> {
		try {
			// Get the current text of the target file
			const targetText = targetFile.getFullText()

			// CRITICAL FIX: Remove existing imports of the symbol being moved to prevent circular imports
			const movingSymbolName = this.extractSymbolName(symbolText)
			if (movingSymbolName) {
				this.removeExistingImportsOfSymbol(targetFile, movingSymbolName, sourceFile.getFilePath())
			}

			// Filter out self-imports to prevent importing from the target file itself
			const filteredImports = this.filterSelfImports(
				requiredImports,
				sourceFile.getFilePath(),
				targetFile.getFilePath(),
			)

			// Prepare the imports to add
			const importsToAdd = this.prepareImportsForTargetFile(
				filteredImports,
				sourceFile.getFilePath(),
				targetFile.getFilePath(),
			)

			// Add imports to the target file using proper import management
			for (const importText of importsToAdd) {
				// CRITICAL: Skip imports that would create circular dependencies
				const targetFileName = targetFile.getBaseName().replace(".ts", "")
				if (
					importText.includes(`from './${targetFileName}'`) ||
					importText.includes(`from "./${targetFileName}"`)
				) {
					continue
				}

				// Parse the import statement to extract module and symbols
				const importMatch = importText.match(/import\s+(.+?)\s+from\s+['"](.+?)['"]/)
				if (importMatch) {
					const [, importClause, moduleSpecifier] = importMatch

					// Parse named imports
					const namedImportsMatch = importClause.match(/\{\s*(.+?)\s*\}/)
					if (namedImportsMatch) {
						const namedImports = namedImportsMatch[1].split(",").map((s) => s.trim())

						// Check if there's already an import from this module
						const existingImport = targetFile.getImportDeclaration(
							(imp) => imp.getModuleSpecifierValue() === moduleSpecifier && !imp.isTypeOnly(),
						)

						if (existingImport) {
							// Add to existing import
							for (const namedImport of namedImports) {
								const existingNamedImports = existingImport.getNamedImports()
								const alreadyImported = existingNamedImports.some(
									(imp) => imp.getName() === namedImport,
								)
								if (!alreadyImported) {
									existingImport.addNamedImport(namedImport)
								}
							}
						} else {
							// Create new import only if it doesn't exist
							if (!targetText.includes(importText.trim())) {
								const insertPosition = this.findImportInsertPosition(targetFile)
								targetFile.insertText(insertPosition, importText + "\n")
							}
						}
					} else {
						// Handle default imports or other import types
						if (!targetText.includes(importText.trim())) {
							const insertPosition = this.findImportInsertPosition(targetFile)
							targetFile.insertText(insertPosition, importText + "\n")
						}
					}
				}
			}

			// Add related type definitions first (before the symbol)
			if (relatedTypes.length > 0) {
				// Insert types after imports but before other content
				const insertPosition = this.findTypeInsertPosition(targetFile)

				// Add each related type
				for (const typeText of relatedTypes) {
					// More robust check for existing type definitions
					const typeName = this.extractTypeName(typeText)
					if (typeName && !this.typeExistsInFile(targetFile, typeName)) {
						targetFile.insertText(insertPosition, typeText + "\n\n")
					}
				}
			}

			// Check if the symbol already exists in the target file to prevent duplicates
			const symbolName = this.extractSymbolName(symbolText)

			if (symbolName && !this.symbolExistsInFile(targetFile, symbolName)) {
				// Add the symbol text to the target file
				targetFile.addStatements(symbolText)
				refactorLogger.debug(`Added symbol '${symbolName}' to target file`)
			} else if (symbolName && this.symbolExistsInFile(targetFile, symbolName)) {
				// EDGE CASE FIX: If symbol already exists in target file, just log and continue
				// This can happen in complex import scenarios where the symbol was already moved
				const warningMessage = `Symbol '${symbolName}' already exists in target file - skipping addition`
				refactorLogger.debug(warningMessage)
				// Don't throw error, just continue - the symbol is already where it needs to be
			} else {
				// No symbol name extracted - this shouldn't happen but handle gracefully
				const errorMessage = `Failed to extract symbol name from: "${symbolText}"`
				refactorLogger.debug(errorMessage)
				throw new Error(errorMessage)
			}

			// Save the changes
			targetFile.saveSync()

			return true
		} catch (error) {
			refactorLogger.error(`Failed to add symbol to target file: ${(error as Error).message}`)
			return false
		}
	}

	/**
	 * Filters out imports that would create self-imports (importing from the target file itself).
	 * Also ensures all dependencies are properly included.
	 *
	 * @param imports - Import declarations from the source file
	 * @param sourceFilePath - Path to the source file
	 * @param targetFilePath - Path to the target file
	 * @returns Filtered import declarations
	 */
	private filterSelfImports(
		imports: ImportDeclaration[],
		sourceFilePath: string,
		targetFilePath: string,
	): ImportDeclaration[] {
		const filteredImports: ImportDeclaration[] = []

		// Normalize paths for comparison
		const normalizedSourcePath = this.pathResolver.standardizePath(sourceFilePath)
		const normalizedTargetPath = this.pathResolver.standardizePath(targetFilePath)

		for (const importDecl of imports) {
			const moduleSpecifier = importDecl.getModuleSpecifierValue()

			// Skip package imports (they're always needed)
			if (!moduleSpecifier.startsWith(".") && !moduleSpecifier.startsWith("/")) {
				filteredImports.push(importDecl)
				continue
			}

			// For relative imports, resolve the actual file path
			const sourceDir = this.pathResolver.getDirectoryPath(normalizedSourcePath)
			const resolvedImportPath = this.resolveImportPath(sourceDir, moduleSpecifier)
			const normalizedImportPath = this.pathResolver.standardizePath(resolvedImportPath)

			// Skip imports that would point to the target file itself (self-imports)
			if (normalizedImportPath === normalizedTargetPath) {
				// refactorLogger.debug(`Filtering out self-import: ${moduleSpecifier} -> ${normalizedImportPath}`)
				continue
			}

			// Include all other imports
			filteredImports.push(importDecl)
		}

		return filteredImports
	}

	/**
	 * Removes existing imports of a specific symbol from the target file to prevent circular imports.
	 * This is critical when moving a symbol to a file that already imports it.
	 *
	 * @param targetFile - The target file to clean up imports from
	 * @param symbolName - The name of the symbol being moved
	 * @param sourceFilePath - The path of the source file where the symbol is coming from
	 */
	private removeExistingImportsOfSymbol(targetFile: SourceFile, symbolName: string, sourceFilePath: string): void {
		// Get all import declarations in the target file
		const importDeclarations = targetFile.getImportDeclarations()

		// Normalize the source file path for comparison
		const normalizedSourcePath = this.pathResolver.standardizePath(sourceFilePath)
		const targetDir = this.pathResolver.getDirectoryPath(targetFile.getFilePath())

		for (const importDecl of importDeclarations) {
			const moduleSpecifier = importDecl.getModuleSpecifierValue()

			// Skip package imports (only check relative imports)
			if (!moduleSpecifier.startsWith(".") && !moduleSpecifier.startsWith("/")) {
				continue
			}

			// Resolve the import path to see if it points to our source file
			const resolvedImportPath = this.resolveImportPath(targetDir, moduleSpecifier)
			const normalizedImportPath = this.pathResolver.standardizePath(resolvedImportPath)

			// Check if this import is from the source file
			if (normalizedImportPath === normalizedSourcePath) {
				// Check if this import includes our symbol
				const namedImports = importDecl.getNamedImports()
				const defaultImport = importDecl.getDefaultImport()
				const namespaceImport = importDecl.getNamespaceImport()

				let symbolFound = false

				// Check named imports
				for (const namedImport of namedImports) {
					if (namedImport.getName() === symbolName) {
						symbolFound = true

						// If this is the only named import, remove the entire import declaration
						if (namedImports.length === 1 && !defaultImport && !namespaceImport) {
							refactorLogger.debug(`Removing entire import declaration: ${importDecl.getText()}`)
							importDecl.remove()
						} else {
							// Remove just this named import
							refactorLogger.debug(`Removing named import '${symbolName}' from: ${importDecl.getText()}`)
							namedImport.remove()
						}
						break
					}
				}

				// Check default import
				if (!symbolFound && defaultImport && defaultImport.getText() === symbolName) {
					symbolFound = true

					// If this is the only import, remove the entire declaration
					if (namedImports.length === 0 && !namespaceImport) {
						refactorLogger.debug(`Removing entire import declaration: ${importDecl.getText()}`)
						importDecl.remove()
					} else {
						// Remove just the default import
						refactorLogger.debug(`Removing default import '${symbolName}' from: ${importDecl.getText()}`)
						importDecl.removeDefaultImport()
					}
				}

				// Check namespace import (less common but possible)
				if (!symbolFound && namespaceImport) {
					// For namespace imports, we can't remove just one symbol, so we log a warning
					refactorLogger.warn(
						`Found namespace import '${namespaceImport.getText()}' - cannot selectively remove '${symbolName}'`,
					)
					// We could potentially remove the entire namespace import if needed, but that's more risky
				}

				if (symbolFound) {
					refactorLogger.debug(`Successfully removed import of '${symbolName}' from target file`)
				}
			}
		}
	}

	/**
	 * Prepares imports for the target file by adjusting paths.
	 *
	 * @param imports - Import declarations from the source file
	 * @param sourceFilePath - Path to the source file
	 * @param targetFilePath - Path to the target file
	 * @returns Array of import statements adjusted for the target file
	 */
	private prepareImportsForTargetFile(
		imports: ImportDeclaration[],
		sourceFilePath: string,
		targetFilePath: string,
	): string[] {
		const importsToAdd: string[] = []

		for (const importDecl of imports) {
			// Get the original module specifier
			const moduleSpecifier = importDecl.getModuleSpecifierValue()

			// Skip package imports (they don't need path adjustment)
			if (!moduleSpecifier.startsWith(".") && !moduleSpecifier.startsWith("/")) {
				importsToAdd.push(importDecl.getText())
				continue
			}

			// For relative imports, adjust the path for the new file location
			const sourceDir = this.pathResolver.getDirectoryPath(sourceFilePath)
			const targetDir = this.pathResolver.getDirectoryPath(targetFilePath)

			// Resolve the full path of the imported module relative to the source file
			const absoluteImportPath = this.resolveImportPath(sourceDir, moduleSpecifier)
			refactorLogger.debug(`resolveImportPath(${sourceDir}, ${moduleSpecifier}) = ${absoluteImportPath}`)

			// Calculate the new relative path from the target file to the imported module
			const newRelativePath = this.pathResolver.getRelativeImportPath(targetFilePath, absoluteImportPath)
			refactorLogger.debug(`getRelativeImportPath(${targetFilePath}, ${absoluteImportPath}) = ${newRelativePath}`)

			// Create the adjusted import statement
			const defaultImportNode = importDecl.getDefaultImport()
			const namespaceImportNode = importDecl.getNamespaceImport()
			const namedImportElements = importDecl.getNamedImports().map((named) => {
				const aliasNode = named.getAliasNode()
				return aliasNode ? `${named.getName()} as ${aliasNode.getText()}` : named.getName()
			})

			let importClause = ""
			if (defaultImportNode) {
				importClause += defaultImportNode.getText()
			}

			if (namespaceImportNode) {
				if (importClause.length > 0) {
					importClause += ", "
				}
				// Use .getText() for namespace import to get its identifier
				importClause += `* as ${namespaceImportNode.getText()}`
			}

			if (namedImportElements.length > 0) {
				if (importClause.length > 0) {
					importClause += ", "
				}
				importClause += `{ ${namedImportElements.join(", ")} }`
			}

			if (importClause.length > 0) {
				const importStatement = `import ${importClause} from "${newRelativePath}";`
				importsToAdd.push(importStatement)
			} else if (!importDecl.getImportClause() && moduleSpecifier.startsWith(".")) {
				// Handles side-effect imports like `import "./styles.css";`
				// Ensure path is adjusted only for relative side-effect imports
				const importStatement = `import "${newRelativePath}";`
				importsToAdd.push(importStatement)
			} else if (!importDecl.getImportClause()) {
				// Handles side-effect imports for packages like `import "reflect-metadata";`
				importsToAdd.push(importDecl.getText()) // Keep original text for package side-effect imports
			}
		}

		return importsToAdd
	}

	/**
	 * Resolves an import path relative to a source directory.
	 *
	 * @param sourceDir - The directory containing the source file
	 * @param importPath - The import path from the source file
	 * @returns The absolute path to the imported module
	 */
	private resolveImportPath(sourceDir: string, importPath: string): string {
		// If the import is already absolute, return it
		if (importPath.startsWith("/")) {
			return importPath
		}

		// For relative imports, resolve them relative to the source directory
		const path = require("path")
		const resolvedPath = path.resolve(sourceDir, importPath)

		// CRITICAL FIX: Ensure the resolved path stays within the project root
		// If the resolved path goes outside the project root, it means we're in a test environment
		// and should resolve relative to the temp directory instead
		const projectRoot = this.pathResolver.getProjectRoot()
		if (!resolvedPath.startsWith(projectRoot)) {
			// refactorLogger.debug(`Resolved path ${resolvedPath} is outside project root ${projectRoot}`)
			// In test environments, the temp directory is the effective project root
			const tempRoot = projectRoot // Use the project root which should be the temp directory in tests
			const tempResolvedPath = path.resolve(tempRoot, importPath)
			// refactorLogger.debug(`Using temp-relative resolution: ${tempResolvedPath}`)
			const normalizedTempPath = this.pathResolver.standardizePath(tempResolvedPath)

			// Append .ts if needed
			if (!normalizedTempPath.endsWith(".ts") && !normalizedTempPath.endsWith(".tsx")) {
				const tsPath = normalizedTempPath + ".ts"
				if (this.pathResolver.pathExists(tsPath)) {
					return tsPath
				}
				return tsPath
			}
			return normalizedTempPath
		}

		// Normalize the path
		const normalizedPath = this.pathResolver.standardizePath(resolvedPath)

		// Append .ts if needed (since imports often omit the extension)
		if (!normalizedPath.endsWith(".ts") && !normalizedPath.endsWith(".tsx")) {
			// Check both .ts and .tsx
			const tsPath = normalizedPath + ".ts"
			const tsxPath = normalizedPath + ".tsx"

			if (this.pathResolver.pathExists(tsPath)) {
				return tsPath
			} else if (this.pathResolver.pathExists(tsxPath)) {
				return tsxPath
			}
			// Return with .ts extension as default
			return tsPath
		}

		return normalizedPath
	}

	/**
	 * Finds the appropriate position to insert type definitions in a file.
	 * This should be after imports but before functions/classes.
	 *
	 * @param file - The source file to analyze
	 * @returns The position to insert new type definitions
	 */
	private findTypeInsertPosition(file: SourceFile): number {
		// Get all existing import declarations
		const importDeclarations = file.getImportDeclarations()

		if (importDeclarations.length > 0) {
			// Place after the last import with a newline
			const lastImport = importDeclarations[importDeclarations.length - 1]
			return lastImport.getEnd() + 1 // Add 1 to move past any newline
		}

		// If no imports, find the beginning of content
		return this.findImportInsertPosition(file)
	}

	/**
	 * Finds the appropriate position to insert imports in a file.
	 *
	 * @param file - The source file to analyze
	 * @returns The position to insert new imports
	 */
	private findImportInsertPosition(file: SourceFile): number {
		// Get all existing import declarations
		const importDeclarations = file.getImportDeclarations()

		if (importDeclarations.length > 0) {
			// Place after the last import
			const lastImport = importDeclarations[importDeclarations.length - 1]
			return lastImport.getEnd()
		}

		// If no imports, place at the beginning of the file
		return 0
	}

	/**
	 * Removes a symbol from its source file.
	 *
	 * @param symbol - The symbol to remove
	 * @param sourceFile - The source file containing the symbol
	 * @param options - Optional parameters
	 * @returns True if the symbol was removed successfully
	 */
	private async removeSymbolFromSourceFile(
		symbol: ResolvedSymbol,
		sourceFile: SourceFile,
	): Promise<{ success: boolean; error?: string }> {
		try {
			// Get the current text for comparison after removal
			const originalText = sourceFile.getFullText()

			// Store symbol name and node for later verification
			const symbolName = symbol.name
			const nodeToRemove = symbol.node
			const nodeText = nodeToRemove.getText()

			// First attempt: Use ts-morph's structured removal capabilities
			try {
				// Different handling based on node kind
				const kindName = nodeToRemove.getKindName()
				let removalSuccessful = false

				if (kindName.includes("Function")) {
					// Try to find the function by name first for most accurate removal
					const functions = sourceFile.getFunctions()
					const functionToRemove = functions.find((f) => f.getName() === symbolName)

					if (functionToRemove) {
						// refactorLogger.debug(`Removing function declaration: ${symbolName}`)
						functionToRemove.remove()
						removalSuccessful = true
					} else {
						// Try to find exported function
						const exportedFunctions = sourceFile.getExportedDeclarations().get(symbolName)
						if (exportedFunctions && exportedFunctions.length > 0) {
							const exportedFunc = exportedFunctions[0]
							if (exportedFunc.getKindName().includes("Function")) {
								// refactorLogger.debug(`Removing exported function: ${symbolName}`)
								// Can't directly remove from exportedDeclarations, so find the actual node
								const nodePos = exportedFunc.getPos()
								const nodeEnd = exportedFunc.getEnd()
								sourceFile.replaceText([nodePos, nodeEnd], "")
								removalSuccessful = true
							}
						}
					}

					// If we couldn't remove directly, try statement-level removal
					if (!removalSuccessful) {
						// Find the nearest statement that contains the function
						let statement: Node | undefined = nodeToRemove
						while (statement && !statement.getKindName().includes("Statement")) {
							statement = statement.getParent()
						}

						if (statement) {
							const parentOfStatement = statement.getParent()
							if (parentOfStatement) {
								if (parentOfStatement.getKindName().includes("SourceFile")) {
									const index = statement.getChildIndex()
									// refactorLogger.debug(`Removing function at statement index: ${index}`)
									sourceFile.removeStatements([index, index + 1])
									removalSuccessful = true
								} else if ("removeStatement" in parentOfStatement) {
									// refactorLogger.debug(`Removing function statement from block`)
									// @ts-ignore - Dynamic method call
									parentOfStatement.removeStatement(statement)
									removalSuccessful = true
								}
							}
						}
					}
				} else if (kindName.includes("Interface")) {
					const interfaces = sourceFile.getInterfaces()
					const interfaceToRemove = interfaces.find((i) => i.getName() === symbolName)
					if (interfaceToRemove) {
						// refactorLogger.debug(`Removing interface declaration: ${symbolName}`)
						interfaceToRemove.remove()
						removalSuccessful = true
					}
				} else if (kindName.includes("Class")) {
					const classes = sourceFile.getClasses()
					const classToRemove = classes.find((c) => c.getName() === symbolName)
					if (classToRemove) {
						// refactorLogger.debug(`Removing class declaration: ${symbolName}`)
						classToRemove.remove()
						removalSuccessful = true
					}
				} else if (kindName.includes("TypeAlias")) {
					const types = sourceFile.getTypeAliases()
					const typeToRemove = types.find((t) => t.getName() === symbolName)
					if (typeToRemove) {
						// refactorLogger.debug(`Removing type alias: ${symbolName}`)
						typeToRemove.remove()
						removalSuccessful = true
					}
				} else if (kindName.includes("Enum")) {
					const enums = sourceFile.getEnums()
					const enumToRemove = enums.find((e) => e.getName() === symbolName)
					if (enumToRemove) {
						// refactorLogger.debug(`Removing enum: ${symbolName}`)
						enumToRemove.remove()
						removalSuccessful = true
					}
				} else if (kindName.includes("Variable")) {
					// Handle variable declarations
					const variableStatements = sourceFile.getVariableStatements()

					for (const statement of variableStatements) {
						const declarations = statement.getDeclarations()
						const foundIndex = declarations.findIndex((d) => d.getName() === symbolName)

						if (foundIndex >= 0) {
							if (declarations.length === 1) {
								// If this is the only declaration in the statement, remove the whole statement
								// refactorLogger.debug(`Removing entire variable statement for: ${symbolName}`)
								statement.remove()
							} else {
								// Otherwise just remove this declaration
								// refactorLogger.debug(`Removing single variable declaration: ${symbolName}`)
								declarations[foundIndex].remove()
							}
							removalSuccessful = true
							break
						}
					}
				}

				// If we couldn't remove using specific methods, try a more generic approach
				if (!removalSuccessful) {
					// Try to get the statement containing the node
					let statement = nodeToRemove
					while (statement && !statement.getKindName().includes("Statement") && statement.getParent()) {
						statement = statement.getParent()!
					}

					if (statement && statement.getKindName().includes("Statement")) {
						const index = statement.getChildIndex()
						// refactorLogger.debug(`Removing generic statement at index: ${index}`)
						try {
							sourceFile.removeStatements([index, index + 1])
							removalSuccessful = true
						} catch (e) {
							// refactorLogger.debug(`Failed to remove statement: ${e}`)
						}
					}
				}

				// If we still couldn't remove the node, throw error to try text-based removal
				if (!removalSuccessful) {
					throw new Error("Structured removal failed, falling back to text-based removal")
				}

				// Save and refresh

				sourceFile.saveSync()
				sourceFile.refreshFromFileSystemSync()

				// Verify removal worked
				const newText = sourceFile.getFullText()

				refactorLogger.debug(`Symbol still exists: ${sourceFile.getFunction(symbol.name) !== undefined}`)
			} catch (nodeRemovalError) {
				// refactorLogger.debug(`Primary node removal failed: ${nodeRemovalError}. Trying text-based removal.`)

				// Second attempt: Text-based removal
				const startPos = nodeToRemove.getPos()
				const endPos = startPos + nodeText.length
				const sourceText = sourceFile.getFullText()

				// Expand the range to include surrounding whitespace and semicolons
				let expandedEndPos = endPos
				while (
					expandedEndPos < sourceText.length &&
					[";", ",", " ", "\t", "\n", "\r"].includes(sourceText[expandedEndPos])
				) {
					expandedEndPos++
				}

				let expandedStartPos = startPos
				while (expandedStartPos > 0 && [" ", "\t", "\n", "\r"].includes(sourceText[expandedStartPos - 1])) {
					expandedStartPos--
				}

				// Remove the text with expanded range
				// refactorLogger.debug(`Text-based removal from positions ${expandedStartPos} to ${expandedEndPos}`)
				sourceFile.replaceText([expandedStartPos, expandedEndPos], "")
				sourceFile.saveSync()
				sourceFile.refreshFromFileSystemSync()
			}

			// Third attempt: Pattern-based removal if still present
			const updatedText = sourceFile.getFullText()
			if (updatedText.includes(symbolName) && updatedText !== originalText) {
				// refactorLogger.debug(`Symbol may still be present. Trying pattern-based removal.`)

				// More comprehensive regex patterns for different symbol types
				const functionPattern = `(export\\s+)?(function|async\\s+function)\\s+${symbolName}\\s*\\([^{]*\\)\\s*\\{[\\s\\S]*?\\}`
				const classPattern = `(export\\s+)?class\\s+${symbolName}\\s*\\{[\\s\\S]*?\\}`
				const interfacePattern = `(export\\s+)?interface\\s+${symbolName}[^{]*\\{[\\s\\S]*?\\}`
				const typePattern = `(export\\s+)?type\\s+${symbolName}\\s*=\\s*[^;]*;`
				const enumPattern = `(export\\s+)?enum\\s+${symbolName}\\s*\\{[\\s\\S]*?\\}`
				const varPattern = `(export\\s+)?(const|let|var)\\s+${symbolName}\\s*=\\s*[^;]*;`

				const patterns = [functionPattern, classPattern, interfacePattern, typePattern, enumPattern, varPattern]

				for (const pattern of patterns) {
					const regex = new RegExp(pattern, "g")
					const matchResult = regex.exec(updatedText)

					if (matchResult) {
						const matchStart = matchResult.index
						const matchEnd = matchStart + matchResult[0].length

						// refactorLogger.debug(`Pattern match found at positions ${matchStart} to ${matchEnd}`)
						sourceFile.replaceText([matchStart, matchEnd], "")
						sourceFile.saveSync()
						sourceFile.refreshFromFileSystemSync()
						break
					}
				}
			}

			// Final verification
			const finalText = sourceFile.getFullText()

			// Check if symbol declaration is still present
			const declarationPatterns = [
				`function\\s+${symbolName}\\b`,
				`class\\s+${symbolName}\\b`,
				`interface\\s+${symbolName}\\b`,
				`type\\s+${symbolName}\\s*=`,
				`enum\\s+${symbolName}\\b`,
				`const\\s+${symbolName}\\s*=`,
				`let\\s+${symbolName}\\s*=`,
				`var\\s+${symbolName}\\s*=`,
				`export\\s+{[^}]*\\b${symbolName}\\b[^}]*}`,
			]

			const symbolStillPresent = declarationPatterns.some((pattern) => new RegExp(pattern, "g").test(finalText))

			if (symbolStillPresent) {
				refactorLogger.warn(`Symbol declaration still detected after all removal attempts`)
				return {
					success: false,
					error: "Symbol still present in source file after multiple removal attempts",
				}
			}

			return { success: true }
		} catch (error) {
			return {
				success: false,
				error: `Failed to remove symbol: ${(error as Error).message}`,
			}
		}
	}

	/**
	 * Updates import references in all files that reference the moved symbol.
	 *
	 * @param symbol - The resolved symbol that was moved
	 * @param targetFilePath - The path to the target file
	 * @returns Array of file paths that were updated
	 */
	private async updateReferencingFiles(symbol: ResolvedSymbol, targetFilePath: string): Promise<string[]> {
		try {
			refactorLogger.debug(`Updating imports for moved symbol "${symbol.name}"`)

			// Use ImportManager to update all imports that reference the moved symbol
			const importManager = new ImportManager(this.project)

			// Call the simple import update method
			const updatedFiles = importManager.updateImportsAfterMove(symbol.name, symbol.filePath, targetFilePath)

			refactorLogger.debug(`Updated imports in ${updatedFiles.length} files`)
			return updatedFiles
		} catch (error) {
			refactorLogger.error(`Error updating referencing files: ${(error as Error).message}`)
			return []
		}
	}

	/**
	 * Updates or adds an import in a file.
	 *
	 * @param file - The source file to update
	 * @param symbolName - The name of the symbol to import
	 * @param importPath - The new import path
	 * @returns Whether the file was updated
	 */
	private updateImportInFile(file: SourceFile, symbolName: string, importPath: string): boolean {
		let updated = false

		// Get all import declarations
		const importDeclarations = file.getImportDeclarations()

		// First, check if there's already an import from the same module
		const existingImportFromModule = importDeclarations.find(
			(imp) => imp.getModuleSpecifierValue() === importPath && !imp.isTypeOnly(),
		)

		if (existingImportFromModule) {
			// Check if the symbol is already imported
			const namedImports = existingImportFromModule.getNamedImports()
			const alreadyImported = namedImports.some((named) => named.getName() === symbolName)

			if (!alreadyImported) {
				// Add to existing import
				existingImportFromModule.addNamedImport(symbolName)
				updated = true
			}
		} else {
			// Check if the symbol is imported from a different module and update it
			let symbolFoundInOtherImport = false

			for (const importDecl of importDeclarations) {
				const namedImports = importDecl.getNamedImports()
				const matchingImport = namedImports.find((named) => named.getName() === symbolName)

				if (matchingImport) {
					// Update the module specifier for this import
					importDecl.setModuleSpecifier(importPath)
					updated = true
					symbolFoundInOtherImport = true
					break
				}
			}

			// If symbol not found in any existing import, create new import
			if (!symbolFoundInOtherImport) {
				file.addImportDeclaration({
					namedImports: [symbolName],
					moduleSpecifier: importPath,
				})
				updated = true
			}
		}

		return updated
	}

	/**
	 * Ensures all TypeScript files in the project directory are loaded into ts-morph.
	 * This is critical for import splitting because the project was created with
	 * skipAddingFilesFromTsConfig: true, so files need to be explicitly added.
	 */
	private async ensureAllProjectFilesAreLoaded(): Promise<void> {
		try {
			const projectRoot = this.pathResolver.getProjectRoot()
			// refactorLogger.debug(`Scanning for TypeScript files in: ${projectRoot}`)

			// Get all TypeScript files in the project directory
			const tsFiles = this.findTypeScriptFiles(projectRoot)
			// refactorLogger.debug(`Found ${tsFiles.length} TypeScript files to ensure are loaded`)

			// Add each file to the project if not already present
			for (const filePath of tsFiles) {
				try {
					const existingFile = this.project.getSourceFile(filePath)
					if (!existingFile) {
						// refactorLogger.debug(`Adding file to project: ${filePath}`)
						this.project.addSourceFileAtPath(filePath)
					}
				} catch (error) {
					// refactorLogger.debug(`Failed to add file ${filePath}: ${error}`)
				}
			}

			// refactorLogger.debug(`Project now has ${this.project.getSourceFiles().length} source files loaded`)
		} catch (error) {}
	}

	/**
	 * Recursively finds all TypeScript files in a directory
	 */
	private findTypeScriptFiles(dir: string): string[] {
		const files: string[] = []

		try {
			const entries = fs.readdirSync(dir, { withFileTypes: true })

			for (const entry of entries) {
				const fullPath = path.join(dir, entry.name)

				if (entry.isDirectory()) {
					// Skip node_modules and other common directories
					if (!["node_modules", ".git", "dist", "build", ".next"].includes(entry.name)) {
						files.push(...this.findTypeScriptFiles(fullPath))
					}
				} else if (entry.isFile()) {
					// Include .ts and .tsx files, but exclude .d.ts files
					if ((entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) && !entry.name.endsWith(".d.ts")) {
						files.push(fullPath)
					}
				}
			}
		} catch (error) {
			// refactorLogger.debug(`Failed to read directory ${dir}: ${error}`)
		}

		return files
	}

	/**
	 * Extracts the type name from a type definition string
	 */
	private extractTypeName(typeText: string): string | null {
		// Match interface, type alias, enum, or class declarations
		const matches = typeText.match(/(?:export\s+)?(?:interface|type|enum|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/)
		return matches ? matches[1] : null
	}

	/**
	 * Extracts the symbol name from a symbol definition string
	 */
	private extractSymbolName(symbolText: string): string | null {
		// Match function, class, interface, type, enum, or variable declarations
		const patterns = [
			/(?:export\s+)?(?:function)\s+([A-Za-z_$][A-Za-z0-9_$]*)/,
			/(?:export\s+)?(?:class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/,
			/(?:export\s+)?(?:interface)\s+([A-Za-z_$][A-Za-z0-9_$]*)/,
			/(?:export\s+)?(?:type)\s+([A-Za-z_$][A-Za-z0-9_$]*)/,
			/(?:export\s+)?(?:enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/,
			/(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/,
			// Handle variable assignments without declaration keywords (e.g., default exports)
			/^([A-Za-z_$][A-Za-z0-9_$]*)\s*=/,
		]

		for (const pattern of patterns) {
			const match = symbolText.match(pattern)
			if (match) {
				return match[1]
			}
		}
		return null
	}

	/**
	 * Checks if a type with the given name already exists in the target file
	 */
	private typeExistsInFile(targetFile: SourceFile, typeName: string): boolean {
		// Check for interface declarations
		if (targetFile.getInterface(typeName)) {
			return true
		}

		// Check for type alias declarations
		if (targetFile.getTypeAlias(typeName)) {
			return true
		}

		// Check for enum declarations
		if (targetFile.getEnum(typeName)) {
			return true
		}

		// Check for class declarations
		if (targetFile.getClass(typeName)) {
			return true
		}

		return false
	}

	/**
	 * Checks if a symbol with the given name already exists in the target file
	 */
	private symbolExistsInFile(targetFile: SourceFile, symbolName: string): boolean {
		// Check for function declarations
		if (targetFile.getFunction(symbolName)) {
			return true
		}

		// Check for class declarations
		if (targetFile.getClass(symbolName)) {
			return true
		}

		// Check for interface declarations
		if (targetFile.getInterface(symbolName)) {
			return true
		}

		// Check for type alias declarations
		if (targetFile.getTypeAlias(symbolName)) {
			return true
		}

		// Check for enum declarations
		if (targetFile.getEnum(symbolName)) {
			return true
		}

		// Check for variable declarations
		const variableStatements = targetFile.getVariableStatements()
		for (const varStatement of variableStatements) {
			const declarations = varStatement.getDeclarations()
			for (const declaration of declarations) {
				if (declaration.getName() === symbolName) {
					return true
				}
			}
		}

		return false
	}
}
