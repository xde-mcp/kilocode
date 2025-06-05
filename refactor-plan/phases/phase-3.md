# Phase 3: Multi-File Operations (2 weeks)

## Goal

Implement MOVE operation with import management and basic dependency analysis. This phase focuses on operations that span multiple files and require careful coordination of imports and exports.

## Prerequisites

- Phase 2 completed with RENAME and REMOVE operations working
- Symbol finder utility tested and reliable
- Transaction system proven with rollback capability
- Comprehensive test infrastructure in place

## Key Components to Build

### 1. Import Manager Utility

**File**: `src/core/tools/refactor-code/utils/import-manager.ts`

```typescript
import {
	Project,
	SourceFile,
	ImportDeclaration,
	ExportDeclaration,
	ImportSpecifier,
	ExportSpecifier,
	Node,
	SyntaxKind,
} from "ts-morph"
import * as path from "path"

export interface ImportUpdate {
	file: SourceFile
	oldPath: string
	newPath: string
	symbolName: string
}

export class ImportManager {
	private project: Project
	private updatedFiles: Set<string> = new Set()

	constructor(project: Project) {
		this.project = project
	}

	/**
	 * Updates all imports after a symbol is moved to a new file
	 */
	async updateImportsAfterMove(symbolName: string, oldFilePath: string, newFilePath: string): Promise<void> {
		this.updatedFiles.clear()

		// Find all files that import from the old file
		const importingFiles = this.findFilesImporting(oldFilePath)

		for (const file of importingFiles) {
			await this.updateImportPath(file, symbolName, oldFilePath, newFilePath)
			this.updatedFiles.add(file.getFilePath())
		}

		// Update re-exports as well
		const reExportingFiles = this.findFilesReExporting(oldFilePath)

		for (const file of reExportingFiles) {
			await this.updateReExportPath(file, symbolName, oldFilePath, newFilePath)
			this.updatedFiles.add(file.getFilePath())
		}

		// Add necessary imports to the new file
		const newFile = this.project.getSourceFile(newFilePath)
		if (newFile) {
			await this.addMissingImports(newFile, symbolName, oldFilePath)
		}
	}

	/**
	 * Finds all files that import from the specified file
	 */
	private findFilesImporting(filePath: string): SourceFile[] {
		const sourceFile = this.project.getSourceFile(filePath)
		if (!sourceFile) return []

		// Get all source files that reference this file
		const referencingFiles = sourceFile.getReferencingSourceFiles()

		// Filter to only those that actually import from this file
		return referencingFiles.filter((file) => {
			const imports = file.getImportDeclarations()
			return imports.some((imp) => this.isImportFromFile(imp, filePath))
		})
	}

	/**
	 * Finds all files that re-export from the specified file
	 */
	private findFilesReExporting(filePath: string): SourceFile[] {
		const allFiles = this.project.getSourceFiles()

		return allFiles.filter((file) => {
			const exports = file.getExportDeclarations()
			return exports.some((exp) => this.isExportFromFile(exp, filePath))
		})
	}

	/**
	 * Updates import paths in a file
	 */
	private async updateImportPath(
		file: SourceFile,
		symbolName: string,
		oldPath: string,
		newPath: string,
	): Promise<void> {
		const imports = file.getImportDeclarations()

		for (const importDecl of imports) {
			if (!this.isImportFromFile(importDecl, oldPath)) {
				continue
			}

			// Check if this import includes the moved symbol
			const namedImports = importDecl.getNamedImports()
			const hasSymbol = namedImports.some((imp) => imp.getName() === symbolName)

			if (!hasSymbol) {
				continue
			}

			// Calculate new relative path
			const newRelativePath = this.calculateRelativePath(file.getFilePath(), newPath)

			// Update the module specifier
			importDecl.setModuleSpecifier(newRelativePath)

			// Check if we need to keep the old import for other symbols
			const otherImports = namedImports.filter((imp) => imp.getName() !== symbolName)

			if (otherImports.length > 0) {
				// Remove only the moved symbol from the import
				const symbolImport = namedImports.find((imp) => imp.getName() === symbolName)
				symbolImport?.remove()

				// Add a new import for the moved symbol
				this.addImport(file, symbolName, newRelativePath)
			}
		}
	}

	/**
	 * Updates re-export paths in a file
	 */
	private async updateReExportPath(
		file: SourceFile,
		symbolName: string,
		oldPath: string,
		newPath: string,
	): Promise<void> {
		const exports = file.getExportDeclarations()

		for (const exportDecl of exports) {
			if (!this.isExportFromFile(exportDecl, oldPath)) {
				continue
			}

			// Check if this export includes the moved symbol
			const namedExports = exportDecl.getNamedExports()
			const hasSymbol = namedExports.some((exp) => exp.getName() === symbolName)

			if (!hasSymbol) {
				continue
			}

			// Calculate new relative path
			const newRelativePath = this.calculateRelativePath(file.getFilePath(), newPath)

			// Update the module specifier
			exportDecl.setModuleSpecifier(newRelativePath)

			// Check if we need to keep the old export for other symbols
			const otherExports = namedExports.filter((exp) => exp.getName() !== symbolName)

			if (otherExports.length > 0) {
				// Remove only the moved symbol from the export
				const symbolExport = namedExports.find((exp) => exp.getName() === symbolName)
				symbolExport?.remove()

				// Add a new export for the moved symbol
				this.addReExport(file, symbolName, newRelativePath)
			}
		}
	}

	/**
	 * Adds missing imports to the new file
	 */
	private async addMissingImports(newFile: SourceFile, movedSymbolName: string, oldFilePath: string): Promise<void> {
		// Get the moved symbol's dependencies from the old file
		const oldFile = this.project.getSourceFile(oldFilePath)
		if (!oldFile) return

		// Find all symbols that the moved symbol depends on
		const dependencies = this.findSymbolDependencies(oldFile, movedSymbolName)

		for (const dep of dependencies) {
			// Check if the dependency is already imported in the new file
			if (!this.hasImport(newFile, dep.name)) {
				// Add the import
				if (dep.isLocal) {
					// Local import from the old file
					const relativePath = this.calculateRelativePath(newFile.getFilePath(), oldFilePath)
					this.addImport(newFile, dep.name, relativePath)
				} else {
					// External import - copy the import statement
					this.copyImport(newFile, oldFile, dep.name)
				}
			}
		}
	}

	/**
	 * Checks if an import declaration is from the specified file
	 */
	private isImportFromFile(importDecl: ImportDeclaration, filePath: string): boolean {
		const moduleSpecifier = importDecl.getModuleSpecifierValue()
		const resolvedPath = this.resolveModulePath(importDecl.getSourceFile().getFilePath(), moduleSpecifier)

		return this.pathsMatch(resolvedPath, filePath)
	}

	/**
	 * Checks if an export declaration is from the specified file
	 */
	private isExportFromFile(exportDecl: ExportDeclaration, filePath: string): boolean {
		const moduleSpecifier = exportDecl.getModuleSpecifierValue()
		if (!moduleSpecifier) return false

		const resolvedPath = this.resolveModulePath(exportDecl.getSourceFile().getFilePath(), moduleSpecifier)

		return this.pathsMatch(resolvedPath, filePath)
	}

	/**
	 * Calculates relative path between two files
	 */
	private calculateRelativePath(fromPath: string, toPath: string): string {
		const fromDir = path.dirname(fromPath)
		let relativePath = path.relative(fromDir, toPath)

		// Remove file extension
		relativePath = relativePath.replace(/\.(ts|tsx|js|jsx)$/, "")

		// Ensure it starts with ./ or ../
		if (!relativePath.startsWith(".")) {
			relativePath = "./" + relativePath
		}

		return relativePath
	}

	/**
	 * Resolves a module path to an absolute path
	 */
	private resolveModulePath(fromPath: string, moduleSpecifier: string): string {
		if (!moduleSpecifier.startsWith(".")) {
			// External module
			return moduleSpecifier
		}

		const fromDir = path.dirname(fromPath)
		const resolved = path.resolve(fromDir, moduleSpecifier)

		// Try with different extensions
		const extensions = [".ts", ".tsx", ".js", ".jsx"]
		for (const ext of extensions) {
			if (resolved.endsWith(ext)) {
				return resolved
			}
			const withExt = resolved + ext
			if (this.project.getSourceFile(withExt)) {
				return withExt
			}
		}

		return resolved
	}

	/**
	 * Checks if two paths refer to the same file
	 */
	private pathsMatch(path1: string, path2: string): boolean {
		// Normalize paths and remove extensions
		const normalize = (p: string) => {
			return p.replace(/\\/g, "/").replace(/\.(ts|tsx|js|jsx)$/, "")
		}

		return normalize(path1) === normalize(path2)
	}

	/**
	 * Finds dependencies of a symbol
	 */
	private findSymbolDependencies(file: SourceFile, symbolName: string): Array<{ name: string; isLocal: boolean }> {
		// This is a simplified implementation
		// In reality, we'd need to analyze the AST to find actual dependencies
		const dependencies: Array<{ name: string; isLocal: boolean }> = []

		// For now, return empty array
		// Full implementation would analyze the symbol's body for references
		return dependencies
	}

	/**
	 * Checks if a file already imports a symbol
	 */
	private hasImport(file: SourceFile, symbolName: string): boolean {
		const imports = file.getImportDeclarations()

		return imports.some((imp) => {
			const namedImports = imp.getNamedImports()
			return namedImports.some((ni) => ni.getName() === symbolName)
		})
	}

	/**
	 * Adds an import to a file
	 */
	private addImport(file: SourceFile, symbolName: string, modulePath: string): void {
		// Check if we already have an import from this module
		const existingImport = file.getImportDeclaration((imp) => imp.getModuleSpecifierValue() === modulePath)

		if (existingImport) {
			// Add to existing import
			existingImport.addNamedImport(symbolName)
		} else {
			// Create new import
			file.addImportDeclaration({
				moduleSpecifier: modulePath,
				namedImports: [symbolName],
			})
		}
	}

	/**
	 * Adds a re-export to a file
	 */
	private addReExport(file: SourceFile, symbolName: string, modulePath: string): void {
		file.addExportDeclaration({
			moduleSpecifier: modulePath,
			namedExports: [symbolName],
		})
	}

	/**
	 * Copies an import from one file to another
	 */
	private copyImport(toFile: SourceFile, fromFile: SourceFile, symbolName: string): void {
		const imports = fromFile.getImportDeclarations()

		for (const imp of imports) {
			const namedImports = imp.getNamedImports()
			const hasSymbol = namedImports.some((ni) => ni.getName() === symbolName)

			if (hasSymbol) {
				// Copy this import
				toFile.addImportDeclaration({
					moduleSpecifier: imp.getModuleSpecifierValue(),
					namedImports: [symbolName],
				})
				break
			}
		}
	}

	/**
	 * Gets list of files that were updated
	 */
	getUpdatedFiles(): string[] {
		return Array.from(this.updatedFiles)
	}

	/**
	 * Removes unused imports from a file
	 */
	removeUnusedImports(file: SourceFile): void {
		file.fixUnusedIdentifiers()
	}
}
```

