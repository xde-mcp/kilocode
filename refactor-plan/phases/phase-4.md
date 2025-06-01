# Phase 4: Complex Transformations (2 weeks)

## Goal

Implement EXTRACT and REFACTOR operations with advanced dependency analysis. These operations enable complex code transformations like extracting functions from code blocks and executing multi-step refactoring sequences.

## Prerequisites

- Phase 3 completed with MOVE operation and import management working
- Dependency analyzer tested and functional
- All single-file and multi-file operations operational
- Comprehensive test infrastructure established

## Key Components to Build

### 1. Code Analysis Utilities

**File**: `src/core/tools/refactor-code/utils/code-analyzer.ts`

```typescript
import {
	SourceFile,
	Node,
	SyntaxKind,
	VariableDeclaration,
	Identifier,
	CallExpression,
	PropertyAccessExpression,
	Block,
	Statement,
	Expression,
} from "ts-morph"

export interface CodeBlockAnalysis {
	statements: Statement[]
	usedVariables: VariableInfo[]
	declaredVariables: VariableInfo[]
	returnStatements: Statement[]
	throwStatements: Statement[]
	modifiedVariables: VariableInfo[]
	calledFunctions: string[]
}

export interface VariableInfo {
	name: string
	type?: string
	isConst: boolean
	isParameter: boolean
	declaration?: VariableDeclaration
}

export interface ExtractedFunctionSpec {
	name: string
	parameters: ParameterSpec[]
	returnType: string
	body: string
	isAsync: boolean
	needsReturn: boolean
}

export interface ParameterSpec {
	name: string
	type: string
	isOptional: boolean
	defaultValue?: string
}

export class CodeAnalyzer {
	/**
	 * Analyzes a code block to determine its dependencies and characteristics
	 */
	analyzeCodeBlock(sourceFile: SourceFile, startLine: number, endLine: number): CodeBlockAnalysis {
		const statements = this.getStatementsInRange(sourceFile, startLine, endLine)

		const analysis: CodeBlockAnalysis = {
			statements,
			usedVariables: [],
			declaredVariables: [],
			returnStatements: [],
			throwStatements: [],
			modifiedVariables: [],
			calledFunctions: [],
		}

		// Analyze each statement
		for (const statement of statements) {
			this.analyzeStatement(statement, analysis)
		}

		// Filter out declared variables from used variables
		analysis.usedVariables = analysis.usedVariables.filter(
			(used) => !analysis.declaredVariables.some((declared) => declared.name === used.name),
		)

		return analysis
	}

	/**
	 * Gets statements within a line range
	 */
	private getStatementsInRange(sourceFile: SourceFile, startLine: number, endLine: number): Statement[] {
		const statements: Statement[] = []

		sourceFile.forEachDescendant((node) => {
			if (Node.isStatement(node)) {
				const nodeStart = node.getStartLineNumber()
				const nodeEnd = node.getEndLineNumber()

				if (nodeStart >= startLine && nodeEnd <= endLine) {
					// Check if this is a top-level statement in the range
					const parent = node.getParent()
					if (parent && Node.isSourceFile(parent)) {
						statements.push(node)
					} else if (parent && Node.isBlock(parent)) {
						const parentStart = parent.getStartLineNumber()
						if (parentStart < startLine) {
							statements.push(node)
						}
					}
				}
			}
		})

		return statements
	}

	/**
	 * Analyzes a single statement
	 */
	private analyzeStatement(statement: Statement, analysis: CodeBlockAnalysis): void {
		statement.forEachDescendant((node) => {
			// Check for variable usage
			if (Node.isIdentifier(node) && this.isVariableUsage(node)) {
				const name = node.getText()
				if (!analysis.usedVariables.some((v) => v.name === name)) {
					analysis.usedVariables.push({
						name,
						type: this.inferType(node),
						isConst: false,
						isParameter: false,
					})
				}
			}

			// Check for variable declarations
			if (Node.isVariableDeclaration(node)) {
				const name = node.getName()
				analysis.declaredVariables.push({
					name,
					type: node.getType().getText(),
					isConst: node.isConst(),
					isParameter: false,
					declaration: node,
				})
			}

			// Check for return statements
			if (Node.isReturnStatement(node)) {
				analysis.returnStatements.push(node)
			}

			// Check for throw statements
			if (Node.isThrowStatement(node)) {
				analysis.throwStatements.push(node)
			}

			// Check for function calls
			if (Node.isCallExpression(node)) {
				const expression = node.getExpression()
				if (Node.isIdentifier(expression)) {
					analysis.calledFunctions.push(expression.getText())
				}
			}

			// Check for variable modifications
			if (Node.isBinaryExpression(node)) {
				const left = node.getLeft()
				if (Node.isIdentifier(left) && node.getOperatorToken().getText() === "=") {
					const name = left.getText()
					const existing = analysis.modifiedVariables.find((v) => v.name === name)
					if (!existing) {
						analysis.modifiedVariables.push({
							name,
							type: this.inferType(left),
							isConst: false,
							isParameter: false,
						})
					}
				}
			}
		})
	}

	/**
	 * Checks if an identifier is a variable usage
	 */
	private isVariableUsage(identifier: Identifier): boolean {
		const parent = identifier.getParent()

		// Not a usage if it's a property name
		if (parent && Node.isPropertyAccessExpression(parent)) {
			return parent.getExpression() === identifier
		}

		// Not a usage if it's a parameter name
		if (parent && Node.isParameter(parent)) {
			return false
		}

		// Not a usage if it's a variable declaration
		if (parent && Node.isVariableDeclaration(parent)) {
			return false
		}

		return true
	}

	/**
	 * Infers the type of a variable
	 */
	private inferType(node: Node): string {
		try {
			return node.getType().getText()
		} catch {
			return "any"
		}
	}

	/**
	 * Generates a function from analyzed code block
	 */
	generateExtractedFunction(analysis: CodeBlockAnalysis, functionName: string): ExtractedFunctionSpec {
		// Determine parameters from used variables
		const parameters: ParameterSpec[] = analysis.usedVariables.map((v) => ({
			name: v.name,
			type: v.type || "any",
			isOptional: false,
		}))

		// Determine if async is needed
		const isAsync = analysis.calledFunctions.some((f) => f.includes("await"))

		// Determine return type
		let returnType = "void"
		let needsReturn = false

		if (analysis.returnStatements.length > 0) {
			// Analyze return statements to determine type
			// This is simplified - real implementation would be more sophisticated
			returnType = "any" // Would infer from return expressions
			needsReturn = true
		} else if (analysis.modifiedVariables.length > 0) {
			// If variables are modified, we might need to return them
			if (analysis.modifiedVariables.length === 1) {
				returnType = analysis.modifiedVariables[0].type || "any"
				needsReturn = true
			} else {
				// Multiple modified variables - return an object
				returnType = `{ ${analysis.modifiedVariables.map((v) => `${v.name}: ${v.type || "any"}`).join(", ")} }`
				needsReturn = true
			}
		}

		// Generate body
		const body = this.generateFunctionBody(analysis, needsReturn)

		return {
			name: functionName,
			parameters,
			returnType,
			body,
			isAsync,
			needsReturn,
		}
	}

	/**
	 * Generates function body from statements
	 */
	private generateFunctionBody(analysis: CodeBlockAnalysis, needsReturn: boolean): string {
		let body = analysis.statements.map((s) => s.getText()).join("\n")

		// Add return statement if needed and not already present
		if (needsReturn && analysis.returnStatements.length === 0) {
			if (analysis.modifiedVariables.length === 1) {
				body += `\nreturn ${analysis.modifiedVariables[0].name};`
			} else if (analysis.modifiedVariables.length > 1) {
				const returnObj = analysis.modifiedVariables.map((v) => v.name).join(", ")
				body += `\nreturn { ${returnObj} };`
			}
		}

		return body
	}
}
```

