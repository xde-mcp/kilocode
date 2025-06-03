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
			if (symbolStartLine - lastCommentEndLine <= 2) {
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
						!commentText.toLowerCase().includes("test")
					) {
						comments.push(commentText)
					}
				}
			}
		}

		// Extract dependencies
		const dependencies = this.extractDependencies(node, sourceFile)

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

		// Set to track all identifiers
		const identifiersToAnalyze = new Set<string>()

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

		// 2. Collect all type references
		node.getDescendantsOfKind(SyntaxKind.TypeReference).forEach((typeRef) => {
			if (Node.isIdentifier(typeRef.getTypeName())) {
				const typeName = typeRef.getTypeName().getText()
				identifiersToAnalyze.add(typeName)

				// Also collect this as a type
				const typeExists =
					sourceFile.getInterface(typeName) !== undefined ||
					sourceFile.getTypeAlias(typeName) !== undefined ||
					sourceFile.getEnum(typeName) !== undefined ||
					sourceFile.getClass(typeName) !== undefined

				if (typeExists) {
					types.push(typeName)
				}
			}
		})

		// 3. Check return type annotations for functions
		if (Node.isFunctionDeclaration(node) && node.getReturnTypeNode()) {
			const returnType = node.getReturnTypeNode()
			if (returnType) {
				returnType.getDescendantsOfKind(SyntaxKind.Identifier).forEach((id) => {
					const typeName = id.getText()
					identifiersToAnalyze.add(typeName)

					// Also collect this as a type
					const typeExists =
						sourceFile.getInterface(typeName) !== undefined ||
						sourceFile.getTypeAlias(typeName) !== undefined ||
						sourceFile.getEnum(typeName) !== undefined ||
						sourceFile.getClass(typeName) !== undefined

					if (typeExists) {
						types.push(typeName)
					}
				})
			}
		}

		// 4. For each identifier, check if it's an import or local reference
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
				localReferences.push(name)
			} else {
				// Check if it's imported
				sourceFile.getImportDeclarations().forEach((importDecl) => {
					const namedImports = importDecl.getNamedImports()
					const hasImport = namedImports.some((ni) => ni.getName() === name)

					if (hasImport) {
						// Store the import information
						const moduleSpecifier = importDecl.getModuleSpecifierValue()
						imports.set(name, moduleSpecifier)
					}
				})
			}
		})

		return {
			imports,
			types,
			localReferences,
		}
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
				returnType.getDescendantsOfKind(SyntaxKind.Identifier).forEach((id) => {
					typeReferences.add(id.getText())
				})
			}
		}

		// 3. Check parameter types for functions
		if (Node.isFunctionDeclaration(node)) {
			node.getParameters().forEach((param) => {
				const typeNode = param.getTypeNode()
				if (typeNode) {
					typeNode.getDescendantsOfKind(SyntaxKind.Identifier).forEach((id) => {
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
