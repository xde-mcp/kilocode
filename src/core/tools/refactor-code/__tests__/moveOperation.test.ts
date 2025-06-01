import { Project } from "ts-morph"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"
import { RefactorEngine } from "../engine"
import { MoveOperation } from "../schema"
import { ensureDirectoryExists, resolveFilePath, fileExists } from "../utils/file-system"

/**
 * Helper function to print detailed diagnostics about files
 */
function logFileDetails(label: string, filePath: string): void {
	console.log(`\n========== ${label} ==========`)
	console.log(`File path: ${filePath}`)
	console.log(`File exists: ${fs.existsSync(filePath)}`)

	if (fs.existsSync(filePath)) {
		const stats = fs.statSync(filePath)
		console.log(`File size: ${stats.size} bytes`)
		const content = fs.readFileSync(filePath, "utf8")
		console.log(`File content:\n${content}`)
		console.log(`Content length: ${content.length} characters`)
	}
	console.log("=======================================\n")
}

/**
 * Helper to verify move operation results by checking file contents
 */
function verifyMoveOperation(sourcePath: string, targetPath: string, symbolName: string): void {
	console.log(`\nVerifying move of "${symbolName}" from ${sourcePath} to ${targetPath}`)

	// Read file contents
	const sourceContent = fs.readFileSync(sourcePath, "utf-8")
	const targetContent = fs.readFileSync(targetPath, "utf-8")

	// Log file sizes
	console.log(`Source file size: ${sourceContent.length} bytes`)
	console.log(`Target file size: ${targetContent.length} bytes`)

	// Log key patterns
	const functionPattern = `function ${symbolName}`
	const exportPattern = `export function ${symbolName}`

	console.log(`Source contains "${functionPattern}": ${sourceContent.includes(functionPattern)}`)
	console.log(`Source contains "${exportPattern}": ${sourceContent.includes(exportPattern)}`)
	console.log(`Target contains "${functionPattern}": ${targetContent.includes(functionPattern)}`)
	console.log(`Target contains "${exportPattern}": ${targetContent.includes(exportPattern)}`)
}