### 2. MOVE Operation Implementation

**File**: `src/core/tools/refactor-code/operations/move.ts`

```typescript
import { Project, SourceFile, Node } from "ts-morph"
import { MoveOperation, OperationResult } from "../types"
import { SymbolFinder } from "../utils/symbol-finder"
import { ImportManager } from "../utils/import-manager"
import { RefactorTransaction } from "../transaction"
import * as path from "path"

export async function executeMoveOperation(
	project: Project,
	operation: MoveOperation,
	transaction: RefactorTransaction,
): Promise<OperationResult> {
	try {
		// Validate inputs
		if (!operation.targetFilePath) {
			return {
				success: false,
				error: "Target file path is required for move operation",
				operation,
			}
		}

		// Check if moving to the same file
		if (operation.selector.filePath === operation.targetFilePath) {
			return {
				success: false,
				error: "Cannot move symbol to the same file",
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

		// Check if symbol is moveable (only top-level symbols)
		if (!isTopLevelSymbol(symbol)) {
			return {
				success: false,
				error: `Symbol '${operation.selector.name}' is not a top-level symbol and cannot be moved`,
				operation,
			}
		}

		// Check if symbol is exported
		const isExported = finder.isExported(symbol)

		// Get or create target file
		let targetFile = project.getSourceFile(operation.targetFilePath)
		if (!targetFile) {
			// Create the target file
			targetFile = project.createSourceFile(operation.targetFilePath, "", {
				overwrite: false,
			})
		}

		// Snapshot both files
		await transaction.snapshot(operation.selector.filePath)
		await transaction.snapshot(operation.targetFilePath)

		// Extract the symbol with its dependencies
		const extracted = extractSymbolWithDependencies(symbol, sourceFile)

		// Check for naming conflicts in target file
		const conflictCheck = checkTargetFileConflicts(targetFile, operation.selector.name)
		if (conflictCheck.hasConflict) {
			return {
				success: false,
				error: `Naming conflict in target file: ${conflictCheck.message}`,
				operation,
			}
		}

		// Add to target file
		addSymbolToFile(targetFile, extracted, isExported)

		// Create import manager
		const importManager = new ImportManager(project)

		// Update all imports before removing the symbol
		await importManager.updateImportsAfterMove(
			operation.selector.name,
			operation.selector.filePath,
			operation.targetFilePath,
		)

		// Remove from source file
		removeSymbolFromFile(symbol, sourceFile)

		// Clean up empty imports in source file
		importManager.removeUnusedImports(sourceFile)

		// Format both files
		sourceFile.formatText()
		targetFile.formatText()

		// Save all affected files
		await project.save()

		// Get all affected files
		const affectedFiles = new Set<string>([
			operation.selector.filePath,
			operation.targetFilePath,
			...importManager.getUpdatedFiles(),
		])

		// Record the operation
		transaction.recordOperation({
			id: operation.id || "move-" + Date.now(),
			type: "move",
			undo: () => {
				// In a real implementation, we'd move the symbol back
			},
		})

		return {
			success: true,
			operation,
			affectedFiles: Array.from(affectedFiles),
			message: `Successfully moved '${operation.selector.name}' to ${operation.targetFilePath}`,
		}
	} catch (error) {
		return {
			success: false,
			error: `Move operation failed: ${error.message}`,
			operation,
		}
	}
}

function isTopLevelSymbol(symbol: Node): boolean {
	// Check if the symbol is at the top level of the file
	const parent = symbol.getParent()
	return parent?.getKind() === SyntaxKind.SourceFile
}

interface ExtractedSymbol {
	text: string
	imports: string[]
	comments: string
}

function extractSymbolWithDependencies(symbol: Node, sourceFile: SourceFile): ExtractedSymbol {
	// Get leading comments
	const leadingComments = symbol
		.getLeadingCommentRanges()
		.map((range) => sourceFile.getFullText().slice(range.getPos(), range.getEnd()))
		.join("\n")

	// Get the symbol text
	const symbolText = symbol.getFullText()

	// Get required imports (simplified - in reality we'd analyze dependencies)
	const imports: string[] = []

	// If the symbol has type annotations, we might need type imports
	// This is a simplified implementation

	return {
		text: symbolText.trim(),
		imports,
		comments: leadingComments.trim(),
	}
}

function checkTargetFileConflicts(
	targetFile: SourceFile,
	symbolName: string,
): { hasConflict: boolean; message?: string } {
	// Check for existing symbols with the same name
	const finder = new SymbolFinder(targetFile)
	const existingSymbol = finder.findSymbol({
		type: "identifier",
		name: symbolName,
		filePath: targetFile.getFilePath(),
	})

	if (existingSymbol) {
		return {
			hasConflict: true,
			message: `Symbol '${symbolName}' already exists in target file`,
		}
	}

	return { hasConflict: false }
}

function addSymbolToFile(targetFile: SourceFile, extracted: ExtractedSymbol, isExported: boolean): void {
	// Build the full text to add
	let textToAdd = ""

	// Add comments if any
	if (extracted.comments) {
		textToAdd += extracted.comments + "\n"
	}

	// Add export keyword if needed
	if (isExported && !extracted.text.trim().startsWith("export")) {
		textToAdd += "export "
	}

	// Add the symbol
	textToAdd += extracted.text

	// Add to the end of the file with proper spacing
	const existingText = targetFile.getFullText()
	if (existingText.trim()) {
		textToAdd = "\n\n" + textToAdd
	}

	targetFile.addStatements(textToAdd)
}

function removeSymbolFromFile(symbol: Node, sourceFile: SourceFile): void {
	// Remove the symbol and its leading comments
	const leadingComments = symbol.getLeadingCommentRanges()

	if (leadingComments.length > 0) {
		// Get the start of the first comment
		const firstCommentStart = leadingComments[0].getPos()
		const symbolEnd = symbol.getEnd()

		// Remove from first comment to end of symbol
		sourceFile.removeText(firstCommentStart, symbolEnd - firstCommentStart)
	} else {
		// Just remove the symbol
		symbol.remove()
	}

	// Clean up extra newlines
	const text = sourceFile.getFullText()
	const cleanedText = text.replace(/\n{3,}/g, "\n\n")
	if (text !== cleanedText) {
		sourceFile.replaceWithText(cleanedText)
	}
}
```

