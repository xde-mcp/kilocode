import { SourceFile, ImportDeclaration, ExportDeclaration, SyntaxKind, QuoteKind } from "ts-morph"
import { PathResolver } from "./PathResolver"

/**
 * Represents a single import or re-export in a virtualized format
 */
interface VirtualImport {
	/** The module specifier (e.g., './utils', 'lodash') */
	moduleSpecifier: string
	/** Default import name (e.g., 'React' in 'import React from "react"') */
	defaultImport?: string
	/** Named imports (e.g., ['useState', 'useEffect'] in 'import { useState, useEffect } from "react"') */
	namedImports: string[]
	/** Namespace import (e.g., 'Utils' in 'import * as Utils from "./utils"') */
	namespaceImport?: string
	/** Type-only import flag */
	isTypeOnly: boolean
	/** Whether this is a re-export (export { ... } from "...") instead of an import */
	isReExport: boolean
	/** Original position in file for ordering preservation */
	originalIndex: number
	/** Quote style preference (single or double) */
	quoteStyle: "single" | "double"
}

/**
 * Represents the complete import state for a single file
 */
interface VirtualFileImports {
	/** File path */
	filePath: string
	/** All imports in the file */
	imports: VirtualImport[]
	/** Whether the file has been modified */
	isDirty: boolean
	/** Original file reference for writing back */
	sourceFile: SourceFile
}

/**
 * Virtualized Import Manager
 *
 * Creates a virtual representation of all imports across files, allows
 * manipulation of this virtual state, then writes back atomically.
 * This approach eliminates complex branching logic and provides a clean
 * interface for import management during refactoring operations.
 */
export class VirtualImportManager {
	private virtualFiles = new Map<string, VirtualFileImports>()
	private pathResolver: PathResolver
	private defaultQuoteStyle: "single" | "double"

	constructor(pathResolver: PathResolver, defaultQuoteStyle: "single" | "double" = "double") {
		this.pathResolver = pathResolver
		this.defaultQuoteStyle = defaultQuoteStyle
	}

	/**
	 * Initialize virtual import state for a file
	 */
	initializeFile(sourceFile: SourceFile): void {
		const filePath = sourceFile.getFilePath()
		const normalizedPath = this.pathResolver.normalizeFilePath(filePath)

		if (this.virtualFiles.has(normalizedPath)) {
			return // Already initialized
		}

		const imports = this.parseImportsFromFile(sourceFile)

		this.virtualFiles.set(normalizedPath, {
			filePath: normalizedPath,
			imports,
			isDirty: false,
			sourceFile,
		})
	}

	/**
	 * Parse existing imports and re-exports from a source file into virtual format
	 */
	private parseImportsFromFile(sourceFile: SourceFile): VirtualImport[] {
		const importDeclarations = sourceFile.getImportDeclarations()
		const exportDeclarations = sourceFile.getExportDeclarations()
		const virtualImports: VirtualImport[] = []

		// Parse import declarations
		importDeclarations.forEach((importDecl, index) => {
			const moduleSpecifier = importDecl.getModuleSpecifierValue()
			const quoteKind = importDecl.getModuleSpecifier().getQuoteKind()
			const quoteStyle = quoteKind === QuoteKind.Single ? "single" : "double"

			const virtualImport: VirtualImport = {
				moduleSpecifier,
				namedImports: [],
				isTypeOnly: importDecl.isTypeOnly(),
				isReExport: false,
				originalIndex: index,
				quoteStyle,
			}

			// Parse default import
			const defaultImport = importDecl.getDefaultImport()
			if (defaultImport) {
				virtualImport.defaultImport = defaultImport.getText()
			}

			// Parse namespace import
			const namespaceImport = importDecl.getNamespaceImport()
			if (namespaceImport) {
				virtualImport.namespaceImport = namespaceImport.getText()
			}

			// Parse named imports
			const namedImports = importDecl.getNamedImports()
			namedImports.forEach((namedImport) => {
				virtualImport.namedImports.push(namedImport.getName())
			})

			virtualImports.push(virtualImport)
		})

		// Parse export declarations (re-exports)
		exportDeclarations.forEach((exportDecl, index) => {
			const moduleSpecifier = exportDecl.getModuleSpecifierValue()
			if (!moduleSpecifier) return // Skip exports without module specifier (local exports)

			const quoteKind = exportDecl.getModuleSpecifier()?.getQuoteKind()
			const quoteStyle = quoteKind === QuoteKind.Single ? "single" : "double"

			const virtualExport: VirtualImport = {
				moduleSpecifier,
				namedImports: [],
				isTypeOnly: exportDecl.isTypeOnly(),
				isReExport: true,
				originalIndex: importDeclarations.length + index, // Place after imports
				quoteStyle,
			}

			// Parse named exports
			const namedExports = exportDecl.getNamedExports()
			namedExports.forEach((namedExport) => {
				virtualExport.namedImports.push(namedExport.getName())
			})

			// Handle star exports (export * from "...")
			if (exportDecl.isNamespaceExport()) {
				virtualExport.namespaceImport = "*"
			}

			virtualImports.push(virtualExport)
		})

		return virtualImports
	}