### 2. EXTRACT Operation Implementation

**File**: `src/core/tools/refactor-code/operations/extract.ts`

```typescript
import { Project, SourceFile } from "ts-morph"
import { ExtractOperation, OperationResult } from "../types"
import { CodeAnalyzer } from "../utils/code-analyzer"
import { RefactorTransaction } from "../transaction"

export async function executeExtractOperation(
	project: Project,
	operation: ExtractOperation,
	transaction: RefactorTransaction,
): Promise<OperationResult> {
	try {
		// Validate inputs
		if (!operation.newName) {
			return {
				success: false,
				error: "New name is required for extract operation",
				operation,
			}
		}

		if (operation.selector.type !== "code_block") {
			return {
				success: false,
				error: "Extract operation requires a code_block selector",
				operation,
			}
		}

		// Get source file
		const sourceFile = project.getSourceFile(operation.selector.filePath)
		if (!sourceFile) {
			return {
				success: false,
				error: `Source file not found: ${operation.selector.filePath}`,
				operation,
			}
		}

		// Snapshot the file
		await transaction.snapshot(operation.selector.filePath)

		// Analyze the code block
		const analyzer = new CodeAnalyzer()
		const analysis = analyzer.analyzeCodeBlock(sourceFile, operation.selector.startLine, operation.selector.endLine)

		// Check if extraction is possible
		if (analysis.statements.length === 0) {
			return {
				success: false,
				error: "No statements found in the specified range",
				operation,
			}
		}

		// Generate the extracted function
		const extractedFunction = analyzer.generateExtractedFunction(analysis, operation.newName)

		// Perform the extraction based on type
		let result: OperationResult

		switch (operation.extractionType) {
			case "function":
				result = await extractToFunction(sourceFile, operation, analysis, extractedFunction, transaction)
				break

			case "method":
				result = await extractToMethod(sourceFile, operation, analysis, extractedFunction, transaction)
				break

			default:
				result = {
					success: false,
					error: `Extraction type '${operation.extractionType}' not yet implemented`,
					operation,
				}
		}

		if (result.success) {
			// Save the file
			await sourceFile.save()
		}

		return result
	} catch (error) {
		return {
			success: false,
			error: `Extract operation failed: ${error.message}`,
			operation,
		}
	}
}

async function extractToFunction(
	sourceFile: SourceFile,
	operation: ExtractOperation,
	analysis: CodeBlockAnalysis,
	functionSpec: ExtractedFunctionSpec,
	transaction: RefactorTransaction,
): Promise<OperationResult> {
	// Build the function declaration
	const functionDeclaration = buildFunctionDeclaration(functionSpec)

	// Find where to insert the function (before the first usage)
	const insertPosition = findInsertPosition(sourceFile, operation.selector.startLine)

	// Insert the function
	sourceFile.insertText(insertPosition, functionDeclaration + "\n\n")

	// Build the function call
	const functionCall = buildFunctionCall(functionSpec, analysis)

	// Replace the original code with the function call
	replaceCodeBlock(sourceFile, operation.selector.startLine, operation.selector.endLine, functionCall)

	// Record the operation
	transaction.recordOperation({
		id: operation.id || "extract-" + Date.now(),
		type: "extract",
		undo: () => {
			// In a real implementation, we'd restore the original code
		},
	})

	return {
		success: true,
		operation,
		affectedFiles: [operation.selector.filePath],
		message: `Successfully extracted function '${operation.newName}'`,
	}
}

async function extractToMethod(
	sourceFile: SourceFile,
	operation: ExtractOperation,
	analysis: CodeBlockAnalysis,
	functionSpec: ExtractedFunctionSpec,
	transaction: RefactorTransaction,
): Promise<OperationResult> {
	// Find the containing class
	const containingClass = findContainingClass(sourceFile, operation.selector.startLine)

	if (!containingClass) {
		return {
			success: false,
			error: "No containing class found for method extraction",
			operation,
		}
	}

	// Build the method declaration
	const methodDeclaration = buildMethodDeclaration(functionSpec)

	// Add the method to the class
	containingClass.addMethod({
		name: functionSpec.name,
		parameters: functionSpec.parameters.map((p) => ({
			name: p.name,
			type: p.type,
			hasQuestionToken: p.isOptional,
		})),
		returnType: functionSpec.returnType,
		isAsync: functionSpec.isAsync,
		statements: functionSpec.body,
	})

	// Build the method call
	const methodCall = `this.${functionSpec.name}(${functionSpec.parameters.map((p) => p.name).join(", ")})`

	// Replace the original code with the method call
	replaceCodeBlock(
		sourceFile,
		operation.selector.startLine,
		operation.selector.endLine,
		functionSpec.needsReturn ? `return ${methodCall};` : `${methodCall};`,
	)

	return {
		success: true,
		operation,
		affectedFiles: [operation.selector.filePath],
		message: `Successfully extracted method '${operation.newName}'`,
	}
}

function buildFunctionDeclaration(spec: ExtractedFunctionSpec): string {
	const params = spec.parameters.map((p) => `${p.name}: ${p.type}`).join(", ")

	const asyncKeyword = spec.isAsync ? "async " : ""

	return `${asyncKeyword}function ${spec.name}(${params}): ${spec.returnType} {
${spec.body}
}`
}

function buildMethodDeclaration(spec: ExtractedFunctionSpec): string {
	const params = spec.parameters.map((p) => `${p.name}: ${p.type}`).join(", ")

	const asyncKeyword = spec.isAsync ? "async " : ""

	return `${asyncKeyword}${spec.name}(${params}): ${spec.returnType} {
${spec.body}
}`
}

function buildFunctionCall(spec: ExtractedFunctionSpec, analysis: CodeBlockAnalysis): string {
	const args = spec.parameters.map((p) => p.name).join(", ")
	const call = `${spec.name}(${args})`

	if (spec.needsReturn) {
		if (analysis.modifiedVariables.length === 1) {
			return `${analysis.modifiedVariables[0].name} = ${call};`
		} else if (analysis.modifiedVariables.length > 1) {
			const destructuring = analysis.modifiedVariables.map((v) => v.name).join(", ")
			return `const { ${destructuring} } = ${call};`
		}
		return `return ${call};`
	}

	return `${call};`
}

function findInsertPosition(sourceFile: SourceFile, beforeLine: number): number {
	// Find the statement that contains the line
	let insertPos = 0

	sourceFile.forEachChild((node) => {
		if (Node.isStatement(node)) {
			const nodeStart = node.getStartLineNumber()
			if (nodeStart >= beforeLine && insertPos === 0) {
				insertPos = node.getStart()
			}
		}
	})

	return insertPos || sourceFile.getStart()
}

function findContainingClass(sourceFile: SourceFile, line: number): ClassDeclaration | undefined {
	let containingClass: ClassDeclaration | undefined

	sourceFile.forEachDescendant((node) => {
		if (Node.isClassDeclaration(node)) {
			const start = node.getStartLineNumber()
			const end = node.getEndLineNumber()

			if (line >= start && line <= end) {
				containingClass = node
			}
		}
	})

	return containingClass
}

function replaceCodeBlock(sourceFile: SourceFile, startLine: number, endLine: number, replacement: string): void {
	const fullText = sourceFile.getFullText()
	const lines = fullText.split("\n")

	// Find the start and end positions
	let startPos = 0
	let endPos = 0

	for (let i = 0; i < lines.length; i++) {
		if (i === startLine - 1) {
			startPos = lines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0)
		}
		if (i === endLine - 1) {
			endPos = lines.slice(0, i + 1).join("\n").length
			break
		}
	}

	// Replace the text
	sourceFile.replaceText([startPos, endPos], replacement)
}
```

