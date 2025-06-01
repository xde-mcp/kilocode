# Refactor Code Tool Test Plan

## Overview

I need you to help test a new code refactoring tool that uses TypeScript's AST to perform safe refactoring operations. The tool supports rename, move, and remove operations, plus batch operations combining multiple changes. Please follow this test plan carefully and document any issues you encounter.

## Test Environment Setup

1. Create a simple TypeScript project with the following structure:

    - src/models/User.ts (containing a User class or interface)
    - src/utils/formatting.ts (with helper functions)
    - src/services/userService.ts (with functions that use the User model)

2. Each file should have multiple imports, exports, and cross-references to thoroughly test refactoring capabilities.

## Test Cases

### 1. Rename Operation Test

Test renaming a function or class and verify all references are updated correctly.

```typescript
<refactor_code>
<operations>
[
  {
    "operation": "rename",
    "selector": {
      "type": "identifier",
      "name": "formatUserName",
      "kind": "function",
      "filePath": "src/utils/formatting.ts"
    },
    "newName": "formatFullName",
    "reason": "More accurately describes the function's purpose"
  }
]
</operations>
</refactor_code>
```

### 2. Move Operation Test

Test moving a function or class to a different file and verify imports are updated.

```typescript
<refactor_code>
<operations>
[
  {
    "operation": "move",
    "selector": {
      "type": "identifier",
      "name": "validateUser",
      "kind": "function",
      "filePath": "src/services/userService.ts"
    },
    "targetFilePath": "src/utils/validation.ts",
    "reason": "Relocating validation functions to a dedicated utility file"
  }
]
</operations>
</refactor_code>
```

### 3. Remove Operation Test

Test removing an unused function or method and verify references are handled.

```typescript
<refactor_code>
<operations>
[
  {
    "operation": "remove",
    "selector": {
      "type": "identifier",
      "name": "deprecatedHelper",
      "kind": "function",
      "filePath": "src/utils/formatting.ts"
    },
    "reason": "Function is no longer used and has been replaced by newer utilities"
  }
]
</operations>
</refactor_code>
```

### 4. Batch Operation Test

Test a combination of operations executed together.

```typescript
<refactor_code>
<operations>
[
  {
    "operation": "rename",
    "selector": {
      "type": "identifier",
      "name": "User",
      "kind": "interface",
      "filePath": "src/models/User.ts"
    },
    "newName": "UserProfile",
    "reason": "More specific naming to distinguish from UserAccount"
  },
  {
    "operation": "move",
    "selector": {
      "type": "identifier",
      "name": "getUserData",
      "kind": "function",
      "filePath": "src/services/userService.ts"
    },
    "targetFilePath": "src/services/profileService.ts",
    "reason": "Organizing user profile related functions together"
  }
]
</operations>
</refactor_code>
```

## Verification Steps

For each test case:

1. Document the state of the codebase before the operation
2. Execute the refactoring operation
3. Verify the changes were applied correctly
4. Check that imports and references were updated
5. Ensure the code still compiles and functions as expected
6. If issues occur, try once more with adjusted parameters

## Important Testing Guidelines

**Do not use alternative tools to fix failing tests.** If the refactor tool fails to correctly perform an operation:

1. **Never** use diffing, search and replace, or manual file editing to fix the issues
2. Document the expected behavior and what actually happened in your bug report
3. Move on to the next test case without attempting to fix the code
4. Include detailed information about the failure in your bug report

The purpose of this testing is to identify issues with the refactor tool itself, not to find workarounds. Using other tools to fix failing tests would mask the actual problems we need to address.

## Bug Reporting Template

If you encounter any issues, document them in a `bugreport.md` file with the following structure:

````markdown
# Refactor Tool Bug Report

## Test Case Information

- Operation Type: [rename/move/remove/batch]
- Date & Time: [When the issue occurred]
- Test Case #: [Which test from the plan]

## Input

```typescript
// The exact refactor_code command that was executed
```
````

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
[Relevant code before the operation]
```

### After:

```typescript
[Relevant code after the operation (if applicable)]
```

## Reproduction Steps

1. [Step-by-step instructions to reproduce the issue]
2. ...

## Additional Notes

[Any other relevant details, such as environment information, potential causes, or workarounds attempted]

````

## Best Practices for Bug Reporting

When reporting bugs with the refactor tool, please follow these guidelines to ensure clear, actionable feedback:

1. **Be specific and precise** - Include exact commands, file paths, and symbol names.

2. **Document the environment** - Include TypeScript version, file structure details, and any project-specific configurations.

3. **Capture before and after states** - Always include snapshots of the code before and after an operation, highlighting the expected vs. actual results.

4. **For complex issues**, provide a minimal reproduction project - If possible, simplify the test case to isolate the issue.

5. **Retry with adjusted parameters** - If an operation fails, try at least once more with any adjustments that might help (more specific selectors, different names, etc.) before reporting.

6. **Prioritize critical issues** - Categorize bugs by severity:
   - Critical: Data loss or corrupted files
   - High: Failed operations that require manual fixing
   - Medium: Incorrect refactoring that still produces valid code
   - Low: Cosmetic or minor functional issues

7. **Track partial successes** - If batch operations partially succeed, document what worked and what didn't.

## Integration with IDE Features

When executing these tests, you should also verify that:

1. The tool integrates properly with VSCode's undo functionality
2. File watchers detect the changes correctly
3. Source control systems track the refactored files appropriately

## Sample TypeScript Files for Testing

### src/models/User.ts
```typescript
export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

export function createDefaultUser(email: string): User {
  return {
    id: crypto.randomUUID(),
    firstName: '',
    lastName: '',
    email,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

export class UserValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserValidationError';
  }
}

// This will be a candidate for the "remove" operation test
export function deprecatedUserFactory() {
  console.warn('This function is deprecated. Use createDefaultUser instead.');
  return createDefaultUser('default@example.com');
}
````

### src/utils/formatting.ts

```typescript
import { User } from "../models/User"

// This will be renamed in test case 1
export function formatUserName(user: User): string {
	return `${user.firstName} ${user.lastName}`.trim() || "Unnamed User"
}

export function formatEmail(email: string): string {
	const [username, domain] = email.split("@")
	if (!domain) return email

	return `${username.substring(0, 3)}...@${domain}`
}

// This will be used for the date formatting rename test
export function formatDate(date: Date): string {
	return date.toLocaleDateString()
}

// This will be removed in test case 3
export function deprecatedHelper(value: string): string {
	return value.toLowerCase()
}

export function formatUserSummary(user: User): string {
	return `${formatUserName(user)} (${formatEmail(user.email)})`
}
```

### src/services/userService.ts

```typescript
import { User, createDefaultUser } from "../models/User"
import { formatUserName, formatEmail } from "../utils/formatting"

// This will be moved to validation.ts in test case 2
export function validateUser(user: User): boolean {
	if (!user.email || !user.email.includes("@")) {
		return false
	}
	return true
}

export function getUserData(userId: string): Promise<User> {
	// Mock implementation
	return Promise.resolve(createDefaultUser(`user-${userId}@example.com`))
}

export function updateUserProfile(user: User, data: Partial<User>): User {
	return {
		...user,
		...data,
		updatedAt: new Date(),
	}
}

export function formatUserProfile(user: User): string {
	return `
    Name: ${formatUserName(user)}
    Email: ${formatEmail(user.email)}
    Member since: ${user.createdAt.toLocaleDateString()}
  `
}
```
