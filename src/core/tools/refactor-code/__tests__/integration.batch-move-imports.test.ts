import * as path from "path"
import { MoveOrchestrator } from "../operations/MoveOrchestrator"
import { MoveOperation } from "../schema"
import { normalizePathForTests, verifySymbolInContent, verifySymbolOnDisk } from "./utils/test-utilities"
import {
	createRefactorEngineTestSetup,
	RefactorEngineTestSetup,
	createTestFiles,
} from "./utils/standardized-test-setup"

describe("Move Operation Import Handling", () => {
	let setup: RefactorEngineTestSetup
	let sourceFilePath: string
	let targetFilePath: string
	let userModelFilePath: string

	beforeEach(async () => {
		setup = createRefactorEngineTestSetup()

		// Create test files using standardized utility
		const testFiles = {
			"models/User.ts": `
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
}`,
			"services/userService.ts": `
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
}`,
			"services/profileService.ts": `
// This file will receive the moved function
export function getProfilePicture(userId: string): string {
		return \`https://example.com/profiles/\${userId}.jpg\`;
}`,
		}

		const filePaths = createTestFiles(setup.projectDir, testFiles)

		// Set file paths for test access
		userModelFilePath = filePaths["models/User.ts"]
		sourceFilePath = filePaths["services/userService.ts"]
		targetFilePath = filePaths["services/profileService.ts"]

		// Load files into RefactorEngine project for cross-file reference detection
		const project = setup.engine.getProject()
		if (project) {
			project.addSourceFilesAtPaths([userModelFilePath, sourceFilePath, targetFilePath])
		}
	})

	afterEach(() => {
		setup.cleanup()
	})

	it("should properly handle imports when moving a function in a batch operation", async () => {
		// Create a move operation
		const moveRelativeSourcePath = path.relative(setup.projectDir, sourceFilePath)
		const moveRelativeTargetPath = path.relative(setup.projectDir, targetFilePath)

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

		// Execute the operation using RefactorEngine's project
		const { ProjectManager } = require("../core/ProjectManager")
		const project = setup.engine.getProject()
		const projectManager = new ProjectManager(project, setup.projectDir)
		const orchestrator = new MoveOrchestrator(project, projectManager)
		const result = await orchestrator.executeMoveOperation(operation)

		// Verify operation succeeded
		expect(result.success).toBe(true)

		const normalizedSourcePath = normalizePathForTests(moveRelativeSourcePath.replace(/\\/g, "/"))
		const normalizedTargetPath = normalizePathForTests(moveRelativeTargetPath.replace(/\\/g, "/"))

		expect(result.affectedFiles.some((file) => normalizePathForTests(file) === normalizedSourcePath)).toBe(true)
		expect(result.affectedFiles.some((file) => normalizePathForTests(file) === normalizedTargetPath)).toBe(true)

		// Check that the function was removed from source file
		console.log(`[TEST] Looking for source file at: ${moveRelativeSourcePath}`)
		const sourceContent = require("fs").readFileSync(sourceFilePath, "utf8")
		expect(verifySymbolInContent(sourceContent, "getUserData")).toBe(false)

		// Check that the function was added to target file
		console.log(`[TEST] Looking for target file at: ${moveRelativeTargetPath}`)
		const targetContent = require("fs").readFileSync(targetFilePath, "utf8")
		expect(verifySymbolInContent(targetContent, "getUserData")).toBe(true)
		expect(verifySymbolInContent(targetContent, "User")).toBe(true)

		// The most important part: verify that the User import was added to the target file
		expect(targetContent).toContain("import { User")
		expect(targetContent).toContain('from "../models/User"')

		// Also verify that createDefaultUser is imported
		expect(targetContent).toContain("createDefaultUser")
	})

	it("should handle complex type dependencies when moving functions", async () => {
		// Create additional test files with complex dependencies
		const complexFiles = {
			"services/complexService.ts": `
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
}`,
			"utils/dataUtils.ts": "// Target file for complex types test",
		}

		const complexFilePaths = createTestFiles(setup.projectDir, complexFiles)
		const complexSourcePath = complexFilePaths["services/complexService.ts"]
		const complexTargetPath = complexFilePaths["utils/dataUtils.ts"]

		// Add files to project for cross-file reference detection
		const project = setup.engine.getProject()
		if (project) {
			project.addSourceFilesAtPaths([complexSourcePath, complexTargetPath])
		}

		// Create move operation
		const complexRelativeSourcePath = path.relative(setup.projectDir, complexSourcePath)
		const complexRelativeTargetPath = path.relative(setup.projectDir, complexTargetPath)

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

		// Execute the operation using RefactorEngine's project
		const { ProjectManager } = require("../core/ProjectManager")
		const projectManager = new ProjectManager(project, setup.projectDir)
		const orchestrator = new MoveOrchestrator(project, projectManager)
		const result = await orchestrator.executeMoveOperation(operation)

		// Verify operation succeeded
		expect(result.success).toBe(true)

		const normalizedSourcePath = normalizePathForTests(complexRelativeSourcePath.replace(/\\/g, "/"))
		const normalizedTargetPath = normalizePathForTests(complexRelativeTargetPath.replace(/\\/g, "/"))

		expect(result.affectedFiles.some((file) => normalizePathForTests(file) === normalizedSourcePath)).toBe(true)
		expect(result.affectedFiles.some((file) => normalizePathForTests(file) === normalizedTargetPath)).toBe(true)

		// Verify that the function was moved
		console.log(`[TEST] Looking for target file at: ${complexRelativeTargetPath}`)

		// Check source file to verify function was removed
		const sourceContent = require("fs").readFileSync(complexSourcePath, "utf8")
		expect(verifySymbolInContent(sourceContent, "analyzeUserData")).toBe(false)

		// Check target file content to verify function was moved and dependencies were included
		const targetContent = require("fs").readFileSync(complexTargetPath, "utf8")
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
