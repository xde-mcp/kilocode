import { RefactorEngine, OperationResult, BatchResult } from "../engine"
import { BatchOperations } from "../schema"
import * as path from "path"
import * as fs from "fs"
import {
	createRefactorEngineTestSetup,
	createTestFiles,
	createTestFilesWithAutoLoad,
	RefactorEngineTestSetup,
	assertFileExists,
	assertFileContains,
	assertFileNotContains,
} from "./utils/standardized-test-setup"

describe("Batch Operations", () => {
	let setup: RefactorEngineTestSetup
	let engine: RefactorEngine

	beforeEach(() => {
		// Use standardized Pattern 2 setup
		setup = createRefactorEngineTestSetup()
		engine = setup.engine

		// Create test files using standardized utility
		const testFiles = {
			"src/models/user.ts": `// User model
export interface User {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
}

export type UserRole = "admin" | "user" | "guest";

export interface UserWithRole extends User {
  role: UserRole;
}

export const DEFAULT_ROLE: UserRole = "user";
`,
			"src/services/userService.ts": `// User service
import { User, UserRole, DEFAULT_ROLE } from "../models/user";

export function getUserById(id: number): User {
  // Mock implementation
  return {
    id,
    username: "testuser",
    email: "test@example.com",
    firstName: "Test",
    lastName: "User",
    isActive: true
  };
}

export function formatUserName(user: User): string {
  return \`\${user.firstName} \${user.lastName}\`;
}

export function getUserRole(user: User): UserRole {
  // Mock implementation
  return DEFAULT_ROLE;
}

export function isAdmin(user: User): boolean {
  return getUserRole(user) === "admin";
}

export const MAX_USERS = 100;
`,
			"src/services/profileService.ts": `// Profile service
import { User } from "../models/user";

export function getProfileData(userId: number): any {
  // Mock implementation
  return {
    userId,
    preferences: {
      theme: "dark",
      notifications: true
    }
  };
}
`,
		}

		createTestFilesWithAutoLoad(setup, testFiles)
	})

	afterEach(() => {
		// Use standardized cleanup
		setup.cleanup()
	})

	test("should execute a batch with multiple operations when stopOnError=false", async () => {
		const batchOps: BatchOperations = {
			operations: [
				{
					operation: "rename",
					selector: {
						type: "identifier",
						name: "User",
						kind: "interface",
						filePath: "src/models/user.ts",
					},
					newName: "UserProfile",
					reason: "More specific name",
				},
				{
					operation: "move",
					selector: {
						type: "identifier",
						name: "formatUserName",
						kind: "function",
						filePath: "src/services/userService.ts",
					},
					targetFilePath: "src/services/profileService.ts",
					reason: "Better organization",
				},
				{
					operation: "remove",
					selector: {
						type: "identifier",
						name: "MAX_USERS",
						kind: "variable",
						filePath: "src/services/userService.ts",
					},
					reason: "No longer needed",
				},
			],
			options: {
				stopOnError: false,
			},
		}

		const result = await engine.executeBatch(batchOps)

		expect(result.success).toBe(true)
		expect(result.results).toHaveLength(3)

		// Verify file contents
		const userModelPath = path.join(setup.projectDir, "src/models/user.ts")
		const userServicePath = path.join(setup.projectDir, "src/services/userService.ts")
		const profileServicePath = path.join(setup.projectDir, "src/services/profileService.ts")

		const userModelContent = fs.readFileSync(userModelPath, "utf-8")
		const userServiceContent = fs.readFileSync(userServicePath, "utf-8")
		const profileServiceContent = fs.readFileSync(profileServicePath, "utf-8")

		// Check rename operation
		expect(userModelContent).toContain("export interface UserProfile")
		expect(userModelContent).not.toContain("export interface User {")

		// Check move operation
		expect(profileServiceContent).toContain("formatUserName")
		expect(userServiceContent).not.toContain("formatUserName")

		// Check remove operation
		expect(userServiceContent).not.toContain("MAX_USERS")
	})

	test("should execute a batch with multiple operations when stopOnError=true", async () => {
		const batchOps: BatchOperations = {
			operations: [
				{
					operation: "rename",
					selector: {
						type: "identifier",
						name: "User",
						kind: "interface",
						filePath: "src/models/user.ts",
					},
					newName: "UserProfile",
					reason: "More specific name",
				},
				{
					operation: "move",
					selector: {
						type: "identifier",
						name: "formatUserName",
						kind: "function",
						filePath: "src/services/userService.ts",
					},
					targetFilePath: "src/services/profileService.ts",
					reason: "Better organization",
				},
			],
			options: {
				stopOnError: true,
			},
		}

		const result = await engine.executeBatch(batchOps)

		expect(result.success).toBe(true)
		expect(result.results).toHaveLength(2)

		// Verify file contents
		const userModelPath = path.join(setup.projectDir, "src/models/user.ts")
		const profileServicePath = path.join(setup.projectDir, "src/services/profileService.ts")

		const userModelContent = fs.readFileSync(userModelPath, "utf-8")
		const profileServiceContent = fs.readFileSync(profileServicePath, "utf-8")

		// Check rename operation
		expect(userModelContent).toContain("export interface UserProfile")

		// Check move operation
		expect(profileServiceContent).toContain("formatUserName")
	})

	test("should handle batch operations with mixed success/failure when stopOnError=false", async () => {
		const batchOps: BatchOperations = {
			operations: [
				{
					operation: "rename",
					selector: {
						type: "identifier",
						name: "User",
						kind: "interface",
						filePath: "src/models/user.ts",
					},
					newName: "UserProfile",
					reason: "More specific name",
				},
				{
					operation: "move",
					selector: {
						type: "identifier",
						name: "formatUserName",
						kind: "function",
						filePath: "src/services/userService.ts",
					},
					targetFilePath: "src/services/profileService.ts",
					reason: "Better organization",
				},
				{
					operation: "remove",
					selector: {
						type: "identifier",
						name: "MAX_USERS",
						kind: "variable",
						filePath: "src/services/userService.ts",
					},
					reason: "No longer needed",
				},
			],
			options: {
				stopOnError: false,
			},
		}

		const result = await engine.executeBatch(batchOps)

		expect(result.success).toBe(true)
		expect(result.results).toHaveLength(3)

		// Verify file contents
		const userModelPath = path.join(setup.projectDir, "src/models/user.ts")
		const userServicePath = path.join(setup.projectDir, "src/services/userService.ts")

		const userModelContent = fs.readFileSync(userModelPath, "utf-8")
		const userServiceContent = fs.readFileSync(userServicePath, "utf-8")

		// Check that successful operations completed
		expect(userModelContent).toContain("export interface UserProfile")
		expect(userServiceContent).not.toContain("MAX_USERS")
	})

	test("should handle complex batch operations with dependencies", async () => {
		const batchOps: BatchOperations = {
			operations: [
				{
					operation: "move",
					selector: {
						type: "identifier",
						name: "formatUserName",
						kind: "function",
						filePath: "src/services/userService.ts",
					},
					targetFilePath: "src/services/profileService.ts",
					reason: "Better organization",
				},
				{
					operation: "rename",
					selector: {
						type: "identifier",
						name: "User",
						kind: "interface",
						filePath: "src/models/user.ts",
					},
					newName: "UserProfile",
					reason: "More specific name",
				},
			],
			options: {
				stopOnError: true,
			},
		}

		const result = await engine.executeBatch(batchOps)

		expect(result.success).toBe(true)
		expect(result.results).toHaveLength(2)

		// Verify file contents
		const userModelPath = path.join(setup.projectDir, "src/models/user.ts")

		const userModelContent = fs.readFileSync(userModelPath, "utf-8")

		// Check rename operation
		expect(userModelContent).toContain("export interface UserProfile")
	})

	test("should handle batch operations with multiple renames", async () => {
		const batchOps: BatchOperations = {
			operations: [
				{
					operation: "rename",
					selector: {
						type: "identifier",
						name: "User",
						kind: "interface",
						filePath: "src/models/user.ts",
					},
					newName: "UserProfile",
					reason: "More specific name",
				},
				{
					operation: "rename",
					selector: {
						type: "identifier",
						name: "UserRole",
						kind: "type",
						filePath: "src/models/user.ts",
					},
					newName: "ProfileRole",
					reason: "Consistent naming",
				},
				{
					operation: "move",
					selector: {
						type: "identifier",
						name: "formatUserName",
						kind: "function",
						filePath: "src/services/userService.ts",
					},
					targetFilePath: "src/services/profileService.ts",
					reason: "Better organization",
				},
				{
					operation: "remove",
					selector: {
						type: "identifier",
						name: "MAX_USERS",
						kind: "variable",
						filePath: "src/services/userService.ts",
					},
					reason: "No longer needed",
				},
			],
			options: {
				stopOnError: true,
			},
		}

		const result = await engine.executeBatch(batchOps)

		expect(result.success).toBe(true)
		expect(result.results).toHaveLength(4)

		// Verify file contents
		const userModelPath = path.join(setup.projectDir, "src/models/user.ts")
		const userServicePath = path.join(setup.projectDir, "src/services/userService.ts")
		const profileServicePath = path.join(setup.projectDir, "src/services/profileService.ts")

		const userModelContent = fs.readFileSync(userModelPath, "utf-8")
		const userServiceContent = fs.readFileSync(userServicePath, "utf-8")
		const profileServiceContent = fs.readFileSync(profileServicePath, "utf-8")

		// Check rename operations
		expect(userModelContent).toContain("export interface UserProfile")
		expect(userModelContent).toContain("export type ProfileRole")

		// Check move operation
		expect(profileServiceContent).toContain("formatUserName")

		// Check remove operation
		expect(userServiceContent).not.toContain("MAX_USERS")
	})
})
