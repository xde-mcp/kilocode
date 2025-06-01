# Phase 5: Code Generation Operations (1 week)

## Goal

Implement ADD and INLINE operations with code generation utilities. These operations enable adding new code elements (functions, classes, methods) and inlining existing code for optimization or refactoring purposes.

## Prerequisites

- Phase 4 completed with EXTRACT and REFACTOR operations working
- Code analysis utilities tested and functional
- All core refactoring operations operational
- Comprehensive understanding of code structure and dependencies

## Key Components to Build

### 1. Code Generator Utility

**File**: `src/core/tools/refactor-code/utils/code-generator.ts`

```typescript
import {
	Project,
	SourceFile,
	ClassDeclaration,
	InterfaceDeclaration,
	MethodDeclarationStructure,
	PropertyDeclarationStructure,
	FunctionDeclarationStructure,
	VariableStatementStructure,
	Scope,
} from "ts-morph"

export interface FunctionSpec {
	name: string
	parameters: ParameterSpec[]
	returnType: string
	body: string
	isAsync?: boolean
	isExported?: boolean
	jsDoc?: string
}

export interface ClassSpec {
	name: string
	properties: PropertySpec[]
	methods: MethodSpec[]
	constructor?: ConstructorSpec
	extends?: string
	implements?: string[]
	isExported?: boolean
	isAbstract?: boolean
	jsDoc?: string
}

export interface InterfaceSpec {
	name: string
	properties: PropertySpec[]
	methods: MethodSpec[]
	extends?: string[]
	isExported?: boolean
	jsDoc?: string
}

export interface PropertySpec {
	name: string
	type: string
	accessibility?: "public" | "private" | "protected"
	isReadonly?: boolean
	isStatic?: boolean
	isOptional?: boolean
	initializer?: string
	jsDoc?: string
}

export interface MethodSpec {
	name: string
	parameters: ParameterSpec[]
	returnType: string
	body?: string
	accessibility?: "public" | "private" | "protected"
	isAsync?: boolean
	isStatic?: boolean
	isAbstract?: boolean
	jsDoc?: string
}

export interface ParameterSpec {
	name: string
	type: string
	isOptional?: boolean
	defaultValue?: string
	isRest?: boolean
}

export interface ConstructorSpec {
	parameters: ParameterSpec[]
	body: string
	accessibility?: "public" | "private" | "protected"
}

export class CodeGenerator {
	private indentSize: number = 2

	/**
	 * Generates a function declaration
	 */
	generateFunction(spec: FunctionSpec): string {
		const parts: string[] = []

		// Add JSDoc if provided
		if (spec.jsDoc) {
			parts.push(spec.jsDoc)
		}

		// Build function signature
		const modifiers: string[] = []
		if (spec.isExported) modifiers.push("export")
		if (spec.isAsync) modifiers.push("async")

		const params = this.generateParameters(spec.parameters)
		const signature = `${modifiers.join(" ")} function ${spec.name}(${params}): ${spec.returnType}`

		// Add body
		const body = this.formatBody(spec.body)
		parts.push(`${signature} {${body}}`)

		return parts.join("\n")
	}

	/**
	 * Generates a class declaration
	 */
	generateClass(spec: ClassSpec): string {
		const parts: string[] = []

		// Add JSDoc if provided
		if (spec.jsDoc) {
			parts.push(spec.jsDoc)
		}

		// Build class signature
		const modifiers: string[] = []
		if (spec.isExported) modifiers.push("export")
		if (spec.isAbstract) modifiers.push("abstract")

		let signature = `${modifiers.join(" ")} class ${spec.name}`

		if (spec.extends) {
			signature += ` extends ${spec.extends}`
		}

		if (spec.implements && spec.implements.length > 0) {
			signature += ` implements ${spec.implements.join(", ")}`
		}

		parts.push(signature + " {")

		// Add properties
		const classBody: string[] = []

		for (const prop of spec.properties) {
			classBody.push(this.generateProperty(prop))
		}

		if (spec.properties.length > 0 && (spec.constructor || spec.methods.length > 0)) {
			classBody.push("") // Empty line
		}

		// Add constructor
		if (spec.constructor) {
			classBody.push(this.generateConstructor(spec.constructor))
			if (spec.methods.length > 0) {
				classBody.push("") // Empty line
			}
		}

		// Add methods
		for (let i = 0; i < spec.methods.length; i++) {
			classBody.push(this.generateMethod(spec.methods[i]))
			if (i < spec.methods.length - 1) {
				classBody.push("") // Empty line between methods
			}
		}

		// Indent class body
		const indentedBody = classBody.map((line) => (line ? this.indent(line) : line)).join("\n")

		parts.push(indentedBody)
		parts.push("}")

		return parts.join("\n")
	}

	/**
	 * Generates an interface declaration
	 */
	generateInterface(spec: InterfaceSpec): string {
		const parts: string[] = []

		// Add JSDoc if provided
		if (spec.jsDoc) {
			parts.push(spec.jsDoc)
		}

		// Build interface signature
		const modifiers: string[] = []
		if (spec.isExported) modifiers.push("export")

		let signature = `${modifiers.join(" ")} interface ${spec.name}`

		if (spec.extends && spec.extends.length > 0) {
			signature += ` extends ${spec.extends.join(", ")}`
		}

		parts.push(signature + " {")

		// Add properties and methods
		const interfaceBody: string[] = []

		for (const prop of spec.properties) {
			const optional = prop.isOptional ? "?" : ""
			const readonly = prop.isReadonly ? "readonly " : ""
			interfaceBody.push(`${readonly}${prop.name}${optional}: ${prop.type};`)
		}

		if (spec.properties.length > 0 && spec.methods.length > 0) {
			interfaceBody.push("") // Empty line
		}

		for (const method of spec.methods) {
			const params = this.generateParameters(method.parameters)
			interfaceBody.push(`${method.name}(${params}): ${method.returnType};`)
		}

		// Indent interface body
		const indentedBody = interfaceBody.map((line) => (line ? this.indent(line) : line)).join("\n")

		parts.push(indentedBody)
		parts.push("}")

		return parts.join("\n")
	}

	/**
	 * Generates a property declaration
	 */
	private generateProperty(spec: PropertySpec): string {
		const parts: string[] = []

		if (spec.jsDoc) {
			parts.push(spec.jsDoc)
		}

		const modifiers: string[] = []
		if (spec.accessibility) modifiers.push(spec.accessibility)
		if (spec.isStatic) modifiers.push("static")
		if (spec.isReadonly) modifiers.push("readonly")

		const optional = spec.isOptional ? "?" : ""
		const initializer = spec.initializer ? ` = ${spec.initializer}` : ""

		const declaration = `${modifiers.join(" ")} ${spec.name}${optional}: ${spec.type}${initializer};`
		parts.push(declaration)

		return parts.join("\n")
	}

	/**
	 * Generates a method declaration
	 */
	private generateMethod(spec: MethodSpec): string {
		const parts: string[] = []

		if (spec.jsDoc) {
			parts.push(spec.jsDoc)
		}

		const modifiers: string[] = []
		if (spec.accessibility) modifiers.push(spec.accessibility)
		if (spec.isStatic) modifiers.push("static")
		if (spec.isAsync) modifiers.push("async")
		if (spec.isAbstract) modifiers.push("abstract")

		const params = this.generateParameters(spec.parameters)
		const signature = `${modifiers.join(" ")} ${spec.name}(${params}): ${spec.returnType}`

		if (spec.isAbstract || !spec.body) {
			parts.push(signature + ";")
		} else {
			const body = this.formatBody(spec.body)
			parts.push(`${signature} {${body}}`)
		}

		return parts.join("\n")
	}

	/**
	 * Generates a constructor declaration
	 */
	private generateConstructor(spec: ConstructorSpec): string {
		const modifiers: string[] = []
		if (spec.accessibility) modifiers.push(spec.accessibility)

		const params = this.generateParameters(spec.parameters)
		const signature = `${modifiers.join(" ")} constructor(${params})`

		const body = this.formatBody(spec.body)
		return `${signature} {${body}}`
	}

	/**
	 * Generates parameter list
	 */
	private generateParameters(parameters: ParameterSpec[]): string {
		return parameters
			.map((param) => {
				const optional = param.isOptional ? "?" : ""
				const rest = param.isRest ? "..." : ""
				const defaultValue = param.defaultValue ? ` = ${param.defaultValue}` : ""
				return `${rest}${param.name}${optional}: ${param.type}${defaultValue}`
			})
			.join(", ")
	}

	/**
	 * Formats a function/method body
	 */
	private formatBody(body: string): string {
		if (!body.trim()) {
			return "\n" + this.indent("// TODO: Implement") + "\n"
		}

		const lines = body.trim().split("\n")
		const indented = lines.map((line) => this.indent(line)).join("\n")
		return "\n" + indented + "\n"
	}

	/**
	 * Indents a string
	 */
	private indent(str: string, level: number = 1): string {
		const spaces = " ".repeat(this.indentSize * level)
		return spaces + str
	}

	/**
	 * Generates JSDoc comment
	 */
	generateJsDoc(
		description: string,
		params?: Array<{ name: string; description: string }>,
		returns?: string,
	): string {
		const lines: string[] = ["/**", ` * ${description}`]

		if (params && params.length > 0) {
			lines.push(" *")
			for (const param of params) {
				lines.push(` * @param ${param.name} ${param.description}`)
			}
		}

		if (returns) {
			if (params && params.length > 0) {
				lines.push(" *")
			}
			lines.push(` * @returns ${returns}`)
		}

		lines.push(" */")
		return lines.join("\n")
	}
}
```

