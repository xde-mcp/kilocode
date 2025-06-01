import { Project, ScriptTarget } from "ts-morph"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"
import { RefactorEngine } from "../engine"
import { BatchOperations } from "../schema"
import { ensureDirectoryExists } from "../utils/file-system"

describe("Move Operation Bug", () => {
	let tempDir: string
	let sourceFile: string
	let targetFile: string

	beforeEach(async () => {
		// Create a temporary directory for test files
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "move-operation-bug-test-"))

		// Create source file path
		sourceFile = path.join(tempDir, "demoFunctions.ts")

		// Create target file path
		targetFile = path.join(tempDir, "utils", "dataProcessing.ts")

		// Create source file with test content
		const sourceContent = `
export function processUserData() {
  return "Processing user data";
}

export function generateRandomString() {
  return "Random string";
}
`
		// Create directories
		await ensureDirectoryExists(path.dirname(sourceFile))

		// Write source file
		fs.writeFileSync(sourceFile, sourceContent)

		// Don't create the target file or its directory
		// This matches the bug report scenario where the target file doesn't exist
	})

	afterEach(() => {
		// Clean up temp directory
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true })
		}
	})

	it("should actually move the function to the target file", async () => {
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
		expect(sourceFileContent).not.toContain("processUserData")
		expect(targetFileContent).toContain("processUserData")

		// Verify that the target file contains the expected content
		expect(targetFileContent.trim()).not.toBe("")
	})
})
