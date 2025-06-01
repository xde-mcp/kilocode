import { Project, ScriptTarget } from "ts-morph"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"
import { RefactorEngine } from "../engine"
import { BatchOperations } from "../schema"
import { ensureDirectoryExists } from "../utils/file-system"

describe("Move Operation File Save Bug", () => {
	let tempDir: string
	let sourceFile: string
	let targetFile: string

	beforeEach(async () => {
		// Create a temporary directory for test files
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "move-operation-file-save-bug-test-"))

		// Create source file path
		sourceFile = path.join(tempDir, "utils", "formatting.ts")

		// Create target file path
		targetFile = path.join(tempDir, "services", "profileService.ts")

		// Create source file with test content
		const sourceContent = `
export function formatUserSummary(user: any): string {
  return \`\${user.givenName} \${user.lastName} (\${user.email})\`
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString()
}
`

		// Create target file with test content
		const targetContent = `
// This file will contain user profile related services
`

		// Create directories
		await ensureDirectoryExists(path.dirname(sourceFile))
		await ensureDirectoryExists(path.dirname(targetFile))

		// Write source files
		fs.writeFileSync(sourceFile, sourceContent)
		fs.writeFileSync(targetFile, targetContent)
	})

	afterEach(() => {
		// Clean up temp directory
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true })
		}
	})

	it("should actually move the function to the target file and save the changes to disk", async () => {
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
						name: "formatUserSummary",
						kind: "function",
						filePath: sourceFile,
					},
					targetFilePath: targetFile,
					reason: "Moving user summary formatting to profile service",
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

		// The operation should succeed
		expect(result.success).toBe(true)
		expect(result.results[0].success).toBe(true)

		// Read the file contents after the operation
		const sourceFileContent = fs.readFileSync(sourceFile, "utf-8")
		const targetFileContent = fs.readFileSync(targetFile, "utf-8")

		// Log the file contents for debugging
		console.log("Source file content after move:", sourceFileContent)
		console.log("Target file content after move:", targetFileContent)

		// Verify that the function was actually moved
		expect(sourceFileContent).not.toContain("function formatUserSummary")
		expect(targetFileContent).toContain("function formatUserSummary")

		// Verify that the target file contains the expected content
		expect(targetFileContent.trim()).not.toBe("// This file will contain user profile related services")
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
						name: "formatUserSummary",
						kind: "function",
						filePath: sourceFile,
					},
					targetFilePath: targetFile,
					reason: "Moving user summary formatting to profile service",
				},
				// Then rename the function in its new location
				{
					operation: "rename",
					selector: {
						type: "identifier",
						name: "formatUserSummary",
						kind: "function",
						filePath: targetFile,
					},
					newName: "generateUserSummary",
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

		// The operations should succeed
		expect(result.success).toBe(true)
		expect(result.results[0].success).toBe(true)
		expect(result.results[1].success).toBe(true)

		// Read the file contents after the operations
		const sourceFileContent = fs.readFileSync(sourceFile, "utf-8")
		const targetFileContent = fs.readFileSync(targetFile, "utf-8")

		// Log the file contents for debugging
		console.log("Source file content after operations:", sourceFileContent)
		console.log("Target file content after operations:", targetFileContent)

		// Verify that the function was moved and renamed
		expect(sourceFileContent).not.toContain("function formatUserSummary")
		expect(targetFileContent).not.toContain("function formatUserSummary")
		expect(targetFileContent).toContain("function generateUserSummary")
	})
})