### 3. REFACTOR Operation Implementation

**File**: `src/core/tools/refactor-code/operations/refactor.ts`

```typescript
import { RefactorOperation, OperationResult } from "../types"
import { RefactorEngine } from "../engine"
import { DependencyAnalyzer } from "../utils/dependency-analyzer"
import { RefactorTransaction } from "../transaction"

export async function executeRefactorOperation(
	engine: RefactorEngine,
	operation: RefactorOperation,
	dependencyAnalyzer: DependencyAnalyzer,
): Promise<OperationResult> {
	if (operation.operation !== "refactor" || !operation.steps || operation.steps.length === 0) {
		return {
			success: false,
			error: "Invalid refactor operation: steps are required",
			operation,
		}
	}

	// Create a transaction for the entire refactoring
	const transaction = new RefactorTransaction(engine.getProject())
	const transactionId = await transaction.begin()

	try {
		// Sort operations based on dependencies
		const sortedSteps = dependencyAnalyzer.sortOperations(operation.steps)

		// Check for circular dependencies
		const cycles = dependencyAnalyzer.detectCircularDependencies(operation.steps)
		if (cycles.length > 0) {
			return {
				success: false,
				error: `Circular dependencies detected: ${JSON.stringify(cycles)}`,
				operation,
			}
		}

		// Execute each step
		const results: OperationResult[] = []
		const affectedFiles = new Set<string>()

		for (const step of sortedSteps) {
			// Execute the step
			const result = await engine.executeOperation(step)
			results.push(result)

			// Collect affected files
			if (result.affectedFiles) {
				result.affectedFiles.forEach((f) => affectedFiles.add(f))
			}

			// Stop on error unless explicitly told to continue
			if (!result.success && !operation.continueOnError) {
				// Rollback all changes
				await transaction.rollback()

				return {
					success: false,
					error: `Step failed: ${result.error}`,
					operation,
					subResults: results,
					affectedFiles: Array.from(affectedFiles),
				}
			}
		}

		// All steps completed
		await transaction.commit()

		const successCount = results.filter((r) => r.success).length
		const failureCount = results.filter((r) => !r.success).length

		return {
			success: failureCount === 0,
			operation,
			subResults: results,
			affectedFiles: Array.from(affectedFiles),
			message: `Refactoring completed: ${successCount} successful, ${failureCount} failed`,
			transactionId,
		}
	} catch (error) {
		await transaction.rollback()

		return {
			success: false,
			error: `Refactor operation failed: ${error.message}`,
			operation,
		}
	}
}
```

