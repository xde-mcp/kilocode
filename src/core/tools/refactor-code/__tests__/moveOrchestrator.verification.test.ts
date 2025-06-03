import { Project, ScriptTarget } from "ts-morph"
import { MoveOrchestrator } from "../operations/MoveOrchestrator"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"
import { normalizePathForTests, verifySymbolInContent } from "./utils/test-utilities"

/**
 * Comprehensive verification test for the refactored MoveOrchestrator
 *
 * This test suite verifies that the refactored MoveOrchestrator implementation
 * correctly handles various complex move operations, including:
 *
 * 1. Basic moves (function, interface, type)
 * 2. Moves with dependencies
 * 3. Complex import patterns
 * 4. Circular dependencies
 * 5. Multiple related symbols
 */
describe("MoveOrchestrator Verification Tests", () => {
	let project: Project
	let tempDir: string
	let moveOrchestrator: MoveOrchestrator

	// File paths
	let modelFile: string
	let serviceFile: string
	let utilFile: string
	let targetFile: string
	let consumerFile: string
	let circularFile: string

	beforeEach(async () => {
		// Create a temporary directory for test files
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "move-orchestrator-verification-"))

		// Create test directory structure
		fs.mkdirSync(path.join(tempDir, "src", "models"), { recursive: true })
		fs.mkdirSync(path.join(tempDir, "src", "services"), { recursive: true })
		fs.mkdirSync(path.join(tempDir, "src", "utils"), { recursive: true })
		fs.mkdirSync(path.join(tempDir, "src", "types"), { recursive: true })
		fs.mkdirSync(path.join(tempDir, "src", "consumers"), { recursive: true })

		// Create test files
		modelFile = path.join(tempDir, "src", "models", "user.ts")
		serviceFile = path.join(tempDir, "src", "services", "userService.ts")
		utilFile = path.join(tempDir, "src", "utils", "formatting.ts")
		targetFile = path.join(tempDir, "src", "types", "userTypes.ts")
		consumerFile = path.join(tempDir, "src", "consumers", "userConsumer.ts")
		circularFile = path.join(tempDir, "src", "models", "circular.ts")

		// Write content to model file
		fs.writeFileSync(
			modelFile,
			`// User model definitions
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
		)

		// Write content to service file
		fs.writeFileSync(
			serviceFile,
			`// User service implementation
import { User, UserRole, DEFAULT_ROLE } from "../models/user";
import { formatName, formatEmail } from "../utils/formatting";

export function getUserById(id: number): User {
  // Implementation
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
  // Implementation
  return DEFAULT_ROLE;
}

export function isAdmin(user: User): boolean {
  return getUserRole(user) === "admin";
}

export function displayUserInfo(user: User): string {
  return \`User: \${formatName(user.firstName, user.lastName)}, Email: \${formatEmail(user.email)}\`;
}
`,
		)

		// Write content to util file
		fs.writeFileSync(
			utilFile,
			`// Formatting utilities
export function formatName(firstName: string, lastName: string): string {
  return \`\${firstName} \${lastName}\`.trim();
}

export function formatEmail(email: string): string {
  const [username, domain] = email.split("@");
  if (!domain) return email;
  return \`\${username.substring(0, 3)}...@\${domain}\`;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString();
}
`,
		)

		// Write content to target file
		fs.writeFileSync(
			targetFile,
			`// User type definitions
// This file will be the target for moving types
`,
		)

		// Write content to consumer file
		fs.writeFileSync(
			consumerFile,
			`// User consumer
import { User, UserRole } from "../models/user";
import { getUserById, getUserRole, displayUserInfo } from "../services/userService";
import { formatName } from "../utils/formatting";

export function processUser(userId: number): void {
  const user = getUserById(userId);
  const role = getUserRole(user);
  const displayName = formatName(user.firstName, user.lastName);
  
  console.log(\`Processing user: \${displayName} (Role: \${role})\`);
  console.log(displayUserInfo(user));
}
`,
		)

		// Write content to circular file
		fs.writeFileSync(
			circularFile,
			`// Circular dependency example
export interface Parent {
  id: number;
  name: string;
  children: Child[];
}

export interface Child {
  id: number;
  name: string;
  parent: Parent;
}
`,
		)

		// Set up the project
		project = new Project({
			compilerOptions: {
				target: ScriptTarget.ES2020,
				rootDir: tempDir,
			},
		})

		// Add the test files to the project
		project.addSourceFilesAtPaths([modelFile, serviceFile, utilFile, targetFile, consumerFile, circularFile])

		// Initialize the MoveOrchestrator
		moveOrchestrator = new MoveOrchestrator(project)
	})

	afterEach(() => {
		// Clean up temp directory
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true })
		}
	})

	/**
	 * Test 1: Basic move operation - move a type from one file to another
	 */
	test("should move a simple type definition", async () => {
		// Execute the move operation
		const result = await moveOrchestrator.executeMoveOperation({
			operation: "move",
			selector: {
				type: "identifier",
				name: "UserRole",
				kind: "type",
				filePath: path.relative(tempDir, modelFile),
			},
			targetFilePath: path.relative(tempDir, targetFile),
		})

		// Verify operation success
		expect(result.success).toBe(true)
		expect(result.affectedFiles.length).toBeGreaterThanOrEqual(2)

		// Read file contents after move
		const sourceContent = fs.readFileSync(modelFile, "utf-8")
		const targetContent = fs.readFileSync(targetFile, "utf-8")
		const serviceContent = fs.readFileSync(serviceFile, "utf-8")

		// Verify the symbol was moved
		expect(verifySymbolInContent(sourceContent, "type UserRole")).toBe(false)
		expect(verifySymbolInContent(targetContent, "type UserRole")).toBe(true)

		// Verify imports were updated
		expect(sourceContent).toContain('import { UserRole } from "../types/userTypes"')
		expect(serviceContent).toContain('import { UserRole } from "../types/userTypes"')
	})

	/**
	 * Test 2: Move an interface with dependencies
	 */
	test("should move an interface with dependencies", async () => {
		// Execute the move operation
		const result = await moveOrchestrator.executeMoveOperation({
			operation: "move",
			selector: {
				type: "identifier",
				name: "UserWithRole",
				kind: "interface",
				filePath: path.relative(tempDir, modelFile),
			},
			targetFilePath: path.relative(tempDir, targetFile),
		})

		// Verify operation success
		expect(result.success).toBe(true)
		expect(result.affectedFiles.length).toBeGreaterThanOrEqual(2)

		// Read file contents after move
		const sourceContent = fs.readFileSync(modelFile, "utf-8")
		const targetContent = fs.readFileSync(targetFile, "utf-8")

		// Verify the symbol was moved
		expect(verifySymbolInContent(sourceContent, "interface UserWithRole")).toBe(false)
		expect(verifySymbolInContent(targetContent, "interface UserWithRole")).toBe(true)

		// Verify imports were updated in target
		expect(targetContent).toContain('import { User, UserRole } from "../models/user"')
		// or if UserRole was moved in previous test
		if (!sourceContent.includes("type UserRole")) {
			expect(targetContent).toContain('import { User } from "../models/user"')
		}
	})

	/**
	 * Test 3: Move a function with dependencies
	 */
	test("should move a function that depends on other functions", async () => {
		// Execute the move operation
		const result = await moveOrchestrator.executeMoveOperation({
			operation: "move",
			selector: {
				type: "identifier",
				name: "displayUserInfo",
				kind: "function",
				filePath: path.relative(tempDir, serviceFile),
			},
			targetFilePath: path.relative(tempDir, consumerFile),
		})

		// Verify operation success
		expect(result.success).toBe(true)
		expect(result.affectedFiles.length).toBeGreaterThanOrEqual(2)

		// Read file contents after move
		const sourceContent = fs.readFileSync(serviceFile, "utf-8")
		const targetContent = fs.readFileSync(consumerFile, "utf-8")

		// Verify the symbol was moved
		expect(verifySymbolInContent(sourceContent, "function displayUserInfo")).toBe(false)
		expect(verifySymbolInContent(targetContent, "function displayUserInfo")).toBe(true)

		// Verify imports were updated in target
		expect(targetContent).toContain('import { formatName, formatEmail } from "../utils/formatting"')
	})

	/**
	 * Test 4: Move a function and update imports in multiple files
	 */
	test("should move a function and update imports in multiple files", async () => {
		// Execute the move operation
		const result = await moveOrchestrator.executeMoveOperation({
			operation: "move",
			selector: {
				type: "identifier",
				name: "formatName",
				kind: "function",
				filePath: path.relative(tempDir, utilFile),
			},
			targetFilePath: path.relative(tempDir, serviceFile),
		})

		// Verify operation success
		expect(result.success).toBe(true)
		expect(result.affectedFiles.length).toBeGreaterThanOrEqual(3) // util, service, and consumer

		// Read file contents after move
		const sourceContent = fs.readFileSync(utilFile, "utf-8")
		const targetContent = fs.readFileSync(serviceFile, "utf-8")
		const consumerContent = fs.readFileSync(consumerFile, "utf-8")

		// Verify the symbol was moved
		expect(verifySymbolInContent(sourceContent, "function formatName")).toBe(false)
		expect(verifySymbolInContent(targetContent, "function formatName")).toBe(true)

		// Verify imports were updated in consumer
		expect(consumerContent).toContain('import { formatName } from "../services/userService"')
		expect(consumerContent).not.toContain('import { formatName } from "../utils/formatting"')
	})

	/**
	 * Test 5: Move an interface with circular dependencies
	 */
	test("should move an interface with circular dependencies", async () => {
		// Execute the move operation
		const result = await moveOrchestrator.executeMoveOperation({
			operation: "move",
			selector: {
				type: "identifier",
				name: "Parent",
				kind: "interface",
				filePath: path.relative(tempDir, circularFile),
			},
			targetFilePath: path.relative(tempDir, targetFile),
		})

		// Verify operation success
		expect(result.success).toBe(true)
		expect(result.affectedFiles.length).toBeGreaterThanOrEqual(2)

		// Read file contents after move
		const sourceContent = fs.readFileSync(circularFile, "utf-8")
		const targetContent = fs.readFileSync(targetFile, "utf-8")

		// Verify the symbol was moved
		expect(verifySymbolInContent(sourceContent, "interface Parent")).toBe(false)
		expect(verifySymbolInContent(targetContent, "interface Parent")).toBe(true)

		// Verify imports were updated with circular references
		expect(sourceContent).toContain('import { Parent } from "../types/userTypes"')
		expect(targetContent).toContain('import { Child } from "../models/circular"')
	})

	/**
	 * Test 6: Copy-only move operation
	 */
	test("should copy a function without removing from source when copyOnly is true", async () => {
		// We need to directly access the executor here to set copyOnly option
		// Get the MoveExecutor from the MoveOrchestrator instance
		const validator = (moveOrchestrator as any).validator
		const executor = (moveOrchestrator as any).executor
		const verifier = (moveOrchestrator as any).verifier

		// Create the operation
		const operation = {
			operation: "move",
			selector: {
				type: "identifier",
				name: "formatEmail",
				kind: "function",
				filePath: path.relative(tempDir, utilFile),
			},
			targetFilePath: path.relative(tempDir, serviceFile),
		}

		// Validate
		const validationResult = await validator.validate(operation)
		expect(validationResult.success).toBe(true)

		// Execute with copyOnly option
		const executionResult = await executor.execute(
			operation,
			{
				symbol: validationResult.symbol!,
				sourceFile: validationResult.sourceFile!,
			},
			{ copyOnly: true },
		)

		// Verify success
		expect(executionResult.success).toBe(true)
		expect(executionResult.details?.copyOnly).toBe(true)

		// Read file contents after copy
		const sourceContent = fs.readFileSync(utilFile, "utf-8")
		const targetContent = fs.readFileSync(serviceFile, "utf-8")

		// Verify the symbol exists in both files
		expect(verifySymbolInContent(sourceContent, "function formatEmail")).toBe(true)
		expect(verifySymbolInContent(targetContent, "function formatEmail")).toBe(true)
	})

	/**
	 * Test 7: Complex import patterns - move something with default and named imports
	 */
	test("should handle complex import patterns", async () => {
		// First add a file with default export
		const defaultExportFile = path.join(tempDir, "src", "utils", "defaults.ts")
		fs.writeFileSync(
			defaultExportFile,
			`// Default export example
export default function defaultFunction() {
  return "default";
}

export const namedExport = "named";
`,
		)

		// Add a file that imports both default and named exports
		const mixedImportFile = path.join(tempDir, "src", "utils", "mixed-imports.ts")
		fs.writeFileSync(
			mixedImportFile,
			`// Mixed imports example
import defaultFunction, { namedExport } from "./defaults";

export function useBoth() {
  return \`\${defaultFunction()} and \${namedExport}\`;
}
`,
		)

		// Add files to project
		project.addSourceFilesAtPaths([defaultExportFile, mixedImportFile])

		// Move the defaultFunction
		const result = await moveOrchestrator.executeMoveOperation({
			operation: "move",
			selector: {
				type: "identifier",
				name: "defaultFunction",
				kind: "function",
				filePath: path.relative(tempDir, defaultExportFile),
			},
			targetFilePath: path.relative(tempDir, serviceFile),
		})

		// Verify operation success
		expect(result.success).toBe(true)
		expect(result.affectedFiles.length).toBeGreaterThanOrEqual(3)

		// Read file contents after move
		const sourceContent = fs.readFileSync(defaultExportFile, "utf-8")
		const targetContent = fs.readFileSync(serviceFile, "utf-8")
		const importerContent = fs.readFileSync(mixedImportFile, "utf-8")

		// Verify the symbol was moved
		expect(verifySymbolInContent(sourceContent, "function defaultFunction")).toBe(false)
		expect(verifySymbolInContent(targetContent, "function defaultFunction")).toBe(true)

		// Verify imports were updated in importer
		expect(importerContent).toContain('import defaultFunction from "../services/userService"')
		expect(importerContent).toContain('import { namedExport } from "./defaults"')
	})

	/**
	 * Test 8: Integration - Move multiple related symbols
	 */
	test("should successfully move multiple related symbols", async () => {
		// Move UserRole type
		const result1 = await moveOrchestrator.executeMoveOperation({
			operation: "move",
			selector: {
				type: "identifier",
				name: "UserRole",
				kind: "type",
				filePath: path.relative(tempDir, modelFile),
			},
			targetFilePath: path.relative(tempDir, targetFile),
		})

		// Move DEFAULT_ROLE constant that depends on UserRole
		const result2 = await moveOrchestrator.executeMoveOperation({
			operation: "move",
			selector: {
				type: "identifier",
				name: "DEFAULT_ROLE",
				kind: "variable",
				filePath: path.relative(tempDir, modelFile),
			},
			targetFilePath: path.relative(tempDir, targetFile),
		})

		// Verify operations success
		expect(result1.success).toBe(true)
		expect(result2.success).toBe(true)

		// Read file contents after moves
		const modelContent = fs.readFileSync(modelFile, "utf-8")
		const targetContent = fs.readFileSync(targetFile, "utf-8")
		const serviceContent = fs.readFileSync(serviceFile, "utf-8")

		// Verify the symbols were moved
		expect(verifySymbolInContent(modelContent, "type UserRole")).toBe(false)
		expect(verifySymbolInContent(modelContent, "const DEFAULT_ROLE")).toBe(false)
		expect(verifySymbolInContent(targetContent, "type UserRole")).toBe(true)
		expect(verifySymbolInContent(targetContent, "const DEFAULT_ROLE")).toBe(true)

		// Verify imports were updated
		expect(serviceContent).toContain('import { UserRole, DEFAULT_ROLE } from "../types/userTypes"')
		expect(serviceContent).not.toContain('import { UserRole, DEFAULT_ROLE } from "../models/user"')
	})
})
