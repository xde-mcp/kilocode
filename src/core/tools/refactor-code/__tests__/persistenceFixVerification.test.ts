import * as path from "path"
import * as fs from "fs/promises"
import * as fsSync from "fs"
import { Project } from "ts-morph"
import { RefactorEngine } from "../engine"
import { RenameOperation } from "../schema"
import * as os from "os"

/**
 * This test file is specifically focused on verifying the fix for file persistence
 * when process.cwd() is "/"
 */
describe("Refactor File Persistence Fix Verification", () => {
	// Setup test directories and files
	let testDir: string
	let testFilePath: string

	beforeEach(async () => {
		// Create a temporary test directory
		testDir = path.join(os.tmpdir(), `refactor-test-${Date.now()}`)
		await fs.mkdir(testDir, { recursive: true })

		// Create a simple test file with a function we'll rename
		testFilePath = path.join(testDir, "test-file.ts")
		const fileContent = `
// Sample function to test rename
export function sampleFunction(input: string): string {
  return input.toUpperCase()
}
`
		await fs.writeFile(testFilePath, fileContent, "utf-8")

		// Mock process.cwd to return "/" to simulate the problematic environment
		jest.spyOn(process, "cwd").mockReturnValue("/")
	})

	afterEach(async () => {
		// Restore original process.cwd
		jest.spyOn(process, "cwd").mockRestore()

		// Clean up test directory
		try {
			await fs.rm(testDir, { recursive: true, force: true })
		} catch (err) {
			console.error("Error during cleanup:", err)
		}
	})

	test("Changes should persist to disk when process.cwd() is '/'", async () => {
		// Get the relative path as used in real scenarios
		const relativeFilePath = path.relative(testDir, testFilePath)

		// Initialize the refactor engine with our test directory
		const engine = new RefactorEngine({
			projectRootPath: testDir,
		})

		// Create a simple rename operation
		const renameOp: RenameOperation = {
			id: "test-rename-operation",
			operation: "rename",
			selector: {
				type: "identifier",
				kind: "function",
				name: "sampleFunction",
				filePath: relativeFilePath,
			},
			newName: "renamedFunction",
			scope: "project",
		}

		// Execute the operation
		const result = await engine.executeOperation(renameOp)

		// Verify the operation reported success
		expect(result.success).toBe(true)

		// IMPORTANT: Directly verify the file content on disk
		// This is what was failing before our fix
		const fileExists = fsSync.existsSync(testFilePath)
		const actualContent = fileExists ? await fs.readFile(testFilePath, "utf-8") : "FILE NOT FOUND"

		// Verify the file exists and contains the renamed function
		expect(fileExists).toBe(true)
		expect(actualContent).toContain("renamedFunction")
		expect(actualContent).not.toContain("sampleFunction")

		// Log diagnostics
		console.log("[TEST] File content verification:", {
			exists: fileExists,
			containsNewName: actualContent.includes("renamedFunction"),
			containsOldName: actualContent.includes("sampleFunction"),
			contentLength: actualContent.length,
		})
	})
})