### 4. Advanced Dependency Analyzer

**File**: `src/core/tools/refactor-code/utils/advanced-dependency-analyzer.ts`

```typescript
import { RefactorOperation } from "../schema"
import { DependencyAnalyzer } from "./dependency-analyzer"

export interface SemanticDependency {
	from: string // operation id
	to: string // operation id
	type: "data" | "control" | "naming" | "location"
	strength: "strong" | "weak"
	description: string
}

export class AdvancedDependencyAnalyzer extends DependencyAnalyzer {
	/**
	 * Analyzes semantic dependencies between operations
	 */
	analyzeSemanticDependencies(operations: RefactorOperation[]): SemanticDependency[] {
		const dependencies: SemanticDependency[] = []

		// Ensure all operations have IDs
		const opsWithIds = operations.map((op, i) => ({
			...op,
			id: op.id || `op-${i}`,
		}))

		// Analyze each pair of operations
		for (let i = 0; i < opsWithIds.length; i++) {
			for (let j = i + 1; j < opsWithIds.length; j++) {
				const deps = this.findDependencies(opsWithIds[i], opsWithIds[j])
				dependencies.push(...deps)
			}
		}

		return dependencies
	}

	/**
	 * Finds dependencies between two operations
	 */
	private findDependencies(op1: RefactorOperation, op2: RefactorOperation): SemanticDependency[] {
		const deps: SemanticDependency[] = []

		// Data dependencies
		const dataDep = this.checkDataDependency(op1, op2)
		if (dataDep) deps.push(dataDep)

		// Control dependencies
		const controlDep = this.checkControlDependency(op1, op2)
		if (controlDep) deps.push(controlDep)

		// Naming dependencies
		const namingDep = this.checkNamingDependency(op1, op2)
		if (namingDep) deps.push(namingDep)

		// Location dependencies
		const locationDep = this.checkLocationDependency(op1, op2)
		if (locationDep) deps.push(locationDep)

		return deps
	}

	/**
	 * Checks for data dependencies (one operation uses data modified by another)
	 */
	private checkDataDependency(op1: RefactorOperation, op2: RefactorOperation): SemanticDependency | null {
		// Example: op1 renames X to Y, op2 uses X
		if (op1.operation === "rename" && this.operationUsesSymbol(op2, op1.selector.name)) {
			return {
				from: op2.id!,
				to: op1.id!,
				type: "data",
				strength: "strong",
				description: `${op2.operation} depends on renamed symbol from ${op1.operation}`,
			}
		}

		// Example: op1 removes X, op2 tries to use X
		if (op1.operation === "remove" && this.operationUsesSymbol(op2, op1.selector.name)) {
			return {
				from: op2.id!,
				to: op1.id!,
				type: "data",
				strength: "strong",
				description: `${op2.operation} cannot use symbol removed by ${op1.operation}`,
			}
		}

		return null
	}

	/**
	 * Checks for control dependencies (execution order matters)
	 */
	private checkControlDependency(op1: RefactorOperation, op2: RefactorOperation): SemanticDependency | null {
		// Example: Both operations modify the same file
		if (this.affectsSameFile(op1, op2)) {
			// Determine which should go first based on line numbers
			if (this.shouldExecuteBefore(op1, op2)) {
				return {
					from: op2.id!,
					to: op1.id!,
					type: "control",
					strength: "weak",
					description: "Operations affect the same file",
				}
			}
		}

		return null
	}

	/**
	 * Checks for naming dependencies
	 */
	private checkNamingDependency(op1: RefactorOperation, op2: RefactorOperation): SemanticDependency | null {
		// Example: op1 creates a symbol that op2 tries to create
		if (op1.operation === "add" && op2.operation === "add") {
			if (op1.symbolName === op2.symbolName && op1.targetFilePath === op2.targetFilePath) {
				return {
					from: op2.id!,
					to: op1.id!,
					type: "naming",
					strength: "strong",
					description: "Both operations create the same symbol",
				}
			}
		}

		return null
	}

	/**
	 * Checks for location dependencies
	 */
	private checkLocationDependency(op1: RefactorOperation, op2: RefactorOperation): SemanticDependency | null {
		// Example: op1 moves file that op2 targets
		if (op1.operation === "move" && "targetFilePath" in op2) {
			if (op1.selector.filePath === op2.targetFilePath) {
				return {
					from: op2.id!,
					to: op1.id!,
					type: "location",
					strength: "strong",
					description: `${op2.operation} targets file moved by ${op1.operation}`,
				}
			}
		}

		return null
	}

	/**
	 * Checks if an operation uses a specific symbol
	 */
	private operationUsesSymbol(op: RefactorOperation, symbolName: string): boolean {
		if ("selector" in op && op.selector.type === "identifier") {
			return op.selector.name === symbolName
		}

		if (op.operation === "refactor" && op.steps) {
			return op.steps.some((step) => this.operationUsesSymbol(step, symbolName))
		}

		return false
	}

	/**
	 * Determines if op1 should execute before op2
	 */
	private shouldExecuteBefore(op1: RefactorOperation, op2: RefactorOperation): boolean {
		// Operations that remove code should go last
		if (op1.operation === "remove" && op2.operation !== "remove") {
			return false
		}
		if (op2.operation === "remove" && op1.operation !== "remove") {
			return true
		}

		// Operations that add code should go first
		if (op1.operation === "add" && op2.operation !== "add") {
			return true
		}
		if (op2.operation === "add" && op1.operation !== "add") {
			return false
		}

		// Default: maintain order
		return true
	}

	/**
	 * Generates a dependency graph visualization
	 */
	generateDependencyGraph(operations: RefactorOperation[]): string {
		const dependencies = this.analyzeSemanticDependencies(operations)

		let graph = "digraph RefactoringDependencies {\n"
		graph += "  rankdir=TB;\n"
		graph += "  node [shape=box];\n\n"

		// Add nodes
		operations.forEach((op, i) => {
			const id = op.id || `op-${i}`
			const label = `${op.operation}\\n${this.getOperationLabel(op)}`
			graph += `  "${id}" [label="${label}"];\n`
		})

		graph += "\n"

		// Add edges
		dependencies.forEach((dep) => {
			const style = dep.strength === "strong" ? "solid" : "dashed"
			const color = this.getDependencyColor(dep.type)
			graph += `  "${dep.from}" -> "${dep.to}" [style=${style}, color=${color}];\n`
		})

		graph += "}\n"

		return graph
	}

	private getOperationLabel(op: RefactorOperation): string {
		if ("selector" in op && op.selector.type === "identifier") {
			return op.selector.name
		}
		if ("symbolName" in op) {
			return op.symbolName
		}
		return ""
	}

	private getDependencyColor(type: string): string {
		const colors = {
			data: "blue",
			control: "red",
			naming: "green",
			location: "orange",
		}
		return colors[type] || "black"
	}
}
```

