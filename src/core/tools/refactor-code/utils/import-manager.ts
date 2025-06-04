import {
	Project,
	SourceFile,
	ImportDeclaration,
	ExportDeclaration,
	ImportSpecifier,
	ExportSpecifier,
	Node,
	SyntaxKind,
	NamespaceImport,
	ImportClause,
	ModuleDeclaration,
} from "ts-morph"
import * as path from "path"
import * as fs from "fs"

export interface ImportUpdate {
	file: SourceFile
	oldPath: string
	newPath: string
	symbolName: string
}

/**
 * Utility for managing imports and exports when moving symbols between files
 * Contains optimized algorithms for tracking and updating import references
 */
export class ImportManager {
	private project: Project
	private updatedFiles: Set<string> = new Set()
	private fileImportCache: Map<string, Set<string>> = new Map()
	private fileExportCache: Map<string, Set<string>> = new Map()
	private resolvedPathCache: Map<string, string> = new Map()
	private symbolExtractor: any // Will be set by setSymbolExtractor
	private pathResolver: any // Will be set by setPathResolver

	// Enum to distinguish between different import types
	private ImportType = {
		REGULAR: "regular", // import { X } from 'module'
		TYPE: "type", // import type { X } from 'module'
		NAMESPACE: "namespace", // import * as X from 'module'
		DEFAULT: "default", // import X from 'module'
		RE_EXPORT: "re-export", // export { X } from 'module'
	}

	constructor(project: Project) {
		this.project = project
	}

	/**
	 * Sets the SymbolExtractor instance to use for dependency analysis
	 * This allows us to leverage the enhanced dependency analysis
	 */
	public setSymbolExtractor(symbolExtractor: any): void {
		this.symbolExtractor = symbolExtractor
	}

	/**
	 * Sets the PathResolver instance to use for path normalization
	 */
	public setPathResolver(pathResolver: any): void {
		this.pathResolver = pathResolver
	}

	/**
	 * Clears all internal caches to ensure fresh data.
	 * Call this when files in the project have changed significantly.
	 */
	public clearCaches(): void {
		this.fileImportCache.clear()
		this.fileExportCache.clear()
		this.resolvedPathCache.clear()
	}

	/**
	 * Updates all imports after a symbol is moved to a new file
	 */
	async updateImportsAfterMove(symbolName: string, oldFilePath: string, newFilePath: string): Promise<void> {
		this.updatedFiles.clear()

		// Find files that import from the old file - these are the most important to update
		const importingFiles = this.findFilesImporting(oldFilePath)

		// Also find files that re-export from the old file
		const reExportingFiles = this.findFilesReExporting(oldFilePath)

		// Focus only on files that directly import from the source file
		// This is much more efficient than searching all files in the project
		const referencingFiles = new Set<SourceFile>()

		// Add files directly importing from the old file
		importingFiles.forEach((file) => referencingFiles.add(file))

		// Only search for additional references in the same directories as the source and target files
		const sourceDir = this.pathResolver.getDirectoryPath(oldFilePath)
		const targetDir = this.pathResolver.getDirectoryPath(newFilePath)
		const nearbyFiles = this.project.getSourceFiles().filter((file) => {
			const filePath = file.getFilePath()
			const fileDir = this.pathResolver.getDirectoryPath(filePath)

			// Skip if we're already going to process this file
			if (referencingFiles.has(file)) return false

			// Skip the old and new files
			if (filePath === oldFilePath || filePath === newFilePath) return false

			// Only include files in the same directories as source or target
			return fileDir === sourceDir || fileDir === targetDir
		})

		// Check these nearby files for references to the symbol
		for (const file of nearbyFiles) {
			// Check if this file contains any references to the symbol
			const fileText = file.getFullText()

			// Simple text search as a first pass - we'll verify the imports later
			if (fileText.includes(symbolName)) {
				// Look for identifiers that match our symbol
				const identifiers = file
					.getDescendantsOfKind(SyntaxKind.Identifier)
					.filter((id) => id.getText() === symbolName)

				if (identifiers.length > 0) {
					referencingFiles.add(file)
					console.log(`[DEBUG] Found additional file referencing ${symbolName}: ${file.getFilePath()}`)
				}
			}
		}

		// Update imports in all referencing files
		for (const file of referencingFiles) {
			await this.updateImportPath(file, symbolName, oldFilePath, newFilePath)
			this.updatedFiles.add(file.getFilePath())
			// Save changes to disk
			file.saveSync()
		}

		// Update re-exports as well
		// We already got the re-exporting files earlier, but we need to re-use them here
		for (const file of reExportingFiles) {
			await this.updateReExportPath(file, symbolName, oldFilePath, newFilePath)
			this.updatedFiles.add(file.getFilePath())
			// Save changes to disk
			file.saveSync()
		}

		// Handle inline symbol definitions that need re-exports
		// If a symbol was defined inline in the source file and moved away,
		// we need to either add a re-export (for barrel files) or an import (for regular files)
		const sourceFile = this.project.getSourceFile(oldFilePath)
		if (sourceFile) {
			const shouldAddReExport = this.shouldAddReExportForInlineSymbol(
				sourceFile,
				symbolName,
				oldFilePath,
				newFilePath,
			)
			if (shouldAddReExport) {
				const newRelativePath = this.calculateRelativePath(oldFilePath, newFilePath)
				this.addReExport(sourceFile, symbolName, newRelativePath)
				console.log(`[DEBUG] ImportManager: Added re-export for inline symbol ${symbolName} in ${oldFilePath}`)
				this.updatedFiles.add(sourceFile.getFilePath())
				sourceFile.saveSync()
			} else {
				// For non-barrel files, check if the source file still uses the moved symbol
				// If so, add an import statement
				if (this.fileReferencesSymbol(sourceFile, symbolName)) {
					const newRelativePath = this.calculateRelativePath(oldFilePath, newFilePath)
					this.addImport(sourceFile, symbolName, newRelativePath)
					console.log(`[DEBUG] ImportManager: Added import for moved symbol ${symbolName} in ${oldFilePath}`)
					this.updatedFiles.add(sourceFile.getFilePath())
					sourceFile.saveSync()
				}
			}
		}

		// Add necessary imports to the new file
		const newFile = this.project.getSourceFile(newFilePath)
		if (newFile) {
			await this.addMissingImports(newFile, symbolName, oldFilePath)
			// Save changes to disk
			newFile.saveSync()
		}
	}

	/**
	 * Finds all files that import from the specified file
	 * Uses caching to improve performance for repeated calls
	 */
	private findFilesImporting(filePath: string): SourceFile[] {
		// Check cache first
		const cacheKey = `import:${filePath}`
		if (this.fileImportCache.has(cacheKey)) {
			const importingFilePaths = this.fileImportCache.get(cacheKey)
			if (importingFilePaths) {
				return Array.from(importingFilePaths)
					.map((path) => this.project.getSourceFile(path))
					.filter(Boolean) as SourceFile[]
			}
		}

		const sourceFile = this.project.getSourceFile(filePath)
		if (!sourceFile) return []

		const importingFiles: SourceFile[] = []

		// First try the ts-morph method
		const referencingFiles = sourceFile.getReferencingSourceFiles()
		for (const file of referencingFiles) {
			const imports = file.getImportDeclarations()
			if (imports.some((imp) => this.isImportFromFile(imp, filePath))) {
				importingFiles.push(file)
			}
		}

		// If we didn't find any files using ts-morph, search all files manually
		// This is more reliable for finding import relationships
		if (importingFiles.length === 0) {
			console.log(
				`[DEBUG] No files found via getReferencingSourceFiles, searching all project files for imports from ${filePath}`,
			)

			// First, ensure we have loaded all TypeScript files in the project directory
			this.ensureAllProjectFilesLoaded(filePath)

			const allFiles = this.project.getSourceFiles()

			// Filter to only files within the project root and in the same directory tree as the target file
			// This prevents scanning the entire 3KiloCode project during tests
			const projectRoot = this.pathResolver.getProjectRoot()
			const targetDir = this.pathResolver.getDirectoryPath(filePath)

			const relevantFiles = allFiles.filter((file) => {
				const currentFilePath = file.getFilePath()
				const currentDir = this.pathResolver.getDirectoryPath(currentFilePath)

				// Skip the source file itself
				if (currentFilePath === filePath) {
					return false
				}

				// Only include files within the project root
				if (!currentFilePath.startsWith(projectRoot)) {
					return false
				}

				// Only check files in the same directory tree
				return currentDir.startsWith(targetDir) || targetDir.startsWith(currentDir)
			})

			for (const file of relevantFiles) {
				const currentFilePath = file.getFilePath()
				const imports = file.getImportDeclarations()

				for (const imp of imports) {
					const isMatch = this.isImportFromFile(imp, filePath)
					if (isMatch) {
						importingFiles.push(file)
						break // Only add the file once
					}
				}
			}
		}

		// Cache the results
		this.fileImportCache.set(cacheKey, new Set(importingFiles.map((file) => file.getFilePath())))

		return importingFiles
	}