	/**
	 * Add a named import to a file's virtual import state
	 */
	addNamedImport(filePath: string, symbolName: string, moduleSpecifier: string, isTypeOnly: boolean = false): void {
		const normalizedPath = this.pathResolver.normalizeFilePath(filePath)
		const fileImports = this.virtualFiles.get(normalizedPath)

		if (!fileImports) {
			throw new Error(`File not initialized in virtual import manager: ${normalizedPath}`)
		}

		// Prevent self-imports: check if the module specifier would resolve to the same file
		const fileName = this.pathResolver.getFileNameWithoutExtension(normalizedPath)
		const isRelativeSelfImport =
			moduleSpecifier === `./${fileName}` || moduleSpecifier === `../${fileName}` || moduleSpecifier === fileName
		const isAbsoluteSelfImport = moduleSpecifier.endsWith(`/${fileName}`) && moduleSpecifier.includes(fileName)

		if (isRelativeSelfImport || isAbsoluteSelfImport) {
			return
		}

		// Check if import from this module already exists
		const existingImport = fileImports.imports.find((imp) => imp.moduleSpecifier === moduleSpecifier)

		if (existingImport) {
			// Add to existing import if not already present
			if (!existingImport.namedImports.includes(symbolName)) {
				existingImport.namedImports.push(symbolName)
				existingImport.namedImports.sort() // Keep alphabetical order
				fileImports.isDirty = true
			}
		} else {
			// Create new import
			const newImport: VirtualImport = {
				moduleSpecifier,
				namedImports: [symbolName],
				isTypeOnly: isTypeOnly,
				isReExport: false,
				originalIndex: fileImports.imports.length,
				quoteStyle: this.defaultQuoteStyle,
			}
			fileImports.imports.push(newImport)
			fileImports.isDirty = true
		}
	}

	/**
	 * Add a named re-export to a file's virtual import state
	 */
	addNamedReExport(filePath: string, symbolName: string, moduleSpecifier: string): void {
		const normalizedPath = this.pathResolver.normalizeFilePath(filePath)
		const fileImports = this.virtualFiles.get(normalizedPath)

		if (!fileImports) {
			throw new Error(`File not initialized in virtual import manager: ${normalizedPath}`)
		}

		// Check if re-export from this module already exists
		const existingReExport = fileImports.imports.find(
			(imp) => imp.moduleSpecifier === moduleSpecifier && imp.isReExport,
		)

		if (existingReExport) {
			// Add to existing re-export if not already present
			if (!existingReExport.namedImports.includes(symbolName)) {
				existingReExport.namedImports.push(symbolName)
				existingReExport.namedImports.sort() // Keep alphabetical order
				fileImports.isDirty = true
			}
		} else {
			// Create new re-export
			// Note: moduleSpecifier is already a relative path calculated by the caller
			const newReExport: VirtualImport = {
				moduleSpecifier: moduleSpecifier,
				namedImports: [symbolName],
				isTypeOnly: false,
				isReExport: true,
				originalIndex: fileImports.imports.length,
				quoteStyle: this.defaultQuoteStyle,
			}
			fileImports.imports.push(newReExport)
			fileImports.isDirty = true
		}
	}

	/**
	 * Remove a named import from a file's virtual import state
	 */
	removeNamedImport(filePath: string, symbolName: string, moduleSpecifier?: string): void {
		const normalizedPath = this.pathResolver.normalizeFilePath(filePath)
		const fileImports = this.virtualFiles.get(normalizedPath)

		if (!fileImports) {
			return // File not tracked, nothing to remove
		}

		let removed = false

		for (let i = fileImports.imports.length - 1; i >= 0; i--) {
			const imp = fileImports.imports[i]

			// If moduleSpecifier is provided, only remove from that specific import
			if (moduleSpecifier && imp.moduleSpecifier !== moduleSpecifier) {
				continue
			}

			// Remove the symbol from named imports
			const symbolIndex = imp.namedImports.indexOf(symbolName)
			if (symbolIndex !== -1) {
				imp.namedImports.splice(symbolIndex, 1)
				removed = true
				fileImports.isDirty = true

				// If this was the last named import and no default/namespace import, remove entire import
				if (imp.namedImports.length === 0 && !imp.defaultImport && !imp.namespaceImport) {
					fileImports.imports.splice(i, 1)
				}

				// If no moduleSpecifier was provided, remove from first match only
				if (!moduleSpecifier) {
					break
				}
			}
		}
	}

