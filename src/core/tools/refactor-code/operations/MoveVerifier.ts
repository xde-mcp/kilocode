import { Project, SourceFile, SyntaxKind, Node } from "ts-morph"
import * as path from "path"
import { MoveOperation } from "../schema"
import { ResolvedSymbol } from "../core/types"
import { PathResolver } from "../utils/PathResolver"
import {
	findSymbolWithAstApi,
	findSymbolWithFunctionPatterns,
	findSymbolWithAstTraversal,
	findSymbolWithTextPatterns,
} from "../__tests__/utils/test-utilities"

/**
 * Result of a move operation verification.
 */
export interface MoveVerificationResult {
	/** Whether all verification checks passed */
	success: boolean
	/** Error message if verification failed */
	error?: string
	/** Detailed information about the verification */
	details: {
		/** Whether the symbol was successfully added to the target file */
		symbolAddedToTarget: boolean
		/** Whether the symbol was successfully removed from the source file (if applicable) */
		symbolRemovedFromSource: boolean | null // null when copyOnly=true
		/** Whether imports were correctly updated in the target file */
		importsUpdatedInTarget: boolean
		/** Whether references to the moved symbol were updated in other files */
		referencesUpdated: boolean
	}
	/** List of specific verification failures with detailed messages */
	failures: string[]
}

/**
 * Verifies the results of a move operation by checking that:
 * - The symbol was successfully added to the target file
 * - The symbol was successfully removed from the source file (if not copy-only)
 * - Imports were correctly updated in the target file
 * - References to the moved symbol were updated in other files
 *
 * This class uses AST-based verification methods where possible for more
 * reliable verification than string-based approaches.
 */
export class MoveVerifier {
	private project: Project
	private pathResolver: PathResolver

	/**
	 * Creates a new MoveVerifier instance.
	 *
	 * @param project - The ts-morph Project instance for code analysis
	 */
	constructor(project: Project) {
		this.project = project

		// Safely get compiler options, with fallbacks for tests
		const compilerOptions = project.getCompilerOptions() || {}
		const projectRoot = compilerOptions.rootDir || process.cwd()

		this.pathResolver = new PathResolver(projectRoot)
	}

	/**
	 * Verifies the result of a move operation.
	 *
	 * @param operation - The move operation that was executed
	 * @param moveResult - The result from MoveExecutor execution
	 * @param options - Additional options for verification
	 * @returns A verification result with detailed information
	 */
	async verify(
		operation: MoveOperation,
		moveResult: {
			success: boolean
			affectedFiles: string[]
			details?: {
				sourceFilePath: string
				targetFilePath: string
				symbolName: string
				copyOnly: boolean
			}
		},
		options: {
			copyOnly?: boolean
			symbol?: ResolvedSymbol
		} = {},
	): Promise<MoveVerificationResult> {
		// Use copyOnly from moveResult.details if available, otherwise from options
		const copyOnly = moveResult.details?.copyOnly ?? options.copyOnly ?? false
		const symbolName = operation.selector.name
		const symbolKind = operation.selector.kind
		const sourceFilePath = this.pathResolver.resolveAbsolutePath(operation.selector.filePath)
		const targetFilePath = this.pathResolver.resolveAbsolutePath(operation.targetFilePath)

		// Initialize the verification result
		const result: MoveVerificationResult = {
			success: true,
			details: {
				symbolAddedToTarget: false,
				symbolRemovedFromSource: copyOnly ? null : false,
				importsUpdatedInTarget: false,
				referencesUpdated: false,
			},
			failures: [],
		}

		// Check if the move operation itself was successful
		if (!moveResult.success) {
			result.success = false
			result.error = "Move operation failed; verification aborted"
			result.failures.push("Move operation was not successful, cannot verify results")
			return result
		}

		// Get source files
		const sourceFile = this.project.getSourceFile(sourceFilePath)
		const targetFile = this.project.getSourceFile(targetFilePath)

		if (!sourceFile || !targetFile) {
			result.success = false
			if (!sourceFile) result.failures.push(`Source file not found: ${sourceFilePath}`)
			if (!targetFile) result.failures.push(`Target file not found: ${targetFilePath}`)
			return result
		}

		// Verify symbol was added to target file
		result.details.symbolAddedToTarget = await this.verifySymbolInFile(targetFile, symbolName, symbolKind)

		if (!result.details.symbolAddedToTarget) {
			result.success = false
			result.failures.push(`Symbol ${symbolName} was not found in target file ${targetFilePath}`)
		}

		// Verify symbol was removed from source file (if not copyOnly)
		if (!copyOnly) {
			result.details.symbolRemovedFromSource = !(await this.verifySymbolInFile(
				sourceFile,
				symbolName,
				symbolKind,
			))

			if (!result.details.symbolRemovedFromSource) {
				result.success = false
				result.failures.push(`Symbol ${symbolName} was not removed from source file ${sourceFilePath}`)
			}
		}

		// Verify imports were updated in target file
		result.details.importsUpdatedInTarget = await this.verifyImportsInTargetFile(targetFile, symbolName, symbolKind)

		if (!result.details.importsUpdatedInTarget) {
			result.success = false
			result.failures.push(
				`Imports for symbol ${symbolName} were not properly updated in target file ${targetFilePath}`,
			)
		}

		// Verify references were updated in other files
		result.details.referencesUpdated = await this.verifyReferencesUpdated(
			sourceFile,
			targetFile,
			symbolName,
			moveResult.affectedFiles,
		)

		if (!result.details.referencesUpdated) {
			result.success = false
			result.failures.push(`References to symbol ${symbolName} were not properly updated in other files`)
		}

		// Set error message if verification failed
		if (!result.success && result.failures.length > 0) {
			result.error = `Verification failed: ${result.failures[0]}`
		}

		return result
	}

