import { Project } from "ts-morph"
import * as path from "path"
import * as fs from "fs/promises"
import * as fsSync from "fs"
import { RefactorEngine } from "../engine"
import { RenameOperation, MoveOperation, RemoveOperation } from "../schema"

/**
 * Special test that simulates the exact conditions found in the real application
 *
 * This test specifically reproduces the environment issue where process.cwd() returns "/"
 * which was identified as a key difference between our tests and the real application.
 */
describe("Real World Environment Simulation", () => {
	let engine: RefactorEngine
	let rootDir: string
	let testDir: string
	let testFilePath: string
	let targetFilePath: string

	// Store original process.cwd function
	const originalCwd = process.cwd

	// Set up test files before each test
	beforeEach(async () => {
		// Override process.cwd to simulate the bug condition where it returns "/"
		process.cwd = jest.fn().mockReturnValue("/")

		// Set up test directory and file paths
		rootDir = path.resolve(__dirname, "../../../../../")
		testDir = path.join(rootDir, "test-real-world")
		testFilePath = path.join(testDir, "utils", "formatting.ts")
		targetFilePath = path.join(testDir, "utils", "validation.ts")

		// Create test directory structure
		await fs.mkdir(path.join(testDir, "utils"), { recursive: true })
		await fs.mkdir(path.join(testDir, "services"), { recursive: true })

		// Create a realistic test file structure mirroring the bug report
		const formattingContent = `// Formatting utility functions
export function formatUserName(user: any): string {
    return \`\${user.firstName} \${user.lastName}\`.trim() || "Unnamed User"
}

export function formatEmail(email: string): string {
    const [username, domain] = email.split("@")
    if (!domain) return email
    return \`\${username.substring(0, 3)}...@\${domain}\`
}

export function deprecatedHelper(value: string): string {
    return value.toLowerCase()
}
`

		const userServiceContent = `// User service functions
import { formatUserName, formatEmail } from "../utils/formatting"

export function validateUser(user: any): boolean {
    if (!user.email || !user.email.includes("@")) {
        return false
    }
    return true
}

export function getUserInfo(user: any): string {
    return \`Name: \${formatUserName(user)}\nEmail: \${formatEmail(user.email)}\`
}
`

		await fs.writeFile(testFilePath, formattingContent, "utf-8")
		await fs.writeFile(path.join(testDir, "services", "userService.ts"), userServiceContent, "utf-8")
		await fs.writeFile(targetFilePath, "// Validation utility functions\n", "utf-8")

		// Initialize the refactor engine with the same configuration as the real application
		engine = new RefactorEngine({
			projectRootPath: rootDir, // Using absolute path as in the real app
		})

		console.log(`[TEST] Created test files with process.cwd() = "${process.cwd()}"`)
		console.log(`[TEST] projectRootPath = "${rootDir}"`)
	})

	// Clean up test files and restore original process.cwd after each test
	afterEach(async () => {
		// Restore original process.cwd
		process.cwd = originalCwd

		try {
			await fs.rm(testDir, { recursive: true, force: true })
		} catch (error) {
			console.error("Error cleaning up test files:", error)
		}
	})

	test("RENAME operation should work even when process.cwd() returns '/'", async () => {
		// Setup rename operation - using relative paths as in the real application
		const relativeFilePath = path.relative(rootDir, testFilePath)

		console.log(`[TEST] Absolute path: ${testFilePath}`)
		console.log(`[TEST] Relative path: ${relativeFilePath}`)

		const renameOp: RenameOperation = {
			id: "real-world-rename-test",
			operation: "rename",
			selector: {
				type: "identifier",
				kind: "function",
				name: "formatUserName",
				filePath: relativeFilePath, // Using relative path
			},
			newName: "formatFullName",
			scope: "project",
		}

		// Execute rename operation
		const result = await engine.executeOperation(renameOp)

		console.log(`[TEST] Operation result: ${result.success ? "SUCCESS" : "FAILURE"}`)
		if (!result.success) {
			console.error(`[TEST] Error: ${result.error}`)
		}

		// Check actual file content directly using fs, not through the engine
		const fileExists = fsSync.existsSync(testFilePath)
		const fileContent = fileExists ? await fs.readFile(testFilePath, "utf-8") : "FILE NOT FOUND"

		console.log(`[TEST] File exists: ${fileExists}`)
		console.log(`[TEST] File content contains formatFullName: ${fileContent.includes("formatFullName")}`)
		console.log(`[TEST] File content contains formatUserName: ${fileContent.includes("formatUserName")}`)

		// Assert our expectations
		expect(result.success).toBe(true)
		expect(fileExists).toBe(true)
		expect(fileContent).toContain("formatFullName")
		expect(fileContent).not.toContain("formatUserName")
	})

	test("MOVE operation should work even when process.cwd() returns '/'", async () => {
		// Setup move operation with relative paths
		const relativeSourcePath = path.relative(rootDir, path.join(testDir, "services", "userService.ts"))
		const relativeTargetPath = path.relative(rootDir, targetFilePath)

		console.log(`[TEST] Relative source path: ${relativeSourcePath}`)
		console.log(`[TEST] Relative target path: ${relativeTargetPath}`)

		const moveOp: MoveOperation = {
			id: "real-world-move-test",
			operation: "move",
			selector: {
				type: "identifier",
				kind: "function",
				name: "validateUser",
				filePath: relativeSourcePath,
			},
			targetFilePath: relativeTargetPath,
		}

		// Execute move operation
		const result = await engine.executeOperation(moveOp)

		console.log(`[TEST] Operation result: ${result.success ? "SUCCESS" : "FAILURE"}`)
		if (!result.success) {
			console.error(`[TEST] Error: ${result.error}`)
		}

		// Check both files directly
		const sourceExists = fsSync.existsSync(path.join(testDir, "services", "userService.ts"))
		const targetExists = fsSync.existsSync(targetFilePath)

		const sourceContent = sourceExists
			? await fs.readFile(path.join(testDir, "services", "userService.ts"), "utf-8")
			: "FILE NOT FOUND"
		const targetContent = targetExists ? await fs.readFile(targetFilePath, "utf-8") : "FILE NOT FOUND"

		console.log(`[TEST] Source file exists: ${sourceExists}`)
		console.log(`[TEST] Target file exists: ${targetExists}`)
		console.log(`[TEST] Source still contains validateUser: ${sourceContent.includes("validateUser")}`)
		console.log(`[TEST] Target contains validateUser: ${targetContent.includes("validateUser")}`)

		// Assert our expectations
		expect(result.success).toBe(true)
		expect(sourceExists).toBe(true)
		expect(targetExists).toBe(true)
		expect(sourceContent).not.toContain("validateUser")
		expect(targetContent).toContain("validateUser")
	})

	test("REMOVE operation should work even when process.cwd() returns '/'", async () => {
		// Setup remove operation with relative path
		const relativeFilePath = path.relative(rootDir, testFilePath)

		const removeOp: RemoveOperation = {
			id: "real-world-remove-test",
			operation: "remove",
			selector: {
				type: "identifier",
				kind: "function",
				name: "deprecatedHelper",
				filePath: relativeFilePath,
			},
		}

		// Execute remove operation
		const result = await engine.executeOperation(removeOp)

		console.log(`[TEST] Operation result: ${result.success ? "SUCCESS" : "FAILURE"}`)
		if (!result.success) {
			console.error(`[TEST] Error: ${result.error}`)
		}

		// Check file directly
		const fileExists = fsSync.existsSync(testFilePath)
		const fileContent = fileExists ? await fs.readFile(testFilePath, "utf-8") : "FILE NOT FOUND"

		console.log(`[TEST] File exists: ${fileExists}`)
		console.log(`[TEST] File content still contains deprecatedHelper: ${fileContent.includes("deprecatedHelper")}`)

		// Assert our expectations
		expect(result.success).toBe(true)
		expect(fileExists).toBe(true)
		expect(fileContent).not.toContain("deprecatedHelper")
	})
})
