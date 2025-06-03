import { Project, SourceFile } from "ts-morph"
import { MoveExecutor } from "../operations/MoveExecutor"
import { MoveOperation } from "../schema"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import { PathResolver } from "../utils/PathResolver"
import { FileManager } from "../utils/FileManager"
import { SymbolResolver } from "../core/SymbolResolver"
import { ResolvedSymbol } from "../core/types"
import { verifySymbolInContent } from "./utils/test-utilities"

describe("MoveExecutor", () => {
	let tempDir: string
	let sourceFile: string
	let targetFile: string
	let project: Project
	let moveExecutor: MoveExecutor
	let pathResolver: PathResolver
	let fileManager: FileManager
	let symbolResolver: SymbolResolver

	beforeEach(async () => {
		// Create a temporary directory for test files
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "move-executor-test-"))

		// Create file paths
		sourceFile = path.join(tempDir, "src", "services", "userService.ts")
		targetFile = path.join(tempDir, "src", "services", "profileService.ts")

		// Create source file with test content
		const sourceContent = `
import { UserProfile } from "../models/User"

export function getUserData(userId: string): Promise<UserProfile> {
  // Implementation
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

		// Ensure directories exist
		await fs.promises.mkdir(path.dirname(sourceFile), { recursive: true })
		await fs.promises.mkdir(path.dirname(targetFile), { recursive: true })

		// Write the test files
		fs.writeFileSync(sourceFile, sourceContent)
		fs.writeFileSync(targetFile, targetContent)

		// Create model file with UserProfile type
		const modelDir = path.join(tempDir, "src", "models")
		const modelFile = path.join(modelDir, "User.ts")
		await fs.promises.mkdir(modelDir, { recursive: true })

		fs.writeFileSync(
			modelFile,
			`
export interface UserProfile {
  id: string
  email: string
  firstName: string
  lastName: string
  createdAt: Date
  updatedAt: Date
}
`,
		)

		// Initialize project and services
		project = new Project({
			compilerOptions: {
				rootDir: tempDir,
			},
		})

		// Add source files to project
		project.addSourceFileAtPath(sourceFile)
		project.addSourceFileAtPath(targetFile)
		project.addSourceFileAtPath(modelFile)

		// Initialize the MoveExecutor and related services
		moveExecutor = new MoveExecutor(project)
		pathResolver = new PathResolver(tempDir)
		fileManager = new FileManager(project, pathResolver)
		symbolResolver = new SymbolResolver(project)
	})

	afterEach(() => {
		// Clean up temp directory
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true })
		}
	})

	describe("execute", () => {
		it("should move a function from source to target file", async () => {
			// Get source file
			const sourceFileObj = project.getSourceFile(sourceFile)
			expect(sourceFileObj).not.toBeUndefined()

			// Resolve the symbol to move
			const symbolName = "getUserData"
			const symbol = symbolResolver.resolveSymbol(
				{
					type: "identifier",
					name: symbolName,
					kind: "function",
					filePath: sourceFile,
				},
				sourceFileObj!,
			)

			expect(symbol).not.toBeUndefined()

			// Create validation data (normally provided by MoveValidator)
			const validationData = {
				symbol: symbol!,
				sourceFile: sourceFileObj!,
			}

			// Create move operation
			const moveOperation: MoveOperation = {
				operation: "move",
				selector: {
					type: "identifier",
					name: symbolName,
					kind: "function",
					filePath: path.relative(tempDir, sourceFile),
				},
				targetFilePath: path.relative(tempDir, targetFile),
			}

			// Execute the move
			const result = await moveExecutor.execute(moveOperation, validationData)

			// Verify success
			expect(result.success).toBe(true)
			expect(result.affectedFiles.length).toBeGreaterThanOrEqual(2) // At least source and target

			// Read file contents after move
			const sourceContentAfter = fs.readFileSync(sourceFile, "utf-8")
			const targetContentAfter = fs.readFileSync(targetFile, "utf-8")

			// Verify symbol was moved
			expect(verifySymbolInContent(sourceContentAfter, symbolName)).toBe(false)
			expect(verifySymbolInContent(targetContentAfter, symbolName)).toBe(true)

			// Verify imports were properly handled
			expect(targetContentAfter).toContain("import { UserProfile } from")
		})

		it("should copy a function without removing from source when copyOnly is true", async () => {
			// Get source file
			const sourceFileObj = project.getSourceFile(sourceFile)
			expect(sourceFileObj).not.toBeUndefined()

			// Resolve the symbol to move
			const symbolName = "updateUserProfile"
			const symbol = symbolResolver.resolveSymbol(
				{
					type: "identifier",
					name: symbolName,
					kind: "function",
					filePath: sourceFile,
				},
				sourceFileObj!,
			)

			expect(symbol).not.toBeUndefined()

			// Create validation data
			const validationData = {
				symbol: symbol!,
				sourceFile: sourceFileObj!,
			}

			// Create move operation
			const moveOperation: MoveOperation = {
				operation: "move",
				selector: {
					type: "identifier",
					name: symbolName,
					kind: "function",
					filePath: path.relative(tempDir, sourceFile),
				},
				targetFilePath: path.relative(tempDir, targetFile),
			}

			// Execute the move with copyOnly option
			const result = await moveExecutor.execute(moveOperation, validationData, { copyOnly: true })

			// Verify success
			expect(result.success).toBe(true)
			expect(result.details?.copyOnly).toBe(true)

			// Read file contents after move
			const sourceContentAfter = fs.readFileSync(sourceFile, "utf-8")
			const targetContentAfter = fs.readFileSync(targetFile, "utf-8")

			// Verify symbol exists in both files
			expect(verifySymbolInContent(sourceContentAfter, symbolName)).toBe(true)
			expect(verifySymbolInContent(targetContentAfter, symbolName)).toBe(true)
		})

		it("should handle errors gracefully when target file cannot be prepared", async () => {
			// Mock a bad target path
			const badTargetPath = "/invalid/path/that/does/not/exist.ts"

			// Get source file
			const sourceFileObj = project.getSourceFile(sourceFile)

			// Resolve the symbol to move
			const symbolName = "getUserData"
			const symbol = symbolResolver.resolveSymbol(
				{
					type: "identifier",
					name: symbolName,
					kind: "function",
					filePath: sourceFile,
				},
				sourceFileObj!,
			)

			// Create validation data
			const validationData = {
				symbol: symbol!,
				sourceFile: sourceFileObj!,
			}

			// Create move operation with bad target path
			const moveOperation: MoveOperation = {
				operation: "move",
				selector: {
					type: "identifier",
					name: symbolName,
					kind: "function",
					filePath: path.relative(tempDir, sourceFile),
				},
				targetFilePath: badTargetPath,
			}

			// Try to execute the move
			const result = await moveExecutor.execute(moveOperation, validationData)

			// Verify failure
			expect(result.success).toBe(false)
			expect(result.error).toContain("Failed to prepare target file")
		})
	})
})