	/**
	 * Finds all files that re-export from the specified file
	 * Uses caching to improve performance for repeated calls
	 */
	private findFilesReExporting(filePath: string): SourceFile[] {
		// Check cache first
		const cacheKey = `export:${filePath}`
		if (this.fileExportCache.has(cacheKey)) {
			const exportingFilePaths = this.fileExportCache.get(cacheKey)
			if (exportingFilePaths) {
				return Array.from(exportingFilePaths)
					.map((path) => this.project.getSourceFile(path))
					.filter(Boolean) as SourceFile[]
			}
		}

		// For re-exports, we need to search only files that reference this file
		const sourceFile = this.project.getSourceFile(filePath)
		if (!sourceFile) return []

		const referencingFiles = sourceFile.getReferencingSourceFiles()

		const reExportingFiles = referencingFiles.filter((file) => {
			const exports = file.getExportDeclarations()
			return exports.some((exp) => this.isExportFromFile(exp, filePath))
		})

		// Cache the results
		this.fileExportCache.set(cacheKey, new Set(reExportingFiles.map((file) => file.getFilePath())))

		return reExportingFiles
	}

	/**
	 * Updates import paths in a file
	 */
	private async updateImportPath(
		file: SourceFile,
		symbolName: string,
		oldPath: string,
		newPath: string,
	): Promise<void> {
		const imports = file.getImportDeclarations()

		for (const importDecl of imports) {
			if (!this.isImportFromFile(importDecl, oldPath)) {
				continue
			}

			// Check if this import includes the moved symbol
			const importType = this.getImportType(importDecl)
			let hasSymbol = false

			if (importType === this.ImportType.DEFAULT) {
				// For default imports, check the default import name
				const defaultImport = importDecl.getDefaultImport()
				hasSymbol = defaultImport?.getText() === symbolName
			} else if (importType === this.ImportType.NAMESPACE) {
				// For namespace imports, check if the namespace contains the symbol
				// by analyzing if the symbol is used via the namespace in the file
				const namespaceImport = importDecl.getNamespaceImport()
				if (namespaceImport) {
					const namespaceAlias = namespaceImport.getText()
					// Check if the file uses the symbol via the namespace (e.g., Helpers.formatName)
					const fileText = file.getFullText()
					const namespaceUsagePattern = new RegExp(`\\b${namespaceAlias}\\.${symbolName}\\b`, "g")
					hasSymbol = namespaceUsagePattern.test(fileText)

					if (hasSymbol) {
						console.log(
							`[DEBUG] ImportManager: Found namespace usage ${namespaceAlias}.${symbolName} in ${file.getFilePath()}`,
						)
					}
				}
			} else {
				// For regular and type imports, check named imports
				const namedImports = importDecl.getNamedImports()
				hasSymbol = namedImports.some((imp) => imp.getName() === symbolName)
			}

			if (!hasSymbol) {
				continue
			}

			console.log(`[DEBUG] ImportManager: Found import with symbol ${symbolName} in ${file.getFilePath()}`)
			console.log(`[DEBUG] ImportManager: Current import: ${importDecl.getText()}`)

			// Calculate new relative path
			const newRelativePath = this.calculateRelativePath(file.getFilePath(), newPath)
			console.log(`[DEBUG] ImportManager: Updating import path to: ${newRelativePath}`)

			// Check if we need to keep the old import for other symbols
			const currentImportType = this.getImportType(importDecl)

			if (currentImportType === this.ImportType.DEFAULT) {
				// For default imports, we need to update the entire import
				console.log(`[DEBUG] ImportManager: Updating default import module specifier`)
				importDecl.setModuleSpecifier(newRelativePath)
			} else if (currentImportType === this.ImportType.NAMESPACE) {
				// For namespace imports, update the module specifier
				console.log(`[DEBUG] ImportManager: Updating namespace import module specifier`)
				importDecl.setModuleSpecifier(newRelativePath)
			} else {
				// For regular and type imports, check if there are other imports to keep
				const namedImports = importDecl.getNamedImports()
				const otherImports = namedImports.filter((imp) => imp.getName() !== symbolName)
				console.log(`[DEBUG] ImportManager: Named import - other imports: ${otherImports.length}`)

				if (otherImports.length > 0) {
					// Remove only the moved symbol from the import
					console.log(`[DEBUG] ImportManager: Removing symbol from import and creating new import`)
					const symbolImport = namedImports.find((imp) => imp.getName() === symbolName)
					symbolImport?.remove()

					// Add a new import for the moved symbol, preserving the import type
					if (currentImportType === this.ImportType.TYPE) {
						console.log(`[DEBUG] ImportManager: Adding new type import for ${symbolName}`)
						this.addTypeImport(file, symbolName, newRelativePath)
					} else {
						console.log(`[DEBUG] ImportManager: Adding new regular import for ${symbolName}`)
						this.addImport(file, symbolName, newRelativePath)
					}
				} else {
					// Update the module specifier if this is the only import
					console.log(`[DEBUG] ImportManager: Updating module specifier for single import`)
					importDecl.setModuleSpecifier(newRelativePath)
				}
			}
		}

		// Search for references to the symbol that might not be directly imported
		const identifiers = file.getDescendantsOfKind(SyntaxKind.Identifier).filter((id) => id.getText() === symbolName)

		if (identifiers.length > 0) {
			// If we find references to the symbol but didn't update any imports,
			// we might need to add a new import (symbol might be referenced without being imported)
			const hasUpdatedImport = imports.some(
				(imp) =>
					this.isImportFromFile(imp, newPath) &&
					imp.getNamedImports().some((ni) => ni.getName() === symbolName),
			)

			if (!hasUpdatedImport && !this.hasImport(file, symbolName)) {
				const newRelativePath = this.calculateRelativePath(file.getFilePath(), newPath)
				this.addImport(file, symbolName, newRelativePath)
				console.log(`[DEBUG] Added missing import for ${symbolName} in file ${file.getFilePath()}`)
			}
		}
	}

	/**
	 * Updates re-export paths in a file
	 */
	private async updateReExportPath(
		file: SourceFile,
		symbolName: string,
		oldPath: string,
		newPath: string,
	): Promise<void> {
		const exports = file.getExportDeclarations()

		for (const exportDecl of exports) {
			if (!this.isExportFromFile(exportDecl, oldPath)) {
				continue
			}

			// Check if this export includes the moved symbol
			const namedExports = exportDecl.getNamedExports()
			const hasSymbol = namedExports.some((exp) => exp.getName() === symbolName)

			// Also check for aliased exports (export { X as Y } from 'module')
			const hasAliasedSymbol = namedExports.some((exp) => {
				const alias = exp.getAliasNode()
				if (alias) {
					return exp.getNameNode().getText() === symbolName || alias.getText() === symbolName
				}
				return false
			})

			if (!hasSymbol) {
				continue
			}

			// Calculate new relative path
			const newRelativePath = this.calculateRelativePath(file.getFilePath(), newPath)

			// Check if we need to keep the old export for other symbols
			const otherExports = namedExports.filter((exp) => exp.getName() !== symbolName)

			if (otherExports.length > 0) {
				// Remove only the moved symbol from the export
				const symbolExport = namedExports.find((exp) => exp.getName() === symbolName)
				symbolExport?.remove()

				// Add a new export for the moved symbol
				this.addReExport(file, symbolName, newRelativePath)
			} else {
				// Update the module specifier if this is the only export
				exportDecl.setModuleSpecifier(newRelativePath)
			}
		}
	}

