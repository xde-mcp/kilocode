import * as path from "path"
import * as fs from "fs/promises"
import * as fsSync from "fs"
import { Project } from "ts-morph"
import { RefactorEngine } from "./engine"
import { RenameOperation } from "./schema"

/**
 * This is a simplified test to verify the fix for the refactoring tool persistence issue
 * when process.cwd() returns "/"
 */
async function testRefactorFix() {
	// Setup test directory
	const testDir = path.join(__dirname, "test-fix-temp")
	await fs.mkdir(testDir, { recursive: true })

	// Create a test file
	const testFilePath = path.join(testDir, "test-file.ts")
	const fileContent = `
// Sample function to test rename
export function sampleFunction(input: string): string {
  return input.toUpperCase()
}
`
	await fs.writeFile(testFilePath, fileContent, "utf-8")

	console.log(`Created test file at: ${testFilePath}`)

	// Initialize the refactor engine
	const engine = new RefactorEngine({
		projectRootPath: testDir,
	})

	// Get the relative path as used in real scenarios
	const relativeFilePath = path.relative(testDir, testFilePath)

	// Create rename operation
	const renameOp: RenameOperation = {
		id: "test-rename-operation",
		operation: "rename",
		selector: {
			type: "identifier",
			kind: "function",
			name: "sampleFunction",
			filePath: relativeFilePath,
		},
		newName: "newFunctionName",
		scope: "project",
	}

	console.log("Executing rename operation...")

	// Execute the operation
	const result = await engine.executeOperation(renameOp)

	console.log(`Operation result: ${result.success ? "SUCCESS" : "FAILURE"}`)
	if (!result.success) {
		console.error(`Error: ${result.error}`)
	}

	// Verify the change was actually made on disk
	console.log("Verifying file content...")

	// Check actual file content directly using fs
	const fileExists = fsSync.existsSync(testFilePath)
	const fileContent2 = fileExists ? await fs.readFile(testFilePath, "utf-8") : "FILE NOT FOUND"

	console.log(`File exists: ${fileExists}`)
	console.log(`File content (first 100 chars): ${fileContent2.substring(0, 100)}...`)
	console.log(`Contains sampleFunction: ${fileContent2.includes("sampleFunction")}`)
	console.log(`Contains newFunctionName: ${fileContent2.includes("newFunctionName")}`)

	// Cleanup
	try {
		await fs.rm(testDir, { recursive: true, force: true })
		console.log("Test cleanup completed")
	} catch (err) {
		console.error("Error during cleanup:", err)
	}
}

// Run the test
testRefactorFix().catch(console.error)
