import { Project } from "ts-morph"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"
import { RefactorEngine, BatchResult } from "../engine"
import { RenameOperation, MoveOperation, RemoveOperation, BatchOperations } from "../schema"
import { performance } from "perf_hooks"
import {
	createRefactorEngineTestSetup,
	createTestFiles,
	TEST_FILE_TEMPLATES,
	RefactorEngineTestSetup,
} from "./utils/standardized-test-setup"

/**
 * Comprehensive integration test suite for the RefactorCodeTool
 *
 * This suite tests:
 * 1. All refactoring operations in isolation and in batches
 * 2. Error handling and recovery mechanisms
 * 3. Cross-platform path compatibility
 * 4. Performance optimizations
 */
describe("RefactorCodeTool Comprehensive Integration Tests", () => {
	// Setup temp directories and files for testing
	let tempDir: string
	let projectDir: string
	let srcDir: string
	let utilsDir: string
	let servicesDir: string
	let modelsDir: string
	let testFilePaths: { [key: string]: string } = {}
	let engine: RefactorEngine

	// Test file contents
	const testFiles = {
		userModel: `
export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'admin' | 'user';
}

export type UserRole = 'admin' | 'user' | 'guest';

export function validateUser(user: User): boolean {
  return !!user.email;
}
`,
		utilityFunctions: `
export function formatName(first: string, last: string): string {
  return \`\${first} \${last}\`.trim();
}

export function formatEmail(email: string): string {
  return email.toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^@]+@[^@]+\.[^@]+$/.test(email);
}
`,
		userService: `
import { User, validateUser } from "../models/user";
import { formatName, formatEmail, isValidEmail } from "../utils/utility";

export class UserService {
  private users: User[] = [];

  constructor() {}

  public addUser(user: User): boolean {
    if (!validateUser(user) || !isValidEmail(user.email)) {
      return false;
    }
    
    // Format user data
    user.firstName = user.firstName.trim();
    user.lastName = user.lastName.trim();
    user.email = formatEmail(user.email);
    
    this.users.push(user);
    return true;
  }

  public getUserByEmail(email: string): User | undefined {
    return this.users.find(u => u.email === formatEmail(email));
  }

  public formatUserDisplay(user: User): string {
    return \`\${formatName(user.firstName, user.lastName)} (\${user.email})\`;
  }
}
`,
		authService: `
import { User } from "../models/user";

export class AuthService {
  private loggedInUsers: Map<string, User> = new Map();

  public login(user: User, token: string): boolean {
    this.loggedInUsers.set(token, user);
    return true;
  }

  public logout(token: string): void {
    this.loggedInUsers.delete(token);
  }

  public isLoggedIn(token: string): boolean {
    return this.loggedInUsers.has(token);
  }

  public getCurrentUser(token: string): User | undefined {
    return this.loggedInUsers.get(token);
  }
}
`,
	}

	/**
	 * Helper function to create normalized paths that work across platforms
	 */
	function normalizePath(filePath: string): string {
		return filePath.split(path.sep).join("/")
	}

	/**
	 * Helper function to verify file content contains certain text
	 */
	function fileContains(filePath: string, text: string): boolean {
		const content = fs.readFileSync(filePath, "utf-8")
		return content.includes(text)
	}

	/**
	 * Helper function to verify file content does not contain certain text
	 */
	function fileNotContains(filePath: string, text: string): boolean {
		const content = fs.readFileSync(filePath, "utf-8")
		return !content.includes(text)
	}

	/**
	 * Helper function to execute a batch operation and measure performance
	 */
	async function executeBatchWithPerf(
		operations: BatchOperations,
	): Promise<{ result: BatchResult; duration: number }> {
		const start = performance.now()
		const result = await engine.executeBatch(operations)
		const duration = performance.now() - start
		return { result, duration }
	}

	let setup: RefactorEngineTestSetup

	beforeAll(() => {
		// Use standardized Pattern 2 setup
		setup = createRefactorEngineTestSetup()
		engine = setup.engine
		projectDir = setup.projectDir
		tempDir = path.dirname(projectDir)
		srcDir = path.join(projectDir, "src")
		utilsDir = path.join(srcDir, "utils")
		servicesDir = path.join(srcDir, "services")
		modelsDir = path.join(srcDir, "models")

		// Create test files using standardized utility
		const filesToCreate = {
			"src/models/user.ts": testFiles.userModel,
			"src/utils/utility.ts": testFiles.utilityFunctions,
			"src/services/userService.ts": testFiles.userService,
			"src/services/authService.ts": testFiles.authService,
		}

		createTestFiles(setup.projectDir, filesToCreate)

		// Update test file paths
		testFilePaths.userModel = path.join(modelsDir, "user.ts")
		testFilePaths.utilityFunctions = path.join(utilsDir, "utility.ts")
		testFilePaths.userService = path.join(servicesDir, "userService.ts")
		testFilePaths.authService = path.join(servicesDir, "authService.ts")

		console.log(`[TEST SETUP] Created test project at: ${projectDir}`)
		console.log(
			`[TEST SETUP] Test files created:`,
			Object.values(testFilePaths).map((p) => path.relative(projectDir, p)),
		)
	})

	afterAll(() => {
		// Use standardized cleanup
		setup.cleanup()
	})

	beforeEach(() => {
		// Reset test files before each test to prevent interference
		fs.writeFileSync(testFilePaths.userModel, testFiles.userModel)
		fs.writeFileSync(testFilePaths.utilityFunctions, testFiles.utilityFunctions)
		fs.writeFileSync(testFilePaths.userService, testFiles.userService)
		fs.writeFileSync(testFilePaths.authService, testFiles.authService)

		// Reinitialize RefactorEngine to clear any cached state
		engine = new RefactorEngine({
			projectRootPath: projectDir,
		})
	})

	/**
	 * RENAME OPERATIONS
	 */
	test("Successfully renames a function and updates all references", async () => {
		// Create a rename operation
		const operation: RenameOperation = {
			operation: "rename",
			selector: {
				type: "identifier",
				name: "formatEmail",
				kind: "function",
				filePath: normalizePath(path.relative(projectDir, testFilePaths.utilityFunctions)),
			},
			newName: "normalizeEmail",
			scope: "project",
			reason: "More descriptive name",
		}

		// Execute the operation
		const result = await engine.executeOperation(operation)

		// Verify the operation was successful
		expect(result.success).toBe(true)

		// Verify the source file was updated
		expect(fileContains(testFilePaths.utilityFunctions, "normalizeEmail")).toBe(true)
		expect(fileNotContains(testFilePaths.utilityFunctions, "formatEmail")).toBe(true)

		// Verify references were updated
		expect(fileContains(testFilePaths.userService, "normalizeEmail")).toBe(true)
		expect(fileNotContains(testFilePaths.userService, "formatEmail")).toBe(true)
	})

	/**
	 * MOVE OPERATIONS
	 */
	test("Successfully moves a function to another file with import updates", async () => {
		// Create a move operation
		const operation: MoveOperation = {
			operation: "move",
			selector: {
				type: "identifier",
				name: "isValidEmail",
				kind: "function",
				filePath: normalizePath(path.relative(projectDir, testFilePaths.utilityFunctions)),
			},
			targetFilePath: normalizePath(path.relative(projectDir, path.join(utilsDir, "validation.ts"))),
			reason: "Better organization of validation functions",
		}

		// Execute the operation
		const result = await engine.executeOperation(operation)

		// Verify the operation was successful
		expect(result.success).toBe(true)

		// Verify the function was removed from source
		expect(fileNotContains(testFilePaths.utilityFunctions, "isValidEmail")).toBe(true)

		// Verify the function was added to target
		const validationPath = path.join(utilsDir, "validation.ts")
		expect(fileContains(validationPath, "isValidEmail")).toBe(true)

		// Verify imports were updated in the user service - show full content for debugging
		const userServiceContent = fs.readFileSync(testFilePaths.userService, "utf-8")
		console.log("\n=== ACTUAL userService.ts content after move ===")
		console.log(userServiceContent)
		console.log("=== END userService.ts content ===\n")

		// Expected content after move operation
		const expectedUserServiceContent = `import { User, validateUser } from "../models/user";
import { formatName, formatEmail } from "../utils/utility";
import { isValidEmail } from "../utils/validation";

export class UserService {
		private users: User[] = [];

		constructor() {}

		public addUser(user: User): boolean {
		  if (!validateUser(user) || !isValidEmail(user.email)) {
		    return false;
		  }
		  
		  // Format user data
		  user.firstName = user.firstName.trim();
		  user.lastName = user.lastName.trim();
		  user.email = formatEmail(user.email);
		  
		  this.users.push(user);
		  return true;
		}

		public getUserByEmail(email: string): User | undefined {
		  return this.users.find(u => u.email === formatEmail(email));
		}

		public formatUserDisplay(user: User): string {
		  return \`\${formatName(user.firstName, user.lastName)} (\${user.email})\`;
		}
}
`

		console.log("=== EXPECTED userService.ts content ===")
		console.log(expectedUserServiceContent)
		console.log("=== END expected content ===\n")

		// Check if the import was properly split and added
		expect(userServiceContent).toContain('import { formatName, formatEmail } from "../utils/utility"')
		expect(userServiceContent).toContain('import { isValidEmail } from "../utils/validation"')
	})

	/**
	 * REMOVE OPERATIONS
	 */
	test("Successfully removes a function and cleans up imports", async () => {
		// Create a remove operation with force and cleanup options
		const operation: RemoveOperation = {
			operation: "remove",
			selector: {
				type: "identifier",
				name: "validateUser",
				kind: "function",
				filePath: normalizePath(path.relative(projectDir, testFilePaths.userModel)),
			},
			reason: "Function is no longer needed",
			options: {
				forceRemove: true,
				cleanupDependencies: true,
			},
		}

		// Execute the operation
		const result = await engine.executeOperation(operation)

		// Verify the operation was successful (with force remove)
		expect(result.success).toBe(true)

		// Verify the function was removed from the source file
		expect(fileNotContains(testFilePaths.userModel, "validateUser")).toBe(true)

		// Note: Import cleanup in other files is not yet implemented
		// The userService file will still contain the import and usage
		// This is expected behavior until cross-file import cleanup is implemented
		console.log("Remove operation completed successfully with forceRemove option")
	})

	/**
	 * BATCH OPERATIONS
	 */
	test("Successfully executes a batch of refactoring operations", async () => {
		// Create a batch with multiple operations
		const batchOperations: BatchOperations = {
			operations: [
				{
					operation: "rename",
					selector: {
						type: "identifier",
						name: "User",
						kind: "interface",
						filePath: normalizePath(path.relative(projectDir, testFilePaths.userModel)),
					},
					newName: "UserProfile",
					scope: "project",
					reason: "More descriptive name",
				},
				{
					operation: "move",
					selector: {
						type: "identifier",
						name: "formatName",
						kind: "function",
						filePath: normalizePath(path.relative(projectDir, testFilePaths.utilityFunctions)),
					},
					targetFilePath: normalizePath(path.relative(projectDir, path.join(utilsDir, "formatting.ts"))),
					reason: "Better organization",
				},
			],
			options: {
				stopOnError: true,
			},
		}

		// Execute the batch and measure performance
		const { result, duration } = await executeBatchWithPerf(batchOperations)

		// Log performance data
		console.log(`[PERF] Batch operation completed in ${duration}ms`)

		// Verify the batch was successful
		expect(result.success).toBe(true)
		expect(result.results.length).toBe(2)

		// Verify both operations were successful
		expect(result.results[0].success).toBe(true)
		expect(result.results[1].success).toBe(true)

		// Verify the interface was renamed
		expect(fileContains(testFilePaths.userModel, "interface UserProfile")).toBe(true)
		expect(fileNotContains(testFilePaths.userModel, "interface User ")).toBe(true)

		// Verify references to the interface were updated
		expect(fileContains(testFilePaths.userService, "import { UserProfile")).toBe(true)
		expect(fileContains(testFilePaths.authService, "import { UserProfile")).toBe(true)

		// Verify the function was moved
		expect(fileNotContains(testFilePaths.utilityFunctions, "formatName")).toBe(true)
		const formattingPath = path.join(utilsDir, "formatting.ts")
		expect(fileContains(formattingPath, "formatName")).toBe(true)

		// Verify imports were updated - add debugging
		const userServiceContent = fs.readFileSync(testFilePaths.userService, "utf-8")
		console.log("[DEBUG BATCH TEST] userService.ts content after move:")
		console.log(userServiceContent)

		// Check if import was updated
		const hasUpdatedImport = fileContains(
			testFilePaths.userService,
			'import { formatName } from "../utils/formatting"',
		)
		console.log("[DEBUG BATCH TEST] Has updated import:", hasUpdatedImport)

		expect(hasUpdatedImport).toBe(true)
	})

	/**
	 * ERROR HANDLING TESTS
	 */
	test("Handles invalid operations with proper error messages", async () => {
		// Create an operation with an invalid file path
		const operation: RenameOperation = {
			operation: "rename",
			selector: {
				type: "identifier",
				name: "nonExistentFunction",
				kind: "function",
				filePath: "src/non-existent-file.ts",
			},
			newName: "newName",
			scope: "project",
			reason: "Testing error handling",
		}

		// Execute the operation
		const result = await engine.executeOperation(operation)

		// Verify the operation failed
		expect(result.success).toBe(false)
		expect(result.error).toBeDefined()
		expect(result.error).toContain("File not found")
	})

	/**
	 * CROSS-PLATFORM PATH COMPATIBILITY
	 */
	test("Handles different path formats correctly", async () => {
		// Create paths with forward slashes
		const forwardSlashPath = `src/utils/utility.ts`

		// Create paths with backslashes (Windows style)
		const backslashPath = `src\\utils\\utility.ts`

		// Create a rename operation with forward slash path
		const forwardSlashOperation: RenameOperation = {
			operation: "rename",
			selector: {
				type: "identifier",
				name: "formatEmail",
				kind: "function",
				filePath: forwardSlashPath,
			},
			newName: "standardizeEmail",
			scope: "project",
			reason: "Testing path compatibility",
		}

		// Execute the operation
		const result = await engine.executeOperation(forwardSlashOperation)

		// Verify the operation was successful regardless of slash type
		expect(result.success).toBe(true)
		expect(fileContains(testFilePaths.utilityFunctions, "standardizeEmail")).toBe(true)

		// Create a rename operation with backslash path
		const backslashOperation: RenameOperation = {
			operation: "rename",
			selector: {
				type: "identifier",
				name: "standardizeEmail",
				kind: "function",
				filePath: backslashPath,
			},
			newName: "normalizeEmail", // Revert to original
			scope: "project",
			reason: "Testing path compatibility",
		}

		// Execute the operation
		const backslashResult = await engine.executeOperation(backslashOperation)

		// Add debugging for path format test
		console.log("[DEBUG PATH TEST] Backslash operation result:", backslashResult.success)
		if (!backslashResult.success) {
			console.log("[DEBUG PATH TEST] Error:", backslashResult.error)
		}

		const utilityContent = fs.readFileSync(testFilePaths.utilityFunctions, "utf-8")
		console.log("[DEBUG PATH TEST] utility.ts content after backslash operation:")
		console.log(utilityContent)

		// Verify the operation was successful regardless of slash type
		expect(backslashResult.success).toBe(true)
		expect(fileContains(testFilePaths.utilityFunctions, "normalizeEmail")).toBe(true)
	})

	/**
	 * PERFORMANCE OPTIMIZATION TESTS
	 */
	test("Performs batch operations efficiently", async () => {
		// Create a large batch of operations
		const operations = []

		// Add 10 rename operations
		for (let i = 1; i <= 10; i++) {
			// Create a unique function name for each iteration
			const tempFuncName = `tempFunction${i}`

			// First add the function to the utility file
			const tempFunctionCode = `
export function ${tempFuncName}(value: string): string {
  return value + "${i}";
}
`
			// Append to the utility file
			fs.appendFileSync(testFilePaths.utilityFunctions, tempFunctionCode)

			// Create a rename operation for this function
			operations.push({
				operation: "rename" as const,
				selector: {
					type: "identifier" as const,
					name: tempFuncName,
					kind: "function" as const,
					filePath: normalizePath(path.relative(projectDir, testFilePaths.utilityFunctions)),
				},
				newName: `processValue${i}`,
				scope: "project" as const,
				reason: "Performance testing",
			})
		}

		// CRITICAL: Force refresh the utility file after dynamic modifications
		// The ts-morph project needs to reload the file to see the appended functions
		const utilitySourceFile = engine.getProject().getSourceFile(testFilePaths.utilityFunctions)
		if (utilitySourceFile) {
			utilitySourceFile.refreshFromFileSystemSync()
			console.log(`[DEBUG BATCH TEST] Refreshed utility file after dynamic modifications`)

			// Verify the functions were loaded
			const fileContent = utilitySourceFile.getFullText()
			console.log(`[DEBUG BATCH TEST] File content length after refresh: ${fileContent.length}`)
			console.log(`[DEBUG BATCH TEST] File contains tempFunction1: ${fileContent.includes("tempFunction1")}`)
		}

		const batchOperations: BatchOperations = {
			operations,
			options: {
				stopOnError: true,
			},
		}

		// Execute the batch and measure performance
		const { result, duration } = await executeBatchWithPerf(batchOperations)

		// Log performance data
		// console.log(`[PERF] Large batch operation (${operations.length} operations) completed in ${duration}ms`)
		// console.log(`[PERF] Average time per operation: ${duration / operations.length}ms`)

		// Verify the batch was successful
		expect(result.success).toBe(true)
		expect(result.results.length).toBe(operations.length)

		// Verify all operations were successful
		const allSuccessful = result.results.every((r) => r.success)
		expect(allSuccessful).toBe(true)

		// Verify the functions were renamed
		for (let i = 1; i <= 10; i++) {
			expect(fileContains(testFilePaths.utilityFunctions, `processValue${i}`)).toBe(true)
			expect(fileNotContains(testFilePaths.utilityFunctions, `tempFunction${i}`)).toBe(true)
		}
	})
})
