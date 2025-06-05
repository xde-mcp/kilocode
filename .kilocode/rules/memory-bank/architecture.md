# Architecture: RefactorCodeTool

## System Architecture

The RefactorCodeTool follows a **layered, orchestrator-based architecture** with clear separation of concerns and robust error handling. The system is built around the **three-phase execution pattern**: Validation → Execution → Verification.

## Source Code Paths

### Core Structure

```
src/core/tools/refactor-code/
├── refactorCodeTool.ts          # Main tool entry point
├── engine.ts                    # Core RefactorEngine orchestrator
├── schema.ts                    # Zod validation schemas
├── parser.ts                    # LLM response parser
├── api.ts                       # Public API surface
├── errors.ts                    # Custom error types
├── core/                        # Core business logic
│   ├── ProjectManager.ts        # ts-morph project management
│   ├── SymbolExtractor.ts       # AST symbol extraction
│   ├── SymbolRemover.ts         # Safe symbol removal
│   ├── SymbolResolver.ts        # Symbol resolution utilities
│   └── types.ts                 # Core type definitions
├── operations/                  # Operation-specific logic
│   ├── MoveOrchestrator.ts      # Move operation coordinator
│   ├── MoveValidator.ts         # Move operation validation
│   ├── MoveExecutor.ts          # Move operation execution
│   ├── MoveVerifier.ts          # Move operation verification
│   ├── RenameOrchestrator.ts    # Rename operation coordinator
│   ├── RemoveOrchestrator.ts    # Remove operation coordinator
│   ├── rename.ts                # Legacy rename implementation
│   └── remove.ts                # Legacy remove implementation
├── utils/                       # Shared utilities
│   ├── PathResolver.ts          # File path resolution
│   ├── FileManager.ts           # File system operations
│   ├── import-manager.ts        # Import/export handling
│   ├── symbol-finder.ts         # Symbol discovery utilities
│   ├── performance-tracker.ts   # Performance monitoring
│   ├── performance-optimizations.ts # Batch optimization
│   └── file-system.ts           # File system helpers
└── __tests__/                   # Comprehensive test suite
    ├── integration/             # Integration tests
    ├── utils/                   # Test utilities
    └── [operation-specific]/    # Unit tests per operation
```

## Key Technical Decisions

### 1. **Three-Phase Execution Pattern**

Every operation follows: **Validate → Execute → Verify**

- **Validation**: Pre-flight checks, parameter validation, feasibility analysis
- **Execution**: Actual AST manipulation and file operations
- **Verification**: Post-execution validation to ensure operation succeeded

### 2. **Orchestrator Pattern**

Each operation type has a dedicated orchestrator (e.g., `MoveOrchestrator`) that coordinates specialized components:

- **Validator**: Operation-specific validation logic
- **Executor**: Core execution logic
- **Verifier**: Post-execution verification

### 3. **AST-Based Manipulation**

Uses **ts-morph** (TypeScript Compiler API wrapper) for:

- Accurate code parsing and manipulation
- Robust symbol resolution
- Automatic import/export management
- Type-aware refactoring operations

### 4. **Robust Error Handling**

- Custom error types with operation context
- Rollback mechanisms for failed batch operations
- Comprehensive diagnostic information
- Graceful degradation strategies

### 5. **Performance Optimization**

- **Batch processing** for multiple operations
- **Parallel execution** where safe
- **File system caching** to reduce I/O
- **Smart operation ordering** to minimize conflicts

### 6. **Security Framework** ✅ **NEW**

- **Precise file path matching** using `.endsWith()` with full paths
- **Comprehensive security audits** for file resolution patterns
- **Zero tolerance for ambiguous file matching** (no `.includes()` for specific files)
- **File path validation** at all operation entry points

## Critical Implementation Paths

### 1. **Batch Operation Flow**

```
refactorCodeTool.ts → RefactorEngine.executeBatch() →
For each operation:
  → validateOperation() →
  → executeOperation() →
  → [Operation]Orchestrator.execute[Operation]() →
  → Validator.validate() → Executor.execute() → Verifier.verify()
```

### 2. **Move Operation Flow**

```
MoveOrchestrator.executeMoveOperation() →
├── MoveValidator.validate()
│   ├── Check symbol exists
│   ├── Validate target file path
│   ├── Check for naming conflicts (with batch context)
│   └── Security: Validate file path precision
├── MoveExecutor.execute()
│   ├── Extract symbol from source
│   ├── Add symbol to target
│   ├── Update imports/exports
│   └── Remove from source (optional)
└── MoveVerifier.verify()
    ├── Confirm symbol in target
    ├── Confirm imports updated
    └── Confirm source cleaned (if not copy-only)
```

### 3. **Batch Context Tracking** ✅ **NEW**

```
RefactorEngine.executeBatch() →
├── Initialize batch context: Map<targetFile, symbols[]>
├── For each operation:
│   ├── Pass batch context to validator
│   ├── Exclude batch-moved symbols from conflict detection
│   └── Track successful moves in batch context
└── Final synchronization across all affected files
```

## Security Architecture ✅ **NEW**

### File Path Resolution Security

- **Principle**: Never use ambiguous file matching patterns
- **Implementation**: All file resolution uses precise `.endsWith()` matching
- **Validation**: Comprehensive security audits prevent file confusion attacks
- **Enforcement**: Zero tolerance policy for `.includes()` patterns on specific files

### Batch Operation Security

- **Context Isolation**: Each batch maintains isolated symbol tracking
- **Conflict Prevention**: Batch context prevents false positive conflicts
- **State Validation**: Comprehensive validation at each operation boundary
- **Rollback Safety**: Failed operations don't corrupt batch state

## Extension Integration

The RefactorCodeTool integrates with the 3KiloCode VS Code extension through:

- **Tool Registration**: Registered as a core tool in the extension
- **User Approval**: Integration with user approval workflows
- **File Tracking**: Integration with file context tracking
- **Error Reporting**: Consistent error reporting with extension patterns
- **Telemetry**: Performance and usage metrics collection
- **Security Compliance**: All file operations follow security framework