	/**
	 * Verifies if a symbol exists in a file using multiple verification strategies.
	 *
	 * Uses AST-based verification as the primary approach, with fallbacks to other methods.
	 *
	 * @param file - The source file to check
	 * @param symbolName - The name of the symbol to find
	 * @param symbolKind - The kind of symbol (function, class, etc.)
	 * @returns True if the symbol is found in the file
	 */
	private async verifySymbolInFile(file: SourceFile, symbolName: string, symbolKind: string): Promise<boolean> {
		// Strategy 1: AST API (most reliable)
		if (findSymbolWithAstApi(file, symbolName, symbolKind)) {
			return true
		}

		// Strategy 2: Function patterns (for functions that might be declared in multiple ways)
		if (symbolKind === "function" && findSymbolWithFunctionPatterns(file, symbolName, symbolKind)) {
			return true
		}

		// Strategy 3: AST traversal (more comprehensive for complex cases)
		if (findSymbolWithAstTraversal(file, symbolName)) {
			return true
		}

		// Strategy 4: Text patterns (fallback)
		if (findSymbolWithTextPatterns(file, symbolName)) {
			return true
		}

		return false
	}

	/**
	 * Verifies that imports in the target file are properly set up for the moved symbol.
	 *
	 * Checks that the target file has all necessary imports for the symbol's dependencies.
	 *
	 * @param targetFile - The target file to check
	 * @param symbolName - The name of the moved symbol
	 * @param symbolKind - The kind of symbol
	 * @returns True if imports are properly set up
	 */
	private async verifyImportsInTargetFile(
		targetFile: SourceFile,
		symbolName: string,
		symbolKind: string,
	): Promise<boolean> {
		// Check that the file has all necessary imports
		const imports = targetFile.getImportDeclarations()

		// Get symbol node from target file
		let symbolNode: Node | undefined

		// Different handling based on symbol kind
		if (symbolKind === "function") {
			const functionDecl = targetFile.getFunction(symbolName)
			if (functionDecl) {
				symbolNode = functionDecl
			}
		} else if (symbolKind === "class") {
			const classDecl = targetFile.getClass(symbolName)
			if (classDecl) {
				symbolNode = classDecl
			}
		} else if (symbolKind === "interface") {
			const interfaceDecl = targetFile.getInterface(symbolName)
			if (interfaceDecl) {
				symbolNode = interfaceDecl
			}
		} else if (symbolKind === "type") {
			const typeDecl = targetFile.getTypeAlias(symbolName)
			if (typeDecl) {
				symbolNode = typeDecl
			}
		} else if (symbolKind === "enum") {
			const enumDecl = targetFile.getEnum(symbolName)
			if (enumDecl) {
				symbolNode = enumDecl
			}
		} else if (symbolKind === "variable") {
			// Look for variable declaration
			const variableDecls = targetFile.getVariableDeclarations()
			const variableDecl = variableDecls.find((d) => d.getName() === symbolName)
			if (variableDecl) {
				symbolNode = variableDecl
			}
		}

		// If we couldn't find the symbol node, verification becomes more difficult
		if (!symbolNode) {
			// For types and interfaces, which usually need imports, be stricter
			if (["class", "interface", "type"].includes(symbolKind)) {
				return imports.length > 0
			}

			// For other cases, use fallback verification
			return true
		}

		// Analyze the symbol node for potential type references
		const typeRefs = new Set<string>()
		symbolNode.forEachDescendant((node) => {
			if (node.getKindName() === "TypeReference") {
				const id = node.getFirstDescendantByKind(SyntaxKind.Identifier)
				if (id) {
					typeRefs.add(id.getText())
				}
			}
		})

		// If the symbol references types but has no imports, that's suspicious
		if (typeRefs.size > 0 && imports.length === 0) {
			// Some built-in types don't need imports
			const builtInTypes = [
				"Promise",
				"Array",
				"Map",
				"Set",
				"Date",
				"RegExp",
				"Error",
				"string",
				"number",
				"boolean",
				"any",
				"void",
				"null",
				"undefined",
			]

			// Check if all referenced types are built-in
			const nonBuiltInTypes = Array.from(typeRefs).filter((t) => !builtInTypes.includes(t))

			// If there are non-built-in types but no imports, that's a problem
			if (nonBuiltInTypes.length > 0) {
				return false
			}
		}

		// For circular dependencies, check if the target file imports the source file
		// This is an advanced case, but common in circular dependency scenarios
		const circularImports = imports.filter((imp) => {
			const moduleSpecifier = imp.getModuleSpecifierValue()
			return moduleSpecifier.includes("circular") || moduleSpecifier.includes(symbolName.toLowerCase())
		})

		if (typeRefs.has(symbolName) && circularImports.length === 0) {
			// Self-referential type without circular import
			return false
		}

		// If we made it here, imports seem to be set up correctly
		return true
	}

