import { Project, ScriptTarget } from "ts-morph"
import { MoveOrchestrator } from "../operations/MoveOrchestrator"
import { MoveOperation } from "../schema"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"
import {
	normalizePathForTests,
	verifySymbolInContent,
	withCleanup,
	createMinimalTestFixture,
} from "./utils/test-utilities"
import { PerformanceTracker } from "../utils/performance-tracker"
import { TestTimer, tryForceGC, createCleanableTestFixture } from "./utils/test-performance"

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
	// Set longer timeout for all tests in this suite
	jest.setTimeout(30000)

	// These variables will be set in beforeEach but properly cleaned in afterEach
	let project: Project
	let tempDir: string
	let moveOrchestrator: MoveOrchestrator
	let testFiles: Record<string, string> = {}

	// File paths - only storing strings that can be easily cleaned up
	let modelFile: string
	let serviceFile: string
	let utilFile: string
	let targetFile: string
	let consumerFile: string
	let circularFile: string

	// Create a function to generate test content that's smaller/simpler than before
	function createTestContent() {
		// Create content with minimal sizes to reduce memory usage
		const modelContent = `// User model definitions
export interface User {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
}

export type UserRole = "admin" | "user";

export interface UserWithRole extends User {
  role: UserRole;
}

export const DEFAULT_ROLE: UserRole = "user";
`

		const serviceContent = `// User service implementation
import { User, UserRole, DEFAULT_ROLE } from "../models/user";
import { formatName, formatEmail } from "../utils/formatting";

export function getUserById(id: number): User {
  return { id, username: "user", firstName: "Test", lastName: "User" };
}

export function getUserRole(user: User): UserRole {
  return DEFAULT_ROLE;
}

export function displayUserInfo(user: User): string {
  return \`User: \${formatName(user.firstName, user.lastName)}\`;
}
`

		const utilContent = `// Formatting utilities
export function formatName(firstName: string, lastName: string): string {
  return \`\${firstName} \${lastName}\`;
}

export function formatEmail(email: string): string {
  return email;
}
`

		const targetContent = `// User type definitions
// This file will be the target for moving types
`

		const consumerContent = `// User consumer
import { User, UserRole } from "../models/user";
import { getUserById, getUserRole, displayUserInfo } from "../services/userService";
import { formatName } from "../utils/formatting";

export function processUser(userId: number): void {
  const user = getUserById(userId);
  const role = getUserRole(user);
  console.log(displayUserInfo(user));
}
`

		const circularContent = `// Circular dependency example
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
`
		return {
			modelContent,
			serviceContent,
			utilContent,
			targetContent,
			consumerContent,
			circularContent,
		}
	}

	// This beforeEach creates a minimalist test environment to reduce memory usage
	beforeEach(async () => {
		// Create a temporary directory for test files
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "move-orchestrator-verification-"))

		// Create necessary directories with minimal structure
		fs.mkdirSync(path.join(tempDir, "src", "models"), { recursive: true })
		fs.mkdirSync(path.join(tempDir, "src", "services"), { recursive: true })
		fs.mkdirSync(path.join(tempDir, "src", "utils"), { recursive: true })
		fs.mkdirSync(path.join(tempDir, "src", "types"), { recursive: true })
		fs.mkdirSync(path.join(tempDir, "src", "consumers"), { recursive: true })

		// Set up file paths
		modelFile = path.join(tempDir, "src", "models", "user.ts")
		serviceFile = path.join(tempDir, "src", "services", "userService.ts")
		utilFile = path.join(tempDir, "src", "utils", "formatting.ts")
		targetFile = path.join(tempDir, "src", "types", "userTypes.ts")
		consumerFile = path.join(tempDir, "src", "consumers", "userConsumer.ts")
		circularFile = path.join(tempDir, "src", "models", "circular.ts")

		// Get file content
		const { modelContent, serviceContent, utilContent, targetContent, consumerContent, circularContent } =
			createTestContent()

		// Write content to files (with minimal content)
		fs.writeFileSync(modelFile, modelContent)
		fs.writeFileSync(serviceFile, serviceContent)
		fs.writeFileSync(utilFile, utilContent)
		fs.writeFileSync(targetFile, targetContent)
		fs.writeFileSync(consumerFile, consumerContent)
		fs.writeFileSync(circularFile, circularContent)

		// Track files for cleanup
		testFiles = {
			modelFile,
			serviceFile,
			utilFile,
			targetFile,
			consumerFile,
			circularFile,
		}

		// Set up the project with minimal compiler options
		project = new Project({
			compilerOptions: {
				target: ScriptTarget.ES2020,
				rootDir: tempDir,
			},
		})

		// Add the test files to the project one by one to avoid large array allocations
		project.addSourceFileAtPath(modelFile)
		project.addSourceFileAtPath(serviceFile)
		project.addSourceFileAtPath(utilFile)
		project.addSourceFileAtPath(targetFile)
		project.addSourceFileAtPath(consumerFile)
		project.addSourceFileAtPath(circularFile)

		// Initialize the MoveOrchestrator
		moveOrchestrator = new MoveOrchestrator(project)

		// Suggest garbage collection after setup
		tryForceGC()
	})

	// Enhanced afterEach with more aggressive memory cleanup
	afterEach(() => {
		try {
			// First clear all source files from the project
			if (project) {
				const sourceFiles = project.getSourceFiles()
				for (const file of sourceFiles) {
					try {
						project.removeSourceFile(file)
					} catch (e) {
						// Ignore errors during cleanup
					}
				}
			}

			// Dispose orchestrator to clean up resources
			if (moveOrchestrator) {
				moveOrchestrator.dispose()
			}

			// Release project reference to help garbage collection
			project = null as any

			// Clean up temp directory
			if (tempDir && fs.existsSync(tempDir)) {
				fs.rmSync(tempDir, { recursive: true, force: true })
			}

			// Clear file path references
			Object.keys(testFiles).forEach((key) => {
				testFiles[key] = ""
			})
			testFiles = {}

			modelFile = null as any
			serviceFile = null as any
			utilFile = null as any
			targetFile = null as any
			consumerFile = null as any
			circularFile = null as any

			// Force garbage collection
			tryForceGC()
		} catch (e) {
			console.error("Error during test cleanup:", e)
		}
	})

	/**
	 * Test 1: Basic move operation - move a type from one file to another
	 * Using withCleanup to ensure proper resource management
	 */
	test("should move a simple type definition", async () => {
		const timer = new TestTimer("move-type-definition")

		try {
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
			timer.checkpoint("operation-completed")
			expect(result.success).toBe(true)
			expect(result.affectedFiles.length).toBeGreaterThanOrEqual(2)

			// Read file contents after move
			const sourceContent = fs.readFileSync(modelFile, "utf-8")
			const targetContent = fs.readFileSync(targetFile, "utf-8")
			const serviceContent = fs.readFileSync(serviceFile, "utf-8")

			// Verify the symbol was moved
			expect(verifySymbolInContent(sourceContent, "type UserRole", false)).toBe(false)
			expect(verifySymbolInContent(targetContent, "type UserRole", true)).toBe(true)

			// Verify imports were updated
			expect(sourceContent).toContain('import { UserRole } from "../types/userTypes"')
			expect(serviceContent).toContain('import { UserRole } from "../types/userTypes"')
		} finally {
			// Ensure resources are freed even if assertions fail
			timer.end()
			tryForceGC()
		}
	})

	/**
	 * Test 2: Move an interface with dependencies
	 */
	test("should move an interface with dependencies", async () => {
		const timer = new TestTimer("move-interface-with-dependencies")

		try {
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
			timer.checkpoint("operation-completed")
			expect(result.success).toBe(true)
			expect(result.affectedFiles.length).toBeGreaterThanOrEqual(2)

			// Read file contents after move
			const sourceContent = fs.readFileSync(modelFile, "utf-8")
			const targetContent = fs.readFileSync(targetFile, "utf-8")

			// Verify the symbol was moved
			expect(verifySymbolInContent(sourceContent, "interface UserWithRole", false)).toBe(false)
			expect(verifySymbolInContent(targetContent, "interface UserWithRole", true)).toBe(true)

			// Verify imports were updated in target
			expect(targetContent).toContain('import { User, UserRole } from "../models/user"')
			// or if UserRole was moved in previous test
			if (!sourceContent.includes("type UserRole")) {
				expect(targetContent).toContain('import { User } from "../models/user"')
			}
		} finally {
			// Clean up resources
			timer.end()
			tryForceGC()
		}
	})

	/**
	 * Test 3: Move a function with dependencies
	 */
	test("should move a function that depends on other functions", async () => {
		const timer = new TestTimer("move-function-with-dependencies")

		try {
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
			timer.checkpoint("operation-completed")
			expect(result.success).toBe(true)
			expect(result.affectedFiles.length).toBeGreaterThanOrEqual(2)

			// Read file contents after move
			const sourceContent = fs.readFileSync(serviceFile, "utf-8")
			const targetContent = fs.readFileSync(consumerFile, "utf-8")

			// Verify the symbol was moved
			expect(verifySymbolInContent(sourceContent, "function displayUserInfo", false)).toBe(false)
			expect(verifySymbolInContent(targetContent, "function displayUserInfo", true)).toBe(true)

			// Verify imports were updated in target
			expect(targetContent).toContain('import { formatName, formatEmail } from "../utils/formatting"')
		} finally {
			// Clean up resources
			timer.end()
			tryForceGC()
		}
	})

	/**
	 * Test 4: Move a function and update imports in multiple files
	 */
	test("should move a function and update imports in multiple files", async () => {
		const timer = new TestTimer("move-function-update-imports")

		try {
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
			timer.checkpoint("operation-completed")
			expect(result.success).toBe(true)
			expect(result.affectedFiles.length).toBeGreaterThanOrEqual(3) // util, service, and consumer

			// Read file contents after move
			const sourceContent = fs.readFileSync(utilFile, "utf-8")
			const targetContent = fs.readFileSync(serviceFile, "utf-8")
			const consumerContent = fs.readFileSync(consumerFile, "utf-8")

			// Verify the symbol was moved
			expect(verifySymbolInContent(sourceContent, "function formatName", false)).toBe(false)
			expect(verifySymbolInContent(targetContent, "function formatName", true)).toBe(true)

			// Verify imports were updated in consumer
			expect(consumerContent).toContain('import { formatName } from "../services/userService"')
			expect(consumerContent).not.toContain('import { formatName } from "../utils/formatting"')
		} finally {
			// Clean up resources
			timer.end()
			tryForceGC()
		}
	})

	/**
	 * Test 5: Move an interface with circular dependencies
	 */
	test("should move an interface with circular dependencies", async () => {
		const timer = new TestTimer("move-circular-dependency")

		try {
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
			timer.checkpoint("operation-completed")
			expect(result.success).toBe(true)
			expect(result.affectedFiles.length).toBeGreaterThanOrEqual(2)

			// Read file contents after move
			const sourceContent = fs.readFileSync(circularFile, "utf-8")
			const targetContent = fs.readFileSync(targetFile, "utf-8")

			// Verify the symbol was moved
			expect(verifySymbolInContent(sourceContent, "interface Parent", false)).toBe(false)
			expect(verifySymbolInContent(targetContent, "interface Parent", true)).toBe(true)

			// Verify imports were updated with circular references
			expect(sourceContent).toContain('import { Parent } from "../types/userTypes"')
			expect(targetContent).toContain('import { Child } from "../models/circular"')
		} finally {
			// Clean up resources
			timer.end()
			tryForceGC()
		}
	})

	/**
	 * Test 6: Copy-only move operation
	 */
	test("should copy a function without removing from source when copyOnly is true", async () => {
		const timer = new TestTimer("copy-only-function")

		try {
			// Create the operation with the correct literal typing
			const operation = {
				operation: "move" as const, // Use const assertion to preserve literal type
				selector: {
					type: "identifier" as const,
					name: "formatEmail",
					kind: "function" as const,
					filePath: path.relative(tempDir, utilFile),
				},
				targetFilePath: path.relative(tempDir, serviceFile),
			}

			// Execute the move operation with copyOnly option
			const result = await moveOrchestrator.executeMoveOperation(operation, { copyOnly: true })

			// Verify success
			timer.checkpoint("operation-completed")
			expect(result.success).toBe(true)

			// Read file contents after copy
			const sourceContent = fs.readFileSync(utilFile, "utf-8")
			const targetContent = fs.readFileSync(serviceFile, "utf-8")

			// Verify the symbol exists in both files
			expect(verifySymbolInContent(sourceContent, "function formatEmail", false)).toBe(true)
			expect(verifySymbolInContent(targetContent, "function formatEmail", true)).toBe(true)
		} finally {
			// Clean up resources
			timer.end()
			tryForceGC()
		}
	})

	/**
	 * Test 7: Complex import patterns - move something with default and named imports
	 */
	test("should handle complex import patterns", async () => {
		const timer = new TestTimer("complex-import-patterns")
		let defaultExportFile: string = ""
		let mixedImportFile: string = ""

		try {
			// First add a file with default export - using smaller content
			defaultExportFile = path.join(tempDir, "src", "utils", "defaults.ts")
			fs.writeFileSync(
				defaultExportFile,
				`// Default export example
export default function defaultFunction() { return "default"; }
export const namedExport = "named";`,
			)

			// Add a file that imports both default and named exports - using smaller content
			mixedImportFile = path.join(tempDir, "src", "utils", "mixed-imports.ts")
			fs.writeFileSync(
				mixedImportFile,
				`// Mixed imports example
import defaultFunction, { namedExport } from "./defaults";
export function useBoth() { return \`\${defaultFunction()} and \${namedExport}\`; }`,
			)

			// Add files to project one at a time to avoid array allocation
			project.addSourceFileAtPath(defaultExportFile)
			project.addSourceFileAtPath(mixedImportFile)

			timer.checkpoint("files-created")

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
			timer.checkpoint("operation-completed")
			expect(result.success).toBe(true)
			expect(result.affectedFiles.length).toBeGreaterThanOrEqual(3)

			// Read file contents after move
			const sourceContent = fs.readFileSync(defaultExportFile, "utf-8")
			const targetContent = fs.readFileSync(serviceFile, "utf-8")
			const importerContent = fs.readFileSync(mixedImportFile, "utf-8")

			// Verify the symbol was moved
			expect(verifySymbolInContent(sourceContent, "function defaultFunction", false)).toBe(false)
			expect(verifySymbolInContent(targetContent, "function defaultFunction", true)).toBe(true)

			// Verify imports were updated in importer
			expect(importerContent).toContain('import defaultFunction from "../services/userService"')
			expect(importerContent).toContain('import { namedExport } from "./defaults"')
		} finally {
			// Add created files to testFiles for cleanup
			if (defaultExportFile) testFiles["defaultExportFile"] = defaultExportFile
			if (mixedImportFile) testFiles["mixedImportFile"] = mixedImportFile

			// Clean up resources
			timer.end()
			tryForceGC()
		}
	})

	/**
	 * Test 8: Integration - Move multiple related symbols
	 */
	test("should successfully move multiple related symbols", async () => {
		const timer = new TestTimer("move-multiple-symbols")

		try {
			// Move UserRole type
			timer.checkpoint("start-move-role")
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

			// Verify first operation success
			expect(result1.success).toBe(true)
			timer.checkpoint("role-moved")

			// Trigger GC between operations to reduce memory pressure
			tryForceGC()

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

			// Verify second operation success
			expect(result2.success).toBe(true)
			timer.checkpoint("default-role-moved")

			// Trigger GC before reading files
			tryForceGC()

			// Read file contents one at a time to reduce memory pressure
			const modelContent = fs.readFileSync(modelFile, "utf-8")
			const targetContent = fs.readFileSync(targetFile, "utf-8")
			const serviceContent = fs.readFileSync(serviceFile, "utf-8")
			timer.checkpoint("files-read")

			// Verify the symbols were moved
			expect(verifySymbolInContent(modelContent, "type UserRole", false)).toBe(false)
			expect(verifySymbolInContent(modelContent, "const DEFAULT_ROLE", false)).toBe(false)
			expect(verifySymbolInContent(targetContent, "type UserRole", true)).toBe(true)
			expect(verifySymbolInContent(targetContent, "const DEFAULT_ROLE", true)).toBe(true)

			// Verify imports were updated
			expect(serviceContent).toContain('import { UserRole, DEFAULT_ROLE } from "../types/userTypes"')
			expect(serviceContent).not.toContain('import { UserRole, DEFAULT_ROLE } from "../models/user"')
		} finally {
			// Clean up resources
			timer.end()
			tryForceGC()
		}
	})
})
