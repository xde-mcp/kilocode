import { Node, SourceFile, SyntaxKind } from "ts-morph"
import { RemovalResult, ResolvedSymbol } from "./types"

/**
 * Responsible for safely removing symbols from source files
 */
export class SymbolRemover {
	/**
	 * Remove a symbol using multiple strategies, from least to most aggressive
	 * Replaces: Symbol removal logic in remove operation and forceRemoveSymbol in move
	 */
	async removeSymbol(symbol: ResolvedSymbol): Promise<RemovalResult> {
		const node = symbol.node
		const sourceFile = node.getSourceFile()

		// Try standard removal first
		const standardResult = await this.removeWithStandardStrategy(node, sourceFile)
		if (standardResult.success) {
			return standardResult
		}

		// If standard removal fails, try aggressive removal
		const aggressiveResult = await this.removeWithAggressiveStrategy(node, sourceFile)
		if (aggressiveResult.success) {
			return aggressiveResult
		}

		// If aggressive removal fails, try manual text-based removal
		const manualResult = await this.removeWithManualStrategy(symbol.name, sourceFile)
		if (manualResult.success) {
			return manualResult
		}

		// All strategies failed
		return {
			success: false,
			method: "failed",
			error: `Failed to remove symbol '${symbol.name}' using all available strategies`,
			symbolStillExists: true,
		}
	}

	/**
	 * Directly applies the aggressive removal strategy for the given symbol
	 * Used when standard removal fails and we want to try a more forceful approach
	 */
	async removeSymbolAggressively(symbol: ResolvedSymbol): Promise<RemovalResult> {
		const node = symbol.node
		const sourceFile = node.getSourceFile()
		return this.removeWithAggressiveStrategy(node, sourceFile)
	}

	/**
	 * Directly applies the manual text-based removal strategy for the given symbol
	 * Used as a last resort when other strategies fail
	 */
	async removeSymbolManually(symbol: ResolvedSymbol): Promise<RemovalResult> {
		const node = symbol.node
		const sourceFile = node.getSourceFile()
		return this.removeWithManualStrategy(symbol.name, sourceFile)
	}

	/**
	 * Standard removal strategy using ts-morph's built-in remove methods
	 */
	private async removeWithStandardStrategy(node: Node, sourceFile: SourceFile): Promise<RemovalResult> {
		try {
			if (Node.isVariableDeclaration(node)) {
				// For variable declarations, check if it's the only one in its statement
				const statement = node.getParent()?.getParent()
				if (statement && Node.isVariableStatement(statement)) {
					const declarations = statement.getDeclarations()
					if (declarations.length === 1) {
						// Remove the entire statement
						statement.remove()
					} else {
						// Remove just this declaration
						node.remove()
					}
				} else {
					node.remove()
				}
			} else if (
				Node.isClassDeclaration(node) ||
				Node.isFunctionDeclaration(node) ||
				Node.isInterfaceDeclaration(node) ||
				Node.isTypeAliasDeclaration(node) ||
				Node.isEnumDeclaration(node)
			) {
				// For declarations that have a remove method
				node.remove()
			} else {
				// For other node types, try to find the parent statement and remove it
				const statement = node.getParentWhile((parent) => !Node.isStatement(parent))
				if (statement && "remove" in statement && typeof statement.remove === "function") {
					statement.remove()
				} else {
					throw new Error(`Unable to remove node of kind ${node.getKindName()}: no remove method available`)
				}
			}

			// Save the file immediately to ensure changes are applied
			sourceFile.saveSync()

			// Verify the removal was successful
			const symbolName =
				node instanceof Node && "getName" in node && typeof node.getName === "function" ? node.getName() : ""

			const symbolStillExists = this.checkIfSymbolExists(symbolName, sourceFile)

			return {
				success: !symbolStillExists,
				method: "standard",
				symbolStillExists,
			}
		} catch (error) {
			return {
				success: false,
				method: "standard",
				error: `Standard removal failed: ${(error as Error).message}`,
				symbolStillExists: true,
			}
		}
	}

