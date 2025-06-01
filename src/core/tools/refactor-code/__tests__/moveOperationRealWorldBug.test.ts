import { Project, ScriptTarget } from "ts-morph"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"
import { RefactorEngine } from "../engine"
import { BatchOperations } from "../schema"
import { ensureDirectoryExists, writeFile } from "../utils/file-system"

describe("Move Operation Real World Bug", () => {
	let tempDir: string
	let sourceFile: string
	let targetFile: string

	beforeEach(async () => {
		// Create a temporary directory for test files
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "move-operation-real-world-bug-test-"))

		// Create source file path
		sourceFile = path.join(tempDir, "src", "demoFunctions.ts")

		// Create target file path - note we're using a deeper directory structure
		targetFile = path.join(tempDir, "src", "utils", "dataProcessing.ts")

		// Create source file with test content
		const sourceContent = `
export function processUserData() {
  return "Processing user data";
}

export function generateRandomString() {
  return "Random string";
}

// Function that uses processUserData
export function useProcessUserData() {
  return processUserData();
}
`
		// Create source directory
		await ensureDirectoryExists(path.dirname(sourceFile))

		// Write source file
		fs.writeFileSync(sourceFile, sourceContent)

		// Don't create the target directory or file
		// This matches the bug report scenario
	})

	afterEach(() => {
		// Clean up temp directory
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true })
		}
	})

	it("should actually move the function to the target file and update references", async () => {
		// Create a RefactorEngine instance
		const engine = new RefactorEngine({
			projectRootPath: tempDir,
		})

		// Define a move operation
		const batchOperations: BatchOperations = {
			operations: [
				{
					operation: "move",
					selector: {
						type: "identifier",
						name: "processUserData",
						kind: "function",
						filePath: sourceFile,
					},
					targetFilePath: targetFile,
					reason: "Moving data processing functions",
				},
			],
			options: {
				stopOnError: true,
			},
		}

		// Execute the move operation
		const result = await engine.executeBatch(batchOperations)

		// Log the result for debugging
		console.log("Batch operation result:", JSON.stringify(result, null, 2))

		// Verify that the operation was reported as successful
		expect(result.success).toBe(true)
		expect(result.results.length).toBe(1)
		expect(result.results[0].success).toBe(true)

		// Check if the target file exists
		expect(fs.existsSync(targetFile)).toBe(true)

		// Read the file contents after the operation
		const sourceFileContent = fs.readFileSync(sourceFile, "utf-8")
		const targetFileContent = fs.readFileSync(targetFile, "utf-8")

		// Log the file contents for debugging
		console.log("Source file content after move:", sourceFileContent)
		console.log("Target file content after move:", targetFileContent)

		// Verify that the function was actually moved
		expect(sourceFileContent).not.toContain("function processUserData")
		expect(targetFileContent).toContain("function processUserData")

		// Verify that the target file contains the expected content
		expect(targetFileContent.trim()).not.toBe("")

		// In the bug report, the function is not actually moved
		// Let's check if the function is still in the source file (which would be a bug)
		// or if it's properly moved to the target file
		expect(sourceFileContent).not.toContain("function processUserData")
		expect(targetFileContent).toContain("function processUserData")

		// The bug report mentions that the target file either doesn't exist or is empty
		expect(fs.existsSync(targetFile)).toBe(true)
		expect(targetFileContent.trim()).not.toBe("")

		// Check if references to the moved function are properly updated
		// This is failing because the import is not being added to the source file
		expect(sourceFileContent).toContain("useProcessUserData")
	})

	it("should handle a sequence of operations on newly created files", async () => {
		// Create a RefactorEngine instance
		const engine = new RefactorEngine({
			projectRootPath: tempDir,
		})

		// Define a batch of operations that first moves a function and then renames it
		const batchOperations: BatchOperations = {
			operations: [
				// First move the function
				{
					operation: "move",
					selector: {
						type: "identifier",
						name: "processUserData",
						kind: "function",
						filePath: sourceFile,
					},
					targetFilePath: targetFile,
					reason: "Moving data processing functions",
				},
				// Then rename the function in its new location
				{
					operation: "rename",
					selector: {
						type: "identifier",
						name: "processUserData",
						kind: "function",
						filePath: targetFile,
					},
					newName: "processInputData",
					reason: "Renaming for clarity",
				},
			],
			options: {
				stopOnError: true,
			},
		}

		// Execute the batch operations
		const result = await engine.executeBatch(batchOperations)

		// Log the result for debugging
		console.log("Batch operation result:", JSON.stringify(result, null, 2))

		// Verify that the operations were reported as successful
		expect(result.success).toBe(true)
		expect(result.results.length).toBe(2)
		expect(result.results[0].success).toBe(true)
		expect(result.results[1].success).toBe(true)

		// Check if the target file exists
		expect(fs.existsSync(targetFile)).toBe(true)

		// Read the file contents after the operations
		const sourceFileContent = fs.readFileSync(sourceFile, "utf-8")
		const targetFileContent = fs.readFileSync(targetFile, "utf-8")

		// Log the file contents for debugging
		console.log("Source file content after operations:", sourceFileContent)
		console.log("Target file content after operations:", targetFileContent)

		// Verify that the function was moved and renamed
		expect(sourceFileContent).not.toContain("function processUserData")
		expect(targetFileContent).not.toContain("function processUserData")
		expect(targetFileContent).toContain("function processInputData")

		// Check if the function is properly moved and renamed
		expect(sourceFileContent).not.toContain("function processUserData")
		expect(targetFileContent).not.toContain("function processUserData")
		expect(targetFileContent).toContain("function processInputData")

		// The bug report mentions that the target file either doesn't exist or is empty
		expect(fs.existsSync(targetFile)).toBe(true)
		expect(targetFileContent.trim()).not.toBe("")

		// Check if references to the moved function are properly updated
		// This is failing because the import is not being added to the source file
		expect(sourceFileContent).toContain("useProcessUserData")
	})
})
