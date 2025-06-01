import { Project, ScriptTarget } from "ts-morph"
import { executeRenameOperation } from "../rename"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"

describe("executeRenameOperation", () => {
	let project: Project
	let tempDir: string
	let fixtureFile: string

	beforeEach(() => {
		// Create a temporary directory for test files
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rename-operation-test-"))

		// Create a clean copy of the fixture file to the temp directory
		const fixtureSource = path.join(__dirname, "fixtures", "rename", "single-file.ts")
		fixtureFile = path.join(tempDir, "single-file.ts")

		// Read the content and write a fresh copy to avoid modifying the original
		const fixtureContent = fs.readFileSync(fixtureSource, "utf-8")
		fs.writeFileSync(fixtureFile, fixtureContent)

		// Set up the project
		project = new Project({
			compilerOptions: {
				target: ScriptTarget.ES2020,
			},
		})

		// Add the fixture file to the project
		project.addSourceFileAtPath(fixtureFile)
	})

	afterEach(async () => {
		// Clean up temp directory
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true })
		}
	})

	describe("renaming a function", () => {
		// Set timeout for all tests in this describe block
		jest.setTimeout(30000)

		it("should rename a function and update all references", async () => {
			// Execute the rename operation
			const result = await executeRenameOperation(project, {
				operation: "rename",
				id: "test-rename-1",
				selector: {
					type: "identifier",
					name: "oldFunction",
					kind: "function",
					filePath: fixtureFile,
				},
				newName: "newFunction",
				scope: "project",
				reason: "Better name for testing",
			})

			// Check that the operation was successful
			expect(result.success).toBe(true)
			expect(result.affectedFiles).toContain(fixtureFile)

			// Verify that the function was renamed
			const sourceFile = project.getSourceFile(fixtureFile)
			expect(sourceFile).not.toBeUndefined()

			// The old function should no longer exist
			expect(sourceFile!.getFunction("oldFunction")).toBeUndefined()

			// The new function should exist
			const newFunction = sourceFile!.getFunction("newFunction")
			expect(newFunction).not.toBeUndefined()

			// References should be updated
			const fileText = sourceFile!.getFullText()
			expect(fileText).not.toContain("oldFunction(")
			expect(fileText).toContain("newFunction(")

			// The calling function should refer to the new name
			expect(fileText).toContain("return newFunction(")

			// Export should be updated
			expect(fileText).toContain("export { newFunction,")
		})
	})

	describe("renaming a method", () => {
		// Set timeout for all tests in this describe block
		jest.setTimeout(30000)

		it("should rename a class method and update all references", async () => {
			// Execute the rename operation
			const result = await executeRenameOperation(project, {
				operation: "rename",
				id: "test-rename-2",
				selector: {
					type: "identifier",
					name: "oldMethod",
					kind: "method",
					filePath: fixtureFile,
					parent: {
						name: "TestClass",
						kind: "class",
					},
				},
				newName: "newMethod",
				scope: "project",
				reason: "Better method name",
			})

			// Check that the operation was successful
			expect(result.success).toBe(true)
			expect(result.affectedFiles).toContain(fixtureFile)

			// Verify that the method was renamed
			const sourceFile = project.getSourceFile(fixtureFile)
			expect(sourceFile).not.toBeUndefined()

			// Get the class
			const testClass = sourceFile!.getClass("TestClass")
			expect(testClass).not.toBeUndefined()

			// The old method should no longer exist
			expect(testClass!.getMethod("oldMethod")).toBeUndefined()

			// The new method should exist
			const newMethod = testClass!.getMethod("newMethod")
			expect(newMethod).not.toBeUndefined()

			// References should be updated
			const fileText = sourceFile!.getFullText()
			expect(fileText).not.toContain("oldMethod()")
			expect(fileText).toContain("newMethod()")

			// The calling method should refer to the new name
			expect(fileText).toContain("this.newMethod()")

			// Instance usage should be updated
			expect(fileText).toContain("instance.newMethod()")
		})
	})

	describe("error handling", () => {
		it("should handle non-existent symbols", async () => {
			// Try to rename a symbol that doesn't exist
			const result = await executeRenameOperation(project, {
				operation: "rename",
				id: "test-rename-error-1",
				selector: {
					type: "identifier",
					name: "nonExistentFunction",
					kind: "function",
					filePath: fixtureFile,
				},
				newName: "newFunction",
				scope: "project",
				reason: "Testing error handling",
			})

			// Check that the operation failed
			expect(result.success).toBe(false)
			expect(result.error).toContain("not found")
		})

		it("should handle empty new names", async () => {
			// Try to rename to an empty name
			const result = await executeRenameOperation(project, {
				operation: "rename",
				id: "test-rename-error-2",
				selector: {
					type: "identifier",
					name: "oldFunction",
					kind: "function",
					filePath: fixtureFile,
				},
				newName: "",
				scope: "project",
				reason: "Testing empty name error",
			})

			// Check that the operation failed
			expect(result.success).toBe(false)
			expect(result.error).toContain("cannot be empty")
		})

		it("should handle naming conflicts", async () => {
			// Add a function with the target name to create a conflict
			const sourceFile = project.getSourceFile(fixtureFile)
			sourceFile!.addFunction({
				name: "conflictName",
				parameters: [],
				statements: [`return "This will cause a conflict";`],
			})

			// Try to rename to a name that already exists
			const result = await executeRenameOperation(project, {
				operation: "rename",
				id: "test-rename-error-3",
				selector: {
					type: "identifier",
					name: "oldFunction",
					kind: "function",
					filePath: fixtureFile,
				},
				newName: "conflictName",
				scope: "project",
				reason: "Testing naming conflict",
			})

			// Check that the operation failed
			expect(result.success).toBe(false)
			expect(result.error).toContain("Naming conflict")
		})

		it("should handle reserved keywords", async () => {
			// Try to rename to a reserved keyword
			const result = await executeRenameOperation(project, {
				operation: "rename",
				id: "test-rename-error-4",
				selector: {
					type: "identifier",
					name: "oldFunction",
					kind: "function",
					filePath: fixtureFile,
				},
				newName: "class",
				scope: "project",
				reason: "Testing reserved keyword error",
			})

			// Check that the operation failed
			expect(result.success).toBe(false)
			expect(result.error).toContain("reserved keyword")
		})
	})
})
