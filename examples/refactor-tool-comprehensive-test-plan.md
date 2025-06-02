# Comprehensive Refactor Code Tool Test Plan

This test plan is designed to systematically evaluate all aspects of the refactor code tool, with careful documentation of any issues encountered.

## Test Environment Setup

First, create a test environment with the following directory structure:

```
src/
  models/
    User.ts
  utils/
    formatting.ts
    validation.ts (will be created during testing)
  services/
    userService.ts
    profileService.ts (will be created during testing)
```

### File Contents

#### src/models/User.ts
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
```

#### src/utils/formatting.ts
```typescript
import { User } from "../models/User";

// This will be renamed in test case 1
export function formatUserName(user: User): string {
  return `${user.firstName} ${user.lastName}`.trim() || "Unnamed User";
}

export function formatEmail(email: string): string {
  const [username, domain] = email.split("@");
  if (!domain) return email;

  return `${username.substring(0, 3)}...@${domain}`;
}

// This will be used for the date formatting rename test
export function formatDate(date: Date): string {
  return date.toLocaleDateString();
}

// This will be removed in test case 3
export function deprecatedHelper(value: string): string {
  return value.toLowerCase();
}

export function formatUserSummary(user: User): string {
  return `${formatUserName(user)} (${formatEmail(user.email)})`;
}
```

#### src/services/userService.ts
```typescript
import { User, createDefaultUser } from "../models/User";
import { formatUserName, formatEmail } from "../utils/formatting";

// This will be moved to validation.ts in test case 2
export function validateUser(user: User): boolean {
  if (!user.email || !user.email.includes("@")) {
    return false;
  }
  return true;
}

export function getUserData(userId: string): Promise<User> {
  // Mock implementation
  return Promise.resolve(createDefaultUser(`user-${userId}@example.com`));
}

export function updateUserProfile(user: User, data: Partial<User>): User {
  return {
    ...user,
    ...data,
    updatedAt: new Date(),
  };
}

export function formatUserProfile(user: User): string {
  return `
    Name: ${formatUserName(user)}
    Email: ${formatEmail(user.email)}
    Member since: ${user.createdAt.toLocaleDateString()}
  `;
}
```

## Test Cases

### 1. Rename Operation Test

Test renaming a function and verify all references are updated correctly.

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

**Verification Steps:**
1. Check that all occurrences of `formatUserName` in formatting.ts are renamed to `formatFullName`
2. Verify that imports and references in userService.ts are updated
3. Ensure the code still compiles and maintains the same functionality

### 2. Move Operation Test

Test moving a function to a different file and verify imports are updated.

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

**Verification Steps:**
1. Verify `validateUser` function is removed from userService.ts
2. Confirm function is correctly added to validation.ts
3. Check that imports are updated in all affected files
4. Verify function can be used from its new location

### 3. Remove Operation Test

Test removing an unused function and verify references are handled.

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

**Verification Steps:**
1. Confirm `deprecatedHelper` function is removed from formatting.ts
2. Verify no references to the function remain in the codebase
3. Ensure the code still compiles without errors

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

**Verification Steps:**
1. Verify both operations completed successfully
2. Check that the interface is renamed in all files
3. Confirm function is moved to the correct file
4. Verify all imports are updated correctly

### 5. Edge Case Tests

#### 5.1 Non-Existent File

Test handling of operations on non-existent files.

```typescript
<refactor_code>
<operations>
[
  {
    "operation": "rename",
    "selector": {
      "type": "identifier",
      "name": "someFunction",
      "kind": "function",
      "filePath": "src/utils/nonexistent.ts"
    },
    "newName": "newFunctionName",
    "reason": "Testing error handling for non-existent files"
  }
]
</operations>
</refactor_code>
```

#### 5.2 Non-Existent Symbol

Test handling of operations on non-existent symbols.

```typescript
<refactor_code>
<operations>
[
  {
    "operation": "rename",
    "selector": {
      "type": "identifier",
      "name": "nonExistentFunction",
      "kind": "function",
      "filePath": "src/utils/formatting.ts"
    },
    "newName": "newFunctionName",
    "reason": "Testing error handling for non-existent symbols"
  }
]
</operations>
</refactor_code>
```

#### 5.3 Invalid Operation

Test handling of invalid operation types.

```typescript
<refactor_code>
<operations>
[
  {
    "operation": "invalid_operation",
    "selector": {
      "type": "identifier",
      "name": "formatUserName",
      "kind": "function",
      "filePath": "src/utils/formatting.ts"
    },
    "newName": "formatFullName",
    "reason": "Testing error handling for invalid operations"
  }
]
</operations>
</refactor_code>
```

## Testing Guidelines

1. **Document Before State:** Before executing each operation, document the state of the affected files.

2. **Execute One Test at a Time:** Run each test independently and document the results.

3. **Strict Bug Reporting:** For any issue encountered, create a detailed bug report with the following structure:
   ```
   # Bug Report: [Brief Description]
   
   ## Test Case
   [The test case that failed]
   
   ## Expected Behavior
   [What should have happened]
   
   ## Actual Behavior
   [What actually happened]
   
   ## Error Messages
   [Any error messages displayed]
   
   ## File Contents Before Operation
   [Content of relevant files before the operation]
   
   ## File Contents After Operation
   [Content of relevant files after the operation]
   
   ## Steps to Reproduce
   1. [Step 1]
   2. [Step 2]
   ...
   ```

4. **No Tool Correction:** If the refactor tool fails to perform an operation correctly, DO NOT use text editing tools like search and replace to fix the issues. Only use text editing if necessary to prepare for the next test case that depends on a previous test.

5. **Sequential Dependencies:** If a test depends on the success of a previous test, and the previous test failed, you may use text editing to prepare the files for the next test, but document this clearly.

6. **Tool Use Reporting:** Document any issues with the tool itself, such as unexpected behavior, unclear error messages, or usability problems.

7. **Comprehensive Coverage:** Ensure all operations (rename, move, remove) are tested in various scenarios.

## Final Report

After completing all tests, compile a comprehensive report including:

1. Summary of test results
2. List of all identified issues
3. Overall assessment of the tool's reliability
4. Recommendations for improvements

This testing approach will systematically evaluate the refactor code tool's functionality and identify any issues that need to be addressed before launch.