import * as path from "path"
import * as fs from "fs/promises"
import * as fsSync from "fs"
import { Project } from "ts-morph"
import { RefactorEngine } from "../engine"
import { MoveOperation, RemoveOperation } from "../schema"
import { ensureDirectoryExists } from "../utils/file-system"

// Test utilities
const TEST_DIR = path.resolve(__dirname, "../../../../__temp_test__/refactor-integration")
const TEST_SRC_DIR = path.join(TEST_DIR, "src")
const CONTENT_FILE_PATH = path.join(TEST_SRC_DIR, "content.ts")
const TARGET_FILE_PATH = path.join(TEST_SRC_DIR, "target.ts")

// Helper to clean up test directory
async function cleanupTestDir() {
	if (fsSync.existsSync(TEST_DIR)) {
		await fs.rm(TEST_DIR, { recursive: true, force: true })
	}
}

// Helper to create test files
async function createTestFiles() {
	await ensureDirectoryExists(TEST_SRC_DIR)
	await fs.writeFile(
		CONTENT_FILE_PATH,
		`
/**
 * Test function that will be moved
 */
export function testFunction(input: string): string {
  return input.toUpperCase()
}

/**
 * Test interface
 */
export interface TestInterface {
  name: string
  value: number
}

/**
 * Test function that will be removed
 */
export function functionToRemove(value: number): number {
  return value * 2
}

// Helper function
function helperFunction() {
  return "helper"
}
`,
	)

	await fs.writeFile(
		TARGET_FILE_PATH,
		`
// Target file for move operations
export const existingFunction = () => {
  return "I was already here"
}
`,
	)
}

describe("Refactor Integration Tests", () => {
	let engine: RefactorEngine

	beforeAll(async () => {
		await cleanupTestDir()
		await createTestFiles()

		engine = new RefactorEngine({ projectRootPath: TEST_DIR })
	})

	afterAll(async () => {
		await cleanupTestDir()
	})

	it("should move a function between files", async () => {
		// Define a move operation
		const moveOperation: MoveOperation = {
			operation: "move",
			selector: {
				type: "identifier",
				name: "testFunction",
				kind: "function",
				filePath: path.join("src", "content.ts"),
			},
			targetFilePath: path.join("src", "target.ts"),
		}

		// Execute the move operation
		const result = await engine.executeOperation(moveOperation)

		// Verify the operation was successful
		expect(result.success).toBe(true)
		expect(result.error).toBeUndefined()

		// Verify affected files
		expect(result.affectedFiles).toHaveLength(2)
		expect(result.affectedFiles).toContain(path.join("src", "content.ts"))
		expect(result.affectedFiles).toContain(path.join("src", "target.ts"))

		// Verify content in target file
		const targetContent = await fs.readFile(TARGET_FILE_PATH, "utf8")
		expect(targetContent).toContain("function testFunction")

		// Verify function is removed from source file
		const sourceContent = await fs.readFile(CONTENT_FILE_PATH, "utf8")
		expect(sourceContent).not.toContain("function testFunction")
	})

	it("should remove a function from a file", async () => {
		// Define a remove operation
		const removeOperation: RemoveOperation = {
			operation: "remove",
			selector: {
				type: "identifier",
				name: "functionToRemove",
				kind: "function",
				filePath: path.join("src", "content.ts"),
			},
		}

		// Execute the remove operation
		const result = await engine.executeOperation(removeOperation)

		// Verify the operation was successful
		expect(result.success).toBe(true)
		expect(result.error).toBeUndefined()

		// Verify affected files
		expect(result.affectedFiles).toContain(path.join("src", "content.ts"))

		// Verify function is removed from source file
		const sourceContent = await fs.readFile(CONTENT_FILE_PATH, "utf8")
		expect(sourceContent).not.toContain("function functionToRemove")
	})

	it("should handle errors when moving non-existent symbols", async () => {
		// Define a move operation for a non-existent symbol
		const moveOperation: MoveOperation = {
			operation: "move",
			selector: {
				type: "identifier",
				name: "nonExistentFunction",
				kind: "function",
				filePath: path.join("src", "content.ts"),
			},
			targetFilePath: path.join("src", "target.ts"),
		}

		// Execute the move operation
		const result = await engine.executeOperation(moveOperation)

		// Verify the operation failed with appropriate error
		expect(result.success).toBe(false)
		expect(result.error).toContain("not found")
	})

	it("should handle errors when removing non-existent symbols", async () => {
		// Define a remove operation for a non-existent symbol
		const removeOperation: RemoveOperation = {
			operation: "remove",
			selector: {
				type: "identifier",
				name: "nonExistentFunction",
				kind: "function",
				filePath: path.join("src", "content.ts"),
			},
		}

		// Execute the remove operation
		const result = await engine.executeOperation(removeOperation)

		// Verify the operation failed with appropriate error
		expect(result.success).toBe(false)
		expect(result.error).toContain("not found")
	})

	it("should execute a batch of operations", async () => {
		// First recreate the test files to ensure consistent state
		await cleanupTestDir()
		await createTestFiles()

		// Define a batch of operations
		const batchOperations = {
			operations: [
				{
					operation: "move",
					selector: {
						type: "identifier",
						name: "testFunction",
						kind: "function",
						filePath: path.join("src", "content.ts"),
					},
					targetFilePath: path.join("src", "target.ts"),
				} as MoveOperation,
				{
					operation: "remove",
					selector: {
						type: "identifier",
						name: "functionToRemove",
						kind: "function",
						filePath: path.join("src", "content.ts"),
					},
				} as RemoveOperation,
			],
			options: {
				stopOnError: true,
			},
		}

		// Execute the batch of operations
		const result = await engine.executeBatch(batchOperations)

		// Verify the batch was successful
		expect(result.success).toBe(true)
		expect(result.error).toBeUndefined()

		// Verify all operations were successful
		expect(result.results).toHaveLength(2)
		expect(result.results[0].success).toBe(true)
		expect(result.results[1].success).toBe(true)

		// Verify content changes
		const targetContent = await fs.readFile(TARGET_FILE_PATH, "utf8")
		expect(targetContent).toContain("function testFunction")

		const sourceContent = await fs.readFile(CONTENT_FILE_PATH, "utf8")
		expect(sourceContent).not.toContain("function testFunction")
		expect(sourceContent).not.toContain("function functionToRemove")
	})
})