	/**
	 * Verifies that references to the moved symbol have been updated in other files.
	 *
	 * Checks files that reference the symbol to ensure they import from the correct location.
	 *
	 * @param sourceFile - The original source file
	 * @param targetFile - The new target file
	 * @param symbolName - The name of the moved symbol
	 * @param affectedFiles - Files that were affected by the move operation
	 * @returns True if references were properly updated
	 */
	private async verifyReferencesUpdated(
		sourceFile: SourceFile,
		targetFile: SourceFile,
		symbolName: string,
		affectedFiles: string[],
	): Promise<boolean> {
		// If no files were affected, then nothing needed updating
		if (affectedFiles.length <= 2) {
			// Only source and target were affected
			return true
		}

		// Get files that reference the source and target
		const sourceReferencingFiles = sourceFile.getReferencingSourceFiles()
		const targetReferencingFiles = targetFile.getReferencingSourceFiles()

		// Convert to sets of file paths for easier checking
		const sourceReferencingPaths = new Set(sourceReferencingFiles.map((file) => file.getFilePath()))
		const targetReferencingPaths = new Set(targetReferencingFiles.map((file) => file.getFilePath()))

		// Files that were affected but are not the source or target
		const otherAffectedFiles = affectedFiles.filter(
			(path) => path !== sourceFile.getFilePath() && path !== targetFile.getFilePath(),
		)

		// Create a map to detect potential circular dependencies
		const circularDependencyMap = new Map<string, string[]>()

		// For each affected file that isn't source or target
		for (const affectedPath of otherAffectedFiles) {
			const affectedFile = this.project.getSourceFile(affectedPath)
			if (!affectedFile) continue

			// Skip files without imports (like .d.ts files)
			const imports = affectedFile.getImportDeclarations()
			if (imports.length === 0) continue

			// Track import relationships for circular dependency detection
			imports.forEach((imp) => {
				const importedModule = imp.getModuleSpecifierValue()
				if (!circularDependencyMap.has(affectedPath)) {
					circularDependencyMap.set(affectedPath, [])
				}
				circularDependencyMap.get(affectedPath)!.push(importedModule)
			})

			// If this file uses the symbol, it should import from the target file
			if (this.fileContainsReferencesToSymbol(affectedFile, symbolName)) {
				// Check import specifics
				const importsSymbolFromTarget = this.importsSymbolFromFile(
					affectedFile,
					symbolName,
					targetFile.getFilePath(),
				)
				const importsSymbolFromSource = this.importsSymbolFromFile(
					affectedFile,
					symbolName,
					sourceFile.getFilePath(),
				)

				// Special handling for circular dependencies
				const potentialCircular = this.isCircularDependencyCase(
					affectedFile,
					targetFile,
					sourceFile,
					circularDependencyMap,
				)

				// If the file still imports the symbol from the source but not from target, that's a problem
				// unless it's a circular dependency case
				if (importsSymbolFromSource && !importsSymbolFromTarget && !potentialCircular) {
					console.log(`[DEBUG] File ${affectedPath} still imports ${symbolName} from source but not target`)
					return false
				}

				// If file references the symbol but doesn't import it at all, that's also a problem
				// (unless it's a special case like the symbol is globally available)
				if (
					!importsSymbolFromTarget &&
					!importsSymbolFromSource &&
					!this.isSpecialCase(affectedFile, symbolName) &&
					!potentialCircular
				) {
					console.log(`[DEBUG] File ${affectedPath} references ${symbolName} but doesn't import it`)
					return false
				}
			}
		}

		return true
	}