## Test Fixtures and Testing

### Test Fixtures for EXTRACT

```
src/core/tools/refactor-code/__tests__/fixtures/extract/
├── extract-function/
│   ├── input/
│   │   └── src/
│   │       └── calculator.ts
│   ├── expected/
│   │   └── src/
│   │       └── calculator.ts
│   └── operation.json
├── extract-method/
│   ├── input/
│   ├── expected/
│   └── operation.json
└── extract-with-parameters/
    ├── input/
    ├── expected/
    └── operation.json
```

### Example Test Fixture

**File**: `fixtures/extract/extract-function/input/src/calculator.ts`

```typescript
export class Calculator {
	calculate(a: number, b: number, operation: string): number {
		// Start extraction
		let result: number

		if (operation === "add") {
			result = a + b
		} else if (operation === "subtract") {
			result = a - b
		} else if (operation === "multiply") {
			result = a * b
		} else if (operation === "divide") {
			result = a / b
		} else {
			throw new Error("Unknown operation")
		}

		return result
		// End extraction
	}
}
```

**File**: `fixtures/extract/extract-function/operation.json`

```json
{
	"operation": "extract",
	"selector": {
		"type": "code_block",
		"filePath": "src/calculator.ts",
		"startLine": 4,
		"endLine": 17
	},
	"extractionType": "function",
	"newName": "performOperation",
	"reason": "Extract operation logic"
}
```

