# RefactorCodeTool Test Standardization Plan

## Current Test Files Analysis (43 files)

### 🔍 **NAMING PATTERN ANALYSIS**

#### Current Inconsistent Patterns:

- **Bug fix tests**: `additional-bug-fixes.test.ts`, `bug-fixes.test.ts`, `batch-context-bug-fix.test.ts`
- **Operation tests**: `move-operation-bugs.test.ts`, `remove-operation.test.ts`, `rename-bug-isolated.test.ts`
- **Integration tests**: `comprehensive.integration.test.ts`, `week1.test.ts`
- **Feature tests**: `batchOperations.test.ts`, `advancedRemove.test.ts`, `advancedRename.test.ts`
- **Debug tests**: `production-debug-test.test.ts`, `symbol-removal-debug.test.ts`

#### Proposed Standardized Naming Convention:

```
[category].[feature].[type].test.ts

Categories:
- unit: Pure unit tests (Pattern 1/3)
- integration: Integration tests (Pattern 2)
- bug: Bug reproduction/fix tests
- performance: Performance/benchmark tests

Features:
- move, rename, remove (operations)
- batch, engine, parser (components)
- import, export (specific functionality)

Types:
- test: Standard test
- spec: Specification test
- benchmark: Performance test
```

## 📋 **STANDARDIZATION TASKS**

### Phase 1: Critical Test Fixes & Naming (HIGH PRIORITY)

#### A. Rename for Consistency

```bash
# Integration Tests
comprehensive.integration.test.ts → integration.comprehensive.test.ts
week1.test.ts → integration.week1.test.ts

# Unit Tests - Operations
move-operation-bugs.test.ts → unit.move-operations.test.ts
remove-operation.test.ts → unit.remove-operations.test.ts
rename-bug-isolated.test.ts → unit.rename-operations.test.ts
rename-cross-file-bug.test.ts → unit.rename-cross-file.test.ts
rename-production-bug.test.ts → bug.rename-production.test.ts

# Unit Tests - Components
batchOperations.test.ts → unit.batch-operations.test.ts
symbolExtractor.test.ts → unit.symbol-extractor.test.ts
parser.test.ts → unit.parser.test.ts
api.test.ts → unit.api.test.ts

# Bug Fix Tests
additional-bug-fixes.test.ts → bug.additional-fixes.test.ts
bug-fixes.test.ts → bug.general-fixes.test.ts
batch-context-bug-fix.test.ts → bug.batch-context.test.ts
false-conflict-bug-fix.test.ts → bug.false-conflicts.test.ts
circular-import-bug-fix.test.ts → bug.circular-imports.test.ts

# Performance Tests
performance.test.ts → performance.operations.test.ts
performance-benchmark.test.ts → performance.benchmark.test.ts

# Advanced Feature Tests
advancedRemove.test.ts → unit.advanced-remove.test.ts
advancedRename.test.ts → unit.advanced-rename.test.ts
```

#### B. Migrate to Standardized Patterns

1. **Pattern 2 (RefactorEngine)**: Integration tests
2. **Pattern 1 (Simple)**: Unit tests with file system
3. **Pattern 3 (In-Memory)**: Pure unit tests

### Phase 2: Setup Pattern Migration (MEDIUM PRIORITY)

#### Files Using Correct Patterns ✅

- `move-operation-bugs.test.ts` - Already Pattern 1
- `core/__tests__/SymbolExtractor.test.ts` - Already Pattern 3

#### Files Needing Migration ❌

- `comprehensive.integration.test.ts` - Needs Pattern 2
- `batchOperations.test.ts` - Needs Pattern 2
- Most others - Need assessment

### Phase 3: Content Standardization (LOW PRIORITY)

#### A. Consistent Test Structure

```typescript
describe("[Component] - [Feature]", () => {
	// Setup using standardized patterns

	describe("when [condition]", () => {
		it("should [expected behavior]", async () => {
			// Arrange
			// Act
			// Assert
		})
	})
})
```

#### B. Consistent Assertions

- Use standardized assertion helpers from `standardized-test-setup.ts`
- Consistent error message patterns
- Standardized file content verification

## 🎯 **IMPLEMENTATION STRATEGY**

### Step 1: Rename Files (Safe Operation)

- Rename files to follow consistent naming convention
- Update any imports/references
- Verify tests still pass

### Step 2: Migrate Setup Patterns (One by One)

- Start with failing tests first
- Migrate to appropriate pattern (1, 2, or 3)
- Run tests after each migration
- Fix any issues immediately

### Step 3: Content Standardization

- Standardize describe/it naming
- Use consistent assertion patterns
- Remove duplicate test utilities

## 🔧 **EXECUTION PLAN**

### Immediate Actions:

1. **Rename critical files** for consistency
2. **Fix `comprehensive.integration.test.ts`** (currently failing)
3. **Migrate high-impact integration tests** to Pattern 2
4. **Verify 100% test pass rate** after each change

### Success Metrics:

- ✅ **Consistent naming convention** across all 43 files
- ✅ **All tests using standardized patterns** (1, 2, or 3)
- ✅ **100% test pass rate** maintained throughout
- ✅ **Reduced boilerplate** through shared utilities
- ✅ **Clear test categorization** for future development

## 📊 **CURRENT STATUS**

- **Total Test Files**: 43
- **Files Following Standards**: ~5 (12%)
- **Files Needing Migration**: ~38 (88%)
- **Current Test Pass Rate**: 2300/2300 (100%) ✅
- **Goal**: Maintain 100% while standardizing

## 🚀 **NEXT STEPS**

1. Start with file renaming (safe, no logic changes)
2. Migrate setup patterns (one file at a time)
3. Run tests after each change
4. Document any issues and solutions
5. Create final standardization report