	/**
	 * Adds missing imports to the new file
	 */
	public async addMissingImports(newFile: SourceFile, movedSymbolName: string, oldFilePath: string): Promise<void> {
		// Get the moved symbol's dependencies from the old file
		const oldFile = this.project.getSourceFile(oldFilePath)
		if (!oldFile) {
			console.log(`[ERROR] Could not find source file: ${oldFilePath}`)
			return
		}

		console.log(
			`[DEBUG] Analyzing dependencies for ${movedSymbolName} to add imports in target file: ${newFile.getFilePath()}`,
		)

		// Find all symbols that the moved symbol depends on
		const dependencies = this.findSymbolDependencies(oldFile, movedSymbolName)

		// Filter out the moved symbol itself and any object property references
		// which are commonly mistaken for dependencies
		const filteredDependencies = dependencies.filter((dep) => {
			// Never import the symbol we just moved
			if (dep.name === movedSymbolName) {
				console.log(`[DEBUG] Filtering out moved symbol itself: ${dep.name}`)
				return false
			}

			// Filter out common property names from object literals that are often mistaken for imports
			if (
				["id", "email", "name", "firstName", "lastName", "createdAt", "updatedAt", "data", "user"].includes(
					dep.name,
				)
			) {
				// Check if this is a type reference (types usually start with uppercase)
				const isLikelyType = /^[A-Z]/.test(dep.name)

				// If it looks like a type, keep it
				if (isLikelyType) {
					console.log(`[DEBUG] Keeping likely type reference despite property name match: ${dep.name}`)
					return true
				}

				console.log(`[DEBUG] Filtering out likely object property: ${dep.name}`)
				return false
			}

			// Keep all type references - these are important for type checking
			if (dep.isType) {
				console.log(`[DEBUG] Keeping type reference: ${dep.name}`)
				return true
			}

			// Keep all function calls - these are important for execution
			if (dep.isFunction) {
				console.log(`[DEBUG] Keeping function call dependency: ${dep.name}`)
				return true
			}

			return true
		})

		console.log(`[DEBUG] After filtering, adding ${filteredDependencies.length} dependencies`)

		// Collect all local symbols in the original file that might be needed
		const localSymbols = new Set<string>()

		// Get all symbols exported by the old file - we'll need to import these if referenced
		const oldFileExports = new Map<string, boolean>()
		const exportedDeclarations = oldFile.getExportedDeclarations()

		// Convert the export declarations map to our simpler format
		exportedDeclarations.forEach((_, name) => {
			oldFileExports.set(name, true)
		})

		// Additional check for non-exported local symbols that are still referenced
		const allOldFileSymbols = new Map<string, boolean>()

		// Add all functions in the file
		oldFile.getFunctions().forEach((func) => {
			const name = func.getName()
			if (name) allOldFileSymbols.set(name, true)
		})

		// Add all variables in the file
		oldFile.getVariableDeclarations().forEach((variable) => {
			const name = variable.getName()
			if (name) allOldFileSymbols.set(name, true)
		})

		// Process local dependencies from the old file
		for (const dep of filteredDependencies) {
			if (dep.isLocal) {
				// If the symbol is defined in the old file (exported or not),
				// we need to import it in the new file
				if (oldFileExports.has(dep.name)) {
					localSymbols.add(dep.name)
					console.log(`[DEBUG] Found local dependency that's exported: ${dep.name}`)
				} else if (allOldFileSymbols.has(dep.name)) {
					// If it's defined in the file but not exported, we still need to reference it
					localSymbols.add(dep.name)
					console.log(`[DEBUG] Found local dependency that's not exported: ${dep.name}`)
				}
			}
		}

		// For local symbols that exist in the old file, add imports from the old file
		if (localSymbols.size > 0) {
			// Calculate relative path from new file to old file
			const relativePath = this.calculateRelativePath(newFile.getFilePath(), oldFilePath)
			console.log(`[DEBUG] Calculated relative path for local imports: ${relativePath}`)

			for (const symbolName of localSymbols) {
				if (!this.hasImport(newFile, symbolName)) {
					this.addImport(newFile, symbolName, relativePath)
					console.log(`[DEBUG] Added import for local dependency: ${symbolName} from ${relativePath}`)
				}
			}
		}

		// Keep track of which dependencies we've already handled
		const handledDependencies = new Set<string>([...localSymbols])

		// Track external imports that we need to add
		const externalImports = new Map<string, string[]>() // moduleSpecifier -> symbolNames

		// Process the original imports for external dependencies
		const oldFileImports = oldFile.getImportDeclarations()

		// Store import metadata to preserve import types
		const importMetadata = new Map<
			string,
			Array<{ symbol: string; type: "regular" | "type" | "namespace" | "default"; originalName?: string }>
		>()

		// Process each import in the old file to see if it contains dependencies we need
		for (const importDecl of oldFileImports) {
			const moduleSpecifier = importDecl.getModuleSpecifierValue()
			const importType = this.getImportType(importDecl)

			// Get all imported symbols from this import declaration with their types
			const symbolsFromThisImport: Array<{
				symbol: string
				type: "regular" | "type" | "namespace" | "default"
				originalName?: string
			}> = []

			// Named imports: import { A, B } from "module" or import type { A, B } from "module"
			const namedImports = importDecl.getNamedImports()
			for (const namedImport of namedImports) {
				const symbolName = namedImport.getName()
				const symbolType = importType === this.ImportType.TYPE ? "type" : "regular"
				symbolsFromThisImport.push({ symbol: symbolName, type: symbolType as "regular" | "type" })
			}

			// Namespace import: import * as Name from "module"
			const namespaceImport = importDecl.getNamespaceImport()
			if (namespaceImport) {
				const symbolName = namespaceImport.getText()
				symbolsFromThisImport.push({ symbol: symbolName, type: "namespace" })
			}

			// Default import: import Name from "module"
			const defaultImport = importDecl.getDefaultImport()
			if (defaultImport) {
				const symbolName = defaultImport.getText()
				symbolsFromThisImport.push({ symbol: symbolName, type: "default" })
			}

			// Find dependencies that are imported by this import declaration
			const neededSymbols = symbolsFromThisImport.filter(({ symbol }) =>
				filteredDependencies.some((dep) => !dep.isLocal && dep.name === symbol),
			)

			if (neededSymbols.length > 0) {
				console.log(
					`[DEBUG] Found original import for dependencies: ${neededSymbols.map((s) => s.symbol).join(", ")} from ${moduleSpecifier}`,
				)

				// Calculate the correct relative path for the new file
				let adjustedModuleSpecifier = moduleSpecifier

				// Only recalculate relative paths
				if (adjustedModuleSpecifier.startsWith(".")) {
					const oldFileDirPath = this.pathResolver.getDirectoryPath(oldFile.getFilePath())
					const newFileDirPath = this.pathResolver.getDirectoryPath(newFile.getFilePath())

					// First resolve the absolute path from the old file's perspective
					const absoluteImportPath = this.pathResolver.resolveAbsolutePath(
						this.pathResolver.joinPaths(oldFileDirPath, moduleSpecifier),
					)
					console.log(`[DEBUG] Resolved absolute import path: ${absoluteImportPath}`)

					// Then calculate the relative path from the new file to that absolute path
					adjustedModuleSpecifier = this.pathResolver.getRelativePath(newFileDirPath, absoluteImportPath)

					// Ensure it starts with ./ or ../
					if (!adjustedModuleSpecifier.startsWith(".")) {
						adjustedModuleSpecifier = "./" + adjustedModuleSpecifier
					}

					// Normalize path separators
					adjustedModuleSpecifier = adjustedModuleSpecifier.replace(/\\/g, "/")

					console.log(`[DEBUG] Adjusted import path: ${adjustedModuleSpecifier}`)
				}

				// Store import metadata
				if (!importMetadata.has(adjustedModuleSpecifier)) {
					importMetadata.set(adjustedModuleSpecifier, [])
				}

				for (const symbolInfo of neededSymbols) {
					if (!this.hasImport(newFile, symbolInfo.symbol)) {
						importMetadata.get(adjustedModuleSpecifier)?.push(symbolInfo)
						handledDependencies.add(symbolInfo.symbol)
					}
				}
			}
		}

		// Add all the external imports we collected, preserving their types
		for (const [moduleSpecifier, symbolInfos] of importMetadata.entries()) {
			if (symbolInfos.length > 0) {
				// Group symbols by import type
				const regularSymbols = symbolInfos.filter((s) => s.type === "regular").map((s) => s.symbol)
				const typeSymbols = symbolInfos.filter((s) => s.type === "type").map((s) => s.symbol)
				const namespaceSymbols = symbolInfos.filter((s) => s.type === "namespace")
				const defaultSymbols = symbolInfos.filter((s) => s.type === "default")

				// Add regular imports
				for (const symbolName of regularSymbols) {
					this.addImport(newFile, symbolName, moduleSpecifier)
					console.log(
						`[DEBUG] Added regular import for external dependency: ${symbolName} from ${moduleSpecifier}`,
					)
				}

				// Add type imports
				for (const symbolName of typeSymbols) {
					this.addTypeImport(newFile, symbolName, moduleSpecifier)
					console.log(
						`[DEBUG] Added type import for external dependency: ${symbolName} from ${moduleSpecifier}`,
					)
				}

				// Add namespace imports
				for (const symbolInfo of namespaceSymbols) {
					this.addNamespaceImport(newFile, symbolInfo.symbol, moduleSpecifier)
					console.log(
						`[DEBUG] Added namespace import for external dependency: ${symbolInfo.symbol} from ${moduleSpecifier}`,
					)
				}

				// Add default imports
				for (const symbolInfo of defaultSymbols) {
					this.addDefaultImport(newFile, symbolInfo.symbol, moduleSpecifier)
					console.log(
						`[DEBUG] Added default import for external dependency: ${symbolInfo.symbol} from ${moduleSpecifier}`,
					)
				}
			}
		}

		// Process remaining dependencies that weren't found in imports
		for (const dep of filteredDependencies) {
			// Skip if we've already handled this dependency
			if (handledDependencies.has(dep.name)) {
				continue
			}

			// Check if the dependency is already imported in the new file
			if (!this.hasImport(newFile, dep.name)) {
				console.log(`[DEBUG] Adding import for remaining dependency: ${dep.name} (isLocal: ${dep.isLocal})`)

				if (dep.isLocal) {
					// For local dependencies that weren't found in imports, we need to create a new import
					const relativePath = this.calculateRelativePath(newFile.getFilePath(), oldFilePath)
					this.addImport(newFile, dep.name, relativePath)
					console.log(`[DEBUG] Added fallback import for local dependency: ${dep.name} from ${relativePath}`)
				} else {
					// External import - try to copy from old file or make best effort
					const importFound = this.copyImport(newFile, oldFile, dep.name)
					if (!importFound) {
						// If we couldn't find an import, look through all files for this symbol
						this.findAndAddImportForSymbol(newFile, dep.name)
					}
				}
			} else {
				console.log(`[DEBUG] Dependency ${dep.name} already imported in target file`)
			}
		}
	}

