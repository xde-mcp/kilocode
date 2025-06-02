import {
	Project,
	SourceFile,
	ImportDeclaration,
	ExportDeclaration,
	ImportSpecifier,
	ExportSpecifier,
	Node,
	SyntaxKind,
} from "ts-morph"
import * as path from "path"

export interface ImportUpdate {
	file: SourceFile
	oldPath: string
	newPath: string
	symbolName: string
}

/**
 * Utility for managing imports and exports when moving symbols between files
 */
export class ImportManager {
	private project: Project
	private updatedFiles: Set<string> = new Set()

	constructor(project: Project) {
		this.project = project
	}

	/**
	 * Updates all imports after a symbol is moved to a new file
	 */
	async updateImportsAfterMove(symbolName: string, oldFilePath: string, newFilePath: string): Promise<void> {
		this.updatedFiles.clear()

		// Find files that import from the old file - these are the most important to update
		const importingFiles = this.findFilesImporting(oldFilePath)
		console.log(`[DEBUG] Found ${importingFiles.length} files importing from ${oldFilePath}`)

		// Focus only on files that directly import from the source file
		// This is much more efficient than searching all files in the project
		const referencingFiles = new Set<SourceFile>()

		// Add files directly importing from the old file
		importingFiles.forEach((file) => referencingFiles.add(file))

		// Only search for additional references in the same directories as the source and target files
		const sourceDir = path.dirname(oldFilePath)
		const targetDir = path.dirname(newFilePath)
		const nearbyFiles = this.project.getSourceFiles().filter((file) => {
			const filePath = file.getFilePath()
			const fileDir = path.dirname(filePath)

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
		}

		// Update re-exports as well
		const reExportingFiles = this.findFilesReExporting(oldFilePath)

		for (const file of reExportingFiles) {
			await this.updateReExportPath(file, symbolName, oldFilePath, newFilePath)
			this.updatedFiles.add(file.getFilePath())
		}

		// Add necessary imports to the new file
		const newFile = this.project.getSourceFile(newFilePath)
		if (newFile) {
			await this.addMissingImports(newFile, symbolName, oldFilePath)
		}
	}

	/**
	 * Finds all files that import from the specified file
	 */
	private findFilesImporting(filePath: string): SourceFile[] {
		const sourceFile = this.project.getSourceFile(filePath)
		if (!sourceFile) return []

		// Get all source files that reference this file
		const referencingFiles = sourceFile.getReferencingSourceFiles()

		// Filter to only those that actually import from this file
		return referencingFiles.filter((file) => {
			const imports = file.getImportDeclarations()
			return imports.some((imp) => this.isImportFromFile(imp, filePath))
		})
	}

	/**
	 * Finds all files that re-export from the specified file
	 */
	private findFilesReExporting(filePath: string): SourceFile[] {
		const allFiles = this.project.getSourceFiles()

		return allFiles.filter((file) => {
			const exports = file.getExportDeclarations()
			return exports.some((exp) => this.isExportFromFile(exp, filePath))
		})
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
			const namedImports = importDecl.getNamedImports()
			const hasSymbol = namedImports.some((imp) => imp.getName() === symbolName)

			if (!hasSymbol) {
				continue
			}

			// Calculate new relative path
			const newRelativePath = this.calculateRelativePath(file.getFilePath(), newPath)

			// Check if we need to keep the old import for other symbols
			const otherImports = namedImports.filter((imp) => imp.getName() !== symbolName)

			if (otherImports.length > 0) {
				// Remove only the moved symbol from the import
				const symbolImport = namedImports.find((imp) => imp.getName() === symbolName)
				symbolImport?.remove()

				// Add a new import for the moved symbol
				this.addImport(file, symbolName, newRelativePath)
			} else {
				// Update the module specifier if this is the only import
				importDecl.setModuleSpecifier(newRelativePath)
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
	private async addMissingImports(newFile: SourceFile, movedSymbolName: string, oldFilePath: string): Promise<void> {
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

		// Process each import in the old file to see if it contains dependencies we need
		for (const importDecl of oldFileImports) {
			const moduleSpecifier = importDecl.getModuleSpecifierValue()
			const namedImports = importDecl.getNamedImports().map((ni) => ni.getName())

			// Find dependencies that are imported by this import declaration
			const neededImports = filteredDependencies
				.filter((dep) => !dep.isLocal && namedImports.includes(dep.name))
				.map((dep) => dep.name)

			if (neededImports.length > 0) {
				console.log(
					`[DEBUG] Found original import for dependencies: ${neededImports.join(", ")} from ${moduleSpecifier}`,
				)

				// Calculate the correct relative path for the new file
				let adjustedModuleSpecifier = moduleSpecifier

				// Only recalculate relative paths
				if (adjustedModuleSpecifier.startsWith(".")) {
					const oldFileDirPath = path.dirname(oldFile.getFilePath())
					const newFileDirPath = path.dirname(newFile.getFilePath())

					// First resolve the absolute path from the old file's perspective
					const absoluteImportPath = path.resolve(oldFileDirPath, moduleSpecifier)
					console.log(`[DEBUG] Resolved absolute import path: ${absoluteImportPath}`)

					// Then calculate the relative path from the new file to that absolute path
					adjustedModuleSpecifier = path.relative(newFileDirPath, absoluteImportPath)

					// Ensure it starts with ./ or ../
					if (!adjustedModuleSpecifier.startsWith(".")) {
						adjustedModuleSpecifier = "./" + adjustedModuleSpecifier
					}

					// Normalize path separators
					adjustedModuleSpecifier = adjustedModuleSpecifier.replace(/\\/g, "/")

					console.log(`[DEBUG] Adjusted import path: ${adjustedModuleSpecifier}`)
				}

				// Add to our import map
				if (!externalImports.has(adjustedModuleSpecifier)) {
					externalImports.set(adjustedModuleSpecifier, [])
				}

				for (const symbolName of neededImports) {
					if (!this.hasImport(newFile, symbolName)) {
						externalImports.get(adjustedModuleSpecifier)?.push(symbolName)
						handledDependencies.add(symbolName)
					}
				}
			}
		}

		// Add all the external imports we collected
		for (const [moduleSpecifier, symbols] of externalImports.entries()) {
			if (symbols.length > 0) {
				// Add them as a single import statement
				for (const symbolName of symbols) {
					this.addImport(newFile, symbolName, moduleSpecifier)
					console.log(`[DEBUG] Added import for external dependency: ${symbolName} from ${moduleSpecifier}`)
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
		const resolvedPath = this.resolveModulePath(importDecl.getSourceFile().getFilePath(), moduleSpecifier)

		return this.pathsMatch(resolvedPath, filePath)
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
	 */
	private calculateRelativePath(fromPath: string, toPath: string): string {
		// Normalize paths to ensure consistent handling across platforms
		const normalizedFromPath = fromPath.replace(/\\/g, "/")
		const normalizedToPath = toPath.replace(/\\/g, "/")

		const fromDir = path.dirname(normalizedFromPath)
		let relativePath = path.relative(fromDir, normalizedToPath)

		// Normalize the resulting path
		relativePath = relativePath.replace(/\\/g, "/")

		// Remove file extension
		relativePath = relativePath.replace(/\.(ts|tsx|js|jsx)$/, "")

		// Ensure it starts with ./ or ../
		if (!relativePath.startsWith(".")) {
			relativePath = "./" + relativePath
		}

		return relativePath
	}

	/**
	 * Resolves a module path to an absolute path
	 */
	private resolveModulePath(fromPath: string, moduleSpecifier: string): string {
		if (!moduleSpecifier.startsWith(".")) {
			// External module
			return moduleSpecifier
		}

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
				return normalizedResolved
			}
			const withExt = normalizedResolved + ext

			// Try to find the file in the project
			if (this.project.getSourceFile(withExt)) {
				return withExt
			}

			// Also check with original path format to support case-sensitive file systems
			const originalWithExt = resolved + ext
			if (this.project.getSourceFile(originalWithExt)) {
				return originalWithExt
			}
		}

		return normalizedResolved
	}

	/**
	 * Checks if two paths refer to the same file
	 */
	private pathsMatch(path1: string, path2: string): boolean {
		// Normalize paths and remove extensions
		const normalize = (p: string) => {
			// Convert to absolute path if not already
			let normalizedPath = p.replace(/\\/g, "/")
			// Remove extensions
			normalizedPath = normalizedPath.replace(/\.(ts|tsx|js|jsx)$/, "")
			// Normalize path separators and case for case-insensitive matching
			return normalizedPath.toLowerCase()
		}

		return normalize(path1) === normalize(path2)
	}

	/**
	 * Finds dependencies of a symbol
	 * This is a simplified implementation for now
	 */
	private findSymbolDependencies(
		file: SourceFile,
		symbolName: string,
	): Array<{ name: string; isLocal: boolean; isType?: boolean; isFunction?: boolean }> {
		const dependencies: Array<{ name: string; isLocal: boolean; isType?: boolean; isFunction?: boolean }> = []
		console.log(`[DEBUG] Finding dependencies for symbol: ${symbolName}`)

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
			console.log(`[DEBUG] Symbol node not found for: ${symbolName}`)
			return dependencies
		}

		console.log(`[DEBUG] Found symbol node of kind: ${symbolNode.getKindName()}`)

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

			console.log(`[DEBUG] Found dependency: ${name} (isLocal: ${isLocal}, source: ${definitionSource})`)
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
		console.log(`[DEBUG] Found ${uniqueDependencies.length} unique dependencies for ${symbolName}`)

		return uniqueDependencies
	}

	/**
	 * Checks if a file already imports a symbol
	 */
	private hasImport(file: SourceFile, symbolName: string): boolean {
		const imports = file.getImportDeclarations()

		return (
			imports.some((imp) => {
				const namedImports = imp.getNamedImports()
				return namedImports.some((ni) => ni.getName() === symbolName)
			}) ||
			imports.some((imp) => {
				// Also check namespace imports that might bring in the symbol
				const namespaceImport = imp.getNamespaceImport()
				return namespaceImport !== undefined
			})
		)
	}

	/**
	 * Adds an import to a file
	 */
	private addImport(file: SourceFile, symbolName: string, modulePath: string): void {
		// Check if we already have an import from this module
		const existingImport = file.getImportDeclaration((imp) => imp.getModuleSpecifierValue() === modulePath)

		if (existingImport) {
			// Add to existing import
			existingImport.addNamedImport(symbolName)
		} else {
			// Create new import
			file.addImportDeclaration({
				moduleSpecifier: modulePath,
				namedImports: [symbolName],
			})
		}
	}

	/**
	 * Adds a re-export to a file
	 */
	private addReExport(file: SourceFile, symbolName: string, modulePath: string): void {
		file.addExportDeclaration({
			moduleSpecifier: modulePath,
			namedExports: [symbolName],
		})
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
				break
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
	getUpdatedFiles(): string[] {
		return Array.from(this.updatedFiles)
	}

	/**
	 * Removes unused imports from a file
	 */
	removeUnusedImports(file: SourceFile): void {
		file.fixUnusedIdentifiers()
	}
}
