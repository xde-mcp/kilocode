import { Project, SourceFile } from "ts-morph"
import { MoveVerifier } from "../operations/MoveVerifier"
import { MoveExecutor } from "../operations/MoveExecutor"
import { MoveOperation } from "../schema"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import { PathResolver } from "../utils/PathResolver"
import { FileManager } from "../utils/FileManager"
import { SymbolResolver } from "../core/SymbolResolver"
import { ResolvedSymbol } from "../core/types"

describe("MoveVerifier", () => {
	let tempDir: string
	let sourceFile: string
	let targetFile: string
	let referencingFile: string
	let project: Project
	let moveExecutor: MoveExecutor
	let moveVerifier: MoveVerifier
	let pathResolver: PathResolver
	let fileManager: FileManager
	let symbolResolver: SymbolResolver

	beforeEach(async () => {
		// Create a temporary directory for test files
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "move-verifier-test-"))

		// Create file paths
		sourceFile = path.join(tempDir, "src", "services", "userService.ts")
		targetFile = path.join(tempDir, "src", "services", "profileService.ts")
		referencingFile = path.join(tempDir, "src", "components", "UserProfile.ts")

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

		// Create referencing file with imports
		const referencingContent = `
import { getUserData } from "../services/userService"

export async function renderUserProfile(userId: string) {
  const userData = await getUserData(userId)
  return {
    html: \`
      <div class="user-profile">
        <h2>\${userData.firstName} \${userData.lastName}</h2>
        <p>\${userData.email}</p>
      </div>
    \`
  }
}
`

		// Ensure directories exist
		await fs.promises.mkdir(path.dirname(sourceFile), { recursive: true })
		await fs.promises.mkdir(path.dirname(targetFile), { recursive: true })
		await fs.promises.mkdir(path.dirname(referencingFile), { recursive: true })

		// Write the test files
		fs.writeFileSync(sourceFile, sourceContent)
		fs.writeFileSync(targetFile, targetContent)
		fs.writeFileSync(referencingFile, referencingContent)

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
		project.addSourceFileAtPath(referencingFile)
		project.addSourceFileAtPath(modelFile)

		// Initialize the services
		moveExecutor = new MoveExecutor(project)
		moveVerifier = new MoveVerifier(project)
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

	describe("verify", () => {
		it("should correctly verify a successful move operation", async () => {
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
			const moveResult = await moveExecutor.execute(moveOperation, validationData)

			// Verify the move was successful
			expect(moveResult.success).toBe(true)

			// Verify the move using the MoveVerifier
			const verificationResult = await moveVerifier.verify(moveOperation, moveResult)

			// Expect all verifications to pass
			expect(verificationResult.success).toBe(true)
			expect(verificationResult.details.symbolAddedToTarget).toBe(true)
			expect(verificationResult.details.symbolRemovedFromSource).toBe(true)
			expect(verificationResult.details.importsUpdatedInTarget).toBe(true)
			expect(verificationResult.details.referencesUpdated).toBe(true)
			expect(verificationResult.failures.length).toBe(0)
		})

		it("should correctly verify a copy-only move operation", async () => {
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
			const moveResult = await moveExecutor.execute(moveOperation, validationData, { copyOnly: true })

			// Verify the move was successful
			expect(moveResult.success).toBe(true)
			expect(moveResult.details?.copyOnly).toBe(true)

			// Verify the move using the MoveVerifier
			const verificationResult = await moveVerifier.verify(moveOperation, moveResult)

			// Expect appropriate verifications to pass
			expect(verificationResult.success).toBe(true)
			expect(verificationResult.details.symbolAddedToTarget).toBe(true)
			expect(verificationResult.details.symbolRemovedFromSource).toBeNull() // Should be null for copy-only
			expect(verificationResult.details.importsUpdatedInTarget).toBe(true)
			expect(verificationResult.failures.length).toBe(0)
		})

		it("should detect when a symbol was not added to the target file", async () => {
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

			// Create a fake "successful" move result but don't actually move the symbol
			const fakeResult = {
				success: true,
				affectedFiles: [sourceFile, targetFile],
				details: {
					sourceFilePath: sourceFile,
					targetFilePath: targetFile,
					symbolName: symbolName,
					copyOnly: false,
					updatedReferenceFiles: [],
				},
			}

			// Verify the move using the MoveVerifier
			const verificationResult = await moveVerifier.verify(moveOperation, fakeResult)

			// Expect verification to fail because the symbol wasn't actually added to target
			expect(verificationResult.success).toBe(false)
			expect(verificationResult.details.symbolAddedToTarget).toBe(false)
			expect(verificationResult.failures.length).toBeGreaterThan(0)
			expect(verificationResult.failures[0]).toContain("not found in target file")
		})

		it("should verify references were updated correctly", async () => {
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

			// Execute the move
			const moveResult = await moveExecutor.execute(moveOperation, validationData)

			// Verify the move was successful
			expect(moveResult.success).toBe(true)

			// Verify the move using the MoveVerifier
			const verificationResult = await moveVerifier.verify(moveOperation, moveResult)

			// Expect all verifications to pass
			expect(verificationResult.success).toBe(true)

			// Check that the referencing file has been updated
			const referencingFileContent = fs.readFileSync(referencingFile, "utf-8")
			expect(referencingFileContent).toContain('import { getUserData } from "../services/profileService"')
			expect(referencingFileContent).not.toContain('import { getUserData } from "../services/userService"')
		})

		it("should handle files that cannot be found", async () => {
			// Create a move operation with a non-existent target file
			const moveOperation: MoveOperation = {
				operation: "move",
				selector: {
					type: "identifier",
					name: "nonExistentSymbol",
					kind: "function",
					filePath: "nonexistent/file.ts",
				},
				targetFilePath: "another/nonexistent/file.ts",
			}

			// Create a fake "successful" move result
			const fakeResult = {
				success: true,
				affectedFiles: ["nonexistent/file.ts", "another/nonexistent/file.ts"],
				details: {
					sourceFilePath: "nonexistent/file.ts",
					targetFilePath: "another/nonexistent/file.ts",
					symbolName: "nonExistentSymbol",
					copyOnly: false,
					updatedReferenceFiles: [],
				},
			}

			// Verify the move using the MoveVerifier
			const verificationResult = await moveVerifier.verify(moveOperation, fakeResult)

			// Expect verification to fail because the files don't exist
			expect(verificationResult.success).toBe(false)
			expect(verificationResult.failures.length).toBeGreaterThan(0)
			expect(verificationResult.failures[0]).toContain("Source file not found")
		})
	})
})