	/**
	 * Checks if an import declaration is from the specified file
	 */
	private isImportFromFile(importDecl: ImportDeclaration, filePath: string): boolean {
		const moduleSpecifier = importDecl.getModuleSpecifierValue()
		const importingFilePath = importDecl.getSourceFile().getFilePath()

		// Handle non-relative imports (packages)
		if (!moduleSpecifier.startsWith(".") && !moduleSpecifier.startsWith("/")) {
			return false
		}

		// Resolve the module path
		const resolvedPath = this.resolveModulePath(importingFilePath, moduleSpecifier)

		// Try multiple comparison methods for robustness
		if (this.pathsMatch(resolvedPath, filePath)) {
			return true
		}

		// Additional check: if PathResolver is available, use it for more accurate comparison
		if (this.pathResolver) {
			// Normalize both paths
			const normalizedResolved = this.pathResolver.normalizeFilePath(resolvedPath)
			const normalizedFilePath = this.pathResolver.normalizeFilePath(filePath)

			// Try direct comparison
			if (this.pathResolver.arePathsEqual(normalizedResolved, normalizedFilePath)) {
				return true
			}

			// Try with extensions added
			const extensions = [".ts", ".tsx", ".js", ".jsx"]
			for (const ext of extensions) {
				const withExt = normalizedResolved + ext
				if (this.pathResolver.arePathsEqual(withExt, normalizedFilePath)) {
					return true
				}
			}
		}

		// Fallback: manual path resolution and comparison
		const importingDir = this.pathResolver.getDirectoryPath(importingFilePath)
		const manualResolved = this.pathResolver.resolveAbsolutePath(
			this.pathResolver.joinPaths(importingDir, moduleSpecifier),
		)

		// Try with different extensions
		const extensions = [".ts", ".tsx", ".js", ".jsx"]
		for (const ext of extensions) {
			const withExt = manualResolved + ext
			if (this.pathsMatch(withExt, filePath)) {
				console.log(
					`[DEBUG] Import match found via manual resolution with ${ext}: ${moduleSpecifier} -> ${filePath}`,
				)
				return true
			}
		}

		return false
	}

	/**
	 * Checks if an export declaration is from the specified file
	 */
	private isExportFromFile(exportDecl: ExportDeclaration, filePath: string): boolean {
		const moduleSpecifier = exportDecl.getModuleSpecifierValue()
		if (!moduleSpecifier) return false

		const resolvedPath = this.resolveModulePath(exportDecl.getSourceFile().getFilePath(), moduleSpecifier)

		return this.pathsMatch(resolvedPath, filePath)
	}

	/**
	 * Calculates relative path between two files
	 * Uses caching to improve performance for repeated calculations
	 */
	private calculateRelativePath(fromPath: string, toPath: string): string {
		// Create a cache key from the two paths
		const cacheKey = `${fromPath}|${toPath}`

		// Check the cache first
		if (this.resolvedPathCache.has(cacheKey)) {
			return this.resolvedPathCache.get(cacheKey)!
		}

		let relativePath: string

		// Use PathResolver's optimized method if available
		if (this.pathResolver && typeof this.pathResolver.getRelativeImportPath === "function") {
			relativePath = this.pathResolver.getRelativeImportPath(fromPath, toPath)
			console.log(
				`[DEBUG] Using PathResolver.getRelativeImportPath: ${relativePath} (from ${fromPath} to ${toPath})`,
			)
		} else {
			// Fallback implementation
			// Normalize paths
			const normalizedFromPath = fromPath.replace(/\\/g, "/")
			const normalizedToPath = toPath.replace(/\\/g, "/")

			const fromDir = path.dirname(normalizedFromPath)
			relativePath = path.relative(fromDir, normalizedToPath)

			// Normalize the resulting path
			relativePath = relativePath.replace(/\\/g, "/")

			// Remove file extension
			relativePath = relativePath.replace(/\.(ts|tsx|js|jsx)$/, "")

			// Ensure it starts with ./ or ../
			if (!relativePath.startsWith(".")) {
				relativePath = "./" + relativePath
			}

			console.log(
				`[DEBUG] Fallback relative path calculation: ${relativePath} (from ${fromDir} to ${normalizedToPath})`,
			)
		}

		// Cache the result
		this.resolvedPathCache.set(cacheKey, relativePath)

		return relativePath
	}

