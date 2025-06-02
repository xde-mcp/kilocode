import { Project, ScriptTarget } from "ts-morph"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"
import { RefactorEngine } from "../engine"
import { BatchOperations } from "../schema"
import { ensureDirectoryExists } from "../utils/file-system"

describe("Bug Report Verification", () => {
	let tempDir: string
	let sourceFile: string
	let targetFile1: string
	let targetFile2: string

	beforeEach(async () => {
		// Create a temporary directory for test files
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bug-report-test-"))

		// Create source file path
		sourceFile = path.join(tempDir, "demoFunctions.ts")

		// Create target file paths
		targetFile1 = path.join(tempDir, "utils", "dataProcessing.ts")
		targetFile2 = path.join(tempDir, "utils", "stringUtils.ts")

		// Create source file with test content
		const sourceContent = `
export function processUserData() {
	 return "Processing user data";
}

export function generateRandomString() {
	 return "Random string";
}
`
		// Create directories - await these async calls
		await ensureDirectoryExists(path.dirname(sourceFile))
		await ensureDirectoryExists(path.dirname(targetFile1))
		await ensureDirectoryExists(path.dirname(targetFile2))

		// Write source file
		fs.writeFileSync(sourceFile, sourceContent)

		// Create empty target files
		fs.writeFileSync(targetFile1, "")
		fs.writeFileSync(targetFile2, "")
	})

	afterEach(() => {
		// Clean up temp directory
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true })
		}
	})

	it("should handle move and rename operations on newly created files", async () => {
		jest.setTimeout(30000) // Increase timeout for this test
		// Create a RefactorEngine instance
		const engine = new RefactorEngine({
			projectRootPath: tempDir,
		})

		// Define batch operations similar to the bug report
		const batchOperations: BatchOperations = {
			operations: [
				// Move processUserData to dataProcessing.ts
				{
					operation: "move",
					selector: {
						type: "identifier",
						name: "processUserData",
						kind: "function",
						filePath: sourceFile,
					},
					targetFilePath: targetFile1,
					reason: "Moving data processing functions",
				},
				// Rename processUserData in dataProcessing.ts
				{
					operation: "rename",
					selector: {
						type: "identifier",
						name: "processUserData",
						kind: "function",
						filePath: targetFile1,
					},
					newName: "processInputData",
					reason: "Renaming for clarity",
				},
				// Move generateRandomString to stringUtils.ts
				{
					operation: "move",
					selector: {
						type: "identifier",
						name: "generateRandomString",
						kind: "function",
						filePath: sourceFile,
					},
					targetFilePath: targetFile2,
					reason: "Moving string utility functions",
				},
				// Rename generateRandomString in stringUtils.ts
				{
					operation: "rename",
					selector: {
						type: "identifier",
						name: "generateRandomString",
						kind: "function",
						filePath: targetFile2,
					},
					newName: "createRandomString",
					reason: "Renaming for clarity",
				},
			],
			options: {
				stopOnError: true,
			},
		}

		// Execute batch operations
		const result = await engine.executeBatch(batchOperations)

		// Verify that all operations succeeded
		expect(result.success).toBe(true)
		expect(result.results.length).toBe(4)
		expect(result.results.every((r) => r.success)).toBe(true)

		// Verify that the files exist
		expect(fs.existsSync(targetFile1)).toBe(true)
		expect(fs.existsSync(targetFile2)).toBe(true)

		// Read the file contents
		const targetFile1Content = fs.readFileSync(targetFile1, "utf-8")
		const targetFile2Content = fs.readFileSync(targetFile2, "utf-8")
		const sourceFileContent = fs.readFileSync(sourceFile, "utf-8")

		// Log the file contents for debugging
		console.log("Source file content:", sourceFileContent)
		console.log("Target file 1 content:", targetFile1Content)
		console.log("Target file 2 content:", targetFile2Content)

		// Verify that the functions were moved and renamed
		// We're checking for the presence of the function names, not the exact content
		expect(targetFile1Content).toContain("processInputData")
		expect(targetFile2Content).toContain("createRandomString")

		// Verify that the functions were removed from the source file
		expect(sourceFileContent).not.toContain("processUserData")
		expect(sourceFileContent).not.toContain("generateRandomString")
	})
})
