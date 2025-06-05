# RefactorCodeTool Test Standardization Migration Guide

## Problem Statement

The RefactorCodeTool has **47 test files** with inconsistent setup patterns, causing perpetual test failures due to:

1. **Inconsistent test environment detection**
2. **Different temp directory naming conventions**
3. **Mixed approaches**: Some use RefactorEngine, others use direct ts-morph
4. **Path resolution issues**: Files saved to wrong locations
5. **Test isolation failures**: Tests interfere with each other

## Solution: Standardized Test Setup Patterns

### Pattern 1: Simple ts-morph Project ✅ RECOMMENDED for Unit Tests

**Use for**: MoveExecutor, SymbolExtractor, SymbolRemover, etc.

```typescript
import { createSimpleTestSetup } from "./utils/standardized-test-setup"

describe("YourTest", () => {
	let setup: StandardTestSetup

	beforeEach(() => {
		setup = createSimpleTestSetup()
	})

	afterEach(() => {
		setup.cleanup()
	})

	it("should work", () => {
		// Use setup.project and setup.tempDir
		const sourceFile = setup.project.createSourceFile(
			path.join(setup.tempDir, "test.ts"),
			"export function test() { return true; }",
		)
		// ... test logic
	})
})
```

### Pattern 2: RefactorEngine Integration ✅ RECOMMENDED for Integration Tests

**Use for**: Comprehensive integration tests, batch operations

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

	it("should execute batch operations", async () => {
		// Use setup.engine, setup.projectDir, setup.tempDir
		const result = await setup.engine.executeBatch(operations)
		// ... test logic
	})
})
```

### Pattern 3: In-Memory FileSystem ✅ RECOMMENDED for Pure Unit Tests

**Use for**: Fast unit tests that don't need file system

```typescript
import { createInMemoryTestSetup } from "./utils/standardized-test-setup"

describe("Pure Unit Test", () => {
	let project: Project

	beforeEach(() => {
		const setup = createInMemoryTestSetup()
		project = setup.project
	})

	it("should work in memory", () => {
		const sourceFile = project.createSourceFile("test.ts", "...")
		// ... test logic
	})
})
```

## Migration Priority

### Phase 1: Fix Critical Failing Tests (HIGH PRIORITY)

1. `comprehensive.integration.test.ts` - Convert to Pattern 2
2. Any other currently failing tests

### Phase 2: Migrate High-Impact Tests (MEDIUM PRIORITY)

1. `move-operation-bugs.test.ts` - Already follows Pattern 1 ✅
2. `engine.test.ts` - Convert to Pattern 2
3. `batchOperations.test.ts` - Convert to Pattern 2

### Phase 3: Migrate Remaining Tests (LOW PRIORITY)

1. All other integration tests → Pattern 2
2. All unit tests → Pattern 1 or 3
3. Remove duplicate/redundant tests

## Test File Audit Results

### ✅ ALREADY FOLLOWING GOOD PATTERNS

- `move-operation-bugs.test.ts` - Uses Pattern 1 correctly
- `core/__tests__/SymbolExtractor.test.ts` - Uses Pattern 3 correctly

### ❌ NEEDS MIGRATION

- `comprehensive.integration.test.ts` - Uses problematic RefactorEngine setup
- `MoveOrchestrator.test.ts` - Heavy mocking, could use Pattern 1
- Most other tests - Various inconsistent patterns

### 🔍 NEEDS ANALYSIS

- 40+ other test files need individual assessment

## Key Benefits After Migration

1. **100% Test Pass Rate**: Eliminate setup-related failures
2. **Consistent Test Environment Detection**: All tests use `refactor-tool-test` prefix
3. **Proper Test Isolation**: No cross-test interference
4. **Reduced Duplication**: Shared utilities eliminate repeated setup code
5. **Clear Test Patterns**: Developers know which pattern to use for new tests

## Implementation Steps

1. ✅ **Create standardized utilities** - COMPLETED
2. 🔄 **Migrate comprehensive.integration.test.ts** - IN PROGRESS
3. **Validate migration works** - Run tests to ensure 100% pass rate
4. **Migrate remaining tests** - One file at a time
5. **Remove old utilities** - Clean up deprecated test helpers

## Success Criteria

- **All 47 test files** use standardized setup patterns
- **100% test pass rate** across RefactorCodeTool suite
- **No test isolation issues** - tests can run in any order
- **Consistent temp directory naming** - all use `refactor-tool-test` prefix
- **Clear documentation** - developers know which pattern to use