	/**
	 * Resolves a module path to an absolute file path
	 * Uses caching to improve performance for repeated calculations
	 */
	private resolveModulePath(fromPath: string, moduleSpecifier: string): string {
		// Create a cache key from the path and module specifier
		const cacheKey = `${fromPath}|${moduleSpecifier}`

		// Check the cache first
		if (this.resolvedPathCache.has(cacheKey)) {
			return this.resolvedPathCache.get(cacheKey)!
		}

		// Handle non-relative imports (packages)
		if (!moduleSpecifier.startsWith(".") && !moduleSpecifier.startsWith("/")) {
			// External module
			this.resolvedPathCache.set(cacheKey, moduleSpecifier)
			return moduleSpecifier
		}

		// Use PathResolver if available for consistent path handling
		if (this.pathResolver) {
			const normalizedFromPath = this.pathResolver.normalizeFilePath(fromPath)
			const fromDir = path.dirname(normalizedFromPath)

			// For relative imports, we need to calculate the absolute path
			let fullPath: string

			if (path.isAbsolute(moduleSpecifier)) {
				// Already absolute
				fullPath = this.pathResolver.normalizeFilePath(moduleSpecifier)
			} else {
				// Resolve relative to fromDir
				fullPath = path.resolve(fromDir, moduleSpecifier)
				fullPath = this.pathResolver.normalizeFilePath(fullPath)
			}

			// Check for extension
			if (!path.extname(fullPath)) {
				// Try to find the file with various extensions
				const extensions = [".ts", ".tsx", ".js", ".jsx"]
				for (const ext of extensions) {
					const withExt = fullPath + ext
					if (fs.existsSync(withExt) || this.project.getSourceFile(withExt)) {
						this.resolvedPathCache.set(cacheKey, withExt)
						return withExt
					}
				}
			}

			// Cache and return the resolved path
			this.resolvedPathCache.set(cacheKey, fullPath)
			return fullPath
		} else {
			// Normalize paths to ensure consistent handling across platforms
			const normalizedFromPath = fromPath.replace(/\\/g, "/")
			const normalizedModuleSpecifier = moduleSpecifier.replace(/\\/g, "/")

			const fromDir = path.dirname(normalizedFromPath)
			const resolved = path.resolve(fromDir, normalizedModuleSpecifier)
			const normalizedResolved = resolved.replace(/\\/g, "/")

			// Try with different extensions
			const extensions = [".ts", ".tsx", ".js", ".jsx"]
			for (const ext of extensions) {
				if (normalizedResolved.endsWith(ext)) {
					this.resolvedPathCache.set(cacheKey, normalizedResolved)
					return normalizedResolved
				}
				const withExt = normalizedResolved + ext

				// Try to find the file in the project
				if (this.project.getSourceFile(withExt)) {
					this.resolvedPathCache.set(cacheKey, withExt)
					return withExt
				}

				// Also check if file exists
				try {
					if (fs.existsSync(withExt)) {
						this.resolvedPathCache.set(cacheKey, withExt)
						return withExt
					}
				} catch (e) {
					// Ignore file system errors
				}
			}

			// Cache the fallback result
			this.resolvedPathCache.set(cacheKey, normalizedResolved)
			return normalizedResolved
		}
	}

	/**
	 * Checks if two paths refer to the same file
	 */
	private pathsMatch(path1: string, path2: string): boolean {
		if (!path1 || !path2) return false

		// Use PathResolver if available for more accurate comparison
		if (this.pathResolver) {
			return this.pathResolver.arePathsEqual(path1, path2)
		}

		// Fallback implementation
		const normalize = (p: string) => {
			// Convert backslashes to forward slashes
			let normalizedPath = p.replace(/\\/g, "/")
			// Remove extensions
			normalizedPath = normalizedPath.replace(/\.(ts|tsx|js|jsx)$/, "")
			// Convert to absolute path for consistent comparison
			if (!path.isAbsolute(normalizedPath)) {
				// If we don't have a PathResolver, we can't resolve relative paths accurately
				// So we'll just normalize the path as-is
			}
			return normalizedPath
		}

		const norm1 = normalize(path1)
		const norm2 = normalize(path2)

		// Try exact match first
		if (norm1 === norm2) return true

		// Try case-insensitive match (for Windows compatibility)
		if (norm1.toLowerCase() === norm2.toLowerCase()) return true

		// Try with different extension combinations
		const extensions = ["", ".ts", ".tsx", ".js", ".jsx"]
		for (const ext1 of extensions) {
			for (const ext2 of extensions) {
				if ((norm1 + ext1).toLowerCase() === (norm2 + ext2).toLowerCase()) {
					return true
				}
			}
		}

		return false
	}

