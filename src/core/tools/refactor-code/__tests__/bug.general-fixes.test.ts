import { describe, it, expect, beforeEach, afterEach } from "@jest/globals"
import {
	createRefactorEngineTestSetup,
	RefactorEngineTestSetup,
	createTestFilesWithAutoLoad,
} from "./utils/standardized-test-setup"
import * as path from "path"

describe("RefactorCodeTool Bug Fixes", () => {
	let setup: RefactorEngineTestSetup

	beforeEach(() => {
		setup = createRefactorEngineTestSetup()
	})

	afterEach(() => {
		setup.cleanup()
	})

	describe("Bug Fix 1: Scoped Symbol Resolution", () => {
		it("should rename constructor within a class scope", async () => {
			// Create test file with UserValidationError class
			const filePaths = createTestFilesWithAutoLoad(setup, {
				"models/User.ts": `
export interface UserData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

export function initializeUser(email: string): UserData {
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

  validateUser(user: any): boolean {
    return user && user.id && user.name;
  }
}
				`.trim(),
			})

			// Test the rename operation with scope
			const operations = [
				{
					operation: "rename" as const,
					selector: {
						type: "identifier" as const,
						name: "validateUser",
						kind: "method" as const,
						filePath: filePaths["models/User.ts"],
						scope: {
							type: "class" as const,
							name: "UserValidationError",
						},
					},
					newName: "checkUserValidity",
					reason: "Testing renaming a method within a class",
				},
			]

			const result = await setup.engine.executeBatch({ operations })

			expect(result.success).toBe(true)
			expect(result.results).toHaveLength(1)
			expect(result.results[0].success).toBe(true)

			// Verify the method was renamed to checkUserValidity
			const project = (setup.engine as any).project
			const userFile = project.getSourceFile(filePaths["models/User.ts"])
			const updatedContent = userFile.getFullText()
			expect(updatedContent).toContain("checkUserValidity(user: any)")
			expect(updatedContent).not.toContain("validateUser(user: any)")
		})

		it("should rename variable within function scope", async () => {
			// Create test file with variable in function scope
			const filePaths = createTestFilesWithAutoLoad(setup, {
				"utils/formatting.ts": `
import { UserData } from "../models/User";

export function formatEmail(email: string): string {
  const [username, domain] = email.split("@");
  let count = 0; // Variable for Test Case 10
  if (!domain) return email;

  return \`\${username.substring(0, 3)}...@\${domain}\`;
}

export function processData(data: any): any {
  console.log("Processing data in formatting.ts");
  return data;
}
				`.trim(),
			})

			// Test the rename operation with function scope
			const operations = [
				{
					operation: "rename" as const,
					selector: {
						type: "identifier" as const,
						name: "count",
						kind: "variable" as const,
						filePath: filePaths["utils/formatting.ts"],
						scope: {
							type: "function" as const,
							name: "formatEmail",
						},
					},
					newName: "emailCount",
					reason: "Testing renaming a variable within a specific function scope",
				},
			]

			const result = await setup.engine.executeBatch({ operations })

			expect(result.success).toBe(true)
			expect(result.results).toHaveLength(1)
			expect(result.results[0].success).toBe(true)

			// Verify the variable was renamed
			const project = (setup.engine as any).project
			const formattingFile = project.getSourceFile(filePaths["utils/formatting.ts"])
			const updatedContent = formattingFile.getFullText()
			expect(updatedContent).toContain("let emailCount = 0")
			expect(updatedContent).not.toContain("let count = 0")
		})
	})

	describe("Bug Fix 2: Duplicate Import Prevention", () => {
		it("should not create duplicate imports when moving functions", async () => {
			// Create source and target files
			const filePaths = createTestFilesWithAutoLoad(setup, {
				"services/profileService.ts": `
import { UserData, initializeUser } from "../models/User";

export function getUserData(userId: string): Promise<UserData> {
  // Mock implementation
  return Promise.resolve(initializeUser(\`user-\${userId}@example.com\`));
}

export function updateUserProfile(user: UserData, data: Partial<UserData>): UserData {
  return {
    ...user,
    ...data,
    updatedAt: new Date(),
  };
}
				`.trim(),
				"utils/formatting.ts": `
import { UserData } from "../models/User";

export function formatFullName(user: UserData): string {
  return \`\${user.firstName} \${user.lastName}\`.trim() || "Unnamed User";
}

export function processData(data: any): any {
  console.log("Processing data in formatting.ts");
  return data;
}
				`.trim(),
				"models/User.ts": `
export interface UserData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

export function initializeUser(email: string): UserData {
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

			// Move getUserData from profileService to formatting
			const operations = [
				{
					operation: "move" as const,
					selector: {
						type: "identifier" as const,
						name: "getUserData",
						kind: "function" as const,
						filePath: filePaths["services/profileService.ts"],
					},
					targetFilePath: filePaths["utils/formatting.ts"],
					reason: "Testing moving a function to a file with existing imports",
				},
			]

			const result = await setup.engine.executeBatch({ operations })

			expect(result.success).toBe(true)

			// Check that no duplicate imports were created
			const project = (setup.engine as any).project
			const targetFile = project.getSourceFile(filePaths["utils/formatting.ts"])
			const targetContent = targetFile.getFullText()

			// Should have only one import line from "../models/User"
			const importLines = targetContent
				.split("\n")
				.filter((line: string) => line.trim().startsWith("import") && line.includes("../models/User"))
			expect(importLines).toHaveLength(1)

			// Should contain both UserData and initializeUser in the same import
			expect(targetContent).toContain('import { UserData, initializeUser } from "../models/User"')

			// Should not have duplicate import lines
			expect(targetContent).not.toMatch(/import.*UserData.*import.*UserData/s)
		})
	})

	describe("Bug Fix 3: Naming Conflict Detection", () => {
		it("should detect and prevent naming conflicts in move operations", async () => {
			// Create files with naming conflict
			const filePaths = createTestFilesWithAutoLoad(setup, {
				"services/profileService.ts": `
export function getUserData(userId: string): Promise<any> {
  return Promise.resolve({ id: userId });
}
				`.trim(),
				"utils/formatting.ts": `
export function getUserData(userId: string): string {
  return \`User: \${userId}\`;
}
				`.trim(),
			})

			// Try to move getUserData to a file that already has getUserData
			const operations = [
				{
					operation: "move" as const,
					selector: {
						type: "identifier" as const,
						name: "getUserData",
						kind: "function" as const,
						filePath: filePaths["services/profileService.ts"],
					},
					targetFilePath: filePaths["utils/formatting.ts"],
					reason: "Testing naming conflict detection",
				},
			]

			const result = await setup.engine.executeBatch({ operations })

			// Should fail due to naming conflict
			expect(result.success).toBe(false)
			expect(result.error).toContain("Naming conflict")
			expect(result.error).toContain("getUserData")
		})
	})

	describe("Bug Fix 4: Test Environment State Management", () => {
		it("should maintain consistent test state between operations", async () => {
			// Create initial file state
			const filePaths = createTestFilesWithAutoLoad(setup, {
				"models/User.ts": `
export interface User {
  id: string;
  name: string;
}
				`.trim(),
			})

			// First operation: rename User to UserProfile
			const operation1 = [
				{
					operation: "rename" as const,
					selector: {
						type: "identifier" as const,
						name: "User",
						kind: "interface" as const,
						filePath: filePaths["models/User.ts"],
					},
					newName: "UserProfile",
					reason: "First rename operation",
				},
			]

			const result1 = await setup.engine.executeBatch({ operations: operation1 })
			expect(result1.success).toBe(true)

			// Verify the rename worked
			const project = (setup.engine as any).project
			let userFile = project.getSourceFile(filePaths["models/User.ts"])
			let content = userFile.getFullText()
			expect(content).toContain("interface UserProfile")
			expect(content).not.toContain("interface User {")

			// Second operation: try to rename User again (should fail since it no longer exists)
			const operation2 = [
				{
					operation: "rename" as const,
					selector: {
						type: "identifier" as const,
						name: "User",
						kind: "interface" as const,
						filePath: filePaths["models/User.ts"],
					},
					newName: "UserData",
					reason: "Second rename operation should fail",
				},
			]

			const result2 = await setup.engine.executeBatch({ operations: operation2 })
			expect(result2.success).toBe(false)
			expect(result2.error).toContain("Symbol 'User' not found")

			// Third operation: rename UserProfile to UserData (should succeed)
			const operation3 = [
				{
					operation: "rename" as const,
					selector: {
						type: "identifier" as const,
						name: "UserProfile",
						kind: "interface" as const,
						filePath: filePaths["models/User.ts"],
					},
					newName: "UserData",
					reason: "Third rename operation should succeed",
				},
			]

			const result3 = await setup.engine.executeBatch({ operations: operation3 })
			expect(result3.success).toBe(true)

			// Verify final state
			userFile = project.getSourceFile(filePaths["models/User.ts"])
			content = userFile.getFullText()
			expect(content).toContain("interface UserData")
			expect(content).not.toContain("interface UserProfile")
			expect(content).not.toContain("interface User {")
		})
	})
})
