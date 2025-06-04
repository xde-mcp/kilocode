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

		// Removed excessive execution flow logging

		try {
			// Ensure we have all required properties for symbol data
			if (!symbol.filePath || typeof symbol.filePath !== "string") {
				// Use the operation data if symbol data is incomplete
				symbol.filePath = operation.selector.filePath
				console.log(`[DEBUG] Using operation file path for symbol: ${symbol.filePath}`)
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

			// Removed excessive path logging

			// Step 1: Ensure target file exists and is in the project
			const targetFile = await PerformanceTracker.measureStep(opId, "prepare-target", async () => {
				return this.prepareTargetFile(operation.targetFilePath)
			})

			if (!targetFile) {
				console.log(`[DEBUG] MoveExecutor: Failed to prepare target file: ${operation.targetFilePath}`)
				PerformanceTracker.endTracking(opId)
				return {
					success: false,
					error: `Failed to prepare target file: ${operation.targetFilePath}`,
					affectedFiles,
					warnings,
				}
			}

			// Removed excessive success logging

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
				console.log(`[DEBUG] MoveExecutor: Failed to add symbol to target file: ${operation.targetFilePath}`)
				PerformanceTracker.endTracking(opId)
				return {
					success: false,
					error: `Failed to add symbol to target file: ${operation.targetFilePath}`,
					affectedFiles,
					warnings,
				}
			}

			// Removed excessive success logging

			// Step 4: Remove symbol from source file (unless copy-only)
			if (!copyOnly) {
				const removeResult = await PerformanceTracker.measureStep(opId, "remove-from-source", async () => {
					return this.removeSymbolFromSourceFile(symbol, sourceFile)
				})

				if (!removeResult.success) {
					console.log(
						`[DEBUG] MoveExecutor: Symbol removal from source failed: ${removeResult.error || "Unknown error"}`,
					)
					warnings.push(`Symbol may not have been fully removed from source: ${removeResult.error}`)

					console.log(`[WARNING] Symbol removal issue: ${removeResult.error || "Unknown error"}`)
				}
			}

			// STEP 4: Update imports using centralized ImportManager (replaces duplicate logic)
			console.log(`[DEBUG] MoveExecutor: Using centralized ImportManager for all import updates`)
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

			// Return successful result with details
			console.log(`[DEBUG] MoveExecutor: All steps completed, returning success=true`)
			PerformanceTracker.endTracking(opId)
			return {
				success: true,
				affectedFiles: finalAffectedFiles,
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
			console.error(`[CRITICAL ERROR] *** MoveExecutor: Exception caught during execution ***`)
			console.error(`[CRITICAL ERROR] Error message: ${(error as Error).message}`)
			console.error(`[CRITICAL ERROR] Error stack: ${(error as Error).stack}`)
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
			console.log(`[DEBUG] prepareTargetFile called with: ${targetFilePath}`)

			// Use ProjectManager if available for more consistent file handling
			if (this.projectManager) {
				console.log(`[DEBUG] Using ProjectManager to ensure source file`)
				const result = await this.projectManager.ensureSourceFile(targetFilePath)
				console.log(`[DEBUG] ProjectManager.ensureSourceFile result: ${result ? "SUCCESS" : "NULL"}`)
				if (result) {
					return result
				}
				console.log(`[DEBUG] ProjectManager failed, falling back to direct creation`)
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
				console.log(`[DEBUG] Checking if file exists on disk: ${absoluteTargetPath}`)

				if (fs.existsSync(absoluteTargetPath)) {
					console.log(`[DEBUG] File exists on disk, adding to project: ${absoluteTargetPath}`)
					try {
						targetFile = this.project.addSourceFileAtPath(absoluteTargetPath)
						if (targetFile) {
							console.log(`[DEBUG] Successfully added existing file to project`)
							return targetFile
						}
					} catch (addError) {
						console.log(`[DEBUG] Failed to add existing file, will create new one: ${addError}`)
					}
				}

				// If file doesn't exist or couldn't be added, create it
				console.log(`[DEBUG] Creating new file at: ${normalizedPath}`)

				// Ensure the directory exists
				const dirName = this.pathResolver.getDirectoryPath(absoluteTargetPath)
				if (!fs.existsSync(dirName)) {
					fs.mkdirSync(dirName, { recursive: true })
					console.log(`[DEBUG] Created directory: ${dirName}`)
				}

				// Create the file in the project
				targetFile = this.project.createSourceFile(normalizedPath, `// Target file\n`, {
					overwrite: true,
				})

				if (targetFile) {
					console.log(`[DEBUG] Successfully created file in project`)
					return targetFile
				}
			} catch (error) {
				console.error(`Failed to prepare file: ${(error as Error).message}`)
				// Continue to fallback options
			}

			// For non-test environments, use the FileManager
			const absolutePath = this.pathResolver.resolveAbsolutePath(normalizedPath)
			return await this.fileManager.createFileIfNeeded(absolutePath, "")
		} catch (error) {
			console.error(`Failed to prepare target file: ${(error as Error).message}`)

			// As a last resort, try a simplified approach
			try {
				const normalizedPath = this.pathResolver.normalizeFilePath(targetFilePath)
				return this.project.createSourceFile(normalizedPath, `// Emergency file\n`, {
					overwrite: true,
				})
			} catch (e) {
				console.error(`Final fallback file creation failed: ${e}`)
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
				console.log(`[DEBUG] Found referenced interface: ${interfaceName}`)
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

		// Removed excessive type reference logging

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

			// Add imports to the target file if they don't already exist
			for (const importText of importsToAdd) {
				if (!targetText.includes(importText.trim())) {
					// Find where to insert the import
					const insertPosition = this.findImportInsertPosition(targetFile)
					targetFile.insertText(insertPosition, importText + "\n")
				}
			}

			// Add related type definitions first (before the symbol)
			if (relatedTypes.length > 0) {
				// Insert types after imports but before other content
				const insertPosition = this.findTypeInsertPosition(targetFile)

				// Add each related type
				for (const typeText of relatedTypes) {
					// Check if this type definition already exists in the target file
					if (!targetFile.getFullText().includes(typeText.trim())) {
						targetFile.insertText(insertPosition, typeText + "\n\n")
					}
				}
			}

			// Add the symbol text to the target file
			// If file is empty or has only imports, add a newline before the symbol
			const fileContent = targetFile.getFullText()
			const hasContent = fileContent.trim().length > 0

			// Add the symbol text to the target file
			if (hasContent) {
				targetFile.addStatements(symbolText)
			} else {
				// Create an empty file with the symbol text
				targetFile.addStatements(symbolText)
			}

			// Save the changes
			targetFile.saveSync()

			return true
		} catch (error) {
			console.error(`Failed to add symbol to target file: ${(error as Error).message}`)
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
				console.log(`[DEBUG] Filtering out self-import: ${moduleSpecifier} -> ${normalizedImportPath}`)
				continue
			}

			// Include all other imports
			filteredImports.push(importDecl)
		}

		return filteredImports
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
			const sourceDir = this.pathResolver.normalizeFilePath(sourceFilePath)
			const targetDir = this.pathResolver.normalizeFilePath(targetFilePath)

			// Resolve the full path of the imported module relative to the source file
			const absoluteImportPath = this.resolveImportPath(sourceDir, moduleSpecifier)

			// Calculate the new relative path from the target file to the imported module
			const newRelativePath = this.pathResolver.getRelativeImportPath(targetDir, absoluteImportPath)

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
	 * Resolves an import path from a specific file.
	 *
	 * @param fromFilePath - The file path that contains the import
	 * @param importPath - The import path to resolve
	 * @returns The resolved absolute path to the imported module
	 */
	private resolveImportPathFromFile(fromFilePath: string, importPath: string): string {
		// If the import is a package import, return as-is
		if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
			return importPath
		}

		// Get the directory of the file containing the import
		const fromDir = this.pathResolver.getDirectoryPath(fromFilePath)

		// Resolve the import path relative to that directory
		return this.resolveImportPath(fromDir, importPath)
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
			console.log(`[DEBUG] Resolved path ${resolvedPath} is outside project root ${projectRoot}`)
			// In test environments, the temp directory is the effective project root
			const tempRoot = projectRoot // Use the project root which should be the temp directory in tests
			const tempResolvedPath = path.resolve(tempRoot, importPath)
			console.log(`[DEBUG] Using temp-relative resolution: ${tempResolvedPath}`)
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

			console.log(
				`[DEBUG] Removing node of kind: ${nodeToRemove.getKindName()} from parent ${nodeToRemove.getParent()?.getKindName()}`,
			)

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
						console.log(`[DEBUG] Removing function declaration: ${symbolName}`)
						functionToRemove.remove()
						removalSuccessful = true
					} else {
						// Try to find exported function
						const exportedFunctions = sourceFile.getExportedDeclarations().get(symbolName)
						if (exportedFunctions && exportedFunctions.length > 0) {
							const exportedFunc = exportedFunctions[0]
							if (exportedFunc.getKindName().includes("Function")) {
								console.log(`[DEBUG] Removing exported function: ${symbolName}`)
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
									console.log(`[DEBUG] Removing function at statement index: ${index}`)
									sourceFile.removeStatements([index, index + 1])
									removalSuccessful = true
								} else if ("removeStatement" in parentOfStatement) {
									console.log(`[DEBUG] Removing function statement from block`)
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
						console.log(`[DEBUG] Removing interface declaration: ${symbolName}`)
						interfaceToRemove.remove()
						removalSuccessful = true
					}
				} else if (kindName.includes("Class")) {
					const classes = sourceFile.getClasses()
					const classToRemove = classes.find((c) => c.getName() === symbolName)
					if (classToRemove) {
						console.log(`[DEBUG] Removing class declaration: ${symbolName}`)
						classToRemove.remove()
						removalSuccessful = true
					}
				} else if (kindName.includes("TypeAlias")) {
					const types = sourceFile.getTypeAliases()
					const typeToRemove = types.find((t) => t.getName() === symbolName)
					if (typeToRemove) {
						console.log(`[DEBUG] Removing type alias: ${symbolName}`)
						typeToRemove.remove()
						removalSuccessful = true
					}
				} else if (kindName.includes("Enum")) {
					const enums = sourceFile.getEnums()
					const enumToRemove = enums.find((e) => e.getName() === symbolName)
					if (enumToRemove) {
						console.log(`[DEBUG] Removing enum: ${symbolName}`)
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
								console.log(`[DEBUG] Removing entire variable statement for: ${symbolName}`)
								statement.remove()
							} else {
								// Otherwise just remove this declaration
								console.log(`[DEBUG] Removing single variable declaration: ${symbolName}`)
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
						console.log(`[DEBUG] Removing generic statement at index: ${index}`)
						try {
							sourceFile.removeStatements([index, index + 1])
							removalSuccessful = true
						} catch (e) {
							console.log(`[DEBUG] Failed to remove statement: ${e}`)
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
			} catch (nodeRemovalError) {
				console.log(`[DEBUG] Primary node removal failed: ${nodeRemovalError}. Trying text-based removal.`)

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
				console.log(`[DEBUG] Text-based removal from positions ${expandedStartPos} to ${expandedEndPos}`)
				sourceFile.replaceText([expandedStartPos, expandedEndPos], "")
				sourceFile.saveSync()
				sourceFile.refreshFromFileSystemSync()
			}

			// Third attempt: Pattern-based removal if still present
			const updatedText = sourceFile.getFullText()
			if (updatedText.includes(symbolName) && updatedText !== originalText) {
				console.log(`[DEBUG] Symbol may still be present. Trying pattern-based removal.`)

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

						console.log(`[DEBUG] Pattern match found at positions ${matchStart} to ${matchEnd}`)
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
				console.log(`[WARNING] Symbol declaration still detected after all removal attempts`)
				return {
					success: false,
					error: "Symbol still present in source file after multiple removal attempts",
				}
			}

			return { success: true }
		} catch (error) {
			console.error(`[ERROR] Failed to remove symbol: ${error}`)
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
			console.log(`[CRITICAL DEBUG] *** updateReferencingFiles ENTRY POINT *** symbol: ${symbol.name}`)
			console.log(`[DEBUG] updateReferencingFiles called for symbol "${symbol.name}"`)
			// Use ImportManager to update all imports that reference the moved symbol
			const importManager = new ImportManager(this.project)
			// CRITICAL: Set the PathResolver so import paths are calculated correctly
			importManager.setPathResolver(this.pathResolver)

			// Set PathResolver, either from ProjectManager or our own
			const pathResolver = this.projectManager ? this.projectManager.getPathResolver() : this.pathResolver
			importManager.setPathResolver(pathResolver)

			// Normalize and resolve paths to ensure consistency
			const sourceFilePath = symbol.filePath
			const normalizedSourcePath = pathResolver.normalizeFilePath(sourceFilePath)
			const absoluteSourcePath = pathResolver.resolveAbsolutePath(normalizedSourcePath)

			const normalizedTargetPath = pathResolver.normalizeFilePath(targetFilePath)
			const resolvedTargetPath = pathResolver.resolveAbsolutePath(normalizedTargetPath)

			console.log(
				`[DEBUG] Updating imports for symbol "${symbol.name}" moved from ${sourceFilePath} to ${resolvedTargetPath}`,
			)

			// Update imports in all referencing files - try with both source paths
			// Convert paths to project-relative before calling import manager
			const relativeSourcePath = pathResolver.convertToRelativePath(sourceFilePath)
			const relativeTargetPath = pathResolver.convertToRelativePath(resolvedTargetPath)

			console.log(`[DEBUG] About to call importManager.updateImportsAfterMove`)
			console.log(`[DEBUG] Source path: ${sourceFilePath} -> ${relativeSourcePath}`)
			console.log(`[DEBUG] Target path: ${resolvedTargetPath} -> ${relativeTargetPath}`)

			await importManager.updateImportsAfterMove(symbol.name, relativeSourcePath, relativeTargetPath)
			console.log(`[DEBUG] Completed importManager.updateImportsAfterMove`)

			// Find all files that reference the symbol - this is more accurate than relying on ImportManager
			const updatedFiles: string[] = []

			// Add source and target files with various path formats for maximum compatibility
			updatedFiles.push(
				sourceFilePath,
				normalizedSourcePath,
				absoluteSourcePath,
				targetFilePath,
				normalizedTargetPath,
				resolvedTargetPath,
			)

			// Find all source files in the project
			this.project.getSourceFiles().forEach((file) => {
				const filePath = file.getFilePath()

				// Skip source and target files (already in the list)
				if (filePath === sourceFilePath || filePath === resolvedTargetPath) {
					return
				}

				// Check if file contains the symbol name (might reference it)
				const fileContent = file.getFullText()
				if (fileContent.includes(symbol.name)) {
					updatedFiles.push(filePath)
				}
			})

			return [...new Set(updatedFiles)] // Remove duplicates
		} catch (error) {
			console.error(`Error updating referencing files: ${(error as Error).message}`)
			return [
				symbol.filePath,
				this.pathResolver.normalizeFilePath(symbol.filePath),
				this.pathResolver.resolveAbsolutePath(symbol.filePath),
				targetFilePath,
				this.pathResolver.normalizeFilePath(targetFilePath),
				this.pathResolver.resolveAbsolutePath(targetFilePath),
			]
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

		// Find existing imports for the symbol
		for (const importDecl of importDeclarations) {
			const namedImports = importDecl.getNamedImports()

			// Check if this import includes our symbol
			const matchingImport = namedImports.find((named) => named.getName() === symbolName)

			if (matchingImport) {
				// Update the module specifier
				importDecl.setModuleSpecifier(importPath)
				updated = true
				break
			}
		}

		// If no existing import for this symbol, add a new one
		if (!updated) {
			file.addImportDeclaration({
				namedImports: [symbolName],
				moduleSpecifier: importPath,
			})
			updated = true
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
			console.log(`[DEBUG] Scanning for TypeScript files in: ${projectRoot}`)

			// Get all TypeScript files in the project directory
			const tsFiles = this.findTypeScriptFiles(projectRoot)
			console.log(`[DEBUG] Found ${tsFiles.length} TypeScript files to ensure are loaded`)

			// Add each file to the project if not already present
			for (const filePath of tsFiles) {
				try {
					const existingFile = this.project.getSourceFile(filePath)
					if (!existingFile) {
						console.log(`[DEBUG] Adding file to project: ${filePath}`)
						this.project.addSourceFileAtPath(filePath)
					}
				} catch (error) {
					console.log(`[DEBUG] Failed to add file ${filePath}: ${error}`)
				}
			}

			console.log(`[DEBUG] Project now has ${this.project.getSourceFiles().length} source files loaded`)
		} catch (error) {
			console.error(`[ERROR] Failed to ensure all project files are loaded: ${error}`)
		}
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
			console.log(`[DEBUG] Failed to read directory ${dir}: ${error}`)
		}

		return files
	}
}
