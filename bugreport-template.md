# Refactor Tool Bug Report Template

## Test Case Information

- **Operation Type:** [rename/move/remove/batch]
- **Date & Time:** [When the issue occurred]
- **Test Case #:** [Which test from the plan]
- **TypeScript Version:** [Version of TypeScript being used]
- **Environment:** [Operating system, VSCode version]

## Input

```typescript
// The exact refactor_code command that was executed
<refactor_code>
<operations>
[
  {
    // Operation details as provided to the tool
  }
]
</operations>
</refactor_code>
```

## Expected Behavior

[Describe what you expected to happen]

## Actual Behavior

[Describe what actually happened]

## Error Message

```
[Include any error messages or output from the tool]
```

## Before/After Code Snippets

### Before:

```typescript
// Relevant code before the operation
```

### After:

```typescript
// Relevant code after the operation (if applicable)
```

## Reproduction Steps

1. [Step-by-step instructions to reproduce the issue]
2. [Include any setup or prerequisite steps]
3. [Be as detailed as possible]

## Impact Assessment

- **Severity:** [Critical/High/Medium/Low]
- **Scope:** [Isolated to specific operation/Affects multiple operations/System-wide]
- **Data Loss:** [Yes/No - describe any unrecoverable changes]

## Workaround Attempted

[Describe any alternative approaches or parameters you tried]

## Additional Context

- **File Structure:** [Relevant project structure details]
- **Related Files:** [List of files that might be affected]
- **Relevant Configuration:** [Any project-specific settings]

## Screenshots

[If applicable, include screenshots showing the issue]

## Retry Information

[If you retried the operation with adjusted parameters, include those details here]

---

## For Project Maintainers

### Triage Notes

- **Reproducibility:** [Always/Sometimes/Rarely]
- **Priority:** [Urgent/High/Medium/Low]
- **Component:** [Parser/Engine/Core/UI]
- **Assigned To:** [Name]

### Resolution Plan

[To be filled by project maintainers]
