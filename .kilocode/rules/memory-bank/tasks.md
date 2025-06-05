# RefactorCodeTool Tasks & Workflows

## Task: Standardize RefactorCodeTool Test Suite

### Description

Systematically migrate all 47 RefactorCodeTool test files to use standardized test setup patterns, eliminating inconsistencies that cause perpetual test failures.

### Files That Need Modification

- **All test files in**: `src/core/tools/refactor-code/__tests__/` (37 files)
- **All test files in**: `src/core/tools/refactor-code/operations/__tests__/` (5 files)
- **All test files in**: `src/core/tools/refactor-code/core/__tests__/` (3 files)
- **All test files in**: `src/core/tools/refactor-code/utils/__tests__/` (4 files)

### Step-by-Step Workflow

#### Phase 1: Infrastructure Setup ✅ COMPLETED

1. **Create standardized test utilities**

    - File: `src/core/tools/refactor-code/__tests__/utils/standardized-test-setup.ts`
    - Provides 3 standard patterns: Simple, RefactorEngine, In-Memory

2. **Create migration guide**
    - File: `src/core/tools/refactor-code/__tests__/utils/TEST_MIGRATION_GUIDE.md`
    - Documents which pattern to use for each test type

#### Phase 2: Critical Test Migration 🔄 IN PROGRESS

1. **Priority Target**: `comprehensive.integration.test.ts`

    - **Current Status**: 5/7 tests passing
    - **Migration**: Convert to Pattern 2 (RefactorEngine Integration)
    - **Expected Result**: 100% test pass rate

2. **Validation**: Run test to confirm migration success

#### Phase 3: Systematic Migration

1. **High-Impact Tests**:

    - `engine.test.ts` → Pattern 2
    - `batchOperations.test.ts` → Pattern 2
    - `move-operation-bugs.test.ts` → Already follows Pattern 1 ✅

2. **Unit Tests**:

    - `core/__tests__/*.test.ts` → Pattern 1 or 3
    - `utils/__tests__/*.test.ts` → Pattern 1 or 3
    - `operations/__tests__/*.test.ts` → Pattern 1

3. **Integration Tests**:
    - All remaining integration tests → Pattern 2

#### Phase 4: Validation & Cleanup

1. **Run full test suite** - Ensure 100% pass rate
2. **Remove deprecated utilities** - Clean up old test helpers
3. **Update documentation** - Ensure clear guidance for future tests

### Important Considerations

#### Test Pattern Selection

- **Pattern 1 (Simple)**: Direct ts-morph operations, unit tests
- **Pattern 2 (RefactorEngine)**: Integration tests, batch operations
- **Pattern 3 (In-Memory)**: Fast pure unit tests, no file system needed

#### Key Requirements

- **All temp directories** must use `refactor-tool-test` prefix
- **Proper cleanup** in afterEach/afterAll hooks
- **Test isolation** - no cross-test interference
- **Consistent file structure** - use standardized file templates

#### Success Metrics

- **100% test pass rate** across all 47 test files
- **No test isolation issues** - tests can run in any order
- **Reduced test execution time** through optimized patterns
- **Clear test patterns** for future development

### Example Implementation

#### Before (Problematic Pattern)

```typescript
// Inconsistent setup causing failures
projectDir = createTestProjectDirectory("comprehensive-integration")
engine = new RefactorEngine({ projectRootPath: projectDir })
```

#### After (Standardized Pattern 2)

```typescript
import { createRefactorEngineTestSetup } from "./utils/standardized-test-setup"

describe("Integration Test", () => {
	let setup: RefactorEngineTestSetup

	beforeAll(() => {
		setup = createRefactorEngineTestSetup()
	})

	afterAll(() => {
		setup.cleanup()
	})

	it("should work", async () => {
		const result = await setup.engine.executeBatch(operations)
		// ... test logic
	})
})
```

## Task: Fix Comprehensive Integration Test

### Description

Migrate the failing comprehensive integration test to use standardized Pattern 2 setup.

### Files That Need Modification

- `src/core/tools/refactor-code/__tests__/comprehensive.integration.test.ts`

### Step-by-Step Workflow

1. **Replace setup section** with `createRefactorEngineTestSetup()`
2. **Update file creation** to use `createTestFiles()` utility
3. **Replace cleanup** with standardized cleanup
4. **Test validation** - ensure all 7 tests pass

### Expected Result

- **Before**: 5/7 tests passing
- **After**: 7/7 tests passing (100% pass rate)