	/**
	 * Aggressive removal strategy using more forceful node manipulation
	 */
	private async removeWithAggressiveStrategy(node: Node, sourceFile: SourceFile): Promise<RemovalResult> {
		try {
			const symbolName =
				node instanceof Node && "getName" in node && typeof node.getName === "function" ? node.getName() : ""

			// Try different removal approaches based on node type
			if (Node.isFunctionDeclaration(node)) {
				// Find all functions with this name and remove them
				const functions = sourceFile.getFunctions().filter((f) => f.getName() === symbolName)
				let removed = false

				for (const func of functions) {
					try {
						func.remove()
						removed = true
					} catch (e) {
						console.error(`[ERROR] Failed to remove function: ${(e as Error).message}`)
					}
				}

				if (!removed) {
					return {
						success: false,
						method: "aggressive",
						error: `Failed to remove any functions named '${symbolName}'`,
						symbolStillExists: true,
					}
				}
			} else if (Node.isClassDeclaration(node)) {
				// Find all classes with this name and remove them
				const classes = sourceFile.getClasses().filter((c) => c.getName() === symbolName)
				let removed = false

				for (const cls of classes) {
					try {
						cls.remove()
						removed = true
					} catch (e) {
						console.error(`[ERROR] Failed to remove class: ${(e as Error).message}`)
					}
				}

				if (!removed) {
					return {
						success: false,
						method: "aggressive",
						error: `Failed to remove any classes named '${symbolName}'`,
						symbolStillExists: true,
					}
				}
			} else if (Node.isInterfaceDeclaration(node)) {
				// Find all interfaces with this name and remove them
				const interfaces = sourceFile.getInterfaces().filter((i) => i.getName() === symbolName)
				let removed = false

				for (const iface of interfaces) {
					try {
						iface.remove()
						removed = true
					} catch (e) {
						console.error(`[ERROR] Failed to remove interface: ${(e as Error).message}`)
					}
				}

				if (!removed) {
					return {
						success: false,
						method: "aggressive",
						error: `Failed to remove any interfaces named '${symbolName}'`,
						symbolStillExists: true,
					}
				}
			} else if (Node.isTypeAliasDeclaration(node)) {
				// Find all type aliases with this name and remove them
				const typeAliases = sourceFile.getTypeAliases().filter((t) => t.getName() === symbolName)
				let removed = false

				for (const typeAlias of typeAliases) {
					try {
						typeAlias.remove()
						removed = true
					} catch (e) {
						console.error(`[ERROR] Failed to remove type alias: ${(e as Error).message}`)
					}
				}

				if (!removed) {
					return {
						success: false,
						method: "aggressive",
						error: `Failed to remove any type aliases named '${symbolName}'`,
						symbolStillExists: true,
					}
				}
			} else if (Node.isVariableDeclaration(node)) {
				// Find all variable declarations with this name and remove them
				const variables = sourceFile.getVariableDeclarations().filter((v) => v.getName() === symbolName)
				let removed = false

				for (const variable of variables) {
					try {
						// For variable declarations, check if it's the only one in its statement
						const statement = variable.getParent()?.getParent()
						if (statement && Node.isVariableStatement(statement)) {
							const declarations = statement.getDeclarations()
							if (declarations.length === 1) {
								// Remove the entire statement
								statement.remove()
							} else {
								// Remove just this declaration
								variable.remove()
							}
						} else {
							variable.remove()
						}
						removed = true
					} catch (e) {
						console.error(`[ERROR] Failed to remove variable: ${(e as Error).message}`)
					}
				}

				if (!removed) {
					return {
						success: false,
						method: "aggressive",
						error: `Failed to remove any variables named '${symbolName}'`,
						symbolStillExists: true,
					}
				}
			}

			// Save the file immediately to ensure changes are applied
			sourceFile.saveSync()

			// Verify the removal was successful
			const symbolStillExists = this.checkIfSymbolExists(symbolName, sourceFile)

			return {
				success: !symbolStillExists,
				method: "aggressive",
				symbolStillExists,
			}
		} catch (error) {
			return {
				success: false,
				method: "aggressive",
				error: `Aggressive removal failed: ${(error as Error).message}`,
				symbolStillExists: true,
			}
		}
	}

