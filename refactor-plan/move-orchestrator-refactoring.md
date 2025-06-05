# MoveOrchestrator Refactoring Plan

## Current Issues

The `MoveOrchestrator.ts` file (2149 lines) suffers from several architectural issues:

1. **Excessive Size**: At over 2100 lines, the file is far too large for a single component
2. **Mixed Responsibilities**: Handles path resolution, file operations, symbol manipulation, verification, etc.
3. **Test-Specific Hacks**: Contains code specifically designed to handle test scenarios
4. **Redundant Verification**: Multiple overlapping verification strategies with fallbacks
5. **Complex Error Handling**: Excessive try/catch blocks and recovery mechanisms
6. **Poor Separation of Concerns**: Tightly coupled logic that should be in separate components

## Test-Specific Code to Remove

### 1. Path Normalization for Tests (lines 430-463)

```typescript
const normalizePathForTests = (filePath: string): string => {
	// For tests, we need to provide just the relative path that the test expects
	// Replace backslashes with forward slashes for consistent paths across platforms
	let normalizedPath = filePath.replace(/\\/g, "/")

	// Handle temp directory patterns in test paths
	if (
		normalizedPath.includes("/var/folders/") ||
		normalizedPath.includes("/tmp/") ||
		normalizedPath.includes("\\Temp\\")
	) {
		// Look for services/ or utils/ or models/ directory patterns
		const dirMatch = normalizedPath.match(/(services|utils|models)\/([^/]+)$/)
		if (dirMatch) {
			return `${dirMatch[1]}/${dirMatch[2]}`
		}

		// Try another pattern matching /move-op-test-{timestamp}/{part}
		const tempDirMatch = normalizedPath.match(/move-op-test-\d+\/(.+)$/)
		if (tempDirMatch && tempDirMatch[1]) {
			return tempDirMatch[1]
		}

		// If all else fails, extract just the filename
		const parts = normalizedPath.split("/")
		for (let i = parts.length - 1; i >= 0; i--) {
			if (parts[i].endsWith(".ts")) {
				return parts[i]
			}
		}
	}

	return normalizedPath
}
```

### 2. Test Environment Special Cases (lines ~1400-1418)

```typescript
// Handle test environment as a special case
if (this.isTestEnvironment(targetFilePath)) {
	console.log(`[INFO] Test environment detected for ${targetFilePath}, checking for symbol on disk`)

	// For tests, attempt to verify directly from disk
	if (await this.verifySymbolOnDisk(targetFilePath, symbolName)) {
		return {
			success: true,
			affectedFiles,
		}
	}

	// For tests, we're more lenient
	console.log(`[WARNING] Target file not found in test environment, but proceeding with success`)
	return {
		success: true,
		affectedFiles,
	}
}
```

### 3. String-Based Verification (multiple methods)

- `verifySymbolOnDisk` with retries and exponential backoff
- `calculateStringSimilarity` for fuzzy matching
- `findPartialSymbolMatches` for approximate matching

## Proposed Architecture

### Core Components to Extract

1. **MoveOrchestrator** (Coordinator)

    - Orchestrates the overall move operation
    - Coordinates between other components
    - Maintains minimal direct logic

2. **MoveValidator**

    - Validates operations before execution
    - Checks symbol can be moved
    - Verifies paths are valid
    - Identifies potential conflicts

3. **MoveExecutor**

    - Handles the core logic of moving a symbol
    - Extracts symbol from source
    - Adds symbol to target
    - Updates imports

4. **MoveVerifier**

    - Verifies the move was successful
    - Uses AST-based verification (not string-based)
    - Provides clear success/failure indicators

5. **Utilities (Enhanced Existing)**
    - **PathResolver**: All path manipulation
    - **FileManager**: All file operations
    - **ImportManager**: All import handling

## Implementation Phases

### Phase 1: Extract Test-Specific Code

- Move test-specific code to test utilities
- Remove special-case handling for tests in main code
- Update tests to use proper utilities

### Phase 2: Create Core Components

- Create MoveValidator class
- Create MoveExecutor class
- Create MoveVerifier class
- Simplify MoveOrchestrator to coordinate

### Phase 3: Clean Up Error Handling

- Standardize error handling across components
- Remove redundant recovery mechanisms
- Implement simpler verification strategy

### Phase 4: Improve Import Handling

- Address known issues with import transfers
- Enhance the ImportManager to better handle dependencies
- Add tests for import edge cases

## Code Examples

### Simplified MoveOrchestrator

```typescript
export class MoveOrchestrator {
	constructor(
		private project: Project,
		private validator: MoveValidator,
		private executor: MoveExecutor,
		private verifier: MoveVerifier,
		private pathResolver: PathResolver,
		private fileManager: FileManager,
	) {}

	async executeMoveOperation(operation: MoveOperation): Promise<OperationResult> {
		// Validate
		const validationResult = await this.validator.validate(operation)
		if (!validationResult.success) {
			return validationResult
		}

		// Execute
		const executionResult = await this.executor.execute(
			operation,
			validationResult.symbol,
			validationResult.sourceFile,
			validationResult.targetFile,
		)

		if (!executionResult.success) {
			return executionResult
		}

		// Verify
		return await this.verifier.verify(
			operation,
			executionResult.sourceFile,
			executionResult.targetFile,
			executionResult.updatedFiles,
		)
	}
}
```

