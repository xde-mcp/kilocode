# Phase 0: Foundation Analysis & Architecture (1 week)

## Goal

Thoroughly analyze the existing codebase, design the architecture, and create a detailed implementation roadmap with concrete deliverables and clear success criteria.

## Day-by-Day Breakdown

### Days 1-2: Codebase Analysis

**Tasks**:

- [ ] Document all TS-Morph usage patterns in the codebase
- [ ] List all file manipulation utilities and their interfaces
- [ ] Identify validation patterns (Zod usage, error handling)
- [ ] Map error handling strategies across similar tools
- [ ] Analyze test patterns and snapshot testing approaches
- [ ] Review existing refactor code tool implementation
- [ ] Examine test fixtures structure and patterns

**Key Files to Examine**:

- **Core Tool Implementation**:

    - `src/core/tools/refactorCodeTool.ts` - Current implementation skeleton
    - `src/core/prompts/tools/refactor-code.ts` - Current DSL prompt

- **Similar Tools for Patterns**:

    - `src/core/tools/applyDiffTool.ts` - File modification patterns
    - `src/core/tools/searchAndReplaceTool.ts` - Pattern matching logic
    - `src/core/tools/insertContentTool.ts` - File manipulation patterns
    - `src/core/tools/writeToFileTool.ts` - File writing patterns

- **Test Fixtures**:

    - `src/core/tools/refactor-code/__tests__/fixtures/` - Examine all subdirectories
    - Look specifically at `rename-class`, `move-function`, `remove-function` directories

- **Validation & Error Handling**:
    - `src/core/tools/validateToolUse.ts` - Error handling patterns
    - Look for Zod schema implementations in other tools

### Days 3-4: Architecture Design

**Tasks**:

- [ ] Create component diagram with clear boundaries
- [ ] Define all TypeScript interfaces
- [ ] Plan data flow between components
- [ ] Design error handling and rollback strategy
- [ ] Create sequence diagrams for each operation type
- [ ] Design testing strategy for environment parity

**Architecture Components**:

```
┌─────────────────────┐
│   RefactorEngine    │
└──────────┬──────────┘
           │
    ┌──────┴──────┬─────────┬──────────┬─────────┐
    │             │         │          │         │
┌───▼────┐ ┌─────▼───┐ ┌──▼───┐ ┌───▼───┐ ┌──▼────┐
│ Parser │ │ Schema  │ │Trans-│ │Symbol │ │Import │
│        │ │Validator│ │action│ │Finder │ │Manager│
└────────┘ └─────────┘ └──────┘ └───────┘ └───────┘
```

**Core Interfaces to Define**:

```typescript
interface RefactorEngine {
	executeOperation(op: RefactorOperation): Promise<OperationResult>
	executeBatch(ops: RefactorOperation[]): Promise<BatchResult>
	validateOperation(op: RefactorOperation): ValidationResult
	previewOperation(op: RefactorOperation): PreviewResult
	rollback(transactionId: string): Promise<void>
}

interface OperationResult {
	success: boolean
	operation: RefactorOperation
	error?: string
	affectedFiles?: string[]
	transactionId?: string
	requiresReview?: boolean
	reviewGuide?: string
}

interface RefactorOperation {
	id?: string
	operation: "rename" | "move" | "remove" | "extract" | "refactor" | "add" | "inline" | "optimize_imports"
	selector: Selector
	reason: string
}
```

### Day 5: Risk Assessment & Planning

**Tasks**:

- [ ] Identify high-risk operations and mitigation strategies
- [ ] Create prioritized feature list
- [ ] Build dependency graph for implementation
- [ ] Define success criteria for each phase
- [ ] Create implementation checklist

**Risk Matrix**:

| Risk                     | Impact   | Probability | Mitigation                   |
| ------------------------ | -------- | ----------- | ---------------------------- |
| LLM Response Variability | High     | High        | Robust parser with fallbacks |
| File System Conflicts    | High     | Medium      | Transaction system           |
| Data Loss                | Critical | Low         | Mandatory snapshots          |
| Performance Issues       | Medium   | Medium      | Lazy loading, caching        |
| Breaking Changes         | High     | Medium      | Semantic analysis            |

**Implementation Dependencies**:

```
Symbol Finder <- RENAME, MOVE, REMOVE, EXTRACT
Import Manager <- MOVE, EXTRACT
Code Generator <- ADD
Transaction Manager <- ALL OPERATIONS
Dependency Analyzer <- REFACTOR, Complex scenarios
Human Review <- REMOVE, ADD, High-risk operations
```

## Deliverables

1. **Component Inventory Document** (`refactor-plan/analysis/component-inventory.md`)

    - List of all reusable components with code examples
    - Analysis of existing TS-Morph usage patterns
    - File manipulation utilities inventory
    - Validation and error handling patterns

2. **Architecture Design Document** (`refactor-plan/analysis/architecture-design.md`)

    - System architecture diagrams
    - Component interaction diagrams
    - Data flow diagrams
    - Interface definitions

3. **Risk Assessment Document** (`refactor-plan/analysis/risk-assessment.md`)

    - Risk matrix with mitigation strategies
    - High-risk operation identification
    - Safety mechanism requirements
    - Rollback strategy design

4. **Implementation Checklist** (`refactor-plan/analysis/implementation-checklist.md`)
    - Detailed task breakdown by phase
    - Dependency graph
    - Success criteria for each component
    - Testing requirements

## Success Criteria

- [ ] All existing code patterns documented with examples
- [ ] Architecture design reviewed and approved
- [ ] Clear understanding of VSCode extension environment
- [ ] All integration points identified
- [ ] Risk mitigation strategies defined
- [ ] Implementation checklist complete and prioritized
- [ ] Testing strategy for environment parity defined
- [ ] All deliverable documents created

## Key Questions to Answer

1. **TS Morph Configuration**:

    - How is TS Morph configured in the project?
    - Are there any wrapper classes or utilities?
    - How are Project instances created and managed?

2. **Testing Patterns**:

    - How are test fixtures organized?
    - What snapshot testing libraries or utilities are used?
    - How are file comparisons performed in tests?
    - What mocking strategies are used?

3. **Error Handling**:

    - How are errors reported to the user?
    - What validation mechanisms are used for user input?
    - How are errors handled in batch operations?

4. **Agent/Test Environment Differences**:
    - How does the filesystem access differ?
    - Are there different path resolution mechanisms?
    - Are there differences in how dependencies are loaded?
    - How is state managed differently?

## Next Steps

After completing Phase 0, we'll have a solid foundation to begin Phase 1 with:

- Clear component boundaries
- Defined interfaces
- Identified reusable code
- Risk mitigation strategies
- Comprehensive testing approach