### 3. Basic Dependency Analyzer

**File**: `src/core/tools/refactor-code/utils/dependency-analyzer.ts`

```typescript
import { RefactorOperation } from "../schema"

export interface OperationDependency {
	operation: RefactorOperation
	dependsOn: RefactorOperation[]
}

export interface DependencyGraph {
	nodes: Map<string, RefactorOperation>
	edges: Map<string, Set<string>> // operation id -> set of dependency ids
}

export class DependencyAnalyzer {
	/**
	 * Analyzes dependencies between operations
	 */
	analyzeDependencies(operations: RefactorOperation[]): OperationDependency[] {
		const dependencies: OperationDependency[] = []

		for (let i = 0; i < operations.length; i++) {
			const operation = operations[i]
			const deps: RefactorOperation[] = []

			for (let j = 0; j < i; j++) {
				const earlierOp = operations[j]

				if (this.operationsDependOn(operation, earlierOp)) {
					deps.push(earlierOp)
				}
			}

			dependencies.push({
				operation,
				dependsOn: deps,
			})
		}

		return dependencies
	}

	/**
	 * Sorts operations based on dependencies
	 */
	sortOperations(operations: RefactorOperation[]): RefactorOperation[] {
		const graph = this.buildDependencyGraph(operations)
		const sorted = this.topologicalSort(graph)

		if (!sorted) {
			throw new Error("Circular dependency detected in refactoring operations")
		}

		return sorted
	}

	/**
	 * Checks if two operations have a dependency relationship
	 */
	private operationsDependOn(op1: RefactorOperation, op2: RefactorOperation): boolean {
		// Check if operations affect the same file
		if (this.affectsSameFile(op1, op2)) {
			return true
		}

		// Check if one operation depends on the result of another
		if (this.isDependentOn(op1, op2)) {
			return true
		}

		return false
	}

	/**
	 * Checks if operations affect the same file
	 */
	private affectsSameFile(op1: RefactorOperation, op2: RefactorOperation): boolean {
		const files1 = this.getAffectedFiles(op1)
		const files2 = this.getAffectedFiles(op2)

		// Check for intersection
		return files1.some((f) => files2.includes(f))
	}

	/**
	 * Gets files affected by an operation
	 */
	private getAffectedFiles(op: RefactorOperation): string[] {
		const files: string[] = []

		// Add source file
		if ("selector" in op && op.selector && "filePath" in op.selector) {
			files.push(op.selector.filePath)
		}

		// Add target file for move operations
		if (op.operation === "move" && "targetFilePath" in op) {
			files.push(op.targetFilePath)
		}

		// Add target file for add operations
		if (op.operation === "add" && "targetFilePath" in op) {
			files.push(op.targetFilePath)
		}

		return files
	}

	/**
	 * Checks if one operation depends on another
	 */
	private isDependentOn(op1: RefactorOperation, op2: RefactorOperation): boolean {
		// Example: If op2 renames a symbol that op1 tries to move
		if (op2.operation === "rename" && op1.operation === "move") {
			if ("selector" in op1 && "selector" in op2) {
				// If op2 renamed the symbol that op1 is trying to move
				if (op2.selector.name === op1.selector.name && op2.selector.filePath === op1.selector.filePath) {
					return true
				}
			}
		}

		// Example: If op2 moves a symbol that op1 tries to rename
		if (op2.operation === "move" && op1.operation === "rename") {
			if ("selector" in op1 && "selector" in op2) {
				// If op2 moved the symbol that op1 is trying to rename
				if (op2.selector.name === op1.selector.name) {
					// op1 should use the new file path
					return true
				}
			}
		}

		return false
	}

	/**
	 * Builds a dependency graph
	 */
	private buildDependencyGraph(operations: RefactorOperation[]): DependencyGraph {
		const nodes = new Map<string, RefactorOperation>()
		const edges = new Map<string, Set<string>>()

		// Ensure all operations have IDs
		operations.forEach((op, index) => {
			const id = op.id || `op-${index}`
			nodes.set(id, { ...op, id })
			edges.set(id, new Set())
		})

		// Build edges based on dependencies
		const nodeArray = Array.from(nodes.entries())

		for (let i = 0; i < nodeArray.length; i++) {
			const [id1, op1] = nodeArray[i]

			for (let j = i + 1; j < nodeArray.length; j++) {
				const [id2, op2] = nodeArray[j]

				if (this.operationsDependOn(op2, op1)) {
					// op2 depends on op1
					edges.get(id2)!.add(id1)
				}
			}
		}

		return { nodes, edges }
	}

	/**
	 * Performs topological sort on the dependency graph
	 */
	private topologicalSort(graph: DependencyGraph): RefactorOperation[] | null {
		const { nodes, edges } = graph
		const sorted: RefactorOperation[] = []
		const visited = new Set<string>()
		const visiting = new Set<string>()

		// Helper function for DFS
		const visit = (nodeId: string): boolean => {
			if (visiting.has(nodeId)) {
				// Circular dependency detected
				return false
			}

			if (visited.has(nodeId)) {
				return true
			}

			visiting.add(nodeId)

			// Visit dependencies first
			const dependencies = edges.get(nodeId) || new Set()
			for (const depId of dependencies) {
				if (!visit(depId)) {
					return false
				}
			}

			visiting.delete(nodeId)
			visited.add(nodeId)
			sorted.push(nodes.get(nodeId)!)

			return true
		}

		// Visit all nodes
		for (const nodeId of nodes.keys()) {
			if (!visit(nodeId)) {
				return null // Circular dependency
			}
		}

		return sorted
	}

	/**
	 * Detects circular dependencies
	 */
	detectCircularDependencies(operations: RefactorOperation[]): string[][] {
		const graph = this.buildDependencyGraph(operations)
		const cycles: string[][] = []

		// Use DFS to detect cycles
		const visited = new Set<string>()
		const recStack = new Set<string>()
		const path: string[] = []

		const findCycles = (nodeId: string): void => {
			visited.add(nodeId)
			recStack.add(nodeId)
			path.push(nodeId)

			const dependencies = graph.edges.get(nodeId) || new Set()
			for (const depId of dependencies) {
				if (!visited.has(depId)) {
					findCycles(depId)
				} else if (recStack.has(depId)) {
					// Found a cycle
					const cycleStart = path.indexOf(depId)
					cycles.push(path.slice(cycleStart))
				}
			}

			path.pop()
			recStack.delete(nodeId)
		}

		for (const nodeId of graph.nodes.keys()) {
			if (!visited.has(nodeId)) {
				findCycles(nodeId)
			}
		}

		return cycles
	}
}
```

