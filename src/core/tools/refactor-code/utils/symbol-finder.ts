import {
	Node,
	SourceFile,
	ClassDeclaration,
	InterfaceDeclaration,
	ModuleDeclaration,
	FunctionDeclaration,
	VariableDeclaration,
	MethodDeclaration,
	PropertyDeclaration,
	TypeAliasDeclaration,
	EnumDeclaration,
	Identifier,
} from "ts-morph"
import { IdentifierSelector } from "../schema"

/**
 * Utility class for finding symbols in TypeScript source files
 * based on selector information.
 */
export class SymbolFinder {
	constructor(private sourceFile: SourceFile) {}

	/**
	 * Finds a symbol based on an identifier selector
	 */
	findSymbol(selector: IdentifierSelector): Node | undefined {
		// Handle nested symbols (methods, properties)
		if (selector.parent) {
			return this.findNestedSymbol(selector)
		}

		// Handle top-level symbols
		switch (selector.kind) {
			case "function":
				return this.findFunction(selector.name, selector.signatureHint)
			case "class":
				return this.findClass(selector.name)
			case "interface":
				return this.findInterface(selector.name)
			case "variable":
				return this.findVariable(selector.name)
			case "type":
				return this.findTypeAlias(selector.name)
			case "enum":
				return this.findEnum(selector.name)
			default:
				return this.findAnySymbol(selector.name)
		}
	}

	/**
	 * Finds a nested symbol (method, property) within a parent
	 */
	private findNestedSymbol(selector: IdentifierSelector): Node | undefined {
		if (!selector.parent) return undefined

		// Directly find the parent without recursion
		let parent: Node | undefined

		// Find parent directly based on kind using if-else structure
		if (selector.parent.kind === "class" || selector.parent.kind === "namespace") {
			parent = this.sourceFile.getClass(selector.parent.name)
		} else if (selector.parent.kind === "interface") {
			parent = this.sourceFile.getInterface(selector.parent.name)
		} else if (selector.parent.kind === "function") {
			parent = this.findFunction(selector.parent.name)
		} else {
			// Fall back to finding any symbol type
			parent = this.findAnySymbol(selector.parent.name)
		}

		if (!parent) {
			// console.log(`[DEBUG] Parent ${selector.parent.name} not found for nested symbol ${selector.name}`)
			return undefined
		}

		// Find the nested symbol within the parent
		if (Node.isClassDeclaration(parent) || Node.isInterfaceDeclaration(parent)) {
			if (selector.kind === "method") {
				return parent.getMethod(selector.name)
			} else if (selector.kind === "property") {
				return parent.getProperty(selector.name)
			}
		}

		return undefined
	}

	/**
	 * Find function declaration by name, with optional signature hint for overloads
	 */
	private findFunction(name: string, signatureHint?: string): FunctionDeclaration | undefined {
		const functions = this.sourceFile.getFunctions()

		// Debug: Log what functions are actually found
		// console.log(`[DEBUG SYMBOL FINDER] Looking for function '${name}' in file: ${this.sourceFile.getFilePath()}`)
		console.log(
			`[DEBUG SYMBOL FINDER] Found ${functions.length} functions:`,
			functions.map((f) => f.getName()),
		)
		// console.log(`[DEBUG SYMBOL FINDER] File content preview:`, this.sourceFile.getText().substring(0, 200))

		if (signatureHint) {
			// Try to match with signature hint for overloaded functions
			return functions.find((fn) => {
				const fnName = fn.getName()
				const fnText = fn.getText()
				return fnName === name && fnText.includes(signatureHint)
			})
		}

		return functions.find((fn) => fn.getName() === name)
	}

	/**
	 * Find class declaration by name
	 */
	private findClass(name: string): ClassDeclaration | undefined {
		return this.sourceFile.getClass(name)
	}

	/**
	 * Find interface declaration by name
	 */
	private findInterface(name: string): InterfaceDeclaration | undefined {
		return this.sourceFile.getInterface(name)
	}

	/**
	 * Find variable declaration by name
	 */
	private findVariable(name: string): VariableDeclaration | undefined {
		const varStatements = this.sourceFile.getVariableStatements()

		for (const statement of varStatements) {
			const declaration = statement.getDeclarations().find((decl) => decl.getName() === name)
			if (declaration) return declaration
		}

		return undefined
	}

	/**
	 * Find type alias declaration by name
	 */
	private findTypeAlias(name: string): TypeAliasDeclaration | undefined {
		return this.sourceFile.getTypeAlias(name)
	}

	/**
	 * Find enum declaration by name
	 */
	private findEnum(name: string): EnumDeclaration | undefined {
		return this.sourceFile.getEnum(name)
	}

	/**
	 * Try to find a symbol of any kind by name
	 */
	private findAnySymbol(name: string): Node | undefined {
		// Try all symbol types
		return (
			this.findFunction(name) ||
			this.findClass(name) ||
			this.findInterface(name) ||
			this.findVariable(name) ||
			this.findTypeAlias(name) ||
			this.findEnum(name)
		)
	}

	/**
	 * Gets all references to a symbol
	 */
	getReferences(symbol: Node): Identifier[] {
		if (!Node.isReferenceFindable(symbol)) {
			return []
		}

		// Cast the references to Identifier[] - we'll handle non-identifiers later if needed
		return symbol.findReferencesAsNodes().filter(Node.isIdentifier)
	}

	/**
	 * Checks if a symbol is exported
	 */
	isExported(symbol: Node): boolean {
		if (Node.isExportable(symbol)) {
			return symbol.isExported()
		}

		// Check if it's a variable in a variable statement with export keyword
		if (Node.isVariableDeclaration(symbol)) {
			const statement = symbol.getParent()?.getParent()
			if (statement && Node.isVariableStatement(statement)) {
				return statement.isExported()
			}
		}

		// Check if it's part of an export statement
		const parent = symbol.getParent()
		if (parent && Node.isExportDeclaration(parent)) {
			return true
		}

		return false
	}
}
