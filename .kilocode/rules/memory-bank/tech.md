# Technology Stack: RefactorCodeTool

## Core Technologies

- **ts-morph** (v26.0.0): TypeScript Compiler API wrapper for AST manipulation
- **Zod** (v3.24.2): Runtime type validation and schema definition
- **Node.js** (v20.18.1): Specific version requirement
- **VS Code Extension API**: Requires v1.84.0+

## Critical Dependencies

- **ts-morph**: Core AST manipulation - high risk dependency
- **zod**: Schema validation - medium risk, stable API

## Technical Constraints

- **AST parsing overhead**: ts-morph operations can be CPU-intensive
- **Path resolution**: Cross-platform file path handling complexities
- **Test environment**: Special handling for test vs. production environments
- **Memory usage**: Large projects require careful memory management

## Performance Optimization Features

- **Batch processing**: Operation ordering for efficiency
- **Parallel execution**: Safe concurrent operations where possible
- **File system caching**: Reduce I/O operations
- **Smart operation ordering**: Minimize conflicts between operations

## ts-morph Configuration Details

### Project Creation

- **Location**: [`engine.ts:185`](src/core/tools/refactor-code/engine.ts:185) - Main project creation
- **Configuration**: Basic setup with `rootDir` and `skipAddingFilesFromTsConfig: true`
- **Quote Style Issue**: ts-morph defaults to double quotes for import statements, but tests expect single quotes

### Import Statement Creation

- **Primary Location**: [`import-manager.ts`](src/core/tools/refactor-code/utils/import-manager.ts) - All import creation methods
- **Methods Affected**: `addImport()`, `addTypeImport()`, `addDefaultImport()`, `addNamespaceImport()`, `addReExport()`
- **Issue**: `addImportDeclaration()` and `setModuleSpecifier()` use ts-morph default quote style (double quotes)
- **Solution**: Configure manipulation settings with `quoteKind: QuoteKind.Single`

### Key Import Creation Points

1. **engine.ts:185** - Project initialization (needs manipulation settings)
2. **import-manager.ts:1497** - `addImport()` method
3. **import-manager.ts:1522** - `addTypeImport()` method
4. **import-manager.ts:1550** - `addDefaultImport()` method
5. **import-manager.ts:1576** - `addNamespaceImport()` method
6. **import-manager.ts:1605** - `addReExport()` method
7. **MoveExecutor.ts:1373** - Additional import creation
