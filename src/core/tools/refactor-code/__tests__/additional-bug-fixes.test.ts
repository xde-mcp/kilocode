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
			const project = setup.engine.getProject()
			project.getSourceFiles().forEach((file) => {
				file.refreshFromFileSystemSync()
			})
			const formattingFile = project.getSourceFiles().find((f) => f.getFilePath().endsWith("utils/formatting.ts"))
			expect(formattingFile).toBeDefined()

			if (formattingFile) {
				const content = formattingFile.getFullText()
				expect(content).toContain("export function formatFullName(user: User)")
				expect(content).toContain("${formatFullName(user)}")
				expect(content).not.toContain("formatUserName")
			}

			// Verify import was updated in userService.ts
			const projectForUserService = setup.engine.getProject()
			projectForUserService.getSourceFiles().forEach((file) => {
				file.refreshFromFileSystemSync()
			})
			const userServiceFile = projectForUserService
				.getSourceFiles()
				.find((f) => f.getFilePath().endsWith("services/userService.ts"))
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
  if (!validateUser(user)) {
    throw new Error("Invalid user data");
  }
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
			const project = setup.engine.getProject()
			project.getSourceFiles().forEach((file) => {
				file.refreshFromFileSystemSync()
			})
			const userServiceFile = project
				.getSourceFiles()
				.find((f) => f.getFilePath().endsWith("services/userService.ts"))
			expect(userServiceFile).toBeDefined()

			if (userServiceFile) {
				const content = userServiceFile.getFullText()
				expect(content).not.toContain("export function validateUser")
				// Should have import for validateUser from validation
				expect(content).toContain("import { validateUser }")
			}

			// Verify function was added to target file (only once)
			const projectForValidation = setup.engine.getProject()
			projectForValidation.getSourceFiles().forEach((file) => {
				file.refreshFromFileSystemSync()
			})
			const validationFile = projectForValidation
				.getSourceFiles()
				.find((f) => f.getFilePath().endsWith("utils/validation.ts"))
			expect(validationFile).toBeDefined()

			if (validationFile) {
				const content = validationFile.getFullText()
				expect(content).toContain("export function validateUser")
				expect(content).toContain("import { User")

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
				"src/models/User.ts": `
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
				"src/utils/formatting.ts": `
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
				"src/services/userService.ts": `
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
							filePath: "src/models/User.ts",
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
							filePath: "src/services/userService.ts",
						},
						targetFilePath: "src/services/profileService.ts",
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
			const project = setup.engine.getProject()
			project.getSourceFiles().forEach((file) => {
				file.refreshFromFileSystemSync()
			})

			// Debug: List all files in project
			console.log("[TEST DEBUG] All files in project:")
			project.getSourceFiles().forEach((file) => {
				console.log(`[TEST DEBUG] - ${file.getFilePath()}`)
			})

			// Find the test file specifically (not the real source file)
			const userFile = project
				.getSourceFiles()
				.find(
					(f) =>
						f.getFilePath().endsWith("src/models/User.ts") &&
						f.getFilePath().includes("/refactor-tool-test-engine-"),
				)
			expect(userFile).toBeDefined()

			if (userFile) {
				const content = userFile.getFullText()
				console.log(`[TEST DEBUG] User file content:\n${content}`)
				console.log(`[TEST DEBUG] User file path: ${userFile.getFilePath()}`)

				// The rename operation should have changed "User" to "UserProfile"
				expect(content).toContain("export interface UserProfile")
				expect(content).toContain("function createDefaultUser(email: string): UserProfile")
				// Make sure the old interface name is not present (be specific to avoid substring matches)
				expect(content).not.toContain("interface User {")
				expect(content).not.toContain("interface User\n")
			}

			// Verify imports were updated in formatting.ts
			const formattingFile = project
				.getSourceFiles()
				.find(
					(f) =>
						f.getFilePath().endsWith("src/utils/formatting.ts") &&
						f.getFilePath().includes("/refactor-tool-test-engine-"),
				)
			expect(formattingFile).toBeDefined()

			if (formattingFile) {
				const content = formattingFile.getFullText()
				console.log(`[TEST DEBUG] Formatting file content:\n${content}`)
				expect(content).toContain("import { UserProfile }")
				expect(content).toContain("formatUserName(user: UserProfile)")
				expect(content).not.toContain("User }")
			}

			// Verify function was moved to profileService.ts
			const profileServiceFile = project
				.getSourceFiles()
				.find(
					(f) =>
						f.getFilePath().endsWith("src/services/profileService.ts") &&
						f.getFilePath().includes("/refactor-tool-test-engine-"),
				)
			expect(profileServiceFile).toBeDefined()

			if (profileServiceFile) {
				const content = profileServiceFile.getFullText()
				console.log(`[TEST DEBUG] ProfileService file content:\n${content}`)
				expect(content).toContain("export function getUserData")
				expect(content).toContain("import { UserProfile, createDefaultUser }")
				expect(content).toContain("Promise<UserProfile>")
				expect(content).not.toContain("Promise<User>")
			}

			// Verify imports were updated in userService.ts
			const userServiceFile = project
				.getSourceFiles()
				.find(
					(f) =>
						f.getFilePath().endsWith("services/userService.ts") &&
						f.getFilePath().includes("/refactor-tool-test-engine-"),
				)
			expect(userServiceFile).toBeDefined()

			if (userServiceFile) {
				const content = userServiceFile.getFullText()
				console.log(`[TEST DEBUG] UserService file content:\n${content}`)
				expect(content).toContain("import { UserProfile, createDefaultUser }")
				// Note: getUserData was moved, so it shouldn't be imported here anymore
				expect(content).toContain("updateUserProfile(user: UserProfile, data: Partial<UserProfile>)")
				expect(content).not.toContain("User,")
			}
		})
	})
})