### 4. Update Engine for Multi-File Operations

**File**: `src/core/tools/refactor-code/engine.ts` (updates)

```typescript
import { executeMoveOperation } from './operations/move';
import { ImportManager } from './utils/import-manager';
import { DependencyAnalyzer } from './utils/dependency-analyzer';

// Add to the RefactorEngine class:

private importManager: ImportManager;
private dependencyAnalyzer: DependencyAnalyzer;

constructor(tsConfigPath?: string) {
  // ... existing constructor code ...

  this.importManager = new ImportManager(this.project);
  this.dependencyAnalyzer = new DependencyAnalyzer();
}

async executeOperation(operation: RefactorOperation): Promise<OperationResult> {
  // ... existing code ...

  switch (operation.operation) {
    // ... existing cases ...

    case 'move':
      result = await executeMoveOperation(
        this.project,
        operation,
        this.transaction
      );
      break;

    // ... rest of cases ...
  }

  // ... rest of method ...
}

async executeBatch(operations: RefactorOperation[]): Promise<BatchResult> {
  // Sort operations based on dependencies
  let sortedOperations: RefactorOperation[];

  try {
    sortedOperations = this.dependencyAnalyzer.sortOperations(operations);
  } catch (error) {
    if (error.message.includes('Circular dependency')) {
      const cycles = this.dependencyAnalyzer.detectCircularDependencies(operations);
      return {
        success: false,
        error: `Circular dependencies detected: ${JSON.stringify(cycles)}`,
        operations: [],
        totalOperations: operations.length,
        successfulOperations: 0,
        failedOperations: operations.length,
        affectedFiles: [],
        duration: 0
      };
    }
    throw error;
  }

  // Execute sorted operations
  const results: OperationResult[] = [];
  const startTime = Date.now();

  for (const operation of sortedOperations) {
    const result = await this.executeOperation(operation);
    results.push(result);

    if (!result.success && operation.stopOnError !== false) {
      break;
    }
  }

  // ... rest of method ...
}
```