### New MoveValidator

```typescript
export class MoveValidator {
	constructor(
		private project: Project,
		private pathResolver: PathResolver,
		private fileManager: FileManager,
		private symbolResolver: SymbolResolver,
	) {}

	async validate(operation: MoveOperation): Promise<ValidationResult> {
		// 1. Validate operation parameters
		const paramValidation = this.validateParameters(operation)
		if (!paramValidation.success) {
			return paramValidation
		}

		// 2. Find and validate source file
		const sourceFilePath = this.pathResolver.normalizeFilePath(operation.selector.filePath)
		const sourceFile = await this.fileManager.ensureFileInProject(sourceFilePath)

		if (!sourceFile) {
			return {
				success: false,
				operation,
				error: `Source file not found: ${sourceFilePath}`,
				affectedFiles: [],
			}
		}

		// 3. Find and validate symbol
		const symbol = this.symbolResolver.resolveSymbol(operation.selector, sourceFile)
		if (!symbol) {
			return {
				success: false,
				operation,
				error: `Symbol '${operation.selector.name}' not found in ${sourceFilePath}`,
				affectedFiles: [],
			}
		}

		// 4. Validate symbol can be moved
		const symbolValidation = this.validateSymbol(symbol)
		if (!symbolValidation.success) {
			return {
				success: false,
				operation,
				error: symbolValidation.error || "Symbol cannot be moved",
				affectedFiles: [sourceFilePath],
			}
		}

		// 5. Validate target file
		const targetFileResult = await this.validateTargetFile(operation)
		if (!targetFileResult.success) {
			return {
				success: false,
				operation,
				error: targetFileResult.error || "Failed to prepare target file",
				affectedFiles: [sourceFilePath],
			}
		}

		return {
			success: true,
			operation,
			sourceFile,
			targetFile: targetFileResult.file,
			symbol,
			affectedFiles: [sourceFilePath, targetFileResult.path],
		}
	}

	// Private methods for specific validation tasks...
}
```

### New MoveExecutor

```typescript
export class MoveExecutor {
	constructor(
		private project: Project,
		private symbolExtractor: SymbolExtractor,
		private symbolRemover: SymbolRemover,
		private importManager: ImportManager,
	) {}

	async execute(
		operation: MoveOperation,
		symbol: ResolvedSymbol,
		sourceFile: SourceFile,
		targetFile: SourceFile,
	): Promise<ExecutionResult> {
		try {
			// 1. Extract the symbol and dependencies
			const extractResult = await this.symbolExtractor.extractSymbol(symbol)
			if (!extractResult.success) {
				return {
					success: false,
					operation,
					error: extractResult.error || "Failed to extract symbol",
					affectedFiles: [sourceFile.getFilePath()],
				}
			}

			// 2. Add the symbol to target file
			const addResult = await this.addSymbolToTarget(extractResult.extractedSymbol, targetFile)

			if (!addResult.success) {
				return {
					success: false,
					operation,
					error: addResult.error || "Failed to add symbol to target",
					affectedFiles: [sourceFile.getFilePath(), targetFile.getFilePath()],
				}
			}

			// 3. Save target file
			try {
				await targetFile.save()
			} catch (error) {
				return {
					success: false,
					operation,
					error: `Failed to save target file: ${error}`,
					affectedFiles: [sourceFile.getFilePath(), targetFile.getFilePath()],
				}
			}

			// 4. Remove symbol from source
			const removalResult = await this.symbolRemover.removeSymbol(symbol)

			// 5. Save source file (even if removal had issues)
			try {
				await sourceFile.save()
			} catch (error) {
				return {
					success: false,
					operation,
					error: `Failed to save source file: ${error}`,
					affectedFiles: [sourceFile.getFilePath(), targetFile.getFilePath()],
				}
			}

			// 6. Update imports
			const importResult = await this.importManager.updateImports(
				operation.selector.name,
				sourceFile.getFilePath(),
				targetFile.getFilePath(),
			)

			// 7. Save all modified files
			const updatedFiles = importResult.success ? importResult.updatedFiles : []
			for (const filePath of updatedFiles) {
				const file = this.project.getSourceFile(filePath)
				if (file) {
					await file.save()
				}
			}

			return {
				success: true,
				operation,
				sourceFile,
				targetFile,
				updatedFiles: [sourceFile.getFilePath(), targetFile.getFilePath(), ...updatedFiles],
				removalSuccess: removalResult.success,
				removalMethod: removalResult.method,
			}
		} catch (error) {
			return {
				success: false,
				operation,
				error: `Execution failed: ${error.message}`,
				affectedFiles: [sourceFile.getFilePath(), targetFile.getFilePath()],
			}
		}
	}

	// Private methods for symbol manipulation...
}
```

## Expected Benefits

1. **Maintainability**: Smaller, focused components with clear responsibilities
2. **Testability**: Each component can be tested in isolation
3. **Reliability**: Simplified error handling with fewer edge cases
4. **Performance**: Elimination of redundant operations and excessive verification
5. **Readability**: Better organization and naming makes the code easier to understand
6. **Extensibility**: New operations can be added without modifying existing components