	/**
	 * Finds dependencies of a symbol
	 * This is a simplified implementation for now
	 */
	private findSymbolDependencies(
		file: SourceFile,
		symbolName: string,
	): Array<{ name: string; isLocal: boolean; isType?: boolean; isFunction?: boolean }> {
		// Use enhanced SymbolExtractor if available
		if (this.symbolExtractor) {
			console.log(`[DEBUG] Using enhanced SymbolExtractor for dependency analysis of ${symbolName}`)

			// Find the symbol node using the appropriate methods for SourceFile
			let symbolNode: Node | undefined
			let symbolKind: string = "unknown"

			// Find variable declarations
			const variableDeclarations = file.getVariableDeclarations().filter((d) => d.getName() === symbolName)
			if (variableDeclarations.length > 0) {
				symbolNode = variableDeclarations[0]
				symbolKind = "variable"
			}

			// Find function declarations
			if (!symbolNode) {
				const functionDeclarations = file.getFunctions().filter((f) => f.getName() === symbolName)
				if (functionDeclarations.length > 0) {
					symbolNode = functionDeclarations[0]
					symbolKind = "function"
				}
			}

			// Find class declarations
			if (!symbolNode) {
				const classDeclarations = file.getClasses().filter((c) => c.getName() === symbolName)
				if (classDeclarations.length > 0) {
					symbolNode = classDeclarations[0]
					symbolKind = "class"
				}
			}

			// Find interface declarations
			if (!symbolNode) {
				const interfaceDeclarations = file.getInterfaces().filter((i) => i.getName() === symbolName)
				if (interfaceDeclarations.length > 0) {
					symbolNode = interfaceDeclarations[0]
					symbolKind = "interface"
				}
			}

			// Find type alias declarations
			if (!symbolNode) {
				const typeAliasDeclarations = file.getTypeAliases().filter((t) => t.getName() === symbolName)
				if (typeAliasDeclarations.length > 0) {
					symbolNode = typeAliasDeclarations[0]
					symbolKind = "typeAlias"
				}
			}

			// Find enum declarations
			if (!symbolNode) {
				const enumDeclarations = file.getEnums().filter((e) => e.getName() === symbolName)
				if (enumDeclarations.length > 0) {
					symbolNode = enumDeclarations[0]
					symbolKind = "enum"
				}
			}

			if (!symbolNode) {
				console.log(`[DEBUG] Symbol node not found for: ${symbolName}`)
				return []
			}

			// Use our enhanced SymbolExtractor to get all dependencies
			const symbol = {
				name: symbolName,
				kind: symbolKind,
				filePath: file.getFilePath(),
				node: symbolNode,
			}

			try {
				const extractedSymbol = this.symbolExtractor.extractSymbol(symbol)

				// Convert the dependencies to the format expected by this method
				const result: Array<{
					name: string
					isLocal: boolean
					isType?: boolean
					isFunction?: boolean
				}> = []

				// Process type dependencies
				for (const typeName of extractedSymbol.dependencies.types) {
					// Check if this is a local type
					const isLocalType =
						file.getInterface(typeName) !== undefined ||
						file.getTypeAlias(typeName) !== undefined ||
						file.getEnum(typeName) !== undefined ||
						file.getClass(typeName) !== undefined

					result.push({
						name: typeName,
						isLocal: isLocalType,
						isType: true,
						isFunction: false,
					})
				}

				// Process import dependencies
				extractedSymbol.dependencies.imports.forEach((moduleSpecifier: string, symbolName: string) => {
					// Skip some common identifiers that aren't likely to be imports
					if (
						[
							"string",
							"number",
							"boolean",
							"any",
							"void",
							"object",
							"null",
							"undefined",
							"Array",
							"Promise",
						].includes(symbolName)
					) {
						return
					}

					result.push({
						name: symbolName,
						isLocal: false,
						isType: false, // We don't know for sure, but imports can be either
						isFunction: false,
					})
				})

				console.log(
					`[DEBUG] Enhanced dependency analysis found ${result.length} dependencies for ${symbolName}`,
				)

				// Remove duplicates by name
				const uniqueDependencies = Array.from(new Map(result.map((item) => [item.name, item])).values())
				return uniqueDependencies
			} catch (error) {
				console.error(`[ERROR] Failed to extract symbol with enhanced extractor: ${error}`)
				// Fall back to original implementation if extraction fails
			}
		}

		// Fall back to original implementation if symbolExtractor is not available or fails
		const dependencies: Array<{ name: string; isLocal: boolean; isType?: boolean; isFunction?: boolean }> = []

		// Find the symbol node using the appropriate methods for SourceFile
		let symbolNode: Node | undefined

		// Find variable declarations
		const variableDeclarations = file.getVariableDeclarations().filter((d) => d.getName() === symbolName)
		if (variableDeclarations.length > 0) {
			symbolNode = variableDeclarations[0]
		}

		// Find function declarations
		if (!symbolNode) {
			const functionDeclarations = file.getFunctions().filter((f) => f.getName() === symbolName)
			if (functionDeclarations.length > 0) {
				symbolNode = functionDeclarations[0]
			}
		}

		// Find class declarations
		if (!symbolNode) {
			const classDeclarations = file.getClasses().filter((c) => c.getName() === symbolName)
			if (classDeclarations.length > 0) {
				symbolNode = classDeclarations[0]
			}
		}

		// Find interface declarations
		if (!symbolNode) {
			const interfaceDeclarations = file.getInterfaces().filter((i) => i.getName() === symbolName)
			if (interfaceDeclarations.length > 0) {
				symbolNode = interfaceDeclarations[0]
			}
		}

		// Find type alias declarations
		if (!symbolNode) {
			const typeAliasDeclarations = file.getTypeAliases().filter((t) => t.getName() === symbolName)
			if (typeAliasDeclarations.length > 0) {
				symbolNode = typeAliasDeclarations[0]
			}
		}

		if (!symbolNode) {
			return dependencies
		}

		// Track declarations within the symbol's scope to avoid adding them as dependencies
		const declarationsInScope = new Set<string>()

		// Add parameters and local variables/functions to declarations in scope
		symbolNode.getDescendantsOfKind(SyntaxKind.VariableDeclaration).forEach((d) => {
			const name = d.getName()
			if (name) {
				declarationsInScope.add(name)
				console.log(`[DEBUG] Added local declaration to scope: ${name}`)
			}
		})

		symbolNode.getDescendantsOfKind(SyntaxKind.FunctionDeclaration).forEach((d) => {
			const name = d.getName()
			if (name) {
				declarationsInScope.add(name)
				console.log(`[DEBUG] Added local function to scope: ${name}`)
			}
		})

		symbolNode.getDescendantsOfKind(SyntaxKind.Parameter).forEach((d) => {
			const name = d.getName()
			if (name) {
				declarationsInScope.add(name)
				console.log(`[DEBUG] Added parameter to scope: ${name}`)
			}
		})

		// Find all identifiers that are not declared within the symbol's scope
		symbolNode.getDescendantsOfKind(SyntaxKind.Identifier).forEach((identifier) => {
			const name = identifier.getText()

			// Skip if it's a declaration in scope or a common keyword
			if (
				declarationsInScope.has(name) ||
				["string", "number", "boolean", "any", "void", "null", "undefined", "this", "super"].includes(name)
			) {
				return
			}

			// Skip property names in object literals
			const parent = identifier.getParent()
			if (parent && Node.isPropertyAssignment(parent) && parent.getNameNode() === identifier) {
				// This is a property name in an object literal, not a reference to a dependency
				console.log(`[DEBUG] Skipping object property name: ${name}`)
				return
			}

			// Skip property access expressions where this is the property name
			if (parent && Node.isPropertyAccessExpression(parent) && parent.getNameNode() === identifier) {
				// This is a property access like obj.prop, and we're looking at "prop"
				console.log(`[DEBUG] Skipping property access name: ${name}`)
				return
			}

			// Skip parameter property names
			if (parent && Node.isParameterDeclaration(parent) && parent.getNameNode() === identifier) {
				console.log(`[DEBUG] Skipping parameter property name: ${name}`)
				return
			}

			// More accurate identification of references that need to be imported
			// For example, a function call like "processData(data)" indicates a dependency on processData
			let shouldInclude = true

			// Check if this is a function call
			if (parent && Node.isCallExpression(parent) && parent.getExpression() === identifier) {
				shouldInclude = true
			}

			// Check if this is a named import specifier (which wouldn't be a dependency)
			if (parent && Node.isImportSpecifier(parent)) {
				shouldInclude = false
				console.log(`[DEBUG] Skipping import specifier: ${name}`)
			}

			// Skip if this is the name of a declaration
			if (
				parent &&
				(Node.isFunctionDeclaration(parent) ||
					Node.isClassDeclaration(parent) ||
					Node.isInterfaceDeclaration(parent)) &&
				parent.getName() === name
			) {
				shouldInclude = false
				console.log(`[DEBUG] Skipping declaration name: ${name}`)
			}

			if (!shouldInclude) {
				return
			}

			// Try to determine if the dependency is local to the file
			let isLocal = false
			let definitionSource = "unknown"

			try {
				const definitions = identifier.getDefinitionNodes()
				if (definitions.length > 0) {
					const defSourceFile = definitions[0].getSourceFile()
					const defPath = defSourceFile.getFilePath()
					isLocal = defPath === file.getFilePath()
					definitionSource = isLocal ? "same file" : defPath
				} else {
					// Check if it's defined in the current file
					const sameFileSymbols =
						file.getExportedDeclarations().get(name) ||
						file.getFunction(name) ||
						file.getClass(name) ||
						file.getInterface(name) ||
						file.getTypeAlias(name) ||
						file.getEnum(name) ||
						file.getVariableDeclaration(name)

					if (sameFileSymbols) {
						isLocal = true
						definitionSource = "current file exports"
					}
				}
			} catch (e) {
				// If we can't determine, assume it's external
				isLocal = false
				definitionSource = "error: " + (e as Error).message
			}

			dependencies.push({ name, isLocal })
		})

		// Look for function calls specifically as they're common dependencies
		symbolNode.getDescendantsOfKind(SyntaxKind.CallExpression).forEach((callExpr) => {
			const expression = callExpr.getExpression()
			if (Node.isIdentifier(expression)) {
				const name = expression.getText()
				if (!declarationsInScope.has(name)) {
					console.log(`[DEBUG] Found function call dependency: ${name}`)
					// Try to determine if the called function is local
					let isLocal = false
					try {
						const definitions = expression.getDefinitionNodes()
						if (definitions.length > 0) {
							isLocal = definitions[0].getSourceFile().getFilePath() === file.getFilePath()
						} else {
							// Check if it exists in this file
							const func = file.getFunction(name)
							isLocal = func !== undefined
						}
					} catch (e) {
						isLocal = false
					}

					// Mark function calls as high priority dependencies
					dependencies.push({ name, isLocal, isFunction: true })
				}
			}
		})

		// Check for TypeNode references in type annotations
		symbolNode.getDescendantsOfKind(SyntaxKind.TypeReference).forEach((typeRef) => {
			if (Node.isIdentifier(typeRef.getTypeName())) {
				const name = typeRef.getTypeName().getText()
				if (!declarationsInScope.has(name)) {
					console.log(`[DEBUG] Found type reference dependency: ${name}`)

					// Check if it's a local type
					let isLocal = false
					try {
						isLocal =
							file.getInterface(name) !== undefined ||
							file.getTypeAlias(name) !== undefined ||
							file.getClass(name) !== undefined ||
							file.getEnum(name) !== undefined
					} catch (e) {
						isLocal = false
					}

					dependencies.push({ name, isLocal, isType: true })
				}
			}
		})

		// Remove duplicates by name
		const uniqueDependencies = Array.from(new Map(dependencies.map((item) => [item.name, item])).values())

		return uniqueDependencies
	}

	/**
	 * Checks if a file already imports a symbol
	 */
	/**
	 * Determines the type of import declaration
	 */
	private getImportType(importDecl: ImportDeclaration): string {
		// Check for import type { X } from 'module'
		const isTypeOnly = importDecl.isTypeOnly()
		if (isTypeOnly) {
			return this.ImportType.TYPE
		}

		// Check for import * as X from 'module'
		const namespaceImport = importDecl.getNamespaceImport()
		if (namespaceImport) {
			return this.ImportType.NAMESPACE
		}

		// Check for import X from 'module'
		const defaultImport = importDecl.getDefaultImport()
		if (defaultImport && importDecl.getNamedImports().length === 0) {
			return this.ImportType.DEFAULT
		}

		// Regular import { X } from 'module'
		return this.ImportType.REGULAR
	}

