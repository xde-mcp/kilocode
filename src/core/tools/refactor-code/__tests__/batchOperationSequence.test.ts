import { Project, ScriptTarget } from "ts-morph"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"
import { RefactorEngine } from "../engine"
import { BatchOperations } from "../schema"
import { ensureDirectoryExists } from "../utils/file-system"

describe("Batch Operation Sequence", () => {
	let tempDir: string
	let sourceFile: string
	let targetFile1: string
	let targetFile2: string

	beforeEach(() => {
		// Create a temporary directory for test files
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "batch-sequence-test-"))

		// Create source file path
		sourceFile = path.join(tempDir, "source.ts")

		// Create target file paths
		targetFile1 = path.join(tempDir, "target1.ts")
		targetFile2 = path.join(tempDir, "target2.ts")

		// Create source file with test content
		const sourceContent = `
export function functionA() {
  return "Function A";
}

export function functionB() {
  return "Function B";
}

export function functionC() {
  return functionA() + functionB();
}
`
		fs.writeFileSync(sourceFile, sourceContent)
	})

	afterEach(() => {
		// Clean up temp directory
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true })
		}
	})

	it("should handle operations that depend on previous operations", async () => {
		// Create empty target files to ensure directories exist
		await ensureDirectoryExists(path.dirname(targetFile1))
		await ensureDirectoryExists(path.dirname(targetFile2))
		fs.writeFileSync(targetFile1, "")
		fs.writeFileSync(targetFile2, "")

		// Create a project for testing
		const project = new Project({
			compilerOptions: {
				target: ScriptTarget.ES2020,
				outDir: tempDir,
				rootDir: tempDir,
			},
		})

		// Add source files to project
		project.addSourceFileAtPath(sourceFile)
		project.addSourceFileAtPath(targetFile1)
		project.addSourceFileAtPath(targetFile2)

		// Save all files to ensure they're on disk
		await project.save()

		// Create a RefactorEngine instance
		const engine = new RefactorEngine({
			projectRootPath: tempDir,
		})

		// Set the project in the engine (this is a hack for testing)
		// @ts-ignore - accessing private property for testing
		engine.project = project

		// Define batch operations
		const batchOperations: BatchOperations = {
			operations: [
				// Move functionA to target1.ts
				{
					operation: "move",
					selector: {
						type: "identifier",
						name: "functionA",
						kind: "function",
						filePath: sourceFile,
					},
					targetFilePath: targetFile1,
					reason: "Moving function A",
				},
				// Rename functionA in target1.ts
				{
					operation: "rename",
					selector: {
						type: "identifier",
						name: "functionA",
						kind: "function",
						filePath: targetFile1,
					},
					newName: "newFunctionA",
					reason: "Renaming function A",
				},
				// Move functionB to target2.ts
				{
					operation: "move",
					selector: {
						type: "identifier",
						name: "functionB",
						kind: "function",
						filePath: sourceFile,
					},
					targetFilePath: targetFile2,
					reason: "Moving function B",
				},
				// Rename functionB in target2.ts
				{
					operation: "rename",
					selector: {
						type: "identifier",
						name: "functionB",
						kind: "function",
						filePath: targetFile2,
					},
					newName: "newFunctionB",
					reason: "Renaming function B",
				},
			],
			options: {
				stopOnError: true,
			},
		}

		// Execute batch operations
		const result = await engine.executeBatch(batchOperations)

		// Verify that all operations succeeded
		expect(result.success).toBe(true)
		expect(result.results.length).toBe(4)
		expect(result.results.every((r) => r.success)).toBe(true)

		// Verify that the files were created and contain the expected content
		expect(fs.existsSync(targetFile1)).toBe(true)
		expect(fs.existsSync(targetFile2)).toBe(true)

		// Save all files to disk
		for (const sourceFile of project.getSourceFiles()) {
			await sourceFile.save()
		}

		// Verify that the functions were moved and renamed
		const target1Content = fs.readFileSync(targetFile1, "utf-8")
		const target2Content = fs.readFileSync(targetFile2, "utf-8")
		const sourceContent = fs.readFileSync(sourceFile, "utf-8")

		// Check that functionA was moved to target1.ts and renamed to newFunctionA
		expect(target1Content).toContain("export function newFunctionA")
		expect(sourceContent).not.toContain("export function functionA")

		// Check that functionB was moved to target2.ts and renamed to newFunctionB
		expect(target2Content).toContain("export function newFunctionB")
		expect(sourceContent).not.toContain("export function functionB")

		// Check that functionC still exists in source.ts
		expect(sourceContent).toContain("export function functionC")

		// In a real scenario, the import manager would update the imports
		// but in our test setup, we're not fully simulating that part
		// So we'll just check that the functions were moved and renamed
	})

	it("should handle creating new files during batch operations", async () => {
		// Create a project for testing
		const project = new Project({
			compilerOptions: {
				target: ScriptTarget.ES2020,
				outDir: tempDir,
				rootDir: tempDir,
			},
		})

		// Add source file to project
		project.addSourceFileAtPath(sourceFile)

		// Save all files to ensure they're on disk
		await project.save()

		// Create the target directory
		await ensureDirectoryExists(path.join(tempDir, "newDir"))

		// Create a RefactorEngine instance
		const engine = new RefactorEngine({
			projectRootPath: tempDir,
		})

		// Set the project in the engine (this is a hack for testing)
		// @ts-ignore - accessing private property for testing
		engine.project = project

		// Define batch operations that create new files
		const batchOperations: BatchOperations = {
			operations: [
				// Move functionA to a new file
				{
					operation: "move",
					selector: {
						type: "identifier",
						name: "functionA",
						kind: "function",
						filePath: sourceFile,
					},
					targetFilePath: path.join(tempDir, "newDir", "newFile1.ts"),
					reason: "Moving function A to a new directory",
				},
				// Move functionB to another new file
				{
					operation: "move",
					selector: {
						type: "identifier",
						name: "functionB",
						kind: "function",
						filePath: sourceFile,
					},
					targetFilePath: path.join(tempDir, "newDir", "newFile2.ts"),
					reason: "Moving function B to a new directory",
				},
			],
			options: {
				stopOnError: true,
			},
		}

		// Execute batch operations
		const result = await engine.executeBatch(batchOperations)

		// Verify that all operations succeeded
		expect(result.success).toBe(true)
		expect(result.results.length).toBe(2)
		expect(result.results.every((r) => r.success)).toBe(true)

		// Verify that the new directory and files were created
		const newDir = path.join(tempDir, "newDir")
		const newFile1 = path.join(newDir, "newFile1.ts")
		const newFile2 = path.join(newDir, "newFile2.ts")

		expect(fs.existsSync(newDir)).toBe(true)
		expect(fs.existsSync(newFile1)).toBe(true)
		expect(fs.existsSync(newFile2)).toBe(true)

		// Save all files to disk
		for (const sourceFile of project.getSourceFiles()) {
			await sourceFile.save()
		}

		// Verify that the functions were moved
		const newFile1Content = fs.readFileSync(newFile1, "utf-8")
		const newFile2Content = fs.readFileSync(newFile2, "utf-8")
		const sourceContent = fs.readFileSync(sourceFile, "utf-8")

		expect(newFile1Content).toContain("export function functionA")
		expect(newFile2Content).toContain("export function functionB")
		expect(sourceContent).not.toContain("export function functionA")
		expect(sourceContent).not.toContain("export function functionB")
	})
})