### 2. ADD Operation Implementation

**File**: `src/core/tools/refactor-code/operations/add.ts`

```typescript
import { Project, SourceFile, ClassDeclaration } from "ts-morph"
import { AddOperation, OperationResult } from "../types"
import { CodeGenerator } from "../utils/code-generator"
import { RefactorTransaction } from "../transaction"
import { HumanReviewSystem } from "../human-review"

export async function executeAddOperation(
	project: Project,
	operation: AddOperation,
	transaction: RefactorTransaction,
	codeGenerator: CodeGenerator,
	reviewSystem: HumanReviewSystem,
): Promise<OperationResult> {
	try {
		// Always generate review guide for add operations
		const reviewGuide = reviewSystem.generateReviewGuide([operation])

		// Validate inputs
		if (!operation.symbolName) {
			return {
				success: false,
				error: "Symbol name is required for add operation",
				operation,
				requiresReview: true,
				reviewGuide: JSON.stringify(reviewGuide),
			}
		}

		if (!operation.code && !operation.spec) {
			return {
				success: false,
				error: "Either code or spec is required for add operation",
				operation,
				requiresReview: true,
				reviewGuide: JSON.stringify(reviewGuide),
			}
		}

		// Get or create target file
		let targetFile = project.getSourceFile(operation.targetFilePath)
		if (!targetFile) {
			targetFile = project.createSourceFile(operation.targetFilePath, "", {
				overwrite: false,
			})
		}

		// Snapshot the file
		await transaction.snapshot(operation.targetFilePath)

		// Check for naming conflicts
		const conflictCheck = checkNamingConflict(targetFile, operation.symbolName, operation.symbolType)
		if (conflictCheck.hasConflict) {
			return {
				success: false,
				error: conflictCheck.message!,
				operation,
				requiresReview: true,
				reviewGuide: JSON.stringify(reviewGuide),
			}
		}

		// Generate or use provided code
		let codeToAdd: string

		if (operation.code) {
			codeToAdd = operation.code
		} else if (operation.spec) {
			codeToAdd = generateCodeFromSpec(codeGenerator, operation)
		} else {
			return {
				success: false,
				error: "No code or spec provided",
				operation,
				requiresReview: true,
				reviewGuide: JSON.stringify(reviewGuide),
			}
		}

		// Add the code based on symbol type and position
		const result = await addCodeToFile(targetFile, operation, codeToAdd, transaction)

		if (result.success) {
			// Format the file
			targetFile.formatText()

			// Save the file
			await targetFile.save()
		}

		return {
			...result,
			requiresReview: true,
			reviewGuide: JSON.stringify(reviewGuide),
		}
	} catch (error) {
		return {
			success: false,
			error: `Add operation failed: ${error.message}`,
			operation,
			requiresReview: true,
		}
	}
}

function checkNamingConflict(
	file: SourceFile,
	symbolName: string,
	symbolType: string,
): { hasConflict: boolean; message?: string } {
	switch (symbolType) {
		case "function":
			if (file.getFunction(symbolName)) {
				return {
					hasConflict: true,
					message: `Function '${symbolName}' already exists in the file`,
				}
			}
			break

		case "class":
			if (file.getClass(symbolName)) {
				return {
					hasConflict: true,
					message: `Class '${symbolName}' already exists in the file`,
				}
			}
			break

		case "interface":
			if (file.getInterface(symbolName)) {
				return {
					hasConflict: true,
					message: `Interface '${symbolName}' already exists in the file`,
				}
			}
			break

		case "variable":
			const varStatements = file.getVariableStatements()
			for (const statement of varStatements) {
				if (statement.getDeclarations().some((d) => d.getName() === symbolName)) {
					return {
						hasConflict: true,
						message: `Variable '${symbolName}' already exists in the file`,
					}
				}
			}
			break
	}

	return { hasConflict: false }
}

function generateCodeFromSpec(codeGenerator: CodeGenerator, operation: AddOperation): string {
	const spec = operation.spec!

	switch (operation.symbolType) {
		case "function":
			return codeGenerator.generateFunction({
				name: operation.symbolName,
				parameters: spec.parameters || [],
				returnType: spec.returnType || "void",
				body: spec.body || "",
				isAsync: spec.isAsync,
				isExported: spec.isExported,
				jsDoc: spec.jsDoc,
			})

		case "class":
			return codeGenerator.generateClass({
				name: operation.symbolName,
				properties: spec.properties || [],
				methods: spec.methods || [],
				constructor: spec.constructor,
				extends: spec.extends,
				implements: spec.implements,
				isExported: spec.isExported,
				isAbstract: spec.isAbstract,
				jsDoc: spec.jsDoc,
			})

		case "interface":
			return codeGenerator.generateInterface({
				name: operation.symbolName,
				properties: spec.properties || [],
				methods: spec.methods || [],
				extends: spec.extends,
				isExported: spec.isExported,
				jsDoc: spec.jsDoc,
			})

		default:
			return operation.code || ""
	}
}

async function addCodeToFile(
	file: SourceFile,
	operation: AddOperation,
	code: string,
	transaction: RefactorTransaction,
): Promise<OperationResult> {
	try {
		if (operation.symbolType === "method" || operation.symbolType === "property") {
			// Need to add to a class
			if (!operation.parentSymbol) {
				return {
					success: false,
					error: "Parent symbol is required for method/property",
					operation,
				}
			}

			const parentClass = file.getClass(operation.parentSymbol)
			if (!parentClass) {
				return {
					success: false,
					error: `Parent class '${operation.parentSymbol}' not found`,
					operation,
				}
			}

			if (operation.symbolType === "method") {
				// Parse the method code and add it
				// This is simplified - real implementation would parse the code properly
				parentClass.addMethod({
					name: operation.symbolName,
					statements: code,
				})
			} else {
				// Add property
				parentClass.addProperty({
					name: operation.symbolName,
					type: "any", // Would be parsed from code
					initializer: code,
				})
			}
		} else {
			// Add to file at specified position
			const position = operation.position || "end"

			switch (position) {
				case "start":
					file.insertText(0, code + "\n\n")
					break

				case "end":
					file.addStatements(code)
					break

				case "before":
				case "after":
					// Would need additional logic to find the reference symbol
					file.addStatements(code)
					break

				default:
					file.addStatements(code)
			}
		}

		// Record the operation
		transaction.recordOperation({
			id: operation.id || "add-" + Date.now(),
			type: "add",
			undo: () => {
				// In a real implementation, we'd remove the added code
			},
		})

		return {
			success: true,
			operation,
			affectedFiles: [operation.targetFilePath],
			message: `Successfully added ${operation.symbolType} '${operation.symbolName}'`,
		}
	} catch (error) {
		return {
			success: false,
			error: `Failed to add code: ${error.message}`,
			operation,
		}
	}
}
```