	/**
	 * Manual text-based removal strategy as a last resort
	 */
	private async removeWithManualStrategy(symbolName: string, sourceFile: SourceFile): Promise<RemovalResult> {
		try {
			const fullText = sourceFile.getFullText()
			const regex = new RegExp(
				`(export)?\\s*(function|const|let|class|interface|type|enum)\\s+${symbolName}\\s*[\\(\\{\\:]`,
				"g",
			)

			if (regex.test(fullText)) {
				// Find the declaration in the source text
				const match = regex.exec(fullText)
				if (match) {
					// Simple approach to remove the symbol
					const lines = fullText.split("\n")
					const newLines = []
					let skip = false
					let braceCount = 0

					for (let i = 0; i < lines.length; i++) {
						const line = lines[i]

						// If this line contains the start of the symbol declaration
						if (!skip && line.includes(match[0])) {
							skip = true
							braceCount = 0

							// Count opening braces in this line
							for (const char of line) {
								if (char === "{") braceCount++
								if (char === "}") braceCount--
							}

							continue
						}

						// If we're skipping, track braces to find the end of the function/block
						if (skip) {
							for (const char of line) {
								if (char === "{") braceCount++
								if (char === "}") braceCount--
							}

							// If we've found the closing brace or a semicolon at the end (for variable declarations)
							if ((braceCount <= 0 && line.includes("}")) || line.trim().endsWith(";")) {
								skip = false
								continue
							}
						}

						// Add the line if we're not skipping
						if (!skip) {
							newLines.push(line)
						}
					}

					// Write the modified content back to the file
					const newText = newLines.join("\n")
					sourceFile.replaceWithText(newText)
					sourceFile.saveSync()

					// Verify the removal was successful
					const symbolStillExists = this.checkIfSymbolExists(symbolName, sourceFile)

					return {
						success: !symbolStillExists,
						method: "manual",
						symbolStillExists,
					}
				}
			}

			return {
				success: false,
				method: "manual",
				error: `Symbol '${symbolName}' declaration pattern not found`,
				symbolStillExists: true,
			}
		} catch (error) {
			return {
				success: false,
				method: "manual",
				error: `Manual removal failed: ${(error as Error).message}`,
				symbolStillExists: true,
			}
		}
	}

	/**
	 * Check if a symbol still exists in the source file
	 */
	private checkIfSymbolExists(symbolName: string, sourceFile: SourceFile): boolean {
		// Check for function declarations
		if (sourceFile.getFunction(symbolName)) {
			return true
		}

		// Check for class declarations
		if (sourceFile.getClass(symbolName)) {
			return true
		}

		// Check for interface declarations
		if (sourceFile.getInterface(symbolName)) {
			return true
		}

		// Check for type alias declarations
		if (sourceFile.getTypeAlias(symbolName)) {
			return true
		}

		// Check for enum declarations
		if (sourceFile.getEnum(symbolName)) {
			return true
		}

		// Check for variable declarations
		if (sourceFile.getVariableDeclaration(symbolName)) {
			return true
		}

		// Check using regex (as a fallback)
		const fullText = sourceFile.getFullText()
		const functionRegex = new RegExp(`function\\s+${symbolName}\\s*\\(`, "g")
		const classRegex = new RegExp(`class\\s+${symbolName}(\\s|\\{)`, "g")
		const interfaceRegex = new RegExp(`interface\\s+${symbolName}(\\s|\\{)`, "g")
		const typeRegex = new RegExp(`type\\s+${symbolName}(\\s|=)`, "g")
		const varRegex = new RegExp(`(const|let|var)\\s+${symbolName}\\s*=`, "g")

		return (
			functionRegex.test(fullText) ||
			classRegex.test(fullText) ||
			interfaceRegex.test(fullText) ||
			typeRegex.test(fullText) ||
			varRegex.test(fullText)
		)
	}
}
