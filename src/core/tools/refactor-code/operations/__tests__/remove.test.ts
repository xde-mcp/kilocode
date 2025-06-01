import { Project, ScriptTarget } from "ts-morph"
import { executeRemoveOperation } from "../remove"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"

describe("executeRemoveOperation", () => {
	let project: Project
	let tempDir: string
	let fixtureFile: string

	beforeEach(() => {
		// Create a temporary directory for test files
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "remove-operation-test-"))

		// Create a clean copy of the fixture file to the temp directory
		const fixtureSource = path.join(__dirname, "fixtures", "remove", "single-file.ts")
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

	describe("removing a function", () => {
		it("should remove a function and its exports", async () => {
			// Execute the remove operation
			const result = await executeRemoveOperation(project, {
				operation: "remove",
				id: "test-remove-1",
				selector: {
					type: "identifier",
					name: "unusedFunction",
					kind: "function",
					filePath: fixtureFile,
				},
				reason: "Function is unused",
			})

			// Check that the operation was successful
			expect(result.success).toBe(true)
			expect(result.affectedFiles).toContain(fixtureFile)

			// Verify that the function was removed
			const sourceFile = project.getSourceFile(fixtureFile)
			expect(sourceFile).not.toBeUndefined()

			// The function should no longer exist
			expect(sourceFile!.getFunction("unusedFunction")).toBeUndefined()

			// The kept function should still exist
			expect(sourceFile!.getFunction("keepFunction")).not.toBeUndefined()

			// The export should be updated (unusedFunction removed)
			const fileText = sourceFile!.getFullText()
			expect(fileText).not.toContain("export { unusedFunction")
			expect(fileText).toContain("export { keepFunction")
		})
	})

	describe("removing a variable", () => {
		it("should remove a variable", async () => {
			// Execute the remove operation
			const result = await executeRemoveOperation(project, {
				operation: "remove",
				id: "test-remove-2",
				selector: {
					type: "identifier",
					name: "unusedVariable",
					kind: "variable",
					filePath: fixtureFile,
				},
				reason: "Variable is unused",
			})

			// Check that the operation was successful
			expect(result.success).toBe(true)
			expect(result.affectedFiles).toContain(fixtureFile)

			// Verify that the variable was removed
			const sourceFile = project.getSourceFile(fixtureFile)
			expect(sourceFile).not.toBeUndefined()

			// The variable should no longer be present in the file
			const fileText = sourceFile!.getFullText()
			expect(fileText).not.toContain("const unusedVariable =")

			// The kept variable should still exist
			expect(fileText).toContain("const keepVariable =")
		})
	})

	describe("removing a method", () => {
		it("should remove a class method", async () => {
			// Execute the remove operation
			const result = await executeRemoveOperation(project, {
				operation: "remove",
				id: "test-remove-3",
				selector: {
					type: "identifier",
					name: "unusedMethod",
					kind: "method",
					filePath: fixtureFile,
					parent: {
						name: "TestClass",
						kind: "class",
					},
				},
				reason: "Method is unused",
			})

			// Check that the operation was successful
			expect(result.success).toBe(true)
			expect(result.affectedFiles).toContain(fixtureFile)

			// Verify that the method was removed
			const sourceFile = project.getSourceFile(fixtureFile)
			expect(sourceFile).not.toBeUndefined()

			// Get the class
			const testClass = sourceFile!.getClass("TestClass")
			expect(testClass).not.toBeUndefined()

			// The removed method should no longer exist
			expect(testClass!.getMethod("unusedMethod")).toBeUndefined()

			// The kept method should still exist
			expect(testClass!.getMethod("keepMethod")).not.toBeUndefined()
		})
	})

	describe("removing an exported variable", () => {
		it("should remove an exported variable", async () => {
			// Execute the remove operation
			const result = await executeRemoveOperation(project, {
				operation: "remove",
				id: "test-remove-4",
				selector: {
					type: "identifier",
					name: "exportedUnused",
					kind: "variable",
					filePath: fixtureFile,
				},
				reason: "Exported variable is unused",
			})

			// Check that the operation was successful
			expect(result.success).toBe(true)
			expect(result.affectedFiles).toContain(fixtureFile)

			// Verify that the variable was removed
			const sourceFile = project.getSourceFile(fixtureFile)
			expect(sourceFile).not.toBeUndefined()

			// The variable should no longer be present in the file
			const fileText = sourceFile!.getFullText()
			expect(fileText).not.toContain("export const exportedUnused =")
		})
	})

	describe("error handling", () => {
		it("should handle non-existent symbols", async () => {
			// Try to remove a symbol that doesn't exist
			const result = await executeRemoveOperation(project, {
				operation: "remove",
				id: "test-remove-error-1",
				selector: {
					type: "identifier",
					name: "nonExistentFunction",
					kind: "function",
					filePath: fixtureFile,
				},
				reason: "Testing error handling",
			})

			// Check that the operation failed
			expect(result.success).toBe(false)
			expect(result.error).toContain("not found")
		})

		it("should handle non-existent files", async () => {
			// Try to remove from a file that doesn't exist
			const result = await executeRemoveOperation(project, {
				operation: "remove",
				id: "test-remove-error-2",
				selector: {
					type: "identifier",
					name: "unusedFunction",
					kind: "function",
					filePath: path.join(tempDir, "non-existent-file.ts"),
				},
				reason: "Testing file error handling",
			})

			// Check that the operation failed
			expect(result.success).toBe(false)
			expect(result.error).toContain("not found")
		})
	})
})
