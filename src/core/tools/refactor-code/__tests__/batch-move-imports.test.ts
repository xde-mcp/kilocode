import { Project } from "ts-morph"
import * as fs from "fs"
import * as path from "path"
import { MoveOrchestrator } from "../operations/MoveOrchestrator"
import { MoveOperation } from "../schema"
import * as os from "os"
import { normalizePathForTests, verifySymbolInContent, verifySymbolOnDisk } from "./utils/test-utilities"

describe("Move Operation Import Handling", () => {
	let project: Project
	let tempDir: string
	let sourceFilePath: string
	let targetFilePath: string
	let userModelFilePath: string

	beforeEach(async () => {
		// Create a temporary directory for our test files
		tempDir = path.join(os.tmpdir(), `move-op-test-${Date.now()}`)
		fs.mkdirSync(tempDir, { recursive: true })
		fs.mkdirSync(path.join(tempDir, "models"), { recursive: true })
		fs.mkdirSync(path.join(tempDir, "services"), { recursive: true })
		fs.mkdirSync(path.join(tempDir, "utils"), { recursive: true })

		// Create a model file with User interface
		userModelFilePath = path.join(tempDir, "models", "User.ts")
		const userModelCode = `
      export interface User {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
        createdAt: Date;
        updatedAt: Date;
      }

      export function createDefaultUser(email: string): User {
        return {
          id: '123',
          firstName: '',
          lastName: '',
          email,
          createdAt: new Date(),
          updatedAt: new Date()
        };
      }
    `
		fs.writeFileSync(userModelFilePath, userModelCode)

		// Create a service file that uses the User model
		sourceFilePath = path.join(tempDir, "services", "userService.ts")
		const serviceCode = `
      import { User, createDefaultUser } from "../models/User";
      
      // This function will be moved
      export function getUserData(userId: string): Promise<User> {
        // Implementation that uses User model
        return Promise.resolve(createDefaultUser(\`user-\${userId}@example.com\`));
      }

      export function updateUserProfile(user: User, data: Partial<User>): User {
        return {
          ...user,
          ...data,
          updatedAt: new Date(),
        };
      }
    `
		fs.writeFileSync(sourceFilePath, serviceCode)

		// Create target file where we'll move the function
		targetFilePath = path.join(tempDir, "services", "profileService.ts")
		const targetCode = `
      // This file will receive the moved function
      export function getProfilePicture(userId: string): string {
        return \`https://example.com/profiles/\${userId}.jpg\`;
      }
    `
		fs.writeFileSync(targetFilePath, targetCode)

		// Initialize ts-morph project
		project = new Project({
			compilerOptions: {
				rootDir: tempDir,
			},
			skipAddingFilesFromTsConfig: true,
		})

		// Add all source files to the project
		project.addSourceFilesAtPaths([path.join(tempDir, "**", "*.ts")])
	})

	afterEach(() => {
		// Clean up temp directory
		try {
			fs.rmSync(tempDir, { recursive: true, force: true })
		} catch (error) {
			console.error(`Failed to clean up temp directory: ${error}`)
		}
	})

	it("should properly handle imports when moving a function in a batch operation", async () => {
		// Create a move operation
		const moveRelativeSourcePath = path.relative(tempDir, sourceFilePath)
		const moveRelativeTargetPath = path.relative(tempDir, targetFilePath)

		const operation: MoveOperation = {
			operation: "move",
			selector: {
				type: "identifier",
				name: "getUserData",
				kind: "function",
				filePath: moveRelativeSourcePath.replace(/\\/g, "/"),
			},
			targetFilePath: moveRelativeTargetPath.replace(/\\/g, "/"),
			reason: "Organizing user profile related functions together",
		}

		// Execute the operation
		const orchestrator = new MoveOrchestrator(project)
		const result = await orchestrator.executeMoveOperation(operation)

		// Verify operation succeeded
		expect(result.success).toBe(true)

		const normalizedSourcePath = normalizePathForTests(moveRelativeSourcePath.replace(/\\/g, "/"))
		const normalizedTargetPath = normalizePathForTests(moveRelativeTargetPath.replace(/\\/g, "/"))

		expect(result.affectedFiles.some((file) => normalizePathForTests(file) === normalizedSourcePath)).toBe(true)
		expect(result.affectedFiles.some((file) => normalizePathForTests(file) === normalizedTargetPath)).toBe(true)

		// Check that the function was removed from source file
		// Use direct file system access instead of relying on project's source file management
		console.log(`[TEST] Looking for source file at: ${moveRelativeSourcePath}`)
		const sourceContent = fs.readFileSync(sourceFilePath, "utf8")
		expect(verifySymbolInContent(sourceContent, "getUserData")).toBe(false)

		// Check that the function was added to target file using direct file access
		console.log(`[TEST] Looking for target file at: ${moveRelativeTargetPath}`)
		const targetContent = fs.readFileSync(targetFilePath, "utf8")
		expect(verifySymbolInContent(targetContent, "getUserData")).toBe(true)
		expect(verifySymbolInContent(targetContent, "User")).toBe(true)

		// The most important part: verify that the User import was added to the target file
		expect(targetContent).toContain("import { User")
		expect(targetContent).toContain('from "../models/User"')

		// Also verify that createDefaultUser is imported
		expect(targetContent).toContain("createDefaultUser")
	})

	it("should handle complex type dependencies when moving functions", async () => {
		// Create a file with more complex type dependencies
		const complexSourcePath = path.join(tempDir, "services", "complexService.ts")
		const complexTargetPath = path.join(tempDir, "utils", "dataUtils.ts")

		// Create source file with nested types and multiple dependencies
		const complexSourceCode = `
      import { User } from "../models/User";
      
      // Define some additional types used by our function
      interface UserStats {
        loginCount: number;
        lastActive: Date;
        preferences: UserPreferences;
      }
      
      interface UserPreferences {
        theme: string;
        notifications: boolean;
      }
      
      // This function uses complex nested types
      export function analyzeUserData(user: User): UserStats {
        // Implementation using User and the local interfaces
        return {
          loginCount: 42,
          lastActive: new Date(),
          preferences: {
            theme: "dark",
            notifications: true
          }
        };
      }
    `
		fs.writeFileSync(complexSourcePath, complexSourceCode)

		// Create target file
		fs.mkdirSync(path.dirname(complexTargetPath), { recursive: true })
		fs.writeFileSync(complexTargetPath, "// Target file for complex types test")

		// Add files to project
		project.addSourceFilesAtPaths([complexSourcePath, complexTargetPath])

		// Create move operation
		const complexRelativeSourcePath = path.relative(tempDir, complexSourcePath)
		const complexRelativeTargetPath = path.relative(tempDir, complexTargetPath)

		const operation: MoveOperation = {
			operation: "move",
			selector: {
				type: "identifier",
				name: "analyzeUserData",
				kind: "function",
				filePath: complexRelativeSourcePath.replace(/\\/g, "/"),
			},
			targetFilePath: complexRelativeTargetPath.replace(/\\/g, "/"),
			reason: "Moving analysis functions to utils",
		}

		// Execute the operation
		const orchestrator = new MoveOrchestrator(project)
		const result = await orchestrator.executeMoveOperation(operation)

		// Verify operation succeeded
		expect(result.success).toBe(true)

		const normalizedSourcePath = normalizePathForTests(complexRelativeSourcePath.replace(/\\/g, "/"))
		const normalizedTargetPath = normalizePathForTests(complexRelativeTargetPath.replace(/\\/g, "/"))

		expect(result.affectedFiles.some((file) => normalizePathForTests(file) === normalizedSourcePath)).toBe(true)
		expect(result.affectedFiles.some((file) => normalizePathForTests(file) === normalizedTargetPath)).toBe(true)

		// Verify that the function was moved using direct file system access
		console.log(`[TEST] Looking for target file at: ${complexRelativeTargetPath}`)

		// Check source file to verify function was removed
		const sourceContent = fs.readFileSync(complexSourcePath, "utf8")
		expect(verifySymbolInContent(sourceContent, "analyzeUserData")).toBe(false)

		// Check target file content to verify function was moved and dependencies were included
		const targetContent = fs.readFileSync(complexTargetPath, "utf8")
		expect(verifySymbolInContent(targetContent, "analyzeUserData")).toBe(true)

		// Should have the User import
		expect(verifySymbolInContent(targetContent, "User")).toBe(true)

		// Should include the dependent interfaces
		expect(verifySymbolInContent(targetContent, "UserStats")).toBe(true)
		expect(verifySymbolInContent(targetContent, "UserPreferences")).toBe(true)

		// Verify implementation still references these types
		expect(targetContent).toContain("function analyzeUserData(user: User): UserStats")
	})
})
