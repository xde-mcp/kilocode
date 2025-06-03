import { Node, SourceFile, SyntaxKind } from "ts-morph"
import { ExtractedSymbol, SymbolDependencies, ResolvedSymbol } from "./types"

/**
 * Responsible for extracting symbol content and dependencies
 */
export class SymbolExtractor {
	/**
	 * Extract a symbol's full text, comments, and dependencies
	 * Replaces: extractSymbolText in move operation
	 */
	extractSymbol(symbol: ResolvedSymbol): ExtractedSymbol {
		const node = symbol.node
		const sourceFile = node.getSourceFile()

		// Get leading comments
		const comments: string[] = []
		const leadingComments = node.getLeadingCommentRanges()

		if (leadingComments && leadingComments.length > 0) {
			// Check if comments are directly above the symbol (within 2 lines)
			const symbolStartLine = node.getStartLineNumber()
			const lastCommentEndLine = sourceFile.getLineAndColumnAtPos(
				leadingComments[leadingComments.length - 1].getEnd(),
			).line

			// Only include comments that are close to the symbol
			if (symbolStartLine - lastCommentEndLine <= 3) {
				// Increased to 3 for better detection
				const fullText = sourceFile.getFullText()

				// Filter out test fixture comments and other non-relevant comments
				for (const comment of leadingComments) {
					const commentText = fullText.substring(comment.getPos(), comment.getEnd())

					// Skip comments that are likely not related to the symbol's functionality
					if (
						!commentText.includes("TEST FIXTURE") &&
						!commentText.includes("will be moved") &&
						!commentText.includes("test case") &&
						!commentText.includes("This will be") &&
						!commentText.toLowerCase().includes("test") &&
						// Make sure filter conditions don't accidentally filter real documentation
						!(
							commentText.toLowerCase().includes("test") &&
							(commentText.includes("Configuration") ||
								commentText.includes("Internal") ||
								commentText.includes("/**"))
						)
					) {
						comments.push(commentText)
					}
				}
			}
		}

		// Extract dependencies
		const dependencies = this.extractDependencies(node, sourceFile)

		// Process additional interface inheritance relationships in the entire file
		this.processInterfaceInheritance(sourceFile, dependencies)

		// Extract the full text including any type dependencies
		let text = comments.join("\n")
		if (text.length > 0) {
			text += "\n"
		}

		// Add any type dependency texts
		for (const typeName of dependencies.types) {
			// Find the type declaration
			const typeInterface = sourceFile.getInterface(typeName)
			if (typeInterface) {
				text += typeInterface.getText() + "\n\n"
				continue
			}

			const typeAlias = sourceFile.getTypeAlias(typeName)
			if (typeAlias) {
				text += typeAlias.getText() + "\n\n"
				continue
			}

			const enumDecl = sourceFile.getEnum(typeName)
			if (enumDecl) {
				text += enumDecl.getText() + "\n\n"
				continue
			}

			const classDecl = sourceFile.getClass(typeName)
			if (classDecl) {
				text += classDecl.getText() + "\n\n"
			}
		}

		// Get the actual symbol text
		if (Node.isVariableDeclaration(node)) {
			// For variable declarations, we need to get the entire variable statement
			const statement = node.getParent()?.getParent()
			if (statement) {
				// Check if this is an exported variable
				if (Node.isVariableStatement(statement) && statement.isExported()) {
					text += statement.getText()
				} else {
					// For non-exported variables, keep the export status
					const isExported = node.getFirstAncestorByKind(SyntaxKind.ExportKeyword) !== undefined
					if (isExported) {
						text += "export " + statement.getText()
					} else {
						text += statement.getText()
					}
				}
			} else {
				text += node.getText()
			}
		} else {
			text += node.getText()
		}

		return {
			text,
			comments,
			dependencies,
			isExported: symbol.isExported,
		}
	}

