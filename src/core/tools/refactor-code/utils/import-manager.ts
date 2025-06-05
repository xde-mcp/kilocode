import { Project, SourceFile, ImportDeclaration } from "ts-morph"
import * as path from "path"

/**
 * Simple, direct import manager that handles import updates after symbol moves
 *
 * This replaces the complex VirtualImportManager/ImportManager system with
 * a straightforward approach that directly manipulates ts-morph imports.
 */
export class ImportManager {
	private project: Project

	constructor(project: Project) {
		this.project = project
	}

	/**
	 * Update imports after moving a symbol from one file to another
	 *
	 * This finds all files that import the symbol from the old location
	 * and updates them to import from the new location.
	 */
	updateImportsAfterMove(symbolName: string, oldFilePath: string, newFilePath: string): string[] {
		const updatedFiles: string[] = []

		// Find all files that import from the old file
		const allFiles = this.project.getSourceFiles()

		for (const file of allFiles) {
			const filePath = file.getFilePath()

			// Skip the target file, but process the source file for re-exports
			if (filePath === newFilePath) {
				continue
			}

			// Special handling for the source file - add re-export if needed
			const isSourceFile = filePath === oldFilePath

			let fileWasUpdated = false

			// Check each import declaration in this file
			const importDeclarations = file.getImportDeclarations()

			for (const importDecl of importDeclarations) {
				const moduleSpecifier = importDecl.getModuleSpecifierValue()

				// Check if this import is from the old file
				if (this.isImportFromFile(moduleSpecifier, oldFilePath, filePath)) {
					// Check if this import includes our moved symbol in various forms
					let symbolFound = false
					let isTypeImport = false
					let isDefaultImport = false
					let isNamespaceImport = false
					let originalNamespaceAlias: string | undefined

					// Check named imports (regular and type)
					const namedImports = importDecl.getNamedImports()
					const symbolImport = namedImports.find((imp) => imp.getName() === symbolName)

					// Check if it's a type-only import
					if (symbolImport) {
						isTypeImport = symbolImport.isTypeOnly() || importDecl.isTypeOnly()
						symbolFound = true
					}

					// Check default import
					const defaultImport = importDecl.getDefaultImport()
					if (defaultImport && defaultImport.getText() === symbolName) {
						isDefaultImport = true
						symbolFound = true
					}

					// Check namespace import - if this import is from the old file,
					// then the moved symbol might be accessed through the namespace
					const namespaceImport = importDecl.getNamespaceImport()
					if (namespaceImport) {
						// Check if the file content uses the symbol through the namespace
						const fileContent = file.getFullText()
						const namespaceAlias = namespaceImport.getText()
						const namespaceUsage = `${namespaceAlias}.${symbolName}`
						console.log(
							`[DEBUG] Checking namespace import: ${namespaceAlias}, looking for: ${namespaceUsage}`,
						)
						console.log(`[DEBUG] File content includes usage: ${fileContent.includes(namespaceUsage)}`)
						// Look for patterns like "Helpers.formatName" where Helpers is the namespace
						if (fileContent.includes(namespaceUsage)) {
							isNamespaceImport = true
							symbolFound = true
							console.log(`[DEBUG] Found namespace usage: ${namespaceUsage}`)
						}
					}

					if (symbolFound) {
						console.log(
							`[DEBUG] Symbol found, removing old import. isNamespaceImport: ${isNamespaceImport}`,
						)

						// IMPORTANT: Capture namespace alias BEFORE removing the import declaration
						if (isNamespaceImport && namespaceImport) {
							originalNamespaceAlias = namespaceImport.getText()
							console.log(`[DEBUG] Captured namespace alias before removal: ${originalNamespaceAlias}`)
						}

						// Remove the symbol from this import
						if (symbolImport) {
							symbolImport.remove()
						} else if (isDefaultImport || isNamespaceImport) {
							// For default and namespace imports, we need to remove the entire import declaration
							// since they can't be partially removed
							console.log(`[DEBUG] Removing entire import declaration for namespace/default import`)
							importDecl.remove()
						}

						// If this was a named import and it was the last import, remove the entire import declaration
						if (
							symbolImport &&
							importDecl.getNamedImports().length === 0 &&
							!importDecl.getDefaultImport() &&
							!importDecl.getNamespaceImport()
						) {
							importDecl.remove()
						}

						console.log(`[DEBUG] About to add new import for symbol: ${symbolName}`)
						console.log(
							`[DEBUG] isDefaultImport: ${isDefaultImport}, isNamespaceImport: ${isNamespaceImport}, isTypeImport: ${isTypeImport}`,
						)

						// Add new import for the symbol from the new location
						// Convert relative newFilePath to absolute if needed
						let absoluteNewFilePath = newFilePath
						if (!path.isAbsolute(newFilePath)) {
							// Find the project root by looking at the old file path
							const projectRoot = this.findProjectRoot(oldFilePath)
							absoluteNewFilePath = path.resolve(projectRoot, newFilePath)
						}

						const newModuleSpecifier = this.calculateRelativeImportPath(filePath, absoluteNewFilePath)
						console.log(`[DEBUG] Calculated module specifier: ${newModuleSpecifier}`)

						try {
							// Create the appropriate type of import
							let newImport
							if (isDefaultImport) {
								console.log(`[DEBUG] Creating default import`)
								newImport = file.addImportDeclaration({
									moduleSpecifier: newModuleSpecifier,
									defaultImport: symbolName,
								})
							} else if (isNamespaceImport) {
								// For namespace imports, use the captured alias or fallback to symbolName
								const aliasToUse = originalNamespaceAlias || symbolName
								console.log(`[DEBUG] Creating namespace import with alias: ${aliasToUse}`)
								newImport = file.addImportDeclaration({
									moduleSpecifier: newModuleSpecifier,
									namespaceImport: aliasToUse,
								})
							} else {
								// For type imports, create type-only import declaration
								if (isTypeImport) {
									console.log(`[DEBUG] Creating type import`)
									newImport = file.addImportDeclaration({
										moduleSpecifier: newModuleSpecifier,
										namedImports: [symbolName],
										isTypeOnly: true,
									})
								} else {
									console.log(`[DEBUG] Creating regular named import`)
									// For regular imports, create normal import declaration
									newImport = file.addImportDeclaration({
										moduleSpecifier: newModuleSpecifier,
										namedImports: [symbolName],
									})
								}
							}

							console.log(`[DEBUG] Import created successfully`)

							// Set quote style to single quotes to match test expectations
							newImport.setModuleSpecifier(newModuleSpecifier)
							newImport.getModuleSpecifier()?.replaceWithText(`'${newModuleSpecifier}'`)

							fileWasUpdated = true
							console.log(`[DEBUG] Set fileWasUpdated = true for ${filePath}`)
						} catch (error) {
							console.log(`[DEBUG] Error creating import: ${error}`)
							throw error
						}
					}
				}
			}

			// Handle re-export statements (export { symbol } from "module")
			const exportDeclarations = file.getExportDeclarations()
			console.log(`[DEBUG] Checking ${exportDeclarations.length} export declarations in ${filePath}`)

			for (const exportDecl of exportDeclarations) {
				const moduleSpecifier = exportDecl.getModuleSpecifierValue()
				console.log(`[DEBUG] Export declaration module specifier: ${moduleSpecifier}`)

				// Check if this re-export is from the old file
				if (moduleSpecifier && this.isImportFromFile(moduleSpecifier, oldFilePath, filePath)) {
					console.log(`[DEBUG] Export is from old file, checking for symbol: ${symbolName}`)
					const namedExports = exportDecl.getNamedExports()
					console.log(`[DEBUG] Named exports: ${namedExports.map((exp) => exp.getName()).join(", ")}`)
					const symbolExport = namedExports.find((exp) => exp.getName() === symbolName)

					if (symbolExport) {
						console.log(`[DEBUG] Found re-export of symbol: ${symbolName}`)

						// Remove the old re-export
						symbolExport.remove()

						// If this was the last export, remove the entire declaration
						if (exportDecl.getNamedExports().length === 0) {
							console.log(`[DEBUG] Removing entire export declaration`)
							exportDecl.remove()
						}

						// Add new re-export from the new location
						// Convert relative newFilePath to absolute if needed
						let absoluteNewFilePath = newFilePath
						if (!path.isAbsolute(newFilePath)) {
							// Find the project root by looking at the old file path
							const projectRoot = this.findProjectRoot(oldFilePath)
							absoluteNewFilePath = path.resolve(projectRoot, newFilePath)
						}

						const newModuleSpecifier = this.calculateRelativeImportPath(filePath, absoluteNewFilePath)

						const newExport = file.addExportDeclaration({
							moduleSpecifier: newModuleSpecifier,
							namedExports: [symbolName],
						})

						// Set quote style to double quotes to match test expectations
						newExport.setModuleSpecifier(newModuleSpecifier)
						newExport.getModuleSpecifier()?.replaceWithText(`"${newModuleSpecifier}"`)

						fileWasUpdated = true
						console.log(`[DEBUG] Added new re-export for ${symbolName} from ${newModuleSpecifier}`)
					}
				}
			}

			// Special handling for source file
			if (isSourceFile && !fileWasUpdated) {
				if (this.isBarrelFile(filePath)) {
					console.log(`[DEBUG] Processing barrel file for re-export: ${filePath}`)

					// Add re-export statement for the moved symbol
					let absoluteNewFilePath = newFilePath
					if (!path.isAbsolute(newFilePath)) {
						const projectRoot = this.findProjectRoot(oldFilePath)
						absoluteNewFilePath = path.resolve(projectRoot, newFilePath)
					}

					const newModuleSpecifier = this.calculateRelativeImportPath(filePath, absoluteNewFilePath)
					console.log(`[DEBUG] Adding re-export: export { ${symbolName} } from "${newModuleSpecifier}"`)

					const newExport = file.addExportDeclaration({
						moduleSpecifier: newModuleSpecifier,
						namedExports: [symbolName],
					})

					// Set quote style to double quotes to match test expectations
					newExport.setModuleSpecifier(newModuleSpecifier)
					newExport.getModuleSpecifier()?.replaceWithText(`"${newModuleSpecifier}"`)

					fileWasUpdated = true
					console.log(`[DEBUG] Added re-export statement to barrel file`)
				} else {
					// For regular source files, check if the file still uses the moved symbol
					const fileContent = file.getFullText()
					const symbolUsagePattern = new RegExp(`\\b${symbolName}\\b`)

					if (symbolUsagePattern.test(fileContent)) {
						console.log(`[DEBUG] Source file still uses moved symbol, adding import: ${symbolName}`)

						// Add import statement for the moved symbol
						let absoluteNewFilePath = newFilePath
						if (!path.isAbsolute(newFilePath)) {
							const projectRoot = this.findProjectRoot(oldFilePath)
							absoluteNewFilePath = path.resolve(projectRoot, newFilePath)
						}

						const newModuleSpecifier = this.calculateRelativeImportPath(filePath, absoluteNewFilePath)
						console.log(`[DEBUG] Adding import: import { ${symbolName} } from '${newModuleSpecifier}'`)

						const newImport = file.addImportDeclaration({
							moduleSpecifier: newModuleSpecifier,
							namedImports: [symbolName],
						})

						// Set quote style to single quotes to match test expectations
						newImport.setModuleSpecifier(newModuleSpecifier)
						newImport.getModuleSpecifier()?.replaceWithText(`'${newModuleSpecifier}'`)

						fileWasUpdated = true
						console.log(`[DEBUG] Added import statement to source file`)
					}
				}
			}

			if (fileWasUpdated) {
				file.saveSync()
				updatedFiles.push(filePath)
				console.log(`[DEBUG] Updated file: ${filePath}`)
				console.log(`[DEBUG] File content after update:`)
				console.log(file.getFullText().substring(0, 300))
			}
		}

		return updatedFiles
	}