### 3. INLINE Operation Implementation

**File**: `src/core/tools/refactor-code/operations/inline.ts`

```typescript
import { Project, SourceFile, Node, CallExpression, Identifier } from "ts-morph"
import { InlineOperation, OperationResult } from "../types"
import { SymbolFinder } from "../utils/symbol-finder"
import { RefactorTransaction } from "../transaction"

export async function executeInlineOperation(
	project: Project,
	operation: InlineOperation,
	transaction: RefactorTransaction,
): Promise<OperationResult> {
	try {
		// Get source file
		const sourceFile = project.getSourceFile(operation.selector.filePath)
		if (!sourceFile) {
			return {
				success: false,
				error: `Source file not found: ${operation.selector.filePath}`,
				operation,
			}
		}

		// Find the symbol to inline
		const finder = new SymbolFinder(sourceFile)
		const symbol = finder.findSymbol(operation.selector)

		if (!symbol) {
			return {
				success: false,
				error: `Symbol '${operation.selector.name}' not found`,
				operation,
			}
		}

		// Get the value/implementation to inline
		const inlineValue = extractInlineValue(symbol)
		if (!inlineValue) {
			return {
				success: false,
				error: `Cannot extract inline value for '${operation.selector.name}'`,
				operation,
			}
		}

		// Find all references to inline
		const references = finder.getReferences(symbol)
		if (references.length === 0) {
			return {
				success: false,
				error: `No references found for '${operation.selector.name}'`,
				operation,
			}
		}

		// Snapshot all affected files
		const affectedFiles = new Set<string>()
		affectedFiles.add(operation.selector.filePath)

		for (const ref of references) {
			const refFile = ref.getSourceFile().getFilePath()
			affectedFiles.add(refFile)
			await transaction.snapshot(refFile)
		}

		// Perform the inlining
		const inlineResults = performInlining(references, inlineValue)

		if (!inlineResults.success) {
			return {
				success: false,
				error: inlineResults.error,
				operation,
			}
		}

		// Remove the original declaration
		removeOriginalDeclaration(symbol)

		// Save all affected files
		await project.save()

		// Record the operation
		transaction.recordOperation({
			id: operation.id || "inline-" + Date.now(),
			type: "inline",
			undo: () => {
				// In a real implementation, we'd restore the original symbol
			},
		})

		return {
			success: true,
			operation,
			affectedFiles: Array.from(affectedFiles),
			message: `Successfully inlined '${operation.selector.name}' at ${references.length} location(s)`,
		}
	} catch (error) {
		return {
			success: false,
			error: `Inline operation failed: ${error.message}`,
			operation,
		}
	}
}

interface InlineValue {
	type: "constant" | "function" | "expression"
	value: string
	isAsync?: boolean
	parameters?: string[]
}

function extractInlineValue(symbol: Node): InlineValue | null {
	// Handle variable declarations
	if (Node.isVariableDeclaration(symbol)) {
		const initializer = symbol.getInitializer()
		if (!initializer) {
			return null
		}

		// Check if it's a simple constant
		if (
			Node.isLiteralExpression(initializer) ||
			Node.isIdentifier(initializer) ||
			Node.isObjectLiteralExpression(initializer) ||
			Node.isArrayLiteralExpression(initializer)
		) {
			return {
				type: "constant",
				value: initializer.getText(),
			}
		}

		// Check if it's a function expression
		if (Node.isFunctionExpression(initializer) || Node.isArrowFunction(initializer)) {
			return {
				type: "function",
				value: initializer.getBody()?.getText() || "",
				isAsync: initializer.isAsync(),
				parameters: initializer.getParameters().map((p) => p.getName()),
			}
		}

		// Other expressions
		return {
			type: "expression",
			value: initializer.getText(),
		}
	}

	// Handle function declarations
	if (Node.isFunctionDeclaration(symbol)) {
		const body = symbol.getBody()
		if (!body) {
			return null
		}

		return {
			type: "function",
			value: body.getText(),
			isAsync: symbol.isAsync(),
			parameters: symbol.getParameters().map((p) => p.getName()),
		}
	}

	// Handle other symbol types
	// This is simplified - real implementation would handle more cases
	return null
}

interface InlineResult {
	success: boolean
	error?: string
}

function performInlining(references: Identifier[], inlineValue: InlineValue): InlineResult {
	for (const ref of references) {
		try {
			const parent = ref.getParent()

			if (inlineValue.type === "constant") {
				// Simple replacement
				ref.replaceWithText(inlineValue.value)
			} else if (inlineValue.type === "function" && Node.isCallExpression(parent)) {
				// Inline function call
				const result = inlineFunctionCall(parent, inlineValue)
				if (!result.success) {
					return result
				}
			} else if (inlineValue.type === "expression") {
				// Inline expression (may need parentheses)
				const needsParens = shouldWrapInParentheses(ref)
				const replacement = needsParens ? `(${inlineValue.value})` : inlineValue.value
				ref.replaceWithText(replacement)
			} else {
				return {
					success: false,
					error: `Cannot inline ${inlineValue.type} at this location`,
				}
			}
		} catch (error) {
			return {
				success: false,
				error: `Failed to inline at reference: ${error.message}`,
			}
		}
	}

	return { success: true }
}

function inlineFunctionCall(callExpr: CallExpression, inlineValue: InlineValue): InlineResult {
	if (!inlineValue.parameters || !inlineValue.value) {
		return {
			success: false,
			error: "Invalid function inline value",
		}
	}

	// Get the arguments from the call
	const args = callExpr.getArguments()

	// Build parameter mapping
	const paramMapping = new Map<string, string>()
	inlineValue.parameters.forEach((param, index) => {
		if (args[index]) {
			paramMapping.set(param, args[index].getText())
		}
	})

	// Replace parameters in the function body
	let inlinedBody = inlineValue.value

	// Remove braces if it's a single expression
	if (inlinedBody.startsWith("{") && inlinedBody.endsWith("}")) {
		inlinedBody = inlinedBody.slice(1, -1).trim()

		// Handle return statements
		if (inlinedBody.startsWith("return ")) {
			inlinedBody = inlinedBody.substring(7).trim()
			if (inlinedBody.endsWith(";")) {
				inlinedBody = inlinedBody.slice(0, -1)
			}
		}
	}

	// Replace parameters with arguments
	for (const [param, arg] of paramMapping) {
		// This is simplified - real implementation would use proper AST manipulation
		const paramRegex = new RegExp(`\\b${param}\\b`, "g")
		inlinedBody = inlinedBody.replace(paramRegex, arg)
	}

	// Handle async functions
	if (inlineValue.isAsync) {
		// Check if we're in an async context
		const containingFunction = callExpr
			.getAncestors()
			.find((a) => Node.isFunctionDeclaration(a) || Node.isMethodDeclaration(a) || Node.isArrowFunction(a))

		if (containingFunction && !containingFunction.isAsync()) {
			return {
				success: false,
				error: "Cannot inline async function in non-async context",
			}
		}

		inlinedBody = `await (${inlinedBody})`
	}

	// Replace the call expression
	callExpr.replaceWithText(inlinedBody)

	return { success: true }
}

function shouldWrapInParentheses(node: Node): boolean {
	const parent = node.getParent()
	if (!parent) return false

	// Check if the parent is an operation that requires parentheses
	if (Node.isBinaryExpression(parent) || Node.isConditionalExpression(parent) || Node.isCallExpression(parent)) {
		return true
	}

	return false
}

function removeOriginalDeclaration(symbol: Node): void {
	if (Node.isVariableDeclaration(symbol)) {
		const statement = symbol.getVariableStatement()
		if (statement) {
			const declarations = statement.getDeclarations()
			if (declarations.length === 1) {
				// Remove the entire statement
				statement.remove()
			} else {
				// Just remove this declaration
				symbol.remove()
			}
		}
	} else if (Node.isFunctionDeclaration(symbol)) {
		symbol.remove()
	} else {
		// Handle other declaration types
		symbol.remove()
	}
}
```

