import { Project, ScriptTarget } from "ts-morph"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"
import { RefactorEngine } from "../engine"
import { BatchOperations } from "../schema"
import { ensureDirectoryExists } from "../utils/file-system"

describe("Remove Operation Bug", () => {
	let tempDir: string
	let sourceFile: string
	let referencingFile: string

	beforeEach(async () => {
		// Create a temporary directory for test files
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "remove-operation-bug-test-"))

		// Create source file path
		sourceFile = path.join(tempDir, "utils", "formatting.ts")

		// Create referencing file path
		referencingFile = path.join(tempDir, "services", "userService.ts")

		// Create source file with test content
		const sourceContent = `
export function formatFullName(user: any): string {
  return \`\${user.givenName} \${user.lastName}\`.trim() || "Unnamed User"
}

export function formatEmail(email: string): string {
  const [username, domain] = email.split("@")
  if (!domain) return email
  return \`\${username.substring(0, 3)}...@\${domain}\`
}
`

		// Create referencing file with test content
		const referencingContent = `
import { formatFullName, formatEmail } from "../utils/formatting"

export function formatUserProfile(user: any): string {
  return \`
    Name: \${formatFullName(user)}
    Email: \${formatEmail(user.email)}
    Member since: \${user.createdAt.toLocaleDateString()}
  \`
}
`

		// Create directories
		await ensureDirectoryExists(path.dirname(sourceFile))
		await ensureDirectoryExists(path.dirname(referencingFile))

		// Write source files
		fs.writeFileSync(sourceFile, sourceContent)
		fs.writeFileSync(referencingFile, referencingContent)
	})

	afterEach(() => {
		// Clean up temp directory
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true })
		}
	})

	it("should not remove a function that is referenced elsewhere", async () => {
		// Create a RefactorEngine instance
		const engine = new RefactorEngine({
			projectRootPath: tempDir,
		})

		// Define a remove operation for a function that is referenced elsewhere
		const batchOperations: BatchOperations = {
			operations: [
				{
					operation: "remove",
					selector: {
						type: "identifier",
						name: "formatFullName",
						kind: "function",
						filePath: sourceFile,
					},
					reason: "Attempting to remove a referenced function",
				},
			],
			options: {
				stopOnError: true,
			},
		}

		// Execute the remove operation
		const result = await engine.executeBatch(batchOperations)

		// Log the result for debugging
		console.log("Batch operation result:", JSON.stringify(result, null, 2))

		// The operation should fail or warn about references
		expect(result.success).toBe(false)

		// Check that the error message contains either "referenced" or "verification failed"
		const errorMessage = result.results[0].error || ""
		expect(errorMessage.includes("referenced") || errorMessage.includes("verification failed")).toBe(true)

		// Read the file contents after the operation
		const sourceFileContent = fs.readFileSync(sourceFile, "utf-8")

		// Verify that the function was not removed
		expect(sourceFileContent).toContain("function formatFullName")
	})

	it("should correctly report failure when a function is not removed", async () => {
		// Create a RefactorEngine instance
		const engine = new RefactorEngine({
			projectRootPath: tempDir,
		})

		// Define a remove operation for a function that doesn't exist
		const batchOperations: BatchOperations = {
			operations: [
				{
					operation: "remove",
					selector: {
						type: "identifier",
						name: "nonExistentFunction",
						kind: "function",
						filePath: sourceFile,
					},
					reason: "Attempting to remove a non-existent function",
				},
			],
			options: {
				stopOnError: true,
			},
		}

		// Execute the remove operation
		const result = await engine.executeBatch(batchOperations)

		// Log the result for debugging
		console.log("Batch operation result:", JSON.stringify(result, null, 2))

		// The operation should fail
		expect(result.success).toBe(false)
		expect(result.results[0].success).toBe(false)
		expect(result.results[0].error).toContain("not found")
	})
})