describe("Move Operation Tests", () => {
	let tempDir: string
	let sourceFile: string
	let targetFile: string
	let engine: RefactorEngine

	beforeEach(async () => {
		// Create a temporary directory for test files
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "move-operation-test-"))

		// Create file paths similar to the ones in the failing case
		sourceFile = path.join(tempDir, "src", "services", "userService.ts")
		targetFile = path.join(tempDir, "src", "services", "profileService.ts")

		// Create source file with test content
		const sourceContent = `
import { UserProfile } from "../models/User"

export function getUserData(userId: string): Promise<UserProfile> {
  // Mock implementation
  return Promise.resolve({
    id: userId,
    email: \`user-\${userId}@example.com\`,
    firstName: "Test",
    lastName: "User",
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

export function updateUserProfile(user: UserProfile, data: Partial<UserProfile>): UserProfile {
  return {
    ...user,
    ...data,
    updatedAt: new Date(),
  }
}
`
		// Create target file with minimal content
		const targetContent = `// This file will contain user profile related services
`

		// Create directories
		await ensureDirectoryExists(path.dirname(sourceFile))
		await ensureDirectoryExists(path.dirname(targetFile))

		// Write source and target files
		fs.writeFileSync(sourceFile, sourceContent)
		fs.writeFileSync(targetFile, targetContent)

		// Create a RefactorEngine instance
		engine = new RefactorEngine({
			projectRootPath: tempDir,
		})

		console.log(`\n=== TEST SETUP ===`)
		console.log(`Temp directory: ${tempDir}`)
		console.log(`Source file: ${sourceFile}`)
		console.log(`Target file: ${targetFile}`)
		console.log(`Source file exists: ${fs.existsSync(sourceFile)}`)
		console.log(`Target file exists: ${fs.existsSync(targetFile)}`)
		console.log(`=== END SETUP ===\n`)
	})

	afterEach(() => {
		// Clean up temp directory
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true })
		}
	})

	it("should move a function from source to target file", async () => {
		// Define a move operation similar to the one that failed
		const moveOperation: MoveOperation = {
			operation: "move",
			selector: {
				type: "identifier",
				name: "getUserData",
				kind: "function",
				filePath: path.relative(tempDir, sourceFile),
			},
			targetFilePath: path.relative(tempDir, targetFile),
			reason: "Testing path resolution in move operations",
		}

		// Log file details before operation
		logFileDetails("SOURCE FILE BEFORE OPERATION", sourceFile)
		logFileDetails("TARGET FILE BEFORE OPERATION", targetFile)

		console.log(`\nExecuting move operation:`)
		console.log(JSON.stringify(moveOperation, null, 2))

		// Execute the operation
		const result = await engine.executeOperation(moveOperation)

		// Print error details if operation failed
		if (!result.success) {
			console.error(`Operation failed: ${result.error}`)
			console.error(`Affected files: ${JSON.stringify(result.affectedFiles)}`)
		}

		// Verify that the operation succeeded
		expect(result.success).toBe(true)
		expect(result.affectedFiles).toContain(path.relative(tempDir, sourceFile))
		expect(result.affectedFiles).toContain(path.relative(tempDir, targetFile))

		// Read the file contents
		const sourceContent = fs.readFileSync(sourceFile, "utf-8")
		const targetContent = fs.readFileSync(targetFile, "utf-8")

		// Log file details after operation
		logFileDetails("SOURCE FILE AFTER OPERATION", sourceFile)
		logFileDetails("TARGET FILE AFTER OPERATION", targetFile)

		// Detailed verification
		verifyMoveOperation(sourceFile, targetFile, "getUserData")

		// Verify that the function was moved
		expect(sourceContent).not.toContain("export function getUserData")
		expect(targetContent).toContain("export function getUserData")
	})

	it("should handle path normalization correctly", async () => {
		// Define a move operation with Windows-style paths to test normalization
		const moveOperation: MoveOperation = {
			operation: "move",
			selector: {
				type: "identifier",
				name: "updateUserProfile",
				kind: "function",
				filePath: path.relative(tempDir, sourceFile).replace(/\//g, "\\"),
			},
			targetFilePath: path.relative(tempDir, targetFile).replace(/\//g, "\\"),
			reason: "Testing path normalization in move operations",
		}

		// Log file details before operation
		logFileDetails("SOURCE FILE BEFORE OPERATION", sourceFile)
		logFileDetails("TARGET FILE BEFORE OPERATION", targetFile)

		// Execute the operation
		const result = await engine.executeOperation(moveOperation)

		// Print error details if operation failed
		if (!result.success) {
			console.error(`Operation failed: ${result.error}`)
			console.error(`Affected files: ${JSON.stringify(result.affectedFiles)}`)
		}

		// Verify that the operation succeeded
		expect(result.success).toBe(true)

		// Read the file contents
		const sourceContent = fs.readFileSync(sourceFile, "utf-8")
		const targetContent = fs.readFileSync(targetFile, "utf-8")

		// Log file details after operation
		logFileDetails("SOURCE FILE AFTER OPERATION", sourceFile)
		logFileDetails("TARGET FILE AFTER OPERATION", targetFile)

		// Detailed verification
		verifyMoveOperation(sourceFile, targetFile, "updateUserProfile")

		// Verify that the function was moved
		expect(sourceContent).not.toContain("export function updateUserProfile")
		expect(targetContent).toContain("export function updateUserProfile")
	})

	it("should handle absolute paths correctly", async () => {
		// Define a move operation with absolute paths
		const moveOperation: MoveOperation = {
			operation: "move",
			selector: {
				type: "identifier",
				name: "getUserData",
				kind: "function",
				filePath: sourceFile, // Using absolute path here
			},
			targetFilePath: targetFile, // Using absolute path here
			reason: "Testing absolute path handling in move operations",
		}

		// Log file details before operation
		logFileDetails("SOURCE FILE BEFORE OPERATION", sourceFile)
		logFileDetails("TARGET FILE BEFORE OPERATION", targetFile)

		// Execute the operation
		const result = await engine.executeOperation(moveOperation)

		// Verify that the operation succeeded
		expect(result.success).toBe(true)

		// Read the file contents
		const sourceContent = fs.readFileSync(sourceFile, "utf-8")
		const targetContent = fs.readFileSync(targetFile, "utf-8")

		// Log file details after operation
		logFileDetails("SOURCE FILE AFTER OPERATION", sourceFile)
		logFileDetails("TARGET FILE AFTER OPERATION", targetFile)

		// Detailed verification
		verifyMoveOperation(sourceFile, targetFile, "getUserData")

		// Verify that the function was moved
		expect(sourceContent).not.toContain("export function getUserData")
		expect(targetContent).toContain("export function getUserData")
	})
})