**File**: `fixtures/extract/extract-function/expected/src/calculator.ts`

```typescript
function performOperation(a: number, b: number, operation: string): number {
	let result: number

	if (operation === "add") {
		result = a + b
	} else if (operation === "subtract") {
		result = a - b
	} else if (operation === "multiply") {
		result = a * b
	} else if (operation === "divide") {
		result = a / b
	} else {
		throw new Error("Unknown operation")
	}

	return result
}

export class Calculator {
	calculate(a: number, b: number, operation: string): number {
		return performOperation(a, b, operation)
	}
}
```

### Test Implementation

**File**: `src/core/tools/refactor-code/__tests__/operations/extract.test.ts`

```typescript
import { RefactorEngine } from "../../engine"
import { runSnapshotTest } from "../helpers/snapshot-testing"
import * as path from "path"
import * as fs from "fs"

describe("EXTRACT Operation", () => {
	const fixturesDir = path.join(__dirname, "../fixtures/extract")

	const testCases = fs
		.readdirSync(fixturesDir)
		.filter((dir) => fs.statSync(path.join(fixturesDir, dir)).isDirectory())

	testCases.forEach((testCase) => {
		test(`extract: ${testCase}`, async () => {
			await runSnapshotTest(path.join(fixturesDir, testCase))
		})
	})

	test("should handle variable dependencies correctly", async () => {
		// Test that parameters are correctly identified
	})

	test("should handle return values correctly", async () => {
		// Test return value inference
	})

	test("should detect async requirements", async () => {
		// Test async function detection
	})
})
```