	/**
	 * Checks if a file already imports a symbol
	 */
	private hasImport(file: SourceFile, symbolName: string): boolean {
		const imports = file.getImportDeclarations()

		return (
			// Check named imports (both regular and type imports)
			imports.some((imp) => {
				const namedImports = imp.getNamedImports()
				return namedImports.some((ni) => ni.getName() === symbolName)
			}) ||
			// Check default imports
			imports.some((imp) => {
				const defaultImport = imp.getDefaultImport()
				return defaultImport?.getText() === symbolName
			}) ||
			// Check namespace imports that might bring in the symbol
			imports.some((imp) => {
				const namespaceImport = imp.getNamespaceImport()
				return namespaceImport !== undefined
			})
		)
	}

	/**
	 * Adds an import to a file
	 */
	/**
	 * Adds a regular import to a file
	 */
	private addImport(file: SourceFile, symbolName: string, modulePath: string): void {
		// Check if we already have an import from this module
		const existingImport = file.getImportDeclaration(
			(imp) =>
				imp.getModuleSpecifierValue() === modulePath &&
				!imp.isTypeOnly() &&
				imp.getNamespaceImport() === undefined,
		)

		if (existingImport) {
			// Add to existing import only if not already present
			const namedImports = existingImport.getNamedImports()
			const alreadyImported = namedImports.some((imp) => imp.getName() === symbolName)

			if (!alreadyImported) {
				existingImport.addNamedImport(symbolName)
			}
		} else {
			// Create new import
			file.addImportDeclaration({
				moduleSpecifier: modulePath,
				namedImports: [symbolName],
			})
		}
	}

	/**
	 * Adds a type import to a file
	 */
	private addTypeImport(file: SourceFile, symbolName: string, modulePath: string): void {
		console.log(`[DEBUG] addTypeImport: Adding ${symbolName} from ${modulePath} to ${file.getFilePath()}`)

		// Check if we already have a type import from this module
		const existingTypeImport = file.getImportDeclaration(
			(imp) => imp.getModuleSpecifierValue() === modulePath && imp.isTypeOnly(),
		)

		if (existingTypeImport) {
			// Add to existing type import
			console.log(`[DEBUG] addTypeImport: Adding to existing type import`)
			existingTypeImport.addNamedImport(symbolName)
		} else {
			// Create new type import
			console.log(`[DEBUG] addTypeImport: Creating new type import declaration`)
			file.addImportDeclaration({
				moduleSpecifier: modulePath,
				namedImports: [symbolName],
				isTypeOnly: true,
			})
		}

		console.log(`[DEBUG] addTypeImport: Import added successfully`)
	}

	/**
	 * Adds a default import to a file
	 */
	private addDefaultImport(file: SourceFile, symbolName: string, modulePath: string): void {
		// Check if we already have an import from this module
		const existingImport = file.getImportDeclaration((imp) => imp.getModuleSpecifierValue() === modulePath)

		if (existingImport) {
			// For default imports, we need to handle carefully
			if (!existingImport.getDefaultImport()) {
				// If there's no default import yet, we need to recreate the import
				// Get any named imports from the existing import
				const namedImports = existingImport.getNamedImports().map((ni) => ni.getName())

				// Remove the existing import
				existingImport.remove()

				// Create a new import with both default and named imports
				file.addImportDeclaration({
					moduleSpecifier: modulePath,
					defaultImport: symbolName,
					namedImports: namedImports.length > 0 ? namedImports : undefined,
				})
			} else {
				// If there's already a default import, we need to create a new import
				// This is an edge case that might require special handling
				console.log(
					`[WARNING] Attempted to add default import ${symbolName} but module already has a default import`,
				)
			}
		} else {
			// Create new default import
			file.addImportDeclaration({
				moduleSpecifier: modulePath,
				defaultImport: symbolName,
			})
		}
	}

	/**
	 * Adds a namespace import to a file
	 */
	private addNamespaceImport(file: SourceFile, namespaceName: string, modulePath: string): void {
		// Create new namespace import
		file.addImportDeclaration({
			moduleSpecifier: modulePath,
			namespaceImport: namespaceName,
		})
	}

	/**
	 * Adds a re-export to a file
	 */
	/**
	 * Adds a re-export to a file
	 *
	 * @param file - The file to add the re-export to
	 * @param symbolName - The name of the symbol to re-export
	 * @param modulePath - The module path to re-export from
	 * @param alias - Optional alias for the re-export (export { symbolName as alias })
	 */
	private addReExport(file: SourceFile, symbolName: string, modulePath: string, alias?: string): void {
		if (alias) {
			file.addExportDeclaration({
				moduleSpecifier: modulePath,
				namedExports: [
					{
						name: symbolName,
						alias: alias,
					},
				],
			})
		} else {
			file.addExportDeclaration({
				moduleSpecifier: modulePath,
				namedExports: [symbolName],
			})
		}
	}

	/**
	 * Copies an import from one file to another
	 * @returns true if the import was found and copied, false otherwise
	 */
	private copyImport(toFile: SourceFile, fromFile: SourceFile, symbolName: string): boolean {
		const imports = fromFile.getImportDeclarations()
		let found = false

		for (const imp of imports) {
			const namedImports = imp.getNamedImports()
			const hasSymbol = namedImports.some((ni) => ni.getName() === symbolName)

			if (hasSymbol) {
				// Copy this import
				toFile.addImportDeclaration({
					moduleSpecifier: imp.getModuleSpecifierValue(),
					namedImports: [symbolName],
				})
				console.log(`[DEBUG] Copied import for ${symbolName} from ${imp.getModuleSpecifierValue()}`)
				found = true
				break
			}
		}

		return found
	}

	/**
	 * Attempts to find an import for a symbol by searching across the project
	 * @returns true if the symbol was found and imported, false otherwise
	 */
	private findAndAddImportForSymbol(file: SourceFile, symbolName: string): boolean {
		console.log(`[DEBUG] Searching project for symbol: ${symbolName}`)
		let found = false

		// Get all source files in the project
		const allFiles = this.project.getSourceFiles()

		// Keep track of source file with the symbol to avoid checking it multiple times
		let foundInFile: SourceFile | null = null

		// Look for the symbol in exports of all files
		for (const sourceFile of allFiles) {
			// Skip the target file itself
			if (sourceFile.getFilePath() === file.getFilePath()) {
				continue
			}

			const exportedDeclarations = sourceFile.getExportedDeclarations()
			if (exportedDeclarations.has(symbolName)) {
				// Found an export of this symbol, calculate relative path
				const relativePath = this.calculateRelativePath(file.getFilePath(), sourceFile.getFilePath())
				this.addImport(file, symbolName, relativePath)
				console.log(
					`[DEBUG] Found symbol ${symbolName} exported by ${sourceFile.getFilePath()}, added import from ${relativePath}`,
				)
				found = true
				foundInFile = sourceFile
				break
			}
		}

		// If we couldn't find a named export, check for default exports
		if (!found) {
			for (const sourceFile of allFiles) {
				// Skip the target file itself
				if (sourceFile.getFilePath() === file.getFilePath()) {
					continue
				}

				// Check for default export that matches the symbol name
				const defaultExport = sourceFile.getDefaultExportSymbol()
				if (defaultExport && defaultExport.getName() === symbolName) {
					const relativePath = this.calculateRelativePath(file.getFilePath(), sourceFile.getFilePath())
					this.addDefaultImport(file, symbolName, relativePath)
					console.log(
						`[DEBUG] Found default export ${symbolName} in ${sourceFile.getFilePath()}, added import from ${relativePath}`,
					)
					found = true
					foundInFile = sourceFile
					break
				}
			}
		}

		// If we still couldn't find it, check for namespace exports
		if (!found) {
			for (const sourceFile of allFiles) {
				// Skip the target file itself
				if (sourceFile.getFilePath() === file.getFilePath()) {
					continue
				}

				// Look for namespace exports that match the symbol name
				const namespaces = sourceFile.getDescendantsOfKind(SyntaxKind.ModuleDeclaration)
				const matchingNamespace = namespaces.find((ns: ModuleDeclaration) => ns.getName() === symbolName)

				if (matchingNamespace) {
					const relativePath = this.calculateRelativePath(file.getFilePath(), sourceFile.getFilePath())
					this.addNamespaceImport(file, symbolName, relativePath)
					console.log(
						`[DEBUG] Found namespace ${symbolName} in ${sourceFile.getFilePath()}, added import from ${relativePath}`,
					)
					found = true
					foundInFile = sourceFile
					break
				}
			}
		}

		if (!found) {
			console.log(`[WARNING] Could not find import for symbol: ${symbolName}. This may cause compilation errors.`)
		}

		return found
	}