## Test Fixtures and Testing

### Test Fixture Structure for MOVE

```
src/core/tools/refactor-code/__tests__/fixtures/move/
├── simple-function/
│   ├── input/
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── source.ts
│   │       ├── target.ts (may not exist)
│   │       └── consumer.ts
│   ├── expected/
│   │   └── src/
│   │       ├── source.ts
│   │       ├── target.ts
│   │       └── consumer.ts
│   └── operation.json
├── with-imports/
│   ├── input/
│   ├── expected/
│   └── operation.json
├── create-new-file/
│   ├── input/
│   ├── expected/
│   └── operation.json
└── update-exports/
    ├── input/
    ├── expected/
    └── operation.json
```

### Example Test Fixture

**File**: `fixtures/move/simple-function/input/src/source.ts`

```typescript
import { helperFunction } from "./helpers"

export function functionToMove(value: string): string {
	return helperFunction(value.toUpperCase())
}

export function stayingFunction(): void {
	console.log("This stays")
}
```

**File**: `fixtures/move/simple-function/input/src/consumer.ts`

```typescript
import { functionToMove, stayingFunction } from "./source"

const result = functionToMove("test")
stayingFunction()
```

**File**: `fixtures/move/simple-function/operation.json`

```json
{
	"operation": "move",
	"selector": {
		"type": "identifier",
		"name": "functionToMove",
		"kind": "function",
		"filePath": "src/source.ts"
	},
	"targetFilePath": "src/target.ts",
	"reason": "Better organization"
}
```