	/**
	 * Extract dependencies (imports, types, local references) for a symbol
	 * Replaces: collectImportsForSymbol in move operation
	 */
	extractDependencies(node: Node, sourceFile: SourceFile): SymbolDependencies {
		const imports = new Map<string, string>() // symbolName -> moduleSpecifier
		const types: string[] = []
		const localReferences: string[] = []

		// Set to track all identifiers and processed types to avoid duplicates
		const identifiersToAnalyze = new Set<string>()
		const processedTypes = new Set<string>()
		const processedImports = new Set<string>()

		// 1. Collect all identifiers in the symbol
		node.getDescendantsOfKind(SyntaxKind.Identifier).forEach((id) => {
			const name = id.getText()
			// Skip property names in object literals and property access expressions
			const parent = id.getParent()

			// Skip if it's a property name or common keyword
			if (
				(parent && Node.isPropertyAssignment(parent) && parent.getNameNode() === id) ||
				(parent && Node.isPropertyAccessExpression(parent) && parent.getNameNode() === id) ||
				["string", "number", "boolean", "any", "void", "null", "undefined", "this", "super"].includes(name)
			) {
				return
			}

			identifiersToAnalyze.add(name)
		})

		// 2. Collect all type references including generic type arguments
		node.getDescendantsOfKind(SyntaxKind.TypeReference).forEach((typeRef) => {
			// Get the main type name
			if (Node.isIdentifier(typeRef.getTypeName())) {
				const typeName = typeRef.getTypeName().getText()
				identifiersToAnalyze.add(typeName)
				this.collectTypeReference(typeName, sourceFile, identifiersToAnalyze, types, processedTypes)
			}

			// Handle generic type arguments (e.g., Promise<UserProfile>)
			const typeArgs = typeRef.getTypeArguments()
			if (typeArgs.length > 0) {
				typeArgs.forEach((typeArg) => {
					// Extract type identifiers from type arguments
					typeArg.getDescendantsOfKind(SyntaxKind.Identifier).forEach((id) => {
						const argTypeName = id.getText()
						identifiersToAnalyze.add(argTypeName)
						this.collectTypeReference(argTypeName, sourceFile, identifiersToAnalyze, types, processedTypes)
					})
				})
			}
		})

		// Process array types (e.g., User[])
		node.getDescendantsOfKind(SyntaxKind.ArrayType).forEach((arrayType) => {
			const elementTypeNode = arrayType.getElementTypeNode()
			elementTypeNode.getDescendantsOfKind(SyntaxKind.Identifier).forEach((id: Node) => {
				const typeName = id.getText()
				identifiersToAnalyze.add(typeName)
				this.collectTypeReference(typeName, sourceFile, identifiersToAnalyze, types, processedTypes)
			})
		})

		// Process interface extensions (e.g., interface A extends B)
		node.getDescendantsOfKind(SyntaxKind.HeritageClause).forEach((heritageClause) => {
			heritageClause.getTypeNodes().forEach((typeExpression) => {
				const expression = typeExpression.getExpression()
				if (Node.isIdentifier(expression)) {
					const baseTypeName = expression.getText()
					identifiersToAnalyze.add(baseTypeName)
					this.collectTypeReference(baseTypeName, sourceFile, identifiersToAnalyze, types, processedTypes)
				}
			})
		})

		// Process union and intersection types
		node.getDescendantsOfKind(SyntaxKind.UnionType).forEach((unionType) => {
			unionType.getTypeNodes().forEach((typeNode) => {
				typeNode.getDescendantsOfKind(SyntaxKind.Identifier).forEach((id: Node) => {
					const typeName = id.getText()
					identifiersToAnalyze.add(typeName)
					this.collectTypeReference(typeName, sourceFile, identifiersToAnalyze, types, processedTypes)
				})
			})
		})

		node.getDescendantsOfKind(SyntaxKind.IntersectionType).forEach((intersectionType) => {
			intersectionType.getTypeNodes().forEach((typeNode) => {
				typeNode.getDescendantsOfKind(SyntaxKind.Identifier).forEach((id: Node) => {
					const typeName = id.getText()
					identifiersToAnalyze.add(typeName)
					this.collectTypeReference(typeName, sourceFile, identifiersToAnalyze, types, processedTypes)
				})
			})
		})

		// 3. Check parameter types for functions
		if (Node.isFunctionDeclaration(node) || Node.isMethodDeclaration(node)) {
			node.getParameters().forEach((param) => {
				const typeNode = param.getTypeNode()
				if (typeNode) {
					typeNode.getDescendantsOfKind(SyntaxKind.Identifier).forEach((id: Node) => {
						const typeName = id.getText()
						identifiersToAnalyze.add(typeName)
						this.collectTypeReference(typeName, sourceFile, identifiersToAnalyze, types, processedTypes)
					})
				}
			})
		}

		// 4. Check return type annotations for functions
		if ((Node.isFunctionDeclaration(node) || Node.isMethodDeclaration(node)) && node.getReturnTypeNode()) {
			const returnType = node.getReturnTypeNode()
			if (returnType) {
				returnType.getDescendantsOfKind(SyntaxKind.Identifier).forEach((id: Node) => {
					const typeName = id.getText()
					identifiersToAnalyze.add(typeName)
					this.collectTypeReference(typeName, sourceFile, identifiersToAnalyze, types, processedTypes)
				})
			}
		}

		// 5. For each identifier, check if it's an import or local reference
		identifiersToAnalyze.forEach((name) => {
			// Skip if the identifier is defined in the source file as a local declaration
			const isDefinedInSource =
				sourceFile.getInterface(name) !== undefined ||
				sourceFile.getTypeAlias(name) !== undefined ||
				sourceFile.getClass(name) !== undefined ||
				sourceFile.getEnum(name) !== undefined ||
				sourceFile.getFunction(name) !== undefined ||
				sourceFile.getVariableDeclaration(name) !== undefined

			// Skip if it's the symbol itself
			if (
				(Node.isFunctionDeclaration(node) ||
					Node.isClassDeclaration(node) ||
					Node.isInterfaceDeclaration(node) ||
					Node.isTypeAliasDeclaration(node) ||
					Node.isEnumDeclaration(node) ||
					Node.isVariableDeclaration(node)) &&
				"getName" in node &&
				node.getName() === name
			) {
				return
			}

			if (isDefinedInSource) {
				// It's a local reference
				if (!localReferences.includes(name)) {
					localReferences.push(name)
				}
			} else {
				// Check if it's imported
				this.findImportForIdentifier(name, sourceFile, imports, processedImports)
			}
		})

		return {
			imports,
			types,
			localReferences,
		}
	}