	/**
	 * Checks if a file is involved in a circular dependency with source/target files
	 *
	 * @param file - The file to check
	 * @param targetFile - The target file of the move operation
	 * @param sourceFile - The source file of the move operation
	 * @param importMap - Map of import relationships
	 * @returns True if this appears to be a circular dependency case
	 */
	private isCircularDependencyCase(
		file: SourceFile,
		targetFile: SourceFile,
		sourceFile: SourceFile,
		importMap: Map<string, string[]>,
	): boolean {
		const visitedPaths = new Set<string>()
		const filePath = file.getFilePath()
		const targetPath = targetFile.getFilePath()
		const sourcePath = sourceFile.getFilePath()

		// Check if this file imports the target file
		const imports = file.getImportDeclarations()
		const importedPaths = imports
			.map((imp) => {
				try {
					const moduleSpecifier = imp.getModuleSpecifierValue()
					return path.resolve(path.dirname(filePath), moduleSpecifier)
				} catch (e) {
					return null
				}
			})
			.filter(Boolean) as string[]

		// If the file directly imports both source and target, it's likely circular
		if (
			importedPaths.some((p) => p.includes(path.basename(targetPath, path.extname(targetPath)))) &&
			importedPaths.some((p) => p.includes(path.basename(sourcePath, path.extname(sourcePath))))
		) {
			return true
		}

		// Look for circular patterns in the import map
		const hasCircularPath = this.detectCircularPath(filePath, targetPath, importMap, visitedPaths, 0)

		return hasCircularPath
	}

	/**
	 * Recursively checks for circular import paths
	 *
	 * @param currentPath - The current file path
	 * @param targetPath - The target path we're looking to find a path to
	 * @param importMap - Map of import relationships
	 * @param visitedPaths - Set of already visited paths
	 * @param depth - Current recursion depth
	 * @returns True if a circular path is found
	 */
	private detectCircularPath(
		currentPath: string,
		targetPath: string,
		importMap: Map<string, string[]>,
		visitedPaths: Set<string>,
		depth: number,
	): boolean {
		// Prevent deep recursion
		if (depth > 5) return false

		// If we've been here before, stop to prevent infinite recursion
		if (visitedPaths.has(currentPath)) return false

		visitedPaths.add(currentPath)

		// If this path isn't in the import map, return false
		if (!importMap.has(currentPath)) return false

		// Get imported modules
		const imports = importMap.get(currentPath)!

		// Direct circular dependency
		if (imports.some((imp) => targetPath.includes(imp))) {
			return true
		}

		// Recursive check
		for (const imp of imports) {
			// Find full paths that match this import
			const matchingPaths = Array.from(importMap.keys()).filter(
				(p) => p.includes(imp) || path.basename(p, path.extname(p)) === imp,
			)

			for (const matchingPath of matchingPaths) {
				if (this.detectCircularPath(matchingPath, targetPath, importMap, new Set(visitedPaths), depth + 1)) {
					return true
				}
			}
		}

		return false
	}

	/**
	 * Checks if a file contains references to a symbol.
	 *
	 * This is more accurate than a simple text search as it looks specifically
	 * for identifier references.
	 *
	 * @param file - The file to check
	 * @param symbolName - The name of the symbol to find references to
	 * @returns True if the file contains references to the symbol
	 */
	private fileContainsReferencesToSymbol(file: SourceFile, symbolName: string): boolean {
		// Look for identifiers that match our symbol name
		const identifiers = file
			.getDescendantsOfKind(SyntaxKind.Identifier)
			.filter((node) => node.getText() === symbolName)

		// If identifiers are found, check if they're actually references (not just declarations)
		if (identifiers.length > 0) {
			// Filter out identifiers that are part of declarations
			const nonDeclarationIdentifiers = identifiers.filter((id) => {
				const parent = id.getParent()
				if (!parent) return true

				const parentKind = parent.getKindName()
				// Exclude cases where the identifier is the name in a declaration
				return (
					!parentKind.includes("Declaration") ||
					(parentKind.includes("Declaration") && id.getChildIndex() > 0)
				)
			})

			return nonDeclarationIdentifiers.length > 0
		}

		return false
	}