	/**
	 * Check if this is a barrel/index file that should maintain re-exports
	 */
	private isBarrelFile(filePath: string): boolean {
		const fileName = path.basename(filePath, path.extname(filePath))
		return (
			fileName === "index" ||
			filePath.includes("/index.") ||
			filePath.endsWith("index.ts") ||
			filePath.endsWith("index.js")
		)
	}

	/**
	 * Check if a module specifier refers to a specific file
	 */
	private isImportFromFile(moduleSpecifier: string, targetFilePath: string, importingFilePath: string): boolean {
		// Handle relative imports
		if (moduleSpecifier.startsWith("./") || moduleSpecifier.startsWith("../")) {
			const resolvedPath = this.resolveRelativeImport(moduleSpecifier, importingFilePath)
			// Normalize paths for comparison
			const normalizedResolved = path.normalize(resolvedPath)
			const normalizedTarget = path.normalize(targetFilePath)

			// Check if the resolved path matches the target file (with or without .ts extension)
			return (
				normalizedResolved === normalizedTarget ||
				normalizedResolved === normalizedTarget.replace(/\.ts$/, "") ||
				normalizedResolved + ".ts" === normalizedTarget
			)
		}

		// Handle absolute imports (less common in our use case)
		return moduleSpecifier.endsWith(targetFilePath) || moduleSpecifier.endsWith(targetFilePath.replace(".ts", ""))
	}