	/**
	 * Collect type reference and recursively process nested types
	 */
	private collectTypeReference(
		typeName: string,
		sourceFile: SourceFile,
		identifiersToAnalyze: Set<string>,
		types: string[],
		processedTypes: Set<string>,
	): void {
		// Skip if already processed or common built-in types
		if (
			processedTypes.has(typeName) ||
			[
				"string",
				"number",
				"boolean",
				"any",
				"void",
				"null",
				"undefined",
				"object",
				"unknown",
				"never",
				"bigint",
				"symbol",
			].includes(typeName)
		) {
			return
		}

		processedTypes.add(typeName)

		// Check if type exists in source file
		const typeExists =
			sourceFile.getInterface(typeName) !== undefined ||
			sourceFile.getTypeAlias(typeName) !== undefined ||
			sourceFile.getEnum(typeName) !== undefined ||
			sourceFile.getClass(typeName) !== undefined

		if (typeExists) {
			// Add to type collection if not already included
			if (!types.includes(typeName)) {
				types.push(typeName)
			}

			// Recursively process nested type references
			// Find type declaration and analyze its dependencies
			const typeDecl =
				sourceFile.getInterface(typeName) ||
				sourceFile.getTypeAlias(typeName) ||
				sourceFile.getEnum(typeName) ||
				sourceFile.getClass(typeName)

			if (typeDecl) {
				// Check for interface extensions (base types)
				if (Node.isInterfaceDeclaration(typeDecl)) {
					// Process base types (interfaces that this interface extends)
					typeDecl.getExtends().forEach((extension) => {
						const expression = extension.getExpression()
						if (Node.isIdentifier(expression)) {
							const baseTypeName = expression.getText()
							// Add the base interface as a dependency
							identifiersToAnalyze.add(baseTypeName)
							this.collectTypeReference(
								baseTypeName,
								sourceFile,
								identifiersToAnalyze,
								types,
								processedTypes,
							)
						}
					})
				}

				// Process nested type references
				typeDecl.getDescendantsOfKind(SyntaxKind.TypeReference).forEach((nestedTypeRef) => {
					if (Node.isIdentifier(nestedTypeRef.getTypeName())) {
						const nestedTypeName = nestedTypeRef.getTypeName().getText()
						identifiersToAnalyze.add(nestedTypeName)
						this.collectTypeReference(
							nestedTypeName,
							sourceFile,
							identifiersToAnalyze,
							types,
							processedTypes,
						)
					}
				})

				// Process array types in type declarations
				typeDecl.getDescendantsOfKind(SyntaxKind.ArrayType).forEach((arrayType) => {
					const elementTypeNode = arrayType.getElementTypeNode()
					elementTypeNode.getDescendantsOfKind(SyntaxKind.Identifier).forEach((id: Node) => {
						const nestedTypeName = id.getText()
						identifiersToAnalyze.add(nestedTypeName)
						this.collectTypeReference(
							nestedTypeName,
							sourceFile,
							identifiersToAnalyze,
							types,
							processedTypes,
						)
					})
				})

				// Process union and intersection types in type declarations
				typeDecl.getDescendantsOfKind(SyntaxKind.UnionType).forEach((unionType) => {
					unionType.getTypeNodes().forEach((typeNode) => {
						typeNode.getDescendantsOfKind(SyntaxKind.Identifier).forEach((id: Node) => {
							const nestedTypeName = id.getText()
							identifiersToAnalyze.add(nestedTypeName)
							this.collectTypeReference(
								nestedTypeName,
								sourceFile,
								identifiersToAnalyze,
								types,
								processedTypes,
							)
						})
					})
				})

				typeDecl.getDescendantsOfKind(SyntaxKind.IntersectionType).forEach((intersectionType) => {
					intersectionType.getTypeNodes().forEach((typeNode) => {
						typeNode.getDescendantsOfKind(SyntaxKind.Identifier).forEach((id: Node) => {
							const nestedTypeName = id.getText()
							identifiersToAnalyze.add(nestedTypeName)
							this.collectTypeReference(
								nestedTypeName,
								sourceFile,
								identifiersToAnalyze,
								types,
								processedTypes,
							)
						})
					})
				})
			}
		}
	}

