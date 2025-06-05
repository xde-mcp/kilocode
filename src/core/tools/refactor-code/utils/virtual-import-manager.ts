import { SourceFile, ImportDeclaration, SyntaxKind, QuoteKind } from "ts-morph"
import { PathResolver } from "./PathResolver"

/**
 * Represents a single import in a virtualized format
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

	constructor(pathResolver: PathResolver) {
		this.pathResolver = pathResolver
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

		console.log(`[VIRTUAL-IMPORT] Initialized ${imports.length} imports for ${normalizedPath}`)
	}

	/**
	 * Parse existing imports from a source file into virtual format
	 */
	private parseImportsFromFile(sourceFile: SourceFile): VirtualImport[] {
		const importDeclarations = sourceFile.getImportDeclarations()
		const virtualImports: VirtualImport[] = []

		importDeclarations.forEach((importDecl, index) => {
			const moduleSpecifier = importDecl.getModuleSpecifierValue()
			const quoteKind = importDecl.getModuleSpecifier().getQuoteKind()
			const quoteStyle = quoteKind === QuoteKind.Single ? "single" : "double"

			const virtualImport: VirtualImport = {
				moduleSpecifier,
				namedImports: [],
				isTypeOnly: importDecl.isTypeOnly(),
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

		return virtualImports
	}

	/**
	 * Add a named import to a file's virtual import state
	 */
	addNamedImport(filePath: string, symbolName: string, moduleSpecifier: string): void {
		const normalizedPath = this.pathResolver.normalizeFilePath(filePath)
		const fileImports = this.virtualFiles.get(normalizedPath)

		if (!fileImports) {
			throw new Error(`File not initialized in virtual import manager: ${normalizedPath}`)
		}

		// Check if import from this module already exists
		const existingImport = fileImports.imports.find((imp) => imp.moduleSpecifier === moduleSpecifier)

		if (existingImport) {
			// Add to existing import if not already present
			if (!existingImport.namedImports.includes(symbolName)) {
				existingImport.namedImports.push(symbolName)
				existingImport.namedImports.sort() // Keep alphabetical order
				fileImports.isDirty = true
				console.log(
					`[VIRTUAL-IMPORT] Added ${symbolName} to existing import from ${moduleSpecifier} in ${normalizedPath}`,
				)
			}
		} else {
			// Create new import
			const newImport: VirtualImport = {
				moduleSpecifier,
				namedImports: [symbolName],
				isTypeOnly: false,
				originalIndex: fileImports.imports.length,
				quoteStyle: "single", // Default to single quotes
			}
			fileImports.imports.push(newImport)
			fileImports.isDirty = true
			console.log(
				`[VIRTUAL-IMPORT] Created new import for ${symbolName} from ${moduleSpecifier} in ${normalizedPath}`,
			)
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
					console.log(
						`[VIRTUAL-IMPORT] Removed entire import from ${imp.moduleSpecifier} in ${normalizedPath}`,
					)
				} else {
					console.log(
						`[VIRTUAL-IMPORT] Removed ${symbolName} from import from ${imp.moduleSpecifier} in ${normalizedPath}`,
					)
				}

				// If no moduleSpecifier was provided, remove from first match only
				if (!moduleSpecifier) {
					break
				}
			}
		}

		if (!removed) {
			console.log(`[VIRTUAL-IMPORT] Symbol ${symbolName} not found in imports for ${normalizedPath}`)
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
			console.log(
				`[VIRTUAL-IMPORT] No import found for ${symbolName} from ${oldModuleSpecifier} in ${normalizedPath}`,
			)
			return
		}

		// Check if symbol exists in old import before removing
		const symbolExistsInOldImport = oldImport.namedImports.includes(symbolName)

		// Remove symbol from old import
		if (symbolExistsInOldImport) {
			this.removeNamedImport(filePath, symbolName, oldModuleSpecifier)
		}

		// Add symbol to new import (use the check from before removal)
		if (symbolExistsInOldImport) {
			this.addNamedImport(filePath, symbolName, newModuleSpecifier)
		}

		console.log(
			`[VIRTUAL-IMPORT] Updated import path for ${symbolName} from ${oldModuleSpecifier} to ${newModuleSpecifier} in ${normalizedPath}`,
		)
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
				console.log(`[VIRTUAL-IMPORT] Successfully wrote imports back to ${filePath}`)
			} catch (error) {
				console.error(`[VIRTUAL-IMPORT] Failed to write imports to ${filePath}:`, error)
			}
		}

		return updatedFiles
	}

	/**
	 * Write virtual imports back to a specific source file
	 */
	private async writeImportsToFile(fileImports: VirtualFileImports): Promise<void> {
		const { sourceFile, imports } = fileImports

		// Remove all existing import declarations
		const existingImports = sourceFile.getImportDeclarations()
		existingImports.forEach((imp) => imp.remove())

		// Sort imports by original index to preserve ordering
		const sortedImports = [...imports].sort((a, b) => a.originalIndex - b.originalIndex)

		// Add imports back in order
		sortedImports.forEach((virtualImport) => {
			const importStructure: any = {
				moduleSpecifier: virtualImport.moduleSpecifier,
				isTypeOnly: virtualImport.isTypeOnly,
			}

			if (virtualImport.defaultImport) {
				importStructure.defaultImport = virtualImport.defaultImport
			}

			if (virtualImport.namespaceImport) {
				importStructure.namespaceImport = virtualImport.namespaceImport
			}

			if (virtualImport.namedImports.length > 0) {
				importStructure.namedImports = virtualImport.namedImports
			}

			sourceFile.addImportDeclaration(importStructure)
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
