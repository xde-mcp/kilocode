import { Project, ScriptTarget } from "ts-morph"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"
import { RefactorEngine } from "../engine"
import { BatchOperations } from "../schema"
import { ensureDirectoryExists } from "../utils/file-system"

describe("File Existence Checks", () => {
	let tempDir: string
	let sourceFile: string
	let targetFile: string
	let nonExistentFile: string

	beforeEach(async () => {
		// Create a temporary directory for test files
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "file-existence-test-"))

		// Create file paths
		sourceFile = path.join(tempDir, "src", "utils", "formatting.ts")
		targetFile = path.join(tempDir, "src", "utils", "validation.ts")
		nonExistentFile = path.join(tempDir, "src", "utils", "nonexistent.ts")

		// Create source file with test content
		const sourceContent = `
export function formatUserName(user: any): string {
	return \`\${user.firstName} \${user.lastName}\`.trim() || "Unnamed User"
}

export function validateEmail(email: string): boolean {
	return email.includes("@")
}
`
		// Create directories
		await ensureDirectoryExists(path.dirname(sourceFile))
		await ensureDirectoryExists(path.dirname(targetFile))

		// Write source file
		fs.writeFileSync(sourceFile, sourceContent)

		// Create empty target file
		fs.writeFileSync(targetFile, "")
	})

	afterEach(() => {
		// Clean up temp directory
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true })
		}
	})

	it("should handle file existence checks correctly for rename operations", async () => {
		// Create a RefactorEngine instance
		const engine = new RefactorEngine({
			projectRootPath: tempDir,
		})

		// Define a rename operation
		const renameOperation = {
			operation: "rename" as const,
			selector: {
				type: "identifier" as const,
				name: "formatUserName",
				kind: "function" as const,
				filePath: sourceFile,
			},
			newName: "formatFullName",
			reason: "More descriptive name",
		}

		// Execute the operation
		const result = await engine.executeOperation(renameOperation)

		// Verify that the operation succeeded
		expect(result.success).toBe(true)
		expect(result.affectedFiles).toContain(sourceFile)

		// Read the file content
		const fileContent = fs.readFileSync(sourceFile, "utf-8")

		// Verify that the function was renamed
		expect(fileContent).not.toContain("formatUserName")
		expect(fileContent).toContain("formatFullName")
	})

	it("should handle file existence checks correctly for move operations", async () => {
		// Create a RefactorEngine instance
		const engine = new RefactorEngine({
			projectRootPath: tempDir,
		})

		// Define a move operation
		const moveOperation = {
			operation: "move" as const,
			selector: {
				type: "identifier" as const,
				name: "validateEmail",
				kind: "function" as const,
				filePath: sourceFile,
			},
			targetFilePath: targetFile,
			reason: "Moving validation functions to a dedicated file",
		}

		// Execute the operation
		const result = await engine.executeOperation(moveOperation)

		// Verify that the operation succeeded
		expect(result.success).toBe(true)
		expect(result.affectedFiles).toContain(sourceFile)
		expect(result.affectedFiles).toContain(targetFile)

		// Read the file contents
		const sourceContent = fs.readFileSync(sourceFile, "utf-8")
		const targetContent = fs.readFileSync(targetFile, "utf-8")

		// Verify that the function was moved
		expect(sourceContent).not.toContain("validateEmail")
		expect(targetContent).toContain("validateEmail")
	})

	it("should handle file existence checks correctly for remove operations", async () => {
		// Create a RefactorEngine instance
		const engine = new RefactorEngine({
			projectRootPath: tempDir,
		})

		// Define a remove operation
		const removeOperation = {
			operation: "remove" as const,
			selector: {
				type: "identifier" as const,
				name: "formatUserName",
				kind: "function" as const,
				filePath: sourceFile,
			},
			reason: "Removing unused function",
		}

		// Execute the operation
		const result = await engine.executeOperation(removeOperation)

		// Verify that the operation succeeded
		expect(result.success).toBe(true)
		expect(result.affectedFiles).toContain(sourceFile)

		// Read the file content
		const fileContent = fs.readFileSync(sourceFile, "utf-8")

		// Verify that the function was removed
		expect(fileContent).not.toContain("formatUserName")
	})

	it("should handle non-existent files correctly", async () => {
		// Create a RefactorEngine instance
		const engine = new RefactorEngine({
			projectRootPath: tempDir,
		})

		// Define an operation on a non-existent file
		const renameOperation = {
			operation: "rename" as const,
			selector: {
				type: "identifier" as const,
				name: "someFunction",
				kind: "function" as const,
				filePath: nonExistentFile,
			},
			newName: "newFunctionName",
			reason: "Testing non-existent file handling",
		}

		// Execute the operation
		const result = await engine.executeOperation(renameOperation)

		// Verify that the operation failed
		expect(result.success).toBe(false)
		expect(result.error).toContain("File not found")
	})

	it("should handle verification correctly after rename operations", async () => {
		// Create a RefactorEngine instance
		const engine = new RefactorEngine({
			projectRootPath: tempDir,
		})

		// Define a rename operation
		const renameOperation = {
			operation: "rename" as const,
			selector: {
				type: "identifier" as const,
				name: "formatUserName",
				kind: "function" as const,
				filePath: sourceFile,
			},
			newName: "formatFullName",
			reason: "More descriptive name",
		}

		// Execute the operation
		const result = await engine.executeOperation(renameOperation)

		// Verify that the operation succeeded
		expect(result.success).toBe(true)

		// Define a batch operation that includes a rename operation on the renamed function
		const batchOperations: BatchOperations = {
			operations: [
				{
					operation: "rename" as const,
					selector: {
						type: "identifier" as const,
						name: "formatFullName", // The renamed function
						kind: "function" as const,
						filePath: sourceFile,
					},
					newName: "formatUserFullName",
					reason: "Even more descriptive name",
				},
			],
			options: {
				stopOnError: true,
			},
		}

		// Execute the batch operation
		const batchResult = await engine.executeBatch(batchOperations)

		// Verify that the batch operation succeeded
		expect(batchResult.success).toBe(true)
		expect(batchResult.results[0].success).toBe(true)

		// Read the file content
		const fileContent = fs.readFileSync(sourceFile, "utf-8")

		// Verify that the function was renamed again
		expect(fileContent).not.toContain("formatFullName")
		expect(fileContent).toContain("formatUserFullName")
	})
})
