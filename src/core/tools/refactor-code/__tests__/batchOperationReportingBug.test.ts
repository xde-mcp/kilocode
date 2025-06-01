import { Project, ScriptTarget } from "ts-morph"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"
import { RefactorEngine } from "../engine"
import { BatchOperations } from "../schema"
import { ensureDirectoryExists } from "../utils/file-system"

describe("Batch Operation Reporting Bug", () => {
	let tempDir: string
	let userModelFile: string
	let formattingUtilFile: string
	let userServiceFile: string
	let errorsFile: string

	beforeEach(async () => {
		// Create a temporary directory for test files
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "batch-operation-reporting-bug-test-"))

		// Create file paths
		userModelFile = path.join(tempDir, "models", "User.ts")
		formattingUtilFile = path.join(tempDir, "utils", "formatting.ts")
		userServiceFile = path.join(tempDir, "services", "userService.ts")
		errorsFile = path.join(tempDir, "utils", "errors.ts")

		// Create model file with test content
		const userModelContent = `
export interface UserProfile {
  id: string;
  givenName: string;
  lastName: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

export class UserValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserValidationError";
  }
}

export function createDefaultUser(email: string): UserProfile {
  return {
    id: crypto.randomUUID(),
    givenName: '',
    lastName: '',
    email,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

export function deprecatedUserFactory() {
  console.warn('This function is deprecated. Use createDefaultUser instead.');
  return createDefaultUser('default@example.com');
}
`

		// Create formatting util file with test content
		const formattingUtilContent = `
import { UserProfile } from "../models/User"

export function formatFullName(user: UserProfile): string {
  return \`\${user.givenName} \${user.lastName}\`.trim() || "Unnamed User"
}

export function formatEmail(email: string): string {
  const [username, domain] = email.split("@")
  if (!domain) return email

  return \`\${username.substring(0, 3)}...@\${domain}\`
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString()
}
`

		// Create user service file with test content
		const userServiceContent = `
import { UserProfile } from "../models/User"
import { formatFullName, formatEmail } from "../utils/formatting"

export function validateUser(user: UserProfile): boolean {
  if (!user.email || !user.email.includes("@")) {
    return false
  }
  return true
}

export function modifyUserProfile(user: UserProfile, data: Partial<UserProfile>): UserProfile {
  return {
    ...user,
    ...data,
    updatedAt: new Date(),
  }
}

export function formatUserProfile(user: UserProfile): string {
  return \`
    Name: \${formatFullName(user)}
    Email: \${formatEmail(user.email)}
    Member since: \${user.createdAt.toLocaleDateString()}
  \`
}
`

		// Create errors file with test content
		const errorsContent = `
// This file will contain error classes
`

		// Create directories
		await ensureDirectoryExists(path.dirname(userModelFile))
		await ensureDirectoryExists(path.dirname(formattingUtilFile))
		await ensureDirectoryExists(path.dirname(userServiceFile))
		await ensureDirectoryExists(path.dirname(errorsFile))

		// Write source files
		fs.writeFileSync(userModelFile, userModelContent)
		fs.writeFileSync(formattingUtilFile, formattingUtilContent)
		fs.writeFileSync(userServiceFile, userServiceContent)
		fs.writeFileSync(errorsFile, errorsContent)
	})

	afterEach(() => {
		// Clean up temp directory
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true })
		}
	})

	it("should correctly report failures in batch operations", async () => {
		// Create a RefactorEngine instance
		const engine = new RefactorEngine({
			projectRootPath: tempDir,
		})

		// Define a batch of operations with some that will fail
		const batchOperations: BatchOperations = {
			operations: [
				// This should succeed
				{
					operation: "rename",
					selector: {
						type: "identifier",
						name: "UserValidationError",
						kind: "class",
						filePath: userModelFile,
					},
					newName: "UserProfileError",
					reason: "Aligning error class name with the renamed UserProfile interface",
				},
				// This should succeed
				{
					operation: "move",
					selector: {
						type: "identifier",
						name: "createDefaultUser",
						kind: "function",
						filePath: userModelFile,
					},
					targetFilePath: userServiceFile,
					reason: "Moving user creation logic to the user service",
				},
				// This should succeed
				{
					operation: "rename",
					selector: {
						type: "identifier",
						name: "formatEmail",
						kind: "function",
						filePath: formattingUtilFile,
					},
					newName: "obfuscateEmail",
					reason: "More accurately describes the function's purpose of partially hiding the email",
				},
				// This should fail (trying to remove a referenced function)
				{
					operation: "remove",
					selector: {
						type: "identifier",
						name: "formatFullName",
						kind: "function",
						filePath: formattingUtilFile,
					},
					reason: "Attempting to remove a referenced function",
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

		// The batch should report failure since one operation failed
		expect(result.success).toBe(false)

		// Check individual operation results
		expect(result.results[0].success).toBe(true) // Rename UserValidationError
		expect(result.results[1].success).toBe(true) // Move createDefaultUser
		expect(result.results[2].success).toBe(true) // Rename formatEmail
		expect(result.results[3].success).toBe(false) // Remove formatFullName (should fail)

		// Read the file contents after the operations
		const userModelContent = fs.readFileSync(userModelFile, "utf-8")
		const formattingUtilContent = fs.readFileSync(formattingUtilFile, "utf-8")
		const userServiceContent = fs.readFileSync(userServiceFile, "utf-8")

		// Verify the successful operations
		expect(userModelContent).toContain("UserProfileError")
		// The class name is changed but the name property inside the constructor might still be "UserValidationError"
		// So we only check that the class declaration is updated
		expect(userModelContent).toContain("class UserProfileError extends Error")
		expect(userModelContent).not.toContain("function createDefaultUser")
		expect(userServiceContent).toContain("function createDefaultUser")
		expect(formattingUtilContent).toContain("function obfuscateEmail")
		expect(formattingUtilContent).not.toContain("function formatEmail")

		// Verify the failed operation
		expect(formattingUtilContent).toContain("function formatFullName")
	})
})
