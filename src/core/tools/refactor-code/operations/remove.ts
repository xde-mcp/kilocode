import { Project, Node, SyntaxKind } from "ts-morph"
import { RemoveOperation } from "../schema"
import { SymbolFinder } from "../utils/symbol-finder"
import { OperationResult } from "../engine"
import * as path from "path"
import * as fsSync from "fs"
import { resolveFilePath } from "../utils/file-system"

/**
 * Executes a REMOVE refactoring operation
 *
 * This operation finds a symbol by its name and removes it, along with any export
 * declarations referring to it.
 */
export async function executeRemoveOperation(
	project: Project,
	operation: RemoveOperation,
): Promise<Partial<OperationResult>> {
	// Track affected files (starting with the file containing the symbol)
	const affectedFiles = new Set<string>([operation.selector.filePath])

	try {
		// Get project root path for file resolution
		const projectRoot = project.getCompilerOptions().rootDir || process.cwd()

		// Get source file
		// Normalize file paths for consistent handling
		const normalizedSourcePath = operation.selector.filePath.replace(/\\/g, "/")
		let sourceFile = project.getSourceFile(normalizedSourcePath)

		// If the file wasn't found in the project, check if it exists on disk
		if (!sourceFile) {
			// Try multiple approaches to resolve the file path
			const absoluteSourcePath = resolveFilePath(normalizedSourcePath, projectRoot)
			const originalPath = operation.selector.filePath
			const relativePath = path.isAbsolute(normalizedSourcePath)
				? path.relative(projectRoot, normalizedSourcePath)
				: normalizedSourcePath

			console.log(`[DEBUG] Source file not found in project. Checking disk: ${absoluteSourcePath}`)
			console.log(`[DEBUG] Original path: ${originalPath}`)
			console.log(`[DEBUG] Relative path: ${relativePath}`)
			console.log(`[DEBUG] File exists on disk (absolute): ${fsSync.existsSync(absoluteSourcePath)}`)
			console.log(`[DEBUG] File exists on disk (original): ${fsSync.existsSync(originalPath)}`)
			console.log(`[DEBUG] File exists on disk (relative): ${fsSync.existsSync(relativePath)}`)

			// Try to read the file content directly to verify it exists and is accessible
			try {
				const fileContent = fsSync.readFileSync(absoluteSourcePath, "utf8")
				console.log(`[DEBUG] Successfully read file content, size: ${fileContent.length} bytes`)
			} catch (readError) {
				console.log(`[DEBUG] Error reading file: ${(readError as Error).message}`)
			}

			// Check if the file exists on disk with more thorough checks
			if (
				fsSync.existsSync(absoluteSourcePath) ||
				fsSync.existsSync(originalPath) ||
				fsSync.existsSync(relativePath)
			) {
				// Try multiple approaches to add the file to the project
				// Try multiple approaches to add the file to the project
				const pathsToTry = [
					{ path: normalizedSourcePath, description: "normalized path" },
					{ path: absoluteSourcePath, description: "absolute path" },
					{ path: operation.selector.filePath, description: "original path" },
					{
						path: path.isAbsolute(normalizedSourcePath)
							? path.relative(projectRoot, normalizedSourcePath)
							: normalizedSourcePath,
						description: "relative path",
					},
				]

				// Try each path in sequence
				for (const { path: pathToTry, description } of pathsToTry) {
					try {
						sourceFile = project.addSourceFileAtPath(pathToTry)
						console.log(`[DEBUG] Added source file using ${description}: ${pathToTry}`)
						break // Exit the loop if successful
					} catch (error) {
						console.log(`[DEBUG] Failed to add with ${description}: ${(error as Error).message}`)
					}
				}

				// If all attempts failed, try creating the file from scratch
				if (!sourceFile) {
					try {
						sourceFile = project.createSourceFile(normalizedSourcePath, "", {
							overwrite: false,
						})
						console.log(`[DEBUG] Created source file in project: ${normalizedSourcePath}`)
					} catch (error) {
						console.log(`[WARNING] Failed to create source file: ${(error as Error).message}`)
					}
				}
			} else {
				console.log(`[WARNING] File does not exist on disk: ${absoluteSourcePath}`)
				// Try to find the file with a case-insensitive search
				try {
					const dirPath = path.dirname(absoluteSourcePath)
					if (fsSync.existsSync(dirPath)) {
						const files = fsSync.readdirSync(path.dirname(absoluteSourcePath))
						const fileName = path.basename(absoluteSourcePath)
						const matchingFile = files.find((file) => file.toLowerCase() === fileName.toLowerCase())

						if (matchingFile) {
							const correctCasePath = path.join(path.dirname(absoluteSourcePath), matchingFile)
							console.log(`[DEBUG] Found file with different case: ${correctCasePath}`)
							sourceFile = project.addSourceFileAtPath(correctCasePath)
							console.log(`[DEBUG] Added source file with correct case: ${correctCasePath}`)
						}
					}
				} catch (e) {
					console.log(`[WARNING] Case-insensitive search failed: ${(e as Error).message}`)
				}
			}

			// If still not found, return error with detailed diagnostics
			if (!sourceFile) {
				// Gather detailed diagnostics for better error reporting
				const diagnostics = {
					originalPath: {
						path: originalPath,
						exists: fsSync.existsSync(originalPath),
						isAbsolute: path.isAbsolute(originalPath),
					},
					absolutePath: {
						path: absoluteSourcePath,
						exists: fsSync.existsSync(absoluteSourcePath),
					},
					relativePath: {
						path: relativePath,
						exists: fsSync.existsSync(relativePath),
					},
					projectRoot: projectRoot,
				}

				return {
					success: false,
					operation,
					error: `Source file not found: ${operation.selector.filePath}. Tried multiple paths but none were found in the project. Diagnostics: ${JSON.stringify(diagnostics)}`,
					affectedFiles: [],
				}
			}
		}

		// Load potential reference files in the project directory
		// This is critical for finding cross-file references, but we need to be selective
		const DEBUG_FILE_LOADING = false // Set to true for detailed debugging output

		if (DEBUG_FILE_LOADING) console.log(`[DEBUG] Loading potentially related TypeScript files...`)
		const startTime = performance.now()
		try {
			// Get the directory of the source file
			const sourceDir = path.dirname(resolveFilePath(normalizedSourcePath, projectRoot))

			// Create optimized glob patterns that exclude unnecessary directories
			// This significantly improves performance by reducing the number of files loaded
			const includePatterns = [
				// Include the specific file we're operating on
				operation.selector.filePath,
				// Include files in the same directory (most likely to have references)
				`${path.dirname(operation.selector.filePath)}/*.ts`,
				// Include files in the source directory and immediate subdirectories (limited depth)
				`${sourceDir}/*.ts`,
				`${sourceDir}/*/*.ts`,
				// Include core project files that might have references
				`${projectRoot}/core/**/*.ts`,
			]

			const excludePatterns = [
				// Exclude common directories that won't have relevant references
				`!${projectRoot}/**/node_modules/**/*.ts`,
				`!${projectRoot}/**/dist/**/*.ts`,
				`!${projectRoot}/**/.git/**/*.ts`,
				`!${projectRoot}/**/build/**/*.ts`,
				`!${projectRoot}/**/coverage/**/*.ts`,
				`!${projectRoot}/**/.vscode/**/*.ts`,
				`!${projectRoot}/**/test-results/**/*.ts`,
				`!${projectRoot}/**/temp/**/*.ts`,
				`!${projectRoot}/**/tmp/**/*.ts`,
			]

			// Combine include and exclude patterns
			const globPatterns = [...includePatterns, ...excludePatterns]

			if (DEBUG_FILE_LOADING) {
				// Count files that would be matched without exclusions (for debugging)
				const allFilesCount = project
					.getFileSystem()
					.globSync([`${sourceDir}/**/*.ts`, `${projectRoot}/**/*.ts`]).length

				console.log(`[DEBUG] Without exclusions, would load ${allFilesCount} files`)
				console.log(`[DEBUG] Using glob patterns:`, globPatterns)
			}

			// Load TypeScript files in the project that might reference this file
			const projectFiles = project.addSourceFilesAtPaths(globPatterns)

			const endTime = performance.now()
			const loadTime = (endTime - startTime).toFixed(2)

			if (DEBUG_FILE_LOADING) {
				console.log(
					`[DEBUG] Loaded ${projectFiles.length} potential reference files into project (took ${loadTime}ms)`,
				)

				// Log some sample paths to verify what's being loaded
				if (projectFiles.length > 0) {
					const sampleSize = Math.min(5, projectFiles.length)
					console.log(`[DEBUG] Sample of loaded files:`)
					for (let i = 0; i < sampleSize; i++) {
						console.log(`  - ${projectFiles[i].getFilePath()}`)
					}
				}
			}
		} catch (error) {
			console.log(`[DEBUG] Error loading reference files: ${(error as Error).message}`)
			// Continue even if some files couldn't be loaded
		}

		// Find the symbol
		const finder = new SymbolFinder(sourceFile)
		const symbol = finder.findSymbol(operation.selector)

		if (!symbol) {
			console.log(`[DEBUG] Symbol '${operation.selector.name}' not found in ${operation.selector.filePath}`)
			return {
				success: false,
				operation,
				error: `Symbol '${operation.selector.name}' not found in ${operation.selector.filePath}`,
				affectedFiles: [],
			}
		}

		// The symbol's file is already tracked in the affectedFiles set initialized at the top

		// Check if symbol is exported
		const isExported = finder.isExported(symbol)

		// Store the original text of the symbol for undo operation
		const originalText = symbol.getText()
		const originalPosition = symbol.getPos()

		// Check if symbol is removable before proceeding
		const isRemovable =
			Node.isFunctionDeclaration(symbol) ||
			Node.isClassDeclaration(symbol) ||
			Node.isInterfaceDeclaration(symbol) ||
			Node.isTypeAliasDeclaration(symbol) ||
			Node.isEnumDeclaration(symbol) ||
			Node.isMethodDeclaration(symbol) ||
			Node.isPropertyDeclaration(symbol) ||
			Node.isExportSpecifier(symbol) ||
			Node.isVariableDeclaration(symbol)

		if (!isRemovable) {
			return {
				success: false,
				operation,
				error: `Symbol '${operation.selector.name}' cannot be removed (unsupported symbol type)`,
				affectedFiles: [],
			}
		}

		// Check for references to this symbol in other files
		if (Node.isReferenceFindable(symbol)) {
			const references = symbol.findReferencesAsNodes()

			// Filter out references in the same file and the declaration itself
			const externalReferences = references.filter((ref) => {
				// Skip the declaration itself
				if (ref === symbol) return false

				// Skip references in the same file
				if (ref.getSourceFile().getFilePath() === sourceFile.getFilePath()) {
					// But only if they're not in other symbols (like function calls)
					const isInDeclaration =
						ref.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration) === symbol ||
						ref.getFirstAncestorByKind(SyntaxKind.ClassDeclaration) === symbol ||
						ref.getFirstAncestorByKind(SyntaxKind.InterfaceDeclaration) === symbol ||
						ref.getFirstAncestorByKind(SyntaxKind.TypeAliasDeclaration) === symbol ||
						ref.getFirstAncestorByKind(SyntaxKind.EnumDeclaration) === symbol ||
						ref.getFirstAncestorByKind(SyntaxKind.MethodDeclaration) === symbol ||
						ref.getFirstAncestorByKind(SyntaxKind.PropertyDeclaration) === symbol ||
						ref.getFirstAncestorByKind(SyntaxKind.VariableDeclaration) === symbol

					// Also skip references in export declarations in the same file
					// This allows removing symbols that are only referenced in their own export statements
					const isInExportDeclaration = ref.getFirstAncestorByKind(SyntaxKind.ExportDeclaration) !== undefined

					return !isInDeclaration && !isInExportDeclaration
				}

				return true
			})

			if (externalReferences.length > 0) {
				// Get the list of files with references
				const referencingFiles = [
					...new Set(externalReferences.map((ref) => ref.getSourceFile().getFilePath())),
				]

				return {
					success: false,
					operation,
					error: `Cannot remove '${operation.selector.name}' because it is referenced in ${externalReferences.length} locations across ${referencingFiles.length} files: ${referencingFiles.join(", ")}`,
					affectedFiles: [],
				}
			}
		}

		// Handle exported variable declarations first to determine removal approach
		let skipStandardRemoval = false

		if (Node.isVariableDeclaration(symbol)) {
			const statement = symbol.getParent()?.getParent()
			if (statement && Node.isVariableStatement(statement) && statement.isExported()) {
				// For exported variables, we need to remove the whole statement
				statement.remove()
				skipStandardRemoval = true
			}
		}

		// Handle named exports like: export { symbol, ... }
		if (!skipStandardRemoval) {
			const exportDeclarations = sourceFile.getExportDeclarations()
			for (const exportDecl of exportDeclarations) {
				const namedExports = exportDecl.getNamedExports()

				// Find all exports of this symbol
				const exportsToRemove = namedExports.filter((exp) => exp.getName() === operation.selector.name)

				if (exportsToRemove.length > 0) {
					// If this would leave the export declaration empty, remove the whole declaration
					if (namedExports.length === exportsToRemove.length) {
						exportDecl.remove()
					} else {
						// Otherwise, remove just the specific export specifiers
						for (const exp of exportsToRemove) {
							exp.remove()
						}
					}
				}
			}
		}

		// Now remove the symbol itself if we haven't already handled it as an exported variable
		let removalSuccessful = false
		if (!skipStandardRemoval) {
			try {
				if (Node.isVariableDeclaration(symbol)) {
					// For variable declarations, we may need to handle the parent statement
					const statement = symbol.getParent()?.getParent()
					if (statement && Node.isVariableStatement(statement)) {
						// If this is the only variable in the statement, remove the whole statement
						if (statement.getDeclarations().length === 1) {
							statement.remove()
						} else {
							// Otherwise, just remove this declaration
							symbol.remove()
						}
					}
				} else {
					// Handle all other types of nodes
					symbol.remove()
				}

				// Save the source file immediately to ensure changes are applied
				sourceFile.saveSync()
				removalSuccessful = true
			} catch (error) {
				console.error(`[ERROR] Standard removal failed: ${(error as Error).message}`)
			}
		} else {
			removalSuccessful = true // If we skipped standard removal, consider it successful
		}

		// If standard removal failed, use a more aggressive approach
		if (!removalSuccessful) {
			console.log(`[DEBUG] Attempting aggressive removal for symbol '${operation.selector.name}'`)

			// Try a more aggressive approach for different node types
			try {
				// For functions
				const functions = sourceFile.getFunctions().filter((f) => f.getName() === operation.selector.name)
				for (const func of functions) {
					func.remove()
					console.log(`[DEBUG] Removed function declaration for ${operation.selector.name}`)
					removalSuccessful = true
				}

				// For classes
				const classes = sourceFile.getClasses().filter((c) => c.getName() === operation.selector.name)
				for (const cls of classes) {
					cls.remove()
					console.log(`[DEBUG] Removed class declaration for ${operation.selector.name}`)
					removalSuccessful = true
				}

				// For interfaces
				const interfaces = sourceFile.getInterfaces().filter((i) => i.getName() === operation.selector.name)
				for (const iface of interfaces) {
					iface.remove()
					console.log(`[DEBUG] Removed interface declaration for ${operation.selector.name}`)
					removalSuccessful = true
				}

				// For variables
				const variables = sourceFile
					.getVariableDeclarations()
					.filter((v) => v.getName() === operation.selector.name)
				for (const variable of variables) {
					const statement = variable.getParent()?.getParent()
					if (statement && Node.isVariableStatement(statement)) {
						if (statement.getDeclarations().length === 1) {
							statement.remove()
						} else {
							variable.remove()
						}
					}
					console.log(`[DEBUG] Removed variable declaration for ${operation.selector.name}`)
					removalSuccessful = true
				}

				// Save the file again after aggressive removal
				sourceFile.saveSync()
			} catch (error) {
				console.error(`[ERROR] Aggressive removal failed: ${(error as Error).message}`)
			}
		}

		// If neither standard nor aggressive removal worked, try manual text manipulation
		if (!removalSuccessful) {
			console.log(`[DEBUG] Attempting manual text removal for symbol '${operation.selector.name}'`)
			try {
				const fullText = sourceFile.getFullText()
				// Create regex patterns to match various declaration types
				const patterns = [
					new RegExp(`(export\\s+)?function\\s+${operation.selector.name}\\s*\\([\\s\\S]*?\\}`, "g"),
					new RegExp(`(export\\s+)?const\\s+${operation.selector.name}\\s*=[\\s\\S]*?;`, "g"),
					new RegExp(`(export\\s+)?let\\s+${operation.selector.name}\\s*=[\\s\\S]*?;`, "g"),
					new RegExp(`(export\\s+)?class\\s+${operation.selector.name}\\s*\\{[\\s\\S]*?\\}`, "g"),
					new RegExp(`(export\\s+)?interface\\s+${operation.selector.name}\\s*\\{[\\s\\S]*?\\}`, "g"),
				]

				let newText = fullText
				for (const pattern of patterns) {
					newText = newText.replace(pattern, "")
				}

				if (newText !== fullText) {
					sourceFile.replaceWithText(newText)
					sourceFile.saveSync()
					console.log(`[DEBUG] Manual text removal successful`)
					removalSuccessful = true
				}
			} catch (error) {
				console.error(`[ERROR] Manual text removal failed: ${(error as Error).message}`)
			}
		}

		// Verify that the symbol was actually removed
		// Refresh the source file from disk first to ensure we have the latest content
		try {
			project.removeSourceFile(sourceFile)
			sourceFile = project.addSourceFileAtPath(normalizedSourcePath)
			console.log(`[DEBUG] Refreshed source file before verification`)
		} catch (error) {
			console.error(`[ERROR] Failed to refresh source file: ${(error as Error).message}`)
		}

		const symbolAfterRemoval = finder.findSymbol(operation.selector)
		if (symbolAfterRemoval) {
			// Try one more time with an even more aggressive approach
			try {
				const sourceFileContent = fsSync.readFileSync(
					resolveFilePath(normalizedSourcePath, projectRoot),
					"utf8",
				)
				const symbolPattern = new RegExp(
					`(export\\s+)?(function|const|let|class|interface|type|enum)\\s+${operation.selector.name}[\\s\\S]*?([;\\}])`,
					"g",
				)
				const modifiedContent = sourceFileContent.replace(symbolPattern, "")

				if (modifiedContent !== sourceFileContent) {
					fsSync.writeFileSync(resolveFilePath(normalizedSourcePath, projectRoot), modifiedContent)
					console.log(`[DEBUG] Final aggressive removal attempt succeeded`)
					removalSuccessful = true
				}
			} catch (error) {
				console.error(`[ERROR] Final removal attempt failed: ${(error as Error).message}`)
			}

			// Final verification
			try {
				project.removeSourceFile(sourceFile)
				sourceFile = project.addSourceFileAtPath(normalizedSourcePath)
				const finalCheck = finder.findSymbol(operation.selector)

				if (finalCheck) {
					return {
						success: false,
						operation,
						error: `Failed to remove symbol '${operation.selector.name}': Symbol still exists after multiple removal attempts`,
						affectedFiles: Array.from(affectedFiles),
					}
				}
			} catch (error) {
				console.error(`[ERROR] Final verification failed: ${(error as Error).message}`)
				return {
					success: false,
					operation,
					error: `Remove operation verification failed: ${(error as Error).message}`,
					affectedFiles: Array.from(affectedFiles),
				}
			}
		}

		return {
			success: true,
			operation,
			affectedFiles: Array.from(affectedFiles),
		}
	} catch (error) {
		const err = error as Error
		return {
			success: false,
			operation,
			error: `Remove operation failed: ${err.message}`,
			affectedFiles: Array.from(affectedFiles || []), // Include affected files even on error
		}
	}
}