	/**
	 * Gets list of files that were updated
	 */
	public getUpdatedFiles(): string[] {
		return Array.from(this.updatedFiles)
	}

	/**
	 * Removes unused imports from a file
	 */
	removeUnusedImports(file: SourceFile): void {
		file.fixUnusedIdentifiers()
	}

	/**
	 * Determines if we should add a re-export for an inline symbol that was moved
	 * This is needed when a symbol was defined inline in a barrel file and moved away
	 */
	private shouldAddReExportForInlineSymbol(
		sourceFile: SourceFile,
		symbolName: string,
		oldFilePath: string,
		newFilePath: string,
	): boolean {
		// Check if this is a barrel file (index.ts or has multiple exports)
		const isBarrelFile = this.isBarrelFile(sourceFile)

		// Only add re-export for true barrel files when moving inline symbols
		if (isBarrelFile) {
			console.log(
				`[DEBUG] shouldAddReExportForInlineSymbol: ${symbolName} was moved from barrel file, adding re-export`,
			)
			return true
		}

		// For non-barrel files, we should update import statements instead of adding re-exports
		// This ensures proper import path updates rather than maintaining old API with re-exports
		console.log(
			`[DEBUG] shouldAddReExportForInlineSymbol: ${symbolName} is from non-barrel file, updating imports instead of re-export`,
		)
		return false
	}

	/**
	 * Checks if a file still references a symbol (used to determine if an import is needed)
	 */
	private fileReferencesSymbol(sourceFile: SourceFile, symbolName: string): boolean {
		const fileText = sourceFile.getFullText()

		// Simple text-based check for symbol usage
		// This covers most cases like type annotations, variable declarations, etc.
		const symbolRegex = new RegExp(`\\b${symbolName}\\b`, "g")
		const matches = fileText.match(symbolRegex)

		if (matches && matches.length > 0) {
			console.log(
				`[DEBUG] fileReferencesSymbol: Found ${matches.length} references to ${symbolName} in ${sourceFile.getFilePath()}`,
			)
			return true
		}

		console.log(`[DEBUG] fileReferencesSymbol: No references to ${symbolName} found in ${sourceFile.getFilePath()}`)
		return false
	}

	/**
	 * Determines if a file is a barrel file (used for re-exporting symbols)
	 * Only true barrel files should get re-exports to maintain API compatibility
	 */
	private isBarrelFile(sourceFile: SourceFile): boolean {
		const fileName = path.basename(sourceFile.getFilePath())

		// Only index files are considered barrel files for re-export purposes
		if (fileName === "index.ts" || fileName === "index.js") {
			return true
		}

		// Check if the file is primarily composed of re-exports (not original definitions)
		const exportDeclarations = sourceFile.getExportDeclarations()
		const exportedDeclarations = sourceFile.getExportedDeclarations()

		// If it has many re-export declarations and few original exports, it's likely a barrel
		if (exportDeclarations.length >= 3 && exportedDeclarations.size <= exportDeclarations.length + 1) {
			return true
		}

		return false
	}

	/**
	 * Ensures relevant TypeScript files are loaded for import analysis
	 * Only loads files in the test directory scope to avoid memory issues
	 */
	private ensureAllProjectFilesLoaded(referenceFilePath: string): void {
		try {
			// Get the directory of the reference file
			const referenceDir = path.dirname(referenceFilePath)
			console.log(`[DEBUG] Reference file directory: ${referenceDir}`)

			// For test files, only load files in the test directory tree
			if (
				referenceFilePath.includes("test-refactor-output") ||
				referenceFilePath.includes("/tmp/") ||
				referenceFilePath.includes("import-split-test") ||
				referenceFilePath.includes("temp")
			) {
				// Find the test directory root - either test-refactor-output or temp directory
				const testDirMatch =
					referenceFilePath.match(/(.*test-refactor-output[\/\\][^\/\\]+)/) ||
					referenceFilePath.match(/(.*(\/tmp\/|\\temp\\)[^\/\\]+)/) ||
					referenceFilePath.match(/(.*import-split-test[^\/\\]*)/)

				if (testDirMatch) {
					const testRoot = testDirMatch[1]
					console.log(`[DEBUG] Loading TypeScript files from test directory: ${testRoot}`)
					this.loadTypeScriptFilesRecursively(testRoot)
					return
				}
			}

			// For non-test files, load only the immediate directory and one level up
			console.log(`[DEBUG] Loading TypeScript files from reference directory: ${referenceDir}`)
			this.loadTypeScriptFilesInDirectory(referenceDir)

			// Also load parent directory (one level up)
			const parentDir = path.dirname(referenceDir)
			if (parentDir !== referenceDir) {
				console.log(`[DEBUG] Loading TypeScript files from parent directory: ${parentDir}`)
				this.loadTypeScriptFilesInDirectory(parentDir)
			}
		} catch (error) {
			console.log(`[DEBUG] Error loading project files: ${(error as Error).message}`)
			// Continue without loading additional files - the search will work with what's available
		}
	}

	/**
	 * Loads TypeScript files in a specific directory (non-recursive for safety)
	 */
	private loadTypeScriptFilesInDirectory(dirPath: string): void {
		try {
			if (!fs.existsSync(dirPath)) {
				return
			}

			const entries = fs.readdirSync(dirPath, { withFileTypes: true })

			for (const entry of entries) {
				if (entry.isFile() && entry.name.match(/\.(ts|tsx)$/)) {
					const fullPath = path.join(dirPath, entry.name)
					// Check if the file is already loaded
					if (!this.project.getSourceFile(fullPath)) {
						try {
							this.project.addSourceFileAtPath(fullPath)
							console.log(`[DEBUG] Loaded TypeScript file: ${fullPath}`)
						} catch (error) {
							// Ignore errors loading individual files
							console.log(`[DEBUG] Failed to load file ${fullPath}: ${(error as Error).message}`)
						}
					}
				}
			}
		} catch (error) {
			console.log(`[DEBUG] Error reading directory ${dirPath}: ${(error as Error).message}`)
		}
	}

	/**
	 * Recursively loads TypeScript files from a directory
	 */
	private loadTypeScriptFilesRecursively(dirPath: string): void {
		try {
			if (!fs.existsSync(dirPath)) {
				return
			}

			const entries = fs.readdirSync(dirPath, { withFileTypes: true })

			for (const entry of entries) {
				const fullPath = path.join(dirPath, entry.name)

				if (entry.isDirectory()) {
					// Skip common directories that don't contain source code
					if (["node_modules", ".git", "dist", "build", "coverage", ".next"].includes(entry.name)) {
						continue
					}

					// Recursively load files from subdirectories
					this.loadTypeScriptFilesRecursively(fullPath)
				} else if (entry.isFile()) {
					// Load TypeScript files
					if (entry.name.match(/\.(ts|tsx)$/)) {
						// Check if the file is already loaded
						if (!this.project.getSourceFile(fullPath)) {
							try {
								this.project.addSourceFileAtPath(fullPath)
								console.log(`[DEBUG] Loaded TypeScript file: ${fullPath}`)
							} catch (error) {
								// Ignore errors loading individual files
								console.log(`[DEBUG] Failed to load file ${fullPath}: ${(error as Error).message}`)
							}
						}
					}
				}
			}
		} catch (error) {
			console.log(`[DEBUG] Error reading directory ${dirPath}: ${(error as Error).message}`)
		}
	}
}
