import { Project, ScriptTarget } from "ts-morph"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"
import { RefactorEngine } from "../engine"
import { BatchOperations } from "../schema"
import { ensureDirectoryExists } from "../utils/file-system"

describe("Batch Operation Bug", () => {
	let tempDir: string
	let formattingUtilFile: string
	let userServiceFile: string

	beforeEach(async () => {
		// Create a temporary directory for test files
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "batch-operation-bug-test-"))

		// Create file paths
		formattingUtilFile = path.join(tempDir, "utils", "formatting.ts")
		userServiceFile = path.join(tempDir, "services", "userService.ts")

		// Create formatting util file with test content
		const formattingUtilContent = `
import { UserProfile } from "../models/User"

// This will be renamed in test case 1
const NAME_PART_SEPARATOR = " ";

export function formatFullName(user: UserProfile): string {
	return \`\${user.firstName}\${NAME_PART_SEPARATOR}\${user.lastName}\`.trim() || "Unnamed User"
}

export function obfuscateEmail(email: string): string {
	const [username, domain] = email.split("@")
	if (!domain) return email

	return \`\${username.substring(0, 3)}...@\${domain}\`
}

export function formatUserSummary(user: UserProfile): string {
	return \`\${formatFullName(user)} (\${obfuscateEmail(user.email)})\` + NAME_PART_SEPARATOR + "Summary";
}
`

		// Create user service file with test content
		const userServiceContent = `
import { UserProfile, createDefaultUser } from "../models/User"
import { formatFullName, obfuscateEmail } from "../utils/formatting"

export function validateUser(user: UserProfile): boolean {
	if (!user.email || !user.email.includes("@")) {
		return false
	}
	return true && isAdultUser(user);
}

function isAdultUser(user: UserProfile): boolean {
	// Mock implementation
	return true; // Assume all users are adults for this test
}

export function formatUserProfile(user: UserProfile): string {
	return \`
    Name: \${formatFullName(user)}
    Email: \${obfuscateEmail(user.email)}
    Member since: \${user.createdAt.toLocaleDateString()}
  \`
}
`

		// Create directories
		await ensureDirectoryExists(path.dirname(formattingUtilFile))
		await ensureDirectoryExists(path.dirname(userServiceFile))

		// Write source files
		fs.writeFileSync(formattingUtilFile, formattingUtilContent)
		fs.writeFileSync(userServiceFile, userServiceContent)
	})

	afterEach(() => {
		// Clean up temp directory
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true })
		}
	})

	it("should correctly handle batch operations with rename and remove", async () => {
		// Create a RefactorEngine instance
		const engine = new RefactorEngine({
			projectRootPath: tempDir,
		})

		// Define a batch operation with rename and remove
		const batchOperations: BatchOperations = {
			operations: [
				{
					operation: "rename",
					selector: {
						type: "identifier",
						name: "NAME_PART_SEPARATOR",
						kind: "variable",
						filePath: formattingUtilFile,
					},
					newName: "FULL_NAME_SEPARATOR",
					reason: "More descriptive name for the full name separator",
				},
				{
					operation: "remove",
					selector: {
						type: "identifier",
						name: "isAdultUser",
						kind: "function",
						filePath: userServiceFile,
					},
					reason: "Removing unused helper function",
				},
			],
			options: {
				stopOnError: false, // Don't stop on error to test all operations
			},
		}

		// Execute the batch operations
		const result = await engine.executeBatch(batchOperations)

		// Log the result for debugging
		console.log("Batch operation result:", JSON.stringify(result, null, 2))

		// The batch should report failure since the remove operation should fail
		// (isAdultUser is referenced in validateUser)
		expect(result.success).toBe(false)

		// Check individual operation results
		expect(result.results[0].success).toBe(true) // Rename should succeed
		expect(result.results[1].success).toBe(false) // Remove should fail

		// Read the file contents after the operations
		const formattingUtilContent = fs.readFileSync(formattingUtilFile, "utf-8")
		const userServiceContent = fs.readFileSync(userServiceFile, "utf-8")

		// Verify that the variable was renamed
		expect(formattingUtilContent).not.toContain("NAME_PART_SEPARATOR")
		expect(formattingUtilContent).toContain("FULL_NAME_SEPARATOR")

		// Verify that the function was not removed
		expect(userServiceContent).toContain("function isAdultUser")
	})
})