## Implementation Checklist

### Code Analyzer

- [ ] Create `src/core/tools/refactor-code/utils/code-analyzer.ts`
- [ ] Implement code block analysis
- [ ] Detect variable usage and dependencies
- [ ] Identify return statements
- [ ] Generate function specifications
- [ ] Handle async detection

### EXTRACT Operation

- [ ] Create `src/core/tools/refactor-code/operations/extract.ts`
- [ ] Implement function extraction
- [ ] Implement method extraction
- [ ] Handle parameter detection
- [ ] Handle return type inference
- [ ] Replace code with function calls

### REFACTOR Operation

- [ ] Create `src/core/tools/refactor-code/operations/refactor.ts`
- [ ] Implement multi-step execution
- [ ] Use dependency analyzer
- [ ] Handle transaction rollback
- [ ] Support continue-on-error mode

### Advanced Dependency Analyzer

- [ ] Create `src/core/tools/refactor-code/utils/advanced-dependency-analyzer.ts`
- [ ] Implement semantic dependency detection
- [ ] Add data flow analysis
- [ ] Add control flow analysis
- [ ] Generate dependency graphs

### Testing

- [ ] Create test fixtures for EXTRACT
- [ ] Create test fixtures for REFACTOR
- [ ] Test complex extraction scenarios
- [ ] Test multi-step refactoring
- [ ] Test dependency analysis
- [ ] Test rollback scenarios

## Success Criteria

- [ ] EXTRACT correctly identifies parameters and return types
- [ ] EXTRACT handles async functions properly
- [ ] REFACTOR executes steps in correct order
- [ ] Dependency analysis prevents conflicts
- [ ] Rollback works for complex operations
- [ ] All tests passing with >90% coverage
- [ ] Performance acceptable for complex refactorings

## Next Steps

After completing Phase 4:

- Complex transformations fully operational
- Ready for code generation operations in Phase 5
- Advanced dependency analysis working
- Multi-step refactoring tested and reliable