**File**: `fixtures/move/simple-function/expected/src/source.ts`

```typescript
import { helperFunction } from "./helpers"

export function stayingFunction(): void {
	console.log("This stays")
}
```

**File**: `fixtures/move/simple-function/expected/src/target.ts`

```typescript
import { helperFunction } from "./helpers"

export function functionToMove(value: string): string {
	return helperFunction(value.toUpperCase())
}
```

**File**: `fixtures/move/simple-function/expected/src/consumer.ts`

```typescript
import { functionToMove } from "./target"
import { stayingFunction } from "./source"

const result = functionToMove("test")
stayingFunction()
```

### Test Implementation

**File**: `src/core/tools/refactor-code/__tests__/operations/move.test.ts`

```typescript
import { RefactorEngine } from "../../engine"
import { runSnapshotTest } from "../helpers/snapshot-testing"
import * as path from "path"
import * as fs from "fs"

describe("MOVE Operation", () => {
	const fixturesDir = path.join(__dirname, "../fixtures/move")

	const testCases = fs
		.readdirSync(fixturesDir)
		.filter((dir) => fs.statSync(path.join(fixturesDir, dir)).isDirectory())

	testCases.forEach((testCase) => {
		test(`move: ${testCase}`, async () => {
			await runSnapshotTest(path.join(fixturesDir, testCase))
		})
	})

	test("should update imports in multiple files", async () => {
		// Specific test for complex import scenarios
	})

	test("should handle circular imports", async () => {
		// Test for circular import handling
	})

	test("should create target file if it does not exist", async () => {
		// Test file creation
	})
})
```

