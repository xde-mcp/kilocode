import { RefactorEngine } from "../engine"
import { RenameOperation } from "../schema"
import * as path from "path"
import * as fs from "fs"
import {
	createRefactorEngineTestSetupWithAutoLoad,
	createTestFilesWithAutoLoad,
	RefactorEngineTestSetup,
} from "./utils/standardized-test-setup"

describe("Advanced Rename Operations", () => {
	let setup: RefactorEngineTestSetup
	let modelFile: string
	let serviceFile: string
	let utilFile: string

	beforeAll(() => {
		// Create enhanced test setup with automatic file loading
		setup = createRefactorEngineTestSetupWithAutoLoad()

		// Define file paths
		modelFile = path.join(setup.projectDir, "src", "models", "user.ts")
		serviceFile = path.join(setup.projectDir, "src", "services", "userService.ts")
		utilFile = path.join(setup.projectDir, "src", "utils", "formatting.ts")

		// Create test files with automatic loading into RefactorEngine
		createTestFilesWithAutoLoad(setup, {
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
import { formatName } from "../utils/formatting";

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

export function getUserRole(user: User): UserRole {
  // Mock implementation
  return DEFAULT_ROLE;
}

export function isAdmin(user: User): boolean {
  return getUserRole(user) === "admin";
}

export function displayUserInfo(user: User): string {
  return \`User: \${formatName(user.firstName, user.lastName)}, Email: \${user.email}\`;
}
`,
			"src/utils/formatting.ts": `// Formatting utilities
export function formatName(firstName: string, lastName: string): string {
  return \`\${firstName} \${lastName}\`.trim();
}

export function formatEmail(email: string): string {
  const [username, domain] = email.split("@");
  if (!domain) return email;
  return \`\${username.substring(0, 3)}...@\${domain}\`;
}
`,
		})
	})

	afterAll(() => {
		setup.cleanup()
	})

	test("should rename an interface and update all references across multiple files", async () => {
		jest.setTimeout(30000) // Increase timeout for this test

		// Execute the rename operation using RefactorEngine
		const renameOperation: RenameOperation = {
			operation: "rename",
			selector: {
				type: "identifier",
				name: "User",
				kind: "interface",
				filePath: path.relative(setup.projectDir, modelFile),
			},
			newName: "UserProfile",
			scope: "project",
			reason: "More descriptive name",
		}

		const result = await setup.engine.executeOperation(renameOperation)

		// Check that the operation was successful
		expect(result.success).toBe(true)
		expect(result.affectedFiles).toContain(modelFile)
		expect(result.affectedFiles).toContain(serviceFile)

		// Verify that the interface was renamed in the model file
		const modelContent = fs.readFileSync(modelFile, "utf-8")
		expect(modelContent).toContain("interface UserProfile {")
		expect(modelContent).not.toContain("interface User {")
		expect(modelContent).toContain("extends UserProfile")

		// Verify that references were updated in the service file
		const serviceContent = fs.readFileSync(serviceFile, "utf-8")
		expect(serviceContent).toContain("import { UserProfile, UserRole, DEFAULT_ROLE } from")
		expect(serviceContent).toContain("function getUserById(id: number): UserProfile")
		expect(serviceContent).toContain("function getUserRole(user: UserProfile): UserRole")
		expect(serviceContent).toContain("function isAdmin(user: UserProfile): boolean")
		expect(serviceContent).toContain("function displayUserInfo(user: UserProfile)")
	})

	test("should rename a type and update all references", async () => {
		jest.setTimeout(30000) // Increase timeout for this test

		// Execute the rename operation using RefactorEngine
		const renameOperation: RenameOperation = {
			operation: "rename",
			selector: {
				type: "identifier",
				name: "UserRole",
				kind: "type",
				filePath: path.relative(setup.projectDir, modelFile),
			},
			newName: "Role",
			scope: "project",
			reason: "Simplify type name",
		}

		const result = await setup.engine.executeOperation(renameOperation)

		// Check that the operation was successful
		expect(result.success).toBe(true)
		expect(result.affectedFiles).toContain(modelFile)
		expect(result.affectedFiles).toContain(serviceFile)

		// Verify that the type was renamed in the model file
		const modelContent = fs.readFileSync(modelFile, "utf-8")
		expect(modelContent).toContain("type Role =")
		expect(modelContent).not.toContain("type UserRole =")
		expect(modelContent).toContain("role: Role;")
		expect(modelContent).toContain("export const DEFAULT_ROLE: Role =")

		// Verify that references were updated in the service file
		const serviceContent = fs.readFileSync(serviceFile, "utf-8")
		expect(serviceContent).toContain("import { UserProfile, Role, DEFAULT_ROLE } from")
		expect(serviceContent).toContain("function getUserRole(user: UserProfile): Role")
	})

	test("should rename a function and update all references", async () => {
		jest.setTimeout(30000) // Increase timeout for this test

		// Execute the rename operation using RefactorEngine
		const renameOperation: RenameOperation = {
			operation: "rename",
			selector: {
				type: "identifier",
				name: "formatName",
				kind: "function",
				filePath: path.relative(setup.projectDir, utilFile),
			},
			newName: "formatFullName",
			scope: "project",
			reason: "More descriptive function name",
		}

		const result = await setup.engine.executeOperation(renameOperation)

		// Check that the operation was successful
		expect(result.success).toBe(true)
		expect(result.affectedFiles).toContain(utilFile)
		expect(result.affectedFiles).toContain(serviceFile)

		// Verify that the function was renamed in the util file
		const utilContent = fs.readFileSync(utilFile, "utf-8")
		expect(utilContent).toContain("function formatFullName(firstName: string, lastName: string)")
		expect(utilContent).not.toContain("function formatName(firstName: string, lastName: string)")

		// Verify that references were updated in the service file
		const serviceContent = fs.readFileSync(serviceFile, "utf-8")
		expect(serviceContent).toContain("import { formatFullName } from")
		expect(serviceContent).toContain("formatFullName(user.firstName, user.lastName)")
	})

	test("should rename a variable and update all references", async () => {
		jest.setTimeout(30000) // Increase timeout for this test

		// Execute the rename operation using RefactorEngine
		const renameOperation: RenameOperation = {
			operation: "rename",
			selector: {
				type: "identifier",
				name: "DEFAULT_ROLE",
				kind: "variable",
				filePath: path.relative(setup.projectDir, modelFile),
			},
			newName: "DEFAULT_USER_ROLE",
			scope: "project",
			reason: "More specific name",
		}

		const result = await setup.engine.executeOperation(renameOperation)

		// Check that the operation was successful
		expect(result.success).toBe(true)
		expect(result.affectedFiles).toContain(modelFile)
		expect(result.affectedFiles).toContain(serviceFile)

		// Verify that the variable was renamed in the model file
		const modelContent = fs.readFileSync(modelFile, "utf-8")
		expect(modelContent).toContain("export const DEFAULT_USER_ROLE: Role =")
		expect(modelContent).not.toContain("export const DEFAULT_ROLE: UserRole =")

		// Verify that references were updated in the service file
		const serviceContent = fs.readFileSync(serviceFile, "utf-8")
		expect(serviceContent).toContain("import { UserProfile, Role, DEFAULT_USER_ROLE } from")
		expect(serviceContent).not.toContain("import { UserProfile, Role, DEFAULT_ROLE } from")
		expect(serviceContent).toContain("return DEFAULT_USER_ROLE;")
	})

	test("should handle renaming with scope limited to file", async () => {
		jest.setTimeout(30000) // Increase timeout for this test

		// Execute the rename operation using RefactorEngine with file scope
		const renameOperation: RenameOperation = {
			operation: "rename",
			selector: {
				type: "identifier",
				name: "getUserRole",
				kind: "function",
				filePath: path.relative(setup.projectDir, serviceFile),
			},
			newName: "getRole",
			scope: "file",
			reason: "Shorter name within file scope",
		}

		const result = await setup.engine.executeOperation(renameOperation)

		// Check that the operation was successful
		expect(result.success).toBe(true)
		expect(result.affectedFiles).toContain(serviceFile)
		expect(result.affectedFiles).not.toContain(utilFile)

		// Verify that the function was renamed in the service file
		const serviceContent = fs.readFileSync(serviceFile, "utf-8")
		expect(serviceContent).toContain("function getRole(user: UserProfile)")
		expect(serviceContent).not.toContain("function getUserRole(user: UserProfile)")
		expect(serviceContent).toContain('return getRole(user) === "admin";')

		// Verify that other files were not affected
		const utilContent = fs.readFileSync(utilFile, "utf-8")
		expect(utilContent).not.toContain("getRole")
	})
})
