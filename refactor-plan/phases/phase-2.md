# Phase 2: Single-File Operations (1 week)

## Goal

Implement RENAME and REMOVE operations with full safety checks and testing. These operations work within single files or across projects but are simpler than multi-file operations like MOVE. The implementation will prioritize RENAME first, followed by thorough testing with real-world code examples before implementing REMOVE.

## Current Status

- Phase 1 is partially complete with core infrastructure in place
- Completed components:
    - ✅ Schema validation using Zod
    - ✅ Robust LLM response parser
    - ✅ Transaction system for safe rollbacks
    - ✅ RefactorEngine framework with operation validation & preview
    - ✅ Integration with tool interface
- Missing components:
    - ❌ Actual implementation of operations (only placeholders exist)
    - ❌ Symbol finder utility
    - ❌ Human review system (partial implementation)
    - ❌ Comprehensive testing with real-world code

## Implementation Priority

1. **RENAME Operation (Priority #1)**

    - Implement proper symbol finding with TS-Morph
    - Add reference tracking across files
    - Implement naming conflict detection
    - Create comprehensive tests with real TypeScript code
    - Validate through tool interface

2. **Agent Testing for RENAME**

    - Test with LLM-generated refactoring commands
    - Ensure it works with complex TypeScript code
    - Document any edge cases or limitations

3. **REMOVE Operation (After RENAME is stable)**
    - Implement reference checking for safety
    - Add proper symbol removal logic
    - Create comprehensive tests
    - Update transaction system for proper rollback

This prioritization ensures we have a rock-solid implementation of RENAME before proceeding to other operations. We'll invest extra time in testing to ensure robustness before moving on.

## Implementation Priority

1. Implement RENAME operation first with full reference tracking
2. Create comprehensive tests with real TypeScript code examples
3. Verify operation works through the tool interface
4. Validate through agent testing with real-world scenarios
5. Only after RENAME is thoroughly tested, implement REMOVE operation

## Key Components to Build

### 1. Symbol Finder Utility

**File**: `src/core/tools/refactor-code/utils/symbol-finder.ts`

```typescript
import {
	Node,
	SourceFile,
	ClassDeclaration,
	InterfaceDeclaration,
	NamespaceDeclaration,
	FunctionDeclaration,
	VariableDeclaration,
	MethodDeclaration,
	PropertyDeclaration,
	TypeAliasDeclaration,
	EnumDeclaration,
	Identifier,
} from "ts-morph"
import { IdentifierSelector } from "../schema"

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

	private findNestedSymbol(selector: IdentifierSelector): Node | undefined {
		if (!selector.parent) return undefined

		// Find the parent first
		const parent = this.findSymbol({
			type: "identifier",
			name: selector.parent.name,
			kind: selector.parent.kind as any,
			filePath: selector.filePath,
		})

		if (!parent) return undefined

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

	private findFunction(name: string, signatureHint?: string): FunctionDeclaration | undefined {
		const functions = this.sourceFile.getFunctions()

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

	private findClass(name: string): ClassDeclaration | undefined {
		return this.sourceFile.getClass(name)
	}

	private findInterface(name: string): InterfaceDeclaration | undefined {
		return this.sourceFile.getInterface(name)
	}

	private findVariable(name: string): VariableDeclaration | undefined {
		const varStatements = this.sourceFile.getVariableStatements()

		for (const statement of varStatements) {
			const declaration = statement.getDeclarations().find((decl) => decl.getName() === name)
			if (declaration) return declaration
		}

		return undefined
	}

	private findTypeAlias(name: string): TypeAliasDeclaration | undefined {
		return this.sourceFile.getTypeAlias(name)
	}

	private findEnum(name: string): EnumDeclaration | undefined {
		return this.sourceFile.getEnum(name)
	}

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

		return symbol.findReferencesAsNodes() as Identifier[]
	}

	/**
	 * Checks if a symbol is exported
	 */
	isExported(symbol: Node): boolean {
		if (Node.isExportable(symbol)) {
			return symbol.isExported()
		}

		// Check if it's part of an export statement
		const parent = symbol.getParent()
		if (parent && Node.isExportDeclaration(parent)) {
			return true
		}

		return false
	}
}
```

### 2. RENAME Operation Implementation

**File**: `src/core/tools/refactor-code/operations/rename.ts`

```typescript
import { Project, SourceFile, Node } from "ts-morph"
import { RenameOperation, OperationResult } from "../types"
import { SymbolFinder } from "../utils/symbol-finder"
import { RefactorTransaction } from "../transaction"

export async function executeRenameOperation(
	project: Project,
	operation: RenameOperation,
	transaction: RefactorTransaction,
): Promise<OperationResult> {
	try {
		// Validate inputs
		if (!operation.newName || operation.newName.trim() === "") {
			return {
				success: false,
				error: "New name cannot be empty",
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

		// Find the symbol
		const finder = new SymbolFinder(sourceFile)
		const symbol = finder.findSymbol(operation.selector)

		if (!symbol) {
			return {
				success: false,
				error: `Symbol '${operation.selector.name}' not found in ${operation.selector.filePath}`,
				operation,
			}
		}

		// Check if symbol is renameable
		if (!Node.isRenameable(symbol)) {
			return {
				success: false,
				error: `Symbol '${operation.selector.name}' cannot be renamed`,
				operation,
			}
		}

		// Find all references to track affected files
		const references = finder.getReferences(symbol)
		const affectedFiles = new Set<string>()

		// Add the source file
		affectedFiles.add(operation.selector.filePath)

		// Add all files containing references
		for (const ref of references) {
			const refFile = ref.getSourceFile().getFilePath()
			affectedFiles.add(refFile)
		}

		// Snapshot all affected files
		for (const filePath of affectedFiles) {
			await transaction.snapshot(filePath)
		}

		// Check for naming conflicts
		const conflictCheck = checkNamingConflict(symbol, operation.newName)
		if (conflictCheck.hasConflict) {
			return {
				success: false,
				error: `Naming conflict: ${conflictCheck.message}`,
				operation,
				requiresReview: true,
			}
		}

		// Perform the rename
		symbol.rename(operation.newName)

		// Save all affected files
		await project.save()

		// Record the operation for potential undo
		transaction.recordOperation({
			id: operation.id || "rename-" + Date.now(),
			type: "rename",
			undo: () => {
				// In a real implementation, we'd store the old name
				// and rename back to it
				symbol.rename(operation.selector.name)
			},
		})

		return {
			success: true,
			operation,
			affectedFiles: Array.from(affectedFiles),
			message: `Successfully renamed '${operation.selector.name}' to '${operation.newName}'`,
		}
	} catch (error) {
		return {
			success: false,
			error: `Rename operation failed: ${error.message}`,
			operation,
		}
	}
}

function checkNamingConflict(symbol: Node, newName: string): { hasConflict: boolean; message?: string } {
	const sourceFile = symbol.getSourceFile()

	// Check if the new name already exists in the same scope
	if (Node.isFunctionDeclaration(symbol)) {
		const existingFunction = sourceFile.getFunction(newName)
		if (existingFunction && existingFunction !== symbol) {
			return {
				hasConflict: true,
				message: `Function '${newName}' already exists in the file`,
			}
		}
	}

	if (Node.isClassDeclaration(symbol)) {
		const existingClass = sourceFile.getClass(newName)
		if (existingClass && existingClass !== symbol) {
			return {
				hasConflict: true,
				message: `Class '${newName}' already exists in the file`,
			}
		}
	}

	if (Node.isInterfaceDeclaration(symbol)) {
		const existingInterface = sourceFile.getInterface(newName)
		if (existingInterface && existingInterface !== symbol) {
			return {
				hasConflict: true,
				message: `Interface '${newName}' already exists in the file`,
			}
		}
	}

	// Check for reserved keywords
	const reservedKeywords = ["class", "function", "const", "let", "var", "if", "else", "for", "while", "return"]
	if (reservedKeywords.includes(newName)) {
		return {
			hasConflict: true,
			message: `'${newName}' is a reserved keyword`,
		}
	}

	return { hasConflict: false }
}
```

### 3. REMOVE Operation Implementation

**File**: `src/core/tools/refactor-code/operations/remove.ts`

```typescript
import { Project, SourceFile, Node, SyntaxKind } from "ts-morph"
import { RemoveOperation, OperationResult } from "../types"
import { SymbolFinder } from "../utils/symbol-finder"
import { RefactorTransaction } from "../transaction"
import { HumanReviewSystem } from "../human-review"

export async function executeRemoveOperation(
	project: Project,
	operation: RemoveOperation,
	transaction: RefactorTransaction,
	reviewSystem: HumanReviewSystem,
): Promise<OperationResult> {
	try {
		// Always generate review guide for remove operations
		const reviewGuide = reviewSystem.generateReviewGuide([operation])

		// Get source file
		const sourceFile = project.getSourceFile(operation.selector.filePath)
		if (!sourceFile) {
			return {
				success: false,
				error: `Source file not found: ${operation.selector.filePath}`,
				operation,
				requiresReview: true,
				reviewGuide: JSON.stringify(reviewGuide),
			}
		}

		// Find the symbol
		const finder = new SymbolFinder(sourceFile)
		const symbol = finder.findSymbol(operation.selector)

		if (!symbol) {
			return {
				success: false,
				error: `Symbol '${operation.selector.name}' not found in ${operation.selector.filePath}`,
				operation,
				requiresReview: true,
				reviewGuide: JSON.stringify(reviewGuide),
			}
		}

		// Check for external references
		const references = finder.getReferences(symbol)
		const externalReferences = references.filter(
			(ref) => ref.getSourceFile().getFilePath() !== operation.selector.filePath,
		)

		if (externalReferences.length > 0) {
			const affectedFiles = new Set(externalReferences.map((ref) => ref.getSourceFile().getFilePath()))

			return {
				success: false,
				error: `Cannot remove '${operation.selector.name}': Found ${externalReferences.length} external reference(s) in ${affectedFiles.size} file(s)`,
				operation,
				affectedFiles: Array.from(affectedFiles),
				requiresReview: true,
				reviewGuide: JSON.stringify(reviewGuide),
			}
		}

		// Check for internal references (within the same file)
		const internalReferences = references.filter(
			(ref) =>
				ref.getSourceFile().getFilePath() === operation.selector.filePath && !isPartOfDeclaration(ref, symbol),
		)

		if (internalReferences.length > 0) {
			return {
				success: false,
				error: `Cannot remove '${operation.selector.name}': Found ${internalReferences.length} internal reference(s) in the same file`,
				operation,
				requiresReview: true,
				reviewGuide: JSON.stringify(reviewGuide),
			}
		}

		// Snapshot the file before removal
		await transaction.snapshot(operation.selector.filePath)

		// Store the removed content for potential undo
		const removedContent = symbol.getText()
		const removedPosition = symbol.getStart()

		// Remove the symbol
		removeSymbolSafely(symbol)

		// Clean up any empty import/export statements
		cleanupEmptyStatements(sourceFile)

		// Save the file
		await sourceFile.save()

		// Record the operation for potential undo
		transaction.recordOperation({
			id: operation.id || "remove-" + Date.now(),
			type: "remove",
			undo: () => {
				// In a real implementation, we'd restore the removed content
				// at the original position
				sourceFile.insertText(removedPosition, removedContent)
			},
		})

		return {
			success: true,
			operation,
			affectedFiles: [operation.selector.filePath],
			message: `Successfully removed '${operation.selector.name}'`,
			requiresReview: true,
			reviewGuide: JSON.stringify(reviewGuide),
		}
	} catch (error) {
		return {
			success: false,
			error: `Remove operation failed: ${error.message}`,
			operation,
			requiresReview: true,
		}
	}
}

function isPartOfDeclaration(reference: Node, declaration: Node): boolean {
	// Check if the reference is part of the declaration itself
	let current: Node | undefined = reference
	while (current) {
		if (current === declaration) {
			return true
		}
		current = current.getParent()
	}
	return false
}

function removeSymbolSafely(symbol: Node): void {
	// Handle different types of symbols
	if (Node.isVariableDeclaration(symbol)) {
		const statement = symbol.getVariableStatement()
		if (statement) {
			const declarations = statement.getDeclarations()
			if (declarations.length === 1) {
				// Remove the entire statement if this is the only declaration
				statement.remove()
			} else {
				// Just remove this declaration
				symbol.remove()
			}
		}
	} else if (Node.isStatement(symbol)) {
		// For statements (functions, classes, etc.), remove directly
		symbol.remove()
	} else if (Node.isMethodDeclaration(symbol) || Node.isPropertyDeclaration(symbol)) {
		// For class members, just remove the member
		symbol.remove()
	} else {
		// For other nodes, try to remove the parent statement
		const statement = symbol.getFirstAncestorByKind(SyntaxKind.Statement)
		if (statement) {
			statement.remove()
		} else {
			// Last resort: remove the node directly
			symbol.remove()
		}
	}
}

function cleanupEmptyStatements(sourceFile: SourceFile): void {
	// Remove empty import declarations
	const imports = sourceFile.getImportDeclarations()
	for (const importDecl of imports) {
		if (
			importDecl.getNamedImports().length === 0 &&
			!importDecl.getDefaultImport() &&
			!importDecl.getNamespaceImport()
		) {
			importDecl.remove()
		}
	}

	// Remove empty export declarations
	const exports = sourceFile.getExportDeclarations()
	for (const exportDecl of exports) {
		if (exportDecl.getNamedExports().length === 0 && !exportDecl.isNamespaceExport()) {
			exportDecl.remove()
		}
	}
}
```

### 4. Engine Integration

Update the main engine to use these operations:

**File**: `src/core/tools/refactor-code/engine.ts`

```typescript
import { Project } from "ts-morph"
import { RefactorOperation, OperationResult, BatchResult } from "./types"
import { RefactorTransaction } from "./transaction"
import { HumanReviewSystem } from "./human-review"
import { executeRenameOperation } from "./operations/rename"
import { executeRemoveOperation } from "./operations/remove"

export class RefactorEngine {
	private project: Project
	private transaction: RefactorTransaction
	private reviewSystem: HumanReviewSystem

	constructor(tsConfigPath?: string) {
		this.project = new Project({
			tsConfigFilePath: tsConfigPath,
			manipulationSettings: {
				usePrefixAndSuffixTextForRename: true,
				indentationText: "  ",
				insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true,
				quoteKind: 1, // Single quotes
			},
		})

		this.transaction = new RefactorTransaction(this.project)
		this.reviewSystem = new HumanReviewSystem()
	}

	async executeOperation(operation: RefactorOperation): Promise<OperationResult> {
		// Start a new transaction for this operation
		const transactionId = await this.transaction.begin()

		try {
			let result: OperationResult

			switch (operation.operation) {
				case "rename":
					result = await executeRenameOperation(this.project, operation, this.transaction)
					break

				case "remove":
					result = await executeRemoveOperation(this.project, operation, this.transaction, this.reviewSystem)
					break

				default:
					result = {
						success: false,
						error: `Operation '${operation.operation}' not yet implemented`,
						operation,
					}
			}

			if (result.success) {
				await this.transaction.commit()
				result.transactionId = transactionId
			} else {
				await this.transaction.rollback()
			}

			return result
		} catch (error) {
			await this.transaction.rollback()
			throw error
		}
	}

	async executeBatch(operations: RefactorOperation[]): Promise<BatchResult> {
		const results: OperationResult[] = []
		const startTime = Date.now()

		for (const operation of operations) {
			const result = await this.executeOperation(operation)
			results.push(result)

			// Stop on error if configured
			if (!result.success) {
				break
			}
		}

		const allSuccessful = results.every((r) => r.success)
		const affectedFiles = new Set<string>()

		for (const result of results) {
			if (result.affectedFiles) {
				result.affectedFiles.forEach((f) => affectedFiles.add(f))
			}
		}

		return {
			success: allSuccessful,
			operations: results,
			totalOperations: operations.length,
			successfulOperations: results.filter((r) => r.success).length,
			failedOperations: results.filter((r) => !r.success).length,
			affectedFiles: Array.from(affectedFiles),
			duration: Date.now() - startTime,
		}
	}

	validateOperation(operation: RefactorOperation): { valid: boolean; errors: string[] } {
		const errors: string[] = []

		// Basic validation
		if (!operation.operation) {
			errors.push("Operation type is required")
		}

		if (!operation.selector) {
			errors.push("Selector is required")
		}

		if (operation.operation === "rename" && !operation.newName) {
			errors.push("New name is required for rename operation")
		}

		if (operation.operation === "move" && !operation.targetFilePath) {
			errors.push("Target file path is required for move operation")
		}

		return {
			valid: errors.length === 0,
			errors,
		}
	}

	previewOperation(operation: RefactorOperation): { preview: string; warnings: string[] } {
		const warnings: string[] = []
		let preview = ""

		switch (operation.operation) {
			case "rename":
				preview = `Rename '${operation.selector.name}' to '${operation.newName}' in ${operation.selector.filePath}`
				if (operation.selector.kind === "class" || operation.selector.kind === "interface") {
					warnings.push("This may affect file imports in other files")
				}
				break

			case "remove":
				preview = `Remove '${operation.selector.name}' from ${operation.selector.filePath}`
				warnings.push("This operation cannot be undone automatically")
				warnings.push("Ensure no external code depends on this symbol")
				break
		}

		return { preview, warnings }
	}
}
```

### 5. Update Tool Implementation

Update the main tool to use the engine:

**File**: `src/core/tools/refactorCodeTool.ts` (partial update)

```typescript
import { RefactorEngine } from "./refactor-code/engine"
import { RobustLLMRefactorParser } from "./refactor-code/parser"

// In the execute function:
const parser = new RobustLLMRefactorParser()
const engine = new RefactorEngine(/* tsconfig path */)

try {
	// Parse the LLM response
	const operations = parser.parseResponse(dslCommandJson)

	// Execute the operations
	const result = await engine.executeBatch(operations)

	if (result.success) {
		pushToolResult(`Successfully completed ${result.successfulOperations} operations`)
	} else {
		pushToolResult(`Refactoring failed: ${result.failedOperations} operations failed`)
	}
} catch (error) {
	if (error instanceof RefactorParseError) {
		pushToolResult(`Failed to parse refactoring operations: ${error.message}`)
	} else {
		pushToolResult(`Refactoring error: ${error.message}`)
	}
}
```

## Test Fixtures and Snapshot Testing

### Test Fixture Structure

Create comprehensive test fixtures for each operation:

```
src/core/tools/refactor-code/__tests__/fixtures/
├── rename/
│   ├── simple-function/
│   │   ├── input/
│   │   │   ├── tsconfig.json
│   │   │   └── src/
│   │   │       ├── index.ts
│   │   │       └── utils.ts
│   │   ├── expected/
│   │   │   └── src/
│   │   │       ├── index.ts
│   │   │       └── utils.ts
│   │   └── operation.json
│   ├── class-with-references/
│   │   ├── input/
│   │   ├── expected/
│   │   └── operation.json
│   ├── method-rename/
│   │   ├── input/
│   │   ├── expected/
│   │   └── operation.json
│   └── overloaded-function/
│       ├── input/
│       ├── expected/
│       └── operation.json
├── remove/
│   ├── unused-function/
│   │   ├── input/
│   │   ├── expected/
│   │   └── operation.json
│   ├── with-internal-references/
│   │   ├── input/
│   │   ├── expected/
│   │   └── operation.json
│   └── with-external-references/
│       ├── input/
│       ├── expected/
│       └── operation.json
```

### Example Test Fixture

**File**: `src/core/tools/refactor-code/__tests__/fixtures/rename/simple-function/input/src/utils.ts`

```typescript
export function calculateTotal(items: number[]): number {
	return items.reduce((sum, item) => sum + item, 0)
}

export function formatCurrency(amount: number): string {
	return `$${amount.toFixed(2)}`
}
```

**File**: `src/core/tools/refactor-code/__tests__/fixtures/rename/simple-function/input/src/index.ts`

```typescript
import { calculateTotal, formatCurrency } from "./utils"

const prices = [10.99, 25.5, 5.0]
const total = calculateTotal(prices)
console.log(formatCurrency(total))
```

**File**: `src/core/tools/refactor-code/__tests__/fixtures/rename/simple-function/operation.json`

```json
{
	"operation": "rename",
	"selector": {
		"type": "identifier",
		"name": "calculateTotal",
		"kind": "function",
		"filePath": "src/utils.ts"
	},
	"newName": "computeSum",
	"reason": "Better naming convention"
}
```

**File**: `src/core/tools/refactor-code/__tests__/fixtures/rename/simple-function/expected/src/utils.ts`

```typescript
export function computeSum(items: number[]): number {
	return items.reduce((sum, item) => sum + item, 0)
}

export function formatCurrency(amount: number): string {
	return `$${amount.toFixed(2)}`
}
```

**File**: `src/core/tools/refactor-code/__tests__/fixtures/rename/simple-function/expected/src/index.ts`

```typescript
import { computeSum, formatCurrency } from "./utils"

const prices = [10.99, 25.5, 5.0]
const total = computeSum(prices)
console.log(formatCurrency(total))
```

### Snapshot Test Implementation

**File**: `src/core/tools/refactor-code/__tests__/operations/rename.test.ts`

```typescript
import { RefactorEngine } from "../../engine"
import { runSnapshotTest } from "../helpers/snapshot-testing"
import * as path from "path"
import * as fs from "fs"

describe("RENAME Operation", () => {
	const fixturesDir = path.join(__dirname, "../fixtures/rename")

	// Get all test cases
	const testCases = fs
		.readdirSync(fixturesDir)
		.filter((dir) => fs.statSync(path.join(fixturesDir, dir)).isDirectory())

	testCases.forEach((testCase) => {
		test(`rename: ${testCase}`, async () => {
			await runSnapshotTest(path.join(fixturesDir, testCase))
		})
	})

	test("should handle naming conflicts", async () => {
		const engine = new RefactorEngine()

		const operation = {
			operation: "rename" as const,
			selector: {
				type: "identifier" as const,
				name: "existingFunction",
				kind: "function" as const,
				filePath: "test.ts",
			},
			newName: "anotherExistingFunction",
			reason: "Test conflict",
		}

		const result = await engine.executeOperation(operation)

		expect(result.success).toBe(false)
		expect(result.error).toContain("conflict")
	})
})
```

### Snapshot Testing Helper

**File**: `src/core/tools/refactor-code/__tests__/helpers/snapshot-testing.ts`

```typescript
import { Project } from "ts-morph"
import { RefactorEngine } from "../../engine"
import * as fs from "fs-extra"
import * as path from "path"
import { RefactorOperation } from "../../schema"

export async function runSnapshotTest(fixturePath: string): Promise<void> {
	const inputDir = path.join(fixturePath, "input")
	const expectedDir = path.join(fixturePath, "expected")
	const operationPath = path.join(fixturePath, "operation.json")

	// Create a temporary directory for the test
	const tempDir = path.join(__dirname, "../temp", path.basename(fixturePath))
	await fs.ensureDir(tempDir)

	try {
		// Copy input files to temp directory
		await fs.copy(inputDir, tempDir)

		// Load the operation
		const operation: RefactorOperation = await fs.readJson(operationPath)

		// Create engine with the test project
		const engine = new RefactorEngine(path.join(tempDir, "tsconfig.json"))

		// Execute the operation
		const result = await engine.executeOperation(operation)

		// Assert success
		expect(result.success).toBe(true)

		// Compare output with expected
		await compareDirectories(tempDir, expectedDir)
	} finally {
		// Clean up temp directory
		await fs.remove(tempDir)
	}
}

async function compareDirectories(actualDir: string, expectedDir: string): Promise<void> {
	const expectedFiles = await getFilesRecursively(expectedDir)

	for (const file of expectedFiles) {
		const relativePath = path.relative(expectedDir, file)
		const actualFile = path.join(actualDir, relativePath)

		// Check file exists
		expect(await fs.pathExists(actualFile)).toBe(true)

		// Compare content
		const expectedContent = await fs.readFile(file, "utf-8")
		const actualContent = await fs.readFile(actualFile, "utf-8")

		expect(actualContent.trim()).toBe(expectedContent.trim())
	}
}

async function getFilesRecursively(dir: string): Promise<string[]> {
	const files: string[] = []
	const entries = await fs.readdir(dir, { withFileTypes: true })

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name)
		if (entry.isDirectory()) {
			files.push(...(await getFilesRecursively(fullPath)))
		} else {
			files.push(fullPath)
		}
	}

	return files
}
```

## Environment Parity Validation

Create specific tests to ensure operations work the same in test and production:

**File**: `src/core/tools/refactor-code/__tests__/environment-parity.test.ts`

```typescript
import { RefactorEngine } from "../engine"
import { Project } from "ts-morph"
import * as path from "path"

describe("Environment Parity - RENAME Operation", () => {
	test("rename produces identical results in test and production environments", async () => {
		// Test environment
		const testProject = new Project({
			useInMemoryFileSystem: true,
			compilerOptions: {
				target: 99, // ESNext
				module: 99, // ESNext
			},
		})

		testProject.createSourceFile(
			"test.ts",
			`
      export function oldName() {
        return 'test';
      }
    `,
		)

		// Production-like environment
		const prodProject = new Project({
			tsConfigFilePath: path.join(__dirname, "../../../../../tsconfig.json"),
		})

		// Create same file in prod project
		const tempFile = "temp-test.ts"
		prodProject.createSourceFile(
			tempFile,
			`
      export function oldName() {
        return 'test';
      }
    `,
		)

		// Execute rename in both environments
		const operation = {
			operation: "rename" as const,
			selector: {
				type: "identifier" as const,
				name: "oldName",
				kind: "function" as const,
				filePath: "test.ts",
			},
			newName: "newName",
			reason: "Test",
		}

		// Compare results
		const testEngine = new RefactorEngine()
		const prodEngine = new RefactorEngine()

		// Clean up
		prodProject.getSourceFile(tempFile)?.delete()
	})
})
```

## Implementation Checklist

### Symbol Finder

- [ ] Create `src/core/tools/refactor-code/utils/symbol-finder.ts`
- [ ] Implement finding for all symbol types
- [ ] Handle nested symbols (methods, properties)
- [ ] Implement reference finding
- [ ] Add export detection

### RENAME Operation

- [ ] Create `src/core/tools/refactor-code/operations/rename.ts`
- [ ] Implement symbol renaming with TS-Morph
- [ ] Add conflict detection
- [ ] Handle all symbol types
- [ ] Track affected files

### REMOVE Operation

- [ ] Create `src/core/tools/refactor-code/operations/remove.ts`
- [ ] Implement safe symbol removal
- [ ] Check for external references
- [ ] Check for internal references
- [ ] Clean up empty statements
- [ ] Always require human review

### Engine Updates

- [ ] Update `src/core/tools/refactor-code/engine.ts`
- [ ] Integrate RENAME operation
- [ ] Integrate REMOVE operation
- [ ] Add validation methods
- [ ] Add preview methods

### Testing

- [ ] Create test fixtures for RENAME
- [ ] Create test fixtures for REMOVE
- [ ] Implement snapshot testing helper
- [ ] Write unit tests for symbol finder
- [ ] Write integration tests
- [ ] Create environment parity tests

### Documentation

- [ ] Document symbol finder API
- [ ] Document operation implementations
- [ ] Create usage examples
- [ ] Document test fixture format

## Success Criteria

- [ ] RENAME operation works for all symbol types
- [ ] RENAME correctly updates all references
- [ ] RENAME detects and prevents naming conflicts
- [ ] REMOVE operation safely removes symbols
- [ ] REMOVE detects all references before removal
- [ ] REMOVE requires human review
- [ ] All snapshot tests passing
- [ ] Environment parity validated
- [ ] > 90% test coverage
- [ ] No TypeScript errors

## Common Issues and Solutions

### Issue: Symbol Not Found

**Solution**: Ensure the symbol finder checks all possible locations and handles different declaration styles.

### Issue: References Not Updated

**Solution**: Use TS-Morph's `findReferencesAsNodes()` method and ensure all files are loaded in the project.

### Issue: Naming Conflicts

**Solution**: Check for existing symbols in the same scope before renaming.

### Issue: Incomplete Removal

**Solution**: Handle different node types appropriately and clean up empty statements.

## Next Steps

1. Implement the SymbolFinder utility first
2. Implement the RENAME operation
    - Focus on correct symbol identification
    - Ensure proper reference tracking across files
    - Handle edge cases (nested symbols, overloaded functions)
    - Add naming conflict detection
3. Create comprehensive tests for RENAME
    - Unit tests for the implementation
    - Snapshot tests with real-world TypeScript code examples
    - Test various symbol types (functions, classes, methods, etc.)
4. Update the engine to use the RENAME operation
    - Replace placeholder implementation with actual implementation
    - Ensure transaction system works correctly with RENAME
5. Perform agent testing to validate RENAME works as expected
    - Test with LLM-generated refactoring commands
    - Verify correct handling of complex TypeScript code
    - Document any edge cases or limitations
6. Only after RENAME is working perfectly:
    - Implement the REMOVE operation with reference checks
    - Create snapshot tests for REMOVE
    - Update engine to use REMOVE implementation
    - Test REMOVE through agent interface
7. Final integration testing for both operations
8. Proceed to Phase 3 (MOVE operation) once all tests pass

This approach ensures we have a solid, well-tested implementation of RENAME before proceeding to other operations.
