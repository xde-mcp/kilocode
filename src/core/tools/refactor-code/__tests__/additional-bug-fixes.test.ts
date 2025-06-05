import { describe, it, expect, beforeAll, afterAll } from "@jest/globals"
import {
	createRefactorEngineTestSetupWithAutoLoad,
	RefactorEngineTestSetup,
	createTestFilesWithAutoLoad,
} from "./utils/standardized-test-setup"

describe("RefactorCodeTool Additional Bug Fixes", () => {
	let setup: RefactorEngineTestSetup

	beforeAll(() => {
		setup = createRefactorEngineTestSetupWithAutoLoad()
	})

	afterAll(() => {
		setup.cleanup()
	})

	// Note: Constructor renaming is not supported by ts-morph and is not a typical use case
	// Removed constructor renaming test as it's not a valid operation

	describe("Bug Fix: Cross-File Reference Updates", () => {
		it("should update all references when renaming a function across files", async () => {
			// Create test files
			createTestFilesWithAutoLoad(setup, {
				"utils/formatting.ts": `
import { User } from "../models/User";

export function formatUserName(user: User): string {
  return \`\${user.firstName} \${user.lastName}\`.trim() || "Unnamed User";
}

export function formatEmail(email: string): string {
  const [username, domain] = email.split("@");
  if (!domain) return email;
  return \`\${username.substring(0, 3)}...@\${domain}\`;
}

export function formatUserSummary(user: User): string {
  return \`\${formatUserName(user)} (\${formatEmail(user.email)})\`;
}
                `.trim(),
				"services/userService.ts": `
import { User, createDefaultUser } from "../models/User";
import { formatUserName, formatEmail } from "../utils/formatting";

export function validateUser(user: User): boolean {
  if (!user.email || !user.email.includes("@")) {
    return false;
  }
  return true;
}

export function getUserData(userId: string): Promise<User> {
  return Promise.resolve(createDefaultUser(\`user-\${userId}@example.com\`));
}

export function formatUserProfile(user: User): string {
  return \`
    Name: \${formatUserName(user)}
    Email: \${formatEmail(user.email)}
    Member since: \${user.createdAt.toLocaleDateString()}
  \`;
}
                `.trim(),
				"models/User.ts": `
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
                `.trim(),
			})

			// Execute rename operation
			const result = await setup.engine.executeBatch({
				operations: [
					{
						operation: "rename" as const,
						selector: {
							type: "identifier" as const,
							name: "formatUserName",
							kind: "function" as const,
							filePath: "utils/formatting.ts",
						},
						newName: "formatFullName",
						reason: "More accurately describes the function's purpose",
					},
				],
			})

			// Verify operation succeeded
			expect(result.success).toBe(true)
			expect(result.results).toHaveLength(1)
			expect(result.results[0].success).toBe(true)

			// Verify function was renamed in source file
			const formattingFile = setup.engine.getProject().getSourceFile("utils/formatting.ts")
			expect(formattingFile).toBeDefined()

			if (formattingFile) {
				const content = formattingFile.getFullText()
				expect(content).toContain("export function formatFullName(user: User)")
				expect(content).toContain("${formatFullName(user)}")
				expect(content).not.toContain("formatUserName")
			}

			// Verify import was updated in userService.ts
			const userServiceFile = setup.engine.getProject().getSourceFile("services/userService.ts")
			expect(userServiceFile).toBeDefined()

			if (userServiceFile) {
				const content = userServiceFile.getFullText()
				expect(content).toContain("import { formatFullName, formatEmail }")
				expect(content).toContain("${formatFullName(user)}")
				expect(content).not.toContain("formatUserName")
			}
		})
	})

	describe("Bug Fix: Move Operation Duplicates and Missing Imports", () => {
		it("should move function without creating duplicates and with proper imports", async () => {
			// Create test files
			createTestFilesWithAutoLoad(setup, {
				"services/userService.ts": `
import { User, createDefaultUser } from "../models/User";
import { formatUserName, formatEmail } from "../utils/formatting";

export function validateUser(user: User): boolean {
  if (!user.email || !user.email.includes("@")) {
    return false;
  }
  return true;
}

export function getUserData(userId: string): Promise<User> {
  return Promise.resolve(createDefaultUser(\`user-\${userId}@example.com\`));
}

export function updateUserProfile(user: User, data: Partial<User>): User {
  return {
    ...user,
    ...data,
    updatedAt: new Date(),
  };
}
                `.trim(),
				"models/User.ts": `
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
                `.trim(),
			})

			// Execute move operation
			const result = await setup.engine.executeBatch({
				operations: [
					{
						operation: "move" as const,
						selector: {
							type: "identifier" as const,
							name: "validateUser",
							kind: "function" as const,
							filePath: "services/userService.ts",
						},
						targetFilePath: "utils/validation.ts",
						reason: "Relocating validation functions to a dedicated utility file",
					},
				],
			})

			// Verify operation succeeded
			expect(result.success).toBe(true)
			expect(result.results).toHaveLength(1)
			expect(result.results[0].success).toBe(true)

			// Verify function was removed from source file
			const userServiceFile = setup.engine.getProject().getSourceFile("services/userService.ts")
			expect(userServiceFile).toBeDefined()

			if (userServiceFile) {
				const content = userServiceFile.getFullText()
				expect(content).not.toContain("export function validateUser")
				// Should have import for validateUser from validation
				expect(content).toContain("import { validateUser }")
			}

			// Verify function was added to target file (only once)
			const validationFile = setup.engine.getProject().getSourceFile("utils/validation.ts")
			expect(validationFile).toBeDefined()

			if (validationFile) {
				const content = validationFile.getFullText()
				expect(content).toContain("export function validateUser")
				expect(content).toContain("import { User }")

				// Count occurrences to ensure no duplicates
				const validateUserMatches = content.match(/export function validateUser/g)
				expect(validateUserMatches).toHaveLength(1)

				const userImportMatches = content.match(/import.*User.*from/g)
				expect(userImportMatches?.length).toBeLessThanOrEqual(1)
			}
		})
	})

	describe("Bug Fix: Batch Operation Reference Updates", () => {
		it("should handle batch operations with proper reference updates", async () => {
			// Create test files
			createTestFilesWithAutoLoad(setup, {
				"models/User.ts": `
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
                `.trim(),
				"utils/formatting.ts": `
import { User } from "../models/User";

export function formatUserName(user: User): string {
  return \`\${user.firstName} \${user.lastName}\`.trim() || "Unnamed User";
}

export function formatEmail(email: string): string {
  const [username, domain] = email.split("@");
  if (!domain) return email;
  return \`\${username.substring(0, 3)}...@\${domain}\`;
}
                `.trim(),
				"services/userService.ts": `
import { User, createDefaultUser } from "../models/User";
import { formatUserName, formatEmail } from "../utils/formatting";

export function getUserData(userId: string): Promise<User> {
  return Promise.resolve(createDefaultUser(\`user-\${userId}@example.com\`));
}

export function updateUserProfile(user: User, data: Partial<User>): User {
  return {
    ...user,
    ...data,
    updatedAt: new Date(),
  };
}
                `.trim(),
			})

			// Execute batch operations: rename interface and move function
			const result = await setup.engine.executeBatch({
				operations: [
					{
						operation: "rename" as const,
						selector: {
							type: "identifier" as const,
							name: "User",
							kind: "interface" as const,
							filePath: "models/User.ts",
						},
						newName: "UserProfile",
						reason: "More specific naming to distinguish from UserAccount",
					},
					{
						operation: "move" as const,
						selector: {
							type: "identifier" as const,
							name: "getUserData",
							kind: "function" as const,
							filePath: "services/userService.ts",
						},
						targetFilePath: "services/profileService.ts",
						reason: "Organizing user profile related functions together",
					},
				],
			})

			// Verify operations succeeded
			expect(result.success).toBe(true)
			expect(result.results).toHaveLength(2)
			expect(result.results[0].success).toBe(true)
			expect(result.results[1].success).toBe(true)

			// Verify interface was renamed in models/User.ts
			const userFile = setup.engine.getProject().getSourceFile("models/User.ts")
			expect(userFile).toBeDefined()

			if (userFile) {
				const content = userFile.getFullText()
				expect(content).toContain("export interface UserProfile")
				expect(content).toContain("function createDefaultUser(email: string): UserProfile")
				expect(content).not.toContain("interface User")
			}

			// Verify imports were updated in formatting.ts
			const formattingFile = setup.engine.getProject().getSourceFile("utils/formatting.ts")
			expect(formattingFile).toBeDefined()

			if (formattingFile) {
				const content = formattingFile.getFullText()
				expect(content).toContain("import { UserProfile }")
				expect(content).toContain("formatUserName(user: UserProfile)")
				expect(content).not.toContain("User }")
			}

			// Verify function was moved to profileService.ts
			const profileServiceFile = setup.engine.getProject().getSourceFile("services/profileService.ts")
			expect(profileServiceFile).toBeDefined()

			if (profileServiceFile) {
				const content = profileServiceFile.getFullText()
				expect(content).toContain("export function getUserData")
				expect(content).toContain("import { UserProfile, createDefaultUser }")
				expect(content).toContain("Promise<UserProfile>")
				expect(content).not.toContain("Promise<User>")
			}

			// Verify imports were updated in userService.ts
			const userServiceFile = setup.engine.getProject().getSourceFile("services/userService.ts")
			expect(userServiceFile).toBeDefined()

			if (userServiceFile) {
				const content = userServiceFile.getFullText()
				expect(content).toContain("import { UserProfile, createDefaultUser }")
				expect(content).toContain("import { getUserData }")
				expect(content).toContain("updateUserProfile(user: UserProfile, data: Partial<UserProfile>)")
				expect(content).not.toContain("User,")
			}
		})
	})
})