**File**: `src/core/tools/refactor-code/__tests__/utils/import-manager.test.ts`

```typescript
import { ImportManager } from "../../utils/import-manager"
import { Project } from "ts-morph"

describe("ImportManager", () => {
	let project: Project
	let importManager: ImportManager

	beforeEach(() => {
		project = new Project({ useInMemoryFileSystem: true })
		importManager = new ImportManager(project)
	})

	test("should update import paths after move", async () => {
		// Create test files
		const sourceFile = project.createSourceFile(
			"src/source.ts",
			`
      export function myFunction() {}
    `,
		)

		const consumerFile = project.createSourceFile(
			"src/consumer.ts",
			`
      import { myFunction } from './source';
      myFunction();
    `,
		)

		// Move the function
		await importManager.updateImportsAfterMove("myFunction", "src/source.ts", "src/utils/target.ts")

		// Check the import was updated
		const updatedConsumer = consumerFile.getFullText()
		expect(updatedConsumer).toContain("from './utils/target'")
	})

	test("should handle re-exports", async () => {
		// Test re-export handling
	})

	test("should preserve other imports when updating", async () => {
		// Test that other imports are not affected
	})
})
```

**File**: `src/core/tools/refactor-code/__tests__/utils/dependency-analyzer.test.ts`

```typescript
import { DependencyAnalyzer } from "../../utils/dependency-analyzer"
import { RefactorOperation } from "../../schema"

describe("DependencyAnalyzer", () => {
	const analyzer = new DependencyAnalyzer()

	test("should detect file-based dependencies", () => {
		const operations: RefactorOperation[] = [
			{
				operation: "rename",
				selector: {
					type: "identifier",
					name: "oldName",
					kind: "function",
					filePath: "file1.ts",
				},
				newName: "newName",
				reason: "Test",
			},
			{
				operation: "move",
				selector: {
					type: "identifier",
					name: "oldName", // Should depend on rename
					kind: "function",
					filePath: "file1.ts",
				},
				targetFilePath: "file2.ts",
				reason: "Test",
			},
		]

		const sorted = analyzer.sortOperations(operations)

		// Rename should come before move
		expect(sorted[0].operation).toBe("rename")
		expect(sorted[1].operation).toBe("move")
	})

	test("should detect circular dependencies", () => {
		const operations: RefactorOperation[] = [
			{
				id: "op1",
				operation: "move",
				selector: {
					type: "identifier",
					name: "func1",
					kind: "function",
					filePath: "file1.ts",
				},
				targetFilePath: "file2.ts",
				reason: "Test",
			},
			{
				id: "op2",
				operation: "move",
				selector: {
					type: "identifier",
					name: "func2",
					kind: "function",
					filePath: "file2.ts",
				},
				targetFilePath: "file1.ts",
				reason: "Test",
			},
		]

		expect(() => analyzer.sortOperations(operations)).toThrow("Circular dependency")
	})
})
```

