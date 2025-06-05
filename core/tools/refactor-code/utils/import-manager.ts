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

			// Skip the source and target files
			if (filePath.endsWith(oldFilePath) || filePath.endsWith(newFilePath)) {
				continue
			}

			let fileWasUpdated = false

			// Check each import declaration in this file
			const importDeclarations = file.getImportDeclarations()

			for (const importDecl of importDeclarations) {
				const moduleSpecifier = importDecl.getModuleSpecifierValue()

				// Check if this import is from the old file
				if (this.isImportFromFile(moduleSpecifier, oldFilePath, filePath)) {
					// Check if this import includes our moved symbol
					const namedImports = importDecl.getNamedImports()
					const symbolImport = namedImports.find((imp) => imp.getName() === symbolName)

					if (symbolImport) {
						refactorLogger.debug(`Found import of ${symbolName} in ${filePath}`)

						// Remove the symbol from this import
						symbolImport.remove()

						// If this was the last named import, remove the entire import declaration
						if (
							importDecl.getNamedImports().length === 0 &&
							!importDecl.getDefaultImport() &&
							!importDecl.getNamespaceImport()
						) {
							importDecl.remove()
						}

						// Add new import for the symbol from the new location
						const newModuleSpecifier = this.calculateRelativeImportPath(filePath, newFilePath)

						file.addImportDeclaration({
							moduleSpecifier: newModuleSpecifier,
							namedImports: [symbolName],
						})

						fileWasUpdated = true
						refactorLogger.debug(
							`Updated import in ${filePath}: ${symbolName} now imported from ${newModuleSpecifier}`,
						)
					}
				}
			}

			if (fileWasUpdated) {
				file.saveSync()
				updatedFiles.push(filePath)
			}
		}

		refactorLogger.debug(`Updated imports in ${updatedFiles.length} files`)
		return updatedFiles
	}

	/**
	 * Check if a module specifier refers to a specific file
	 */
	private isImportFromFile(moduleSpecifier: string, targetFilePath: string, importingFilePath: string): boolean {
		// Handle relative imports
		if (moduleSpecifier.startsWith("./") || moduleSpecifier.startsWith("../")) {
			const resolvedPath = this.resolveRelativeImport(moduleSpecifier, importingFilePath)
			return resolvedPath.endsWith(targetFilePath) || resolvedPath.endsWith(targetFilePath.replace(".ts", ""))
		}

		// Handle absolute imports (less common in our use case)
		return moduleSpecifier.endsWith(targetFilePath) || moduleSpecifier.endsWith(targetFilePath.replace(".ts", ""))
	}

	/**
	 * Resolve a relative import path to an absolute path
	 */
	private resolveRelativeImport(moduleSpecifier: string, importingFilePath: string): string {
		const path = require("path")
		const importingDir = path.dirname(importingFilePath)
		return path.resolve(importingDir, moduleSpecifier)
	}

	/**
	 * Calculate the relative import path from one file to another
	 */
	private calculateRelativeImportPath(fromFilePath: string, toFilePath: string): string {
		const path = require("path")

		// For project-relative paths, we need to work within the project structure
		// Extract just the relative parts after the common project root
		const fromParts = fromFilePath.split(path.sep)
		const toParts = toFilePath.split(path.sep)

		// Find the common project root (look for common path segments)
		let commonIndex = 0
		while (
			commonIndex < fromParts.length &&
			commonIndex < toParts.length &&
			fromParts[commonIndex] === toParts[commonIndex]
		) {
			commonIndex++
		}

		// If we found a reasonable common root, use project-relative calculation
		if (commonIndex > 0) {
			const fromRelative = fromParts.slice(commonIndex).join("/")
			const toRelative = toParts.slice(commonIndex).join("/")

			const fromDir = path.dirname(fromRelative)
			let relativePath = path.relative(fromDir, toRelative)

			// Remove .ts extension
			relativePath = relativePath.replace(/\.ts$/, "")

			// Ensure it starts with ./ or ../
			if (!relativePath.startsWith("./") && !relativePath.startsWith("../")) {
				relativePath = "./" + relativePath
			}

			// Convert Windows backslashes to forward slashes for import paths
			relativePath = relativePath.replace(/\\/g, "/")

			return relativePath
		}

		// Fallback to standard path.relative if no common root found
		const fromDir = path.dirname(fromFilePath)
		let relativePath = path.relative(fromDir, toFilePath)

		// Remove .ts extension
		relativePath = relativePath.replace(/\.ts$/, "")

		// Ensure it starts with ./ or ../
		if (!relativePath.startsWith("./") && !relativePath.startsWith("../")) {
			relativePath = "./" + relativePath
		}

		// Convert Windows backslashes to forward slashes for import paths
		relativePath = relativePath.replace(/\\/g, "/")

		return relativePath
	}
}