## Test Fixtures and Testing

### Test Fixtures for ADD

```
src/core/tools/refactor-code/__tests__/fixtures/add/
├── add-function/
│   ├── input/
│   │   └── src/
│   │       └── utils.ts
│   ├── expected/
│   │   └── src/
│   │       └── utils.ts
│   └── operation.json
├── add-class/
│   ├── input/
│   ├── expected/
│   └── operation.json
├── add-method/
│   ├── input/
│   ├── expected/
│   └── operation.json
└── add-interface/
    ├── input/
    ├── expected/
    └── operation.json
```

### Example Test Fixture

**File**: `fixtures/add/add-function/operation.json`

```json
{
	"operation": "add",
	"symbolType": "function",
	"symbolName": "calculateAverage",
	"targetFilePath": "src/utils.ts",
	"spec": {
		"parameters": [
			{
				"name": "numbers",
				"type": "number[]"
			}
		],
		"returnType": "number",
		"body": "const sum = numbers.reduce((acc, num) => acc + num, 0);\nreturn sum / numbers.length;",
		"isExported": true,
		"jsDoc": "/**\n * Calculates the average of an array of numbers\n * @param numbers The numbers to average\n * @returns The average value\n */"
	},
	"reason": "Add utility function for calculating averages"
}
```

### Test Fixtures for INLINE