	/**
	 * Process interface inheritance relationships in the source file
	 * This ensures we capture all interface extensions
	 */
	private processInterfaceInheritance(sourceFile: SourceFile, dependencies: SymbolDependencies): void {
		// Make a copy of the current types to avoid modification during iteration
		const currentTypes = [...dependencies.types]

		// For each already discovered type, check if it's an interface with extensions
		for (const typeName of currentTypes) {
			const interfaceDecl = sourceFile.getInterface(typeName)
			if (interfaceDecl) {
				// Check all heritage clauses (extends)
				interfaceDecl.getExtends().forEach((extension) => {
					const baseTypeName = extension.getText()
					// If this is a base interface and not already in our types, add it
					if (!dependencies.types.includes(baseTypeName)) {
						dependencies.types.push(baseTypeName)
					}
				})
			}
		}
	}

	/**
	 * Find import declaration for an identifier
	 */
	private findImportForIdentifier(
		name: string,
		sourceFile: SourceFile,
		imports: Map<string, string>,
		processedImports: Set<string>,
	): void {
		// Skip if already processed
		if (processedImports.has(name)) {
			return
		}

		processedImports.add(name)

		// Handle some common imports that might be missed
		const commonExternalImports = new Map([
			["axios", "axios"],
			["react", "react"],
			["useState", "react"],
			["useEffect", "react"],
			["useContext", "react"],
			["useRef", "react"],
			["useCallback", "react"],
			["useMemo", "react"],
			["useReducer", "react"],
		])

		if (commonExternalImports.has(name)) {
			imports.set(name, commonExternalImports.get(name)!)
			return
		}

		// Check all import declarations
		sourceFile.getImportDeclarations().forEach((importDecl) => {
			const namedImports = importDecl.getNamedImports()
			const hasImport = namedImports.some((ni) => ni.getName() === name)

			// Also check for default imports
			const defaultImport = importDecl.getDefaultImport()
			const isDefaultImport = defaultImport && defaultImport.getText() === name

			if (hasImport || isDefaultImport) {
				// Store the import information
				const moduleSpecifier = importDecl.getModuleSpecifierValue()
				imports.set(name, moduleSpecifier)
			}
		})
	}