	/**
	 * Resolve a relative import path to an absolute path
	 */
	private resolveRelativeImport(moduleSpecifier: string, importingFilePath: string): string {
		const importingDir = path.dirname(importingFilePath)
		return path.resolve(importingDir, moduleSpecifier)
	}

	/**
	 * Calculate the relative import path from one file to another
	 */
	private calculateRelativeImportPath(fromFilePath: string, toFilePath: string): string {
		// Get the directory of the importing file
		const fromDir = path.dirname(fromFilePath)

		// Get the directory of the target file
		const toDir = path.dirname(toFilePath)
		const toFileName = path.basename(toFilePath, ".ts")

		// Calculate relative path from importing directory to target directory
		let relativePath = path.relative(fromDir, toDir)

		// If they're in the same directory, use ./
		if (relativePath === "") {
			relativePath = "./" + toFileName
		} else {
			// Ensure it starts with ./ or ../
			if (!relativePath.startsWith("./") && !relativePath.startsWith("../")) {
				relativePath = "./" + relativePath
			}
			// Add the filename
			relativePath = relativePath + "/" + toFileName
		}

		// Convert Windows backslashes to forward slashes for import paths
		relativePath = relativePath.replace(/\\/g, "/")

		return relativePath
	}

	/**
	 * Find the project root from a file path
	 */
	private findProjectRoot(filePath: string): string {
		// Look for common project root indicators by walking up the directory tree
		let currentDir = path.dirname(filePath)

		// Keep walking up until we find a directory that contains 'src' or we reach the root
		while (currentDir !== path.dirname(currentDir)) {
			const srcPath = path.join(currentDir, "src")
			try {
				// Check if this directory contains a 'src' folder
				if (require("fs").existsSync(srcPath)) {
					return currentDir
				}
			} catch (error) {
				// Continue searching
			}
			currentDir = path.dirname(currentDir)
		}

		// Fallback: assume the project root is the parent of the 'src' directory
		const srcIndex = filePath.indexOf("/src/")
		if (srcIndex !== -1) {
			return filePath.substring(0, srcIndex)
		}

		// Last resort: use the directory of the file
		return path.dirname(filePath)
	}
}