```
src/core/tools/refactor-code/__tests__/fixtures/inline/
├── inline-constant/
│   ├── input/
│   ├── expected/
│   └── operation.json
├── inline-function/
│   ├── input/
│   ├── expected/
│   └── operation.json
└── inline-expression/
    ├── input/
    ├── expected/
    └── operation.json
```

## Implementation Checklist

### Code Generator

- [ ] Create `src/core/tools/refactor-code/utils/code-generator.ts`
- [ ] Implement function generation
- [ ] Implement class generation
- [ ] Implement interface generation
- [ ] Support all modifiers and options
- [ ] Generate proper JSDoc comments

### ADD Operation

- [ ] Create `src/core/tools/refactor-code/operations/add.ts`
- [ ] Support adding functions
- [ ] Support adding classes
- [ ] Support adding interfaces
- [ ] Support adding methods to classes
- [ ] Support adding properties to classes
- [ ] Always require human review

### INLINE Operation

- [ ] Create `src/core/tools/refactor-code/operations/inline.ts`
- [ ] Support inlining constants
- [ ] Support inlining functions
- [ ] Support inlining expressions
- [ ] Handle parameter substitution
- [ ] Handle async functions
- [ ] Remove original declarations

### Testing

- [ ] Create test fixtures for ADD
- [ ] Create test fixtures for INLINE
- [ ] Test code generation quality
- [ ] Test naming conflict detection
- [ ] Test inline transformations
- [ ] Test edge cases

## Success Criteria

- [ ] Generated code follows TypeScript best practices
- [ ] ADD operation handles all symbol types
- [ ] INLINE operation preserves semantics
- [ ] Human review required for all ADD operations
- [ ] Naming conflicts detected and prevented
- [ ] All tests passing with >90% coverage
- [ ] Generated code is properly formatted

## Next Steps

After completing Phase 5:

- Code generation fully operational
- All refactoring operations implemented
- Ready for integration and performance optimization in Phase 6