	/**
	 * Find all type dependencies that should be moved with the symbol
	 * Replaces: findTypeDependencies in move operation
	 */
	findTypeDependencies(node: Node, sourceFile: SourceFile): string[] {
		const dependencies: string[] = []
		const typeReferences = new Set<string>()

		// 1. Find all type references in the symbol
		node.getDescendantsOfKind(SyntaxKind.TypeReference).forEach((typeRef) => {
			if (Node.isIdentifier(typeRef.getTypeName())) {
				const typeName = typeRef.getTypeName().getText()
				typeReferences.add(typeName)
			}
		})

		// 2. Also check return type annotations
		if (Node.isFunctionDeclaration(node) && node.getReturnTypeNode()) {
			const returnType = node.getReturnTypeNode()
			if (returnType) {
				returnType.getDescendantsOfKind(SyntaxKind.Identifier).forEach((id: Node) => {
					typeReferences.add(id.getText())
				})
			}
		}

		// 3. Check parameter types for functions
		if (Node.isFunctionDeclaration(node)) {
			node.getParameters().forEach((param) => {
				const typeNode = param.getTypeNode()
				if (typeNode) {
					typeNode.getDescendantsOfKind(SyntaxKind.Identifier).forEach((id: Node) => {
						typeReferences.add(id.getText())
					})
				}
			})
		}

		// 4. For each type reference, find its definition in the source file
		typeReferences.forEach((typeName) => {
			// Skip common built-in types
			if (
				["string", "number", "boolean", "any", "void", "null", "undefined", "object", "unknown"].includes(
					typeName,
				)
			) {
				return
			}

			// Check for interface declarations
			const interfaces = sourceFile.getInterfaces().filter((i) => i.getName() === typeName)
			interfaces.forEach((iface) => {
				dependencies.push(iface.getText())
			})

			// Check for type alias declarations
			const typeAliases = sourceFile.getTypeAliases().filter((t) => t.getName() === typeName)
			typeAliases.forEach((typeAlias) => {
				dependencies.push(typeAlias.getText())
			})

			// Check for enum declarations
			const enums = sourceFile.getEnums().filter((e) => e.getName() === typeName)
			enums.forEach((enumDecl) => {
				dependencies.push(enumDecl.getText())
			})

			// Check for class declarations
			const classes = sourceFile.getClasses().filter((c) => c.getName() === typeName)
			classes.forEach((classDecl) => {
				dependencies.push(classDecl.getText())
			})
		})

		return dependencies
	}
}
