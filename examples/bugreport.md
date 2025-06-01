# Refactor Tool Bug Report

## Test Case Information

- Operation Type: move
- Date & Time: 6/1/2025, 8:34:47 PM
- Test Case #: 2

## Input

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

## Expected Behavior

The `validateUser` function should be moved from `src/services/userService.ts` to `src/utils/validation.ts`. The import for `UserProfile` should be added to `src/utils/validation.ts`, and the import for `validateUser` should be removed from `src/services/userService.ts`.

## Actual Behavior

The `validateUser` function was moved to `src/utils/validation.ts`, and the import was removed from `src/services/userService.ts`. However, the necessary import for `UserProfile` was not added to `src/utils/validation.ts`, which will cause a compilation error.

## Error Message

```
Batch refactoring completed successfully:

✓ Moved validateUser from src/services/userService.ts to src/utils/validation.ts
```
(No error message was reported by the tool, but the resulting code is incorrect.)

## Before/After Code Snippets

### Before: src/services/userService.ts

```typescript
import { UserProfile, createDefaultUser } from "../models/User"
import { formatUserDisplayName, formatEmail } from "../utils/formatting"

// This will be moved to validation.ts in test case 2
export function validateUser(user: UserProfile): boolean {
	if (!user.email || !user.email.includes("@")) {
		return false
	}
	return true
}

export function getUserData(userId: string): Promise<UserProfile> {
	// Mock implementation
	return Promise.resolve(createDefaultUser(`user-${userId}@example.com`))
}

export function updateUserProfile(user: UserProfile, data: Partial<UserProfile>): UserProfile {
	return {
		...user,
		...data,
		updatedAt: new Date(),
	}
}

export function formatUserProfile(user: UserProfile): string {
	return `
    Name: ${formatUserDisplayName(user)}
    Email: ${formatEmail(user.email)}
    Member since: ${user.createdAt.toLocaleDateString()}
  `
}
```

### After: src/utils/validation.ts

```typescript
// This file will contain validation functions
// This will be moved to validation.ts in test case 2
export function validateUser(user: UserProfile): boolean {
	if (!user.email || !user.email.includes("@")) {
		return false
	}
	return true
}

export { validateUser };
```

## Reproduction Steps

1. Start with the initial file structure and content as provided in the test plan.
2. Execute the rename operation from Test Case 1 (renaming `formatUserName` to `formatUserDisplayName`).
3. Execute the move operation from Test Case 2 as provided in the test plan.
4. Observe that the `validateUser` function is moved, but the `UserProfile` import is missing in the target file (`src/utils/validation.ts`).

## Additional Notes

The comment from the source file was also moved to the target file, which is not ideal but less critical than the missing import. The tool reported success despite the missing import.

---

# Refactor Tool Bug Report

## Test Case Information

- Operation Type: remove
- Date & Time: 6/1/2025, 8:35:03 PM
- Test Case #: 3

## Input

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

## Expected Behavior

The `deprecatedHelper` function should be removed from `src/utils/formatting.ts`.

## Actual Behavior

The remove operation failed, reporting that the source file `src/utils/formatting.ts` was not found.

## Error Message

```
Batch refactoring failed:

Operation 1 (remove) failed: Source file not found: src/utils/formatting.ts
```

## Before/After Code Snippets

### Before: src/utils/formatting.ts

```typescript
import { UserProfile } from "../models/User"

// This will be renamed in test case 1
export function formatUserDisplayName(user: UserProfile): string {
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

export function formatUserSummary(user: UserProfile): string {
	return `${formatUserDisplayName(user)} (${formatEmail(user.email)})`
}
```

### After: src/utils/formatting.ts

(File content remained unchanged due to the failed operation.)

## Reproduction Steps

1. Start with the initial file structure and content as provided in the test plan.
2. Execute the rename operation from Test Case 1 (renaming `formatUserName` to `formatUserDisplayName`).
3. Execute the move operation from Test Case 2.
4. Execute the remove operation from Test Case 3 as provided in the test plan.
5. Observe that the remove operation fails with a "Source file not found" error.

## Additional Notes

The file `src/utils/formatting.ts` exists and its content was successfully read immediately before attempting the remove operation. The tool seems to have an issue locating the file specifically during the remove operation.

---

# Refactor Tool Bug Report

## Test Case Information

- Operation Type: batch (rename and move)
- Date & Time: 6/1/2025, 8:35:39 PM
- Test Case #: 4

## Input

```typescript
<refactor_code>
<operations>
[
  {
    "operation": "rename",
    "selector": {
      "type": "identifier",
      "name": "UserProfile",
      "kind": "interface",
      "filePath": "src/models/User.ts"
    },
    "newName": "UserData",
    "reason": "Adjusting test case to match current file content and test batch rename"
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

## Expected Behavior

The `UserProfile` interface should be renamed to `UserData` in `src/models/User.ts`, and all references should be updated. The `getUserData` function should be moved from `src/services/userService.ts` to `src/services/profileService.ts`, and imports/exports should be updated accordingly.

## Actual Behavior

The `UserProfile` interface was renamed to `UserData`, and the `getUserData` function was moved. However, the necessary imports for `UserData` and `createDefaultUser` were not added to the target file (`src/services/profileService.ts`), which will cause compilation errors. An incorrect comment from the source file was also moved to the target file.

## Error Message

```
Batch refactoring completed successfully:

✓ Renamed UserProfile to UserData in src/models/User.ts
✓ Moved getUserData from src/services/userService.ts to src/services/profileService.ts
```
(No error message was reported by the tool, but the resulting code is incorrect.)

## Before/After Code Snippets

### Before: src/services/userService.ts

```typescript
import { UserProfile, createDefaultUser } from "../models/User"
import { formatUserDisplayName, formatEmail } from "../utils/formatting"

// This will be moved to validation.ts in test case 2

export function getUserData(userId: string): Promise<UserProfile> {
	// Mock implementation
	return Promise.resolve(createDefaultUser(`user-${userId}@example.com`))
}

export function updateUserProfile(user: UserProfile, data: Partial<UserProfile>): UserProfile {
	return {
		...user,
		...data,
		updatedAt: new Date(),
	}
}

export function formatUserProfile(user: UserProfile): string {
	return `
    Name: ${formatUserDisplayName(user)}
    Email: ${formatEmail(user.email)}
    Member since: ${user.createdAt.toLocaleDateString()}
  `
}
```

### After: src/services/profileService.ts

```typescript
// This file will contain user profile related services
// This will be moved to validation.ts in test case 2
export function getUserData(userId: string): Promise<UserData> {
	// Mock implementation
	return Promise.resolve(createDefaultUser(`user-${userId}@example.com`))
}

export { getUserData };
```

## Reproduction Steps

1. Start with the initial file structure and content as provided in the test plan.
2. Execute the rename operation from Test Case 1 (renaming `formatUserName` to `formatUserDisplayName`).
3. Execute the move operation from Test Case 2.
4. Execute the remove operation from Test Case 3 (which will fail).
5. Execute the batch operation from Test Case 4 as adjusted (renaming `UserProfile` to `UserData` and moving `getUserData`).
6. Observe that the rename and move operations complete, but imports are missing and an incorrect comment is moved in the target file (`src/services/profileService.ts`).

## Additional Notes

The tool reported success for the batch operation despite the missing imports and incorrectly moved comment.