	/**
	 * Update the module specifier for imports of a specific symbol
	 */
	updateImportPath(
		filePath: string,
		symbolName: string,
		oldModuleSpecifier: string,
		newModuleSpecifier: string,
	): void {
		const normalizedPath = this.pathResolver.normalizeFilePath(filePath)
		const fileImports = this.virtualFiles.get(normalizedPath)

		if (!fileImports) {
			return // File not tracked
		}

		// Find import with old module specifier that contains the symbol
		const oldImport = fileImports.imports.find(
			(imp) =>
				imp.moduleSpecifier === oldModuleSpecifier &&
				(imp.namedImports.includes(symbolName) ||
					imp.defaultImport === symbolName ||
					imp.namespaceImport === symbolName),
		)

		if (!oldImport) {
			// Check if there's a namespace import from the old module specifier
			// This handles cases like: import * as Helpers from "./utils" where formatName is accessed as Helpers.formatName
			const namespaceImport = fileImports.imports.find(
				(imp) => imp.moduleSpecifier === oldModuleSpecifier && imp.namespaceImport,
			)

			if (namespaceImport) {
				// Add a direct import for the moved symbol (keep the namespace import as-is)
				this.addNamedImport(filePath, symbolName, newModuleSpecifier, namespaceImport.isTypeOnly)
				return
			}

			return
		}

		// Check if symbol exists in old import before removing (check all import types)
		const symbolExistsInOldImport =
			oldImport.namedImports.includes(symbolName) ||
			oldImport.defaultImport === symbolName ||
			oldImport.namespaceImport === symbolName

		// Remove symbol from old import and add to new location
		if (symbolExistsInOldImport) {
			// Handle different import types
			if (oldImport.namedImports.includes(symbolName)) {
				// Named import: remove from named imports
				this.removeNamedImport(filePath, symbolName, oldModuleSpecifier)
			} else if (oldImport.defaultImport === symbolName) {
				// Default import: remove entire import (since default can't be partially removed)
				const fileImports = this.virtualFiles.get(this.pathResolver.normalizeFilePath(filePath))!
				const importIndex = fileImports.imports.findIndex((imp) => imp === oldImport)
				if (importIndex !== -1) {
					fileImports.imports.splice(importIndex, 1)
					fileImports.isDirty = true
				}
			} else if (oldImport.namespaceImport === symbolName) {
				// Namespace import: For now, keep the namespace and add direct import
				// This handles cases like: import * as Helpers from "./utils" -> keep namespace, add direct import
				// Future enhancement: could analyze usage to determine if namespace should be removed
			}

			// Add symbol to new import or re-export
			if (oldImport.isReExport) {
				// If the old import was a re-export, create a new re-export
				this.addNamedReExport(filePath, symbolName, newModuleSpecifier)
			} else {
				// Create appropriate import type based on what was moved
				if (oldImport.defaultImport === symbolName) {
					// For default imports, we need to add a default import to the new location
					// Note: This is a simplified approach - in complex cases, the symbol might not be default in new location
					const fileImports = this.virtualFiles.get(this.pathResolver.normalizeFilePath(filePath))!
					const newImport: VirtualImport = {
						moduleSpecifier: newModuleSpecifier,
						defaultImport: symbolName,
						namedImports: [],
						isTypeOnly: oldImport.isTypeOnly,
						isReExport: false,
						originalIndex: fileImports.imports.length,
						quoteStyle: oldImport.quoteStyle,
					}
					fileImports.imports.push(newImport)
					fileImports.isDirty = true
				} else {
					// For named imports and namespace imports, create a named import
					this.addNamedImport(filePath, symbolName, newModuleSpecifier, oldImport.isTypeOnly)
				}
			}
		}
	}

	/**
	 * Check if a file has any imports from a specific module
	 */
	hasImportFrom(filePath: string, moduleSpecifier: string): boolean {
		const normalizedPath = this.pathResolver.normalizeFilePath(filePath)
		const fileImports = this.virtualFiles.get(normalizedPath)

		if (!fileImports) {
			return false
		}

		return fileImports.imports.some((imp) => imp.moduleSpecifier === moduleSpecifier)
	}