## Implementation Checklist

### Import Manager

- [ ] Create `src/core/tools/refactor-code/utils/import-manager.ts`
- [ ] Implement import path updating
- [ ] Handle named imports
- [ ] Handle re-exports
- [ ] Support relative path calculation
- [ ] Clean up unused imports

### MOVE Operation

- [ ] Create `src/core/tools/refactor-code/operations/move.ts`
- [ ] Implement symbol moving with TS-Morph
- [ ] Handle file creation
- [ ] Extract symbol with dependencies
- [ ] Update imports automatically
- [ ] Preserve comments and formatting

### Dependency Analyzer

- [ ] Create `src/core/tools/refactor-code/utils/dependency-analyzer.ts`
- [ ] Implement dependency detection
- [ ] Add topological sorting
- [ ] Detect circular dependencies
- [ ] Handle complex operation sequences

### Engine Updates

- [ ] Integrate MOVE operation
- [ ] Add dependency analysis to batch execution
- [ ] Handle circular dependency errors
- [ ] Update validation for MOVE

### Testing

- [ ] Create test fixtures for MOVE
- [ ] Test import updates
- [ ] Test file creation
- [ ] Test dependency analysis
- [ ] Test circular dependency detection
- [ ] Integration tests for complex scenarios

### Documentation

- [ ] Document import manager API
- [ ] Document MOVE operation behavior
- [ ] Document dependency analysis
- [ ] Create troubleshooting guide

## Success Criteria

- [ ] MOVE operation correctly moves symbols between files
- [ ] All imports are updated automatically
- [ ] New files are created when needed
- [ ] Export status is preserved
- [ ] Comments and formatting are maintained
- [ ] Dependency analysis prevents conflicts
- [ ] Circular dependencies are detected
- [ ] All tests passing with >90% coverage
- [ ] Performance acceptable for large projects

## Common Issues and Solutions

### Issue: Import paths not updating

**Solution**: Ensure all files are loaded in the project and use proper path resolution.

### Issue: Circular imports after move

**Solution**: Detect and warn about potential circular imports before executing.

### Issue: Lost formatting or comments

**Solution**: Extract full text including leading/trailing trivia.

### Issue: Dependency conflicts

**Solution**: Use dependency analyzer to order operations correctly.

## Next Steps

After completing Phase 3:

- MOVE operation fully functional
- Import management automated
- Basic dependency analysis working
- Ready for complex transformations in Phase 4