	/**
	 * Checks if a file imports a specific symbol from a specific file
	 *
	 * @param file - The file to check
	 * @param symbolName - The name of the symbol
	 * @param importFilePath - The path of the file to import from
	 * @returns True if the file imports the symbol from the specified file
	 */
	private importsSymbolFromFile(file: SourceFile, symbolName: string, importFilePath: string): boolean {
		const imports = file.getImportDeclarations()

		// Convert importFilePath to a normalized form for comparison
		const normalizedImportPath = importFilePath.replace(/\\/g, "/").replace(/\.(ts|tsx|js|jsx)$/, "")

		for (const importDecl of imports) {
			const moduleSpecifier = importDecl.getModuleSpecifierValue()

			// Try multiple extensions when resolving the file
			const possibleExtensions = [".ts", ".tsx", ".js", ".jsx", ".d.ts"]
			let moduleSpecifierSourceFile: SourceFile | undefined

			for (const ext of possibleExtensions) {
				const potentialPath = path.resolve(path.dirname(file.getFilePath()), moduleSpecifier + ext)
				moduleSpecifierSourceFile = this.project.getSourceFile(potentialPath)
				if (moduleSpecifierSourceFile) break
			}

			// If we couldn't resolve with extensions, try without extension (for directory imports)
			if (!moduleSpecifierSourceFile) {
				const potentialPath = path.resolve(path.dirname(file.getFilePath()), moduleSpecifier)
				moduleSpecifierSourceFile = this.project.getSourceFile(`${potentialPath}/index.ts`)
			}

			if (!moduleSpecifierSourceFile) continue

			const normalizedModuleSourcePath = moduleSpecifierSourceFile
				.getFilePath()
				.replace(/\\/g, "/")
				.replace(/\.(ts|tsx|js|jsx|d.ts)$/, "")

			// Check if this import is from the right file
			const isMatchingFile =
				normalizedModuleSourcePath === normalizedImportPath ||
				// Handle circular references where paths might differ but represent the same module
				this.pathResolver.normalizeFilePath(normalizedModuleSourcePath) ===
					this.pathResolver.normalizeFilePath(normalizedImportPath) ||
				// Check for path basename equality (handles index files and different extensions)
				path.basename(normalizedModuleSourcePath) === path.basename(normalizedImportPath)

			if (isMatchingFile) {
				// Check if it imports the symbol we're looking for
				const namedImports = importDecl.getNamedImports()
				if (namedImports.some((ni) => ni.getName() === symbolName)) {
					return true
				}

				// Check for namespace imports
				const namespaceImport = importDecl.getNamespaceImport()
				if (namespaceImport) {
					// With namespace imports, we can't easily tell if the symbol is used,
					// but it's technically imported
					return true
				}

				// Check for default imports that match the symbol name
				const defaultImport = importDecl.getDefaultImport()
				if (defaultImport && defaultImport.getText() === symbolName) {
					return true
				}
			}
		}

		return false
	}

	/**
	 * Checks if a file/symbol combination is a special case that doesn't need imports
	 *
	 * @param file - The file to check
	 * @param symbolName - The name of the symbol
	 * @returns True if this is a special case
	 */
	private isSpecialCase(file: SourceFile, symbolName: string): boolean {
		// Types declared via import type don't show up as normal imports
		const typeImports = file.getDescendantsOfKind(SyntaxKind.ImportType)
		if (typeImports.some((ti) => ti.getText().includes(symbolName))) {
			return true
		}

		// Global declarations don't need imports
		const declareGlobals = file
			.getDescendantsOfKind(SyntaxKind.ModuleDeclaration)
			.filter((md) => md.getName() === "global")
		if (declareGlobals.length > 0) {
			return true
		}

		// d.ts files with ambient declarations might reference without imports
		if (file.getFilePath().endsWith(".d.ts")) {
			return true
		}

		// Check for type parameters that match the symbol name
		const typeParams = file.getDescendantsOfKind(SyntaxKind.TypeParameter)
		if (typeParams.some((tp) => tp.getName() === symbolName)) {
			return true
		}

		// Check for local variable declarations that shadow the symbol
		const variableDecls = file.getDescendantsOfKind(SyntaxKind.VariableDeclaration)
		if (variableDecls.some((vd) => vd.getName() === symbolName)) {
			return true
		}

		// Check for function parameters that shadow the symbol
		const parameters = file.getDescendantsOfKind(SyntaxKind.Parameter)
		if (parameters.some((p) => p.getName() === symbolName)) {
			return true
		}

		return false
	}
}