	/**
	 * Get all files that import from a specific module
	 */
	getFilesImportingFrom(moduleSpecifier: string): string[] {
		const importingFiles: string[] = []

		for (const [filePath, fileImports] of this.virtualFiles) {
			if (fileImports.imports.some((imp) => imp.moduleSpecifier === moduleSpecifier)) {
				importingFiles.push(filePath)
			}
		}

		return importingFiles
	}

	/**
	 * Calculate relative import path between two files
	 */
	calculateRelativePath(fromFilePath: string, toFilePath: string): string {
		return this.pathResolver.getRelativeImportPath(fromFilePath, toFilePath)
	}

	/**
	 * Write all dirty virtual import states back to their source files
	 */
	async writeBackToFiles(): Promise<string[]> {
		const updatedFiles: string[] = []

		for (const [filePath, fileImports] of this.virtualFiles) {
			if (!fileImports.isDirty) {
				continue
			}

			try {
				await this.writeImportsToFile(fileImports)
				updatedFiles.push(filePath)
				fileImports.isDirty = false
			} catch (error) {
				// Log error but continue processing other files
			}
		}

		return updatedFiles
	}

	/**
	 * Write virtual imports and re-exports back to a specific source file
	 */
	private async writeImportsToFile(fileImports: VirtualFileImports): Promise<void> {
		const { sourceFile, imports } = fileImports

		// Remove all existing import and export declarations
		const existingImports = sourceFile.getImportDeclarations()
		const existingExports = sourceFile.getExportDeclarations()
		existingImports.forEach((imp) => imp.remove())
		existingExports.forEach((exp) => exp.remove())

		// Sort imports by original index to preserve ordering
		const sortedImports = [...imports].sort((a, b) => a.originalIndex - b.originalIndex)

		// Add imports and re-exports back in order
		sortedImports.forEach((virtualImport) => {
			if (virtualImport.isReExport) {
				// Handle re-export declarations
				const exportStructure: any = {
					moduleSpecifier: virtualImport.moduleSpecifier,
					isTypeOnly: virtualImport.isTypeOnly,
				}

				if (virtualImport.namespaceImport === "*") {
					// Handle star exports (export * from "...")
					exportStructure.namedExports = undefined
				} else if (virtualImport.namedImports.length > 0) {
					// Handle named re-exports (export { name1, name2 } from "...")
					exportStructure.namedExports = virtualImport.namedImports
				}

				sourceFile.addExportDeclaration(exportStructure)
			} else {
				// Handle import declarations
				const importStructure: any = {
					moduleSpecifier: virtualImport.moduleSpecifier,
					isTypeOnly: virtualImport.isTypeOnly,
				}

				if (virtualImport.defaultImport) {
					importStructure.defaultImport = virtualImport.defaultImport
				}

				if (virtualImport.namespaceImport && virtualImport.namespaceImport !== "*") {
					importStructure.namespaceImport = virtualImport.namespaceImport
				}

				if (virtualImport.namedImports.length > 0) {
					importStructure.namedImports = virtualImport.namedImports
				}

				// Add the import declaration and then set the quote style
				const importDeclaration = sourceFile.addImportDeclaration(importStructure)

				// Respect the quote style from the virtual import
				const moduleSpecifier = importDeclaration.getModuleSpecifier()
				if (moduleSpecifier) {
					if (virtualImport.quoteStyle === "single") {
						moduleSpecifier.replaceWithText(`'${virtualImport.moduleSpecifier}'`)
					} else {
						moduleSpecifier.replaceWithText(`"${virtualImport.moduleSpecifier}"`)
					}
				}
			}
		})

		// Save the file
		sourceFile.saveSync()
	}

	/**
	 * Get debug information about virtual import state
	 */
	getDebugInfo(): Record<string, any> {
		const debug: Record<string, any> = {}

		for (const [filePath, fileImports] of this.virtualFiles) {
			debug[filePath] = {
				importCount: fileImports.imports.length,
				isDirty: fileImports.isDirty,
				imports: fileImports.imports.map((imp) => ({
					module: imp.moduleSpecifier,
					named: imp.namedImports,
					default: imp.defaultImport,
					namespace: imp.namespaceImport,
					typeOnly: imp.isTypeOnly,
				})),
			}
		}

		return debug
	}

	/**
	 * Clear all virtual state (useful for testing)
	 */
	clear(): void {
		this.virtualFiles.clear()
	}
}
