import { Project, ScriptTarget } from "ts-morph"
import { executeMoveOperation } from "../move"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"

describe("executeMoveOperation", () => {
	let project: Project
	let tempDir: string
	let sourceFile: string
	let targetFile: string
	let importingFile: string

	beforeEach(() => {
		// Create a temporary directory for test files
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "move-operation-test-"))

		// Copy the fixture files to the temp directory
		const sourceFixture = path.join(__dirname, "fixtures", "move", "single-file.ts")
		const targetFixture = path.join(__dirname, "fixtures", "move", "target-file.ts")
		const importingFixture = path.join(__dirname, "fixtures", "move", "importing-file.ts")

		sourceFile = path.join(tempDir, "single-file.ts")
		targetFile = path.join(tempDir, "target-file.ts")
		importingFile = path.join(tempDir, "importing-file.ts")

		// Create copies of the fixtures with fresh content to avoid modifying the originals
		const sourceContent = fs.readFileSync(sourceFixture, "utf-8")
		const targetContent = fs.readFileSync(targetFixture, "utf-8")
		const importingContent = fs.readFileSync(importingFixture, "utf-8")

		fs.writeFileSync(sourceFile, sourceContent)
		fs.writeFileSync(targetFile, targetContent)
		fs.writeFileSync(importingFile, importingContent)

		// Set up the project
		project = new Project({
			compilerOptions: {
				target: ScriptTarget.ES2020,
			},
		})

		// Add the fixture files to the project
		project.addSourceFileAtPath(sourceFile)
		project.addSourceFileAtPath(targetFile)
		project.addSourceFileAtPath(importingFile)
	})

	afterEach(async () => {
		// Clean up temp directory
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true })
		}
	})

	describe("moving a function", () => {
		it("should move a function to another file", async () => {
			// Execute the move operation
			const result = await executeMoveOperation(project, {
				operation: "move",
				id: "test-move-1",
				selector: {
					type: "identifier",
					name: "moveableFunction",
					kind: "function",
					filePath: sourceFile,
				},
				targetFilePath: targetFile,
				reason: "Moving function to target file",
			})

			// Check that the operation was successful
			expect(result.success).toBe(true)
			expect(result.affectedFiles).toContain(sourceFile)
			expect(result.affectedFiles).toContain(targetFile)
			expect(result.affectedFiles).toContain(importingFile)

			// Verify that the function was moved
			const sourceModule = project.getSourceFile(sourceFile)
			const targetModule = project.getSourceFile(targetFile)
			expect(sourceModule).not.toBeUndefined()
			expect(targetModule).not.toBeUndefined()

			// The function should no longer exist in the source file
			expect(sourceModule!.getFunction("moveableFunction")).toBeUndefined()

			// The function should exist in the target file
			expect(targetModule!.getFunction("moveableFunction")).not.toBeUndefined()

			// The importing file should now import from the target file
			const importingModule = project.getSourceFile(importingFile)
			const importDeclarations = importingModule!.getImportDeclarations()

			// Check if there's an import from the target file for the moved function
			const hasTargetImport = importDeclarations.some(
				(importDecl) =>
					importDecl.getModuleSpecifierValue().includes("target-file") &&
					importDecl.getNamedImports().some((namedImport) => namedImport.getName() === "moveableFunction"),
			)

			expect(hasTargetImport).toBe(true)
		})
	})

	describe("moving a class", () => {
		it("should move a class to another file", async () => {
			// Execute the move operation
			const result = await executeMoveOperation(project, {
				operation: "move",
				id: "test-move-2",
				selector: {
					type: "identifier",
					name: "MoveableClass",
					kind: "class",
					filePath: sourceFile,
				},
				targetFilePath: targetFile,
				reason: "Moving class to target file",
			})

			// Check that the operation was successful
			expect(result.success).toBe(true)
			expect(result.affectedFiles).toContain(sourceFile)
			expect(result.affectedFiles).toContain(targetFile)
			expect(result.affectedFiles).toContain(importingFile)

			// Verify that the class was moved
			const sourceModule = project.getSourceFile(sourceFile)
			const targetModule = project.getSourceFile(targetFile)
			expect(sourceModule).not.toBeUndefined()
			expect(targetModule).not.toBeUndefined()

			// The class should no longer exist in the source file
			expect(sourceModule!.getClass("MoveableClass")).toBeUndefined()

			// The class should exist in the target file
			expect(targetModule!.getClass("MoveableClass")).not.toBeUndefined()

			// The importing file should now import from the target file
			const importingModule = project.getSourceFile(importingFile)
			const importDeclarations = importingModule!.getImportDeclarations()

			// Check if there's an import from the target file for the moved class
			const hasTargetImport = importDeclarations.some(
				(importDecl) =>
					importDecl.getModuleSpecifierValue().includes("target-file") &&
					importDecl.getNamedImports().some((namedImport) => namedImport.getName() === "MoveableClass"),
			)

			expect(hasTargetImport).toBe(true)
		})
	})

	describe("moving a variable", () => {
		it("should move a variable to another file", async () => {
			// Execute the move operation
			const result = await executeMoveOperation(project, {
				operation: "move",
				id: "test-move-3",
				selector: {
					type: "identifier",
					name: "moveableVariable",
					kind: "variable",
					filePath: sourceFile,
				},
				targetFilePath: targetFile,
				reason: "Moving variable to target file",
			})

			// Check that the operation was successful
			expect(result.success).toBe(true)
			expect(result.affectedFiles).toContain(sourceFile)
			expect(result.affectedFiles).toContain(targetFile)

			// Verify that the variable was moved
			const sourceFileText = project.getSourceFile(sourceFile)!.getFullText()
			const targetFileText = project.getSourceFile(targetFile)!.getFullText()

			// The variable should no longer exist in the source file
			expect(sourceFileText).not.toContain("moveableVariable =")

			// The variable should exist in the target file
			expect(targetFileText).toContain("moveableVariable =")
			expect(targetFileText).toContain("This will be moved")
		})
	})

	describe("moving a type", () => {
		it("should move a type to another file", async () => {
			// Execute the move operation
			const result = await executeMoveOperation(project, {
				operation: "move",
				id: "test-move-4",
				selector: {
					type: "identifier",
					name: "MoveableType",
					kind: "type",
					filePath: sourceFile,
				},
				targetFilePath: targetFile,
				reason: "Moving type to target file",
			})

			// Check that the operation was successful
			expect(result.success).toBe(true)
			expect(result.affectedFiles).toContain(sourceFile)
			expect(result.affectedFiles).toContain(targetFile)

			// Verify that the type was moved
			const sourceFileText = project.getSourceFile(sourceFile)!.getFullText()
			const targetFileText = project.getSourceFile(targetFile)!.getFullText()

			// The type should no longer exist in the source file
			expect(sourceFileText).not.toContain("type MoveableType =")

			// The type should exist in the target file
			expect(targetFileText).toContain("type MoveableType =")
			expect(targetFileText).toContain("id: number")
			expect(targetFileText).toContain("name: string")
		})
	})

	describe("error handling", () => {
		it("should handle non-existent symbols", async () => {
			// Try to move a symbol that doesn't exist
			const result = await executeMoveOperation(project, {
				operation: "move",
				id: "test-move-error-1",
				selector: {
					type: "identifier",
					name: "nonExistentFunction",
					kind: "function",
					filePath: sourceFile,
				},
				targetFilePath: targetFile,
				reason: "Testing error handling",
			})

			// Check that the operation failed
			expect(result.success).toBe(false)
			expect(result.error).toContain("not found")
		})

		it("should handle naming conflicts in target file", async () => {
			// First create a function with the same name in the target file
			const targetSourceFile = project.getSourceFile(targetFile)
			targetSourceFile!.addFunction({
				name: "moveableFunction",
				parameters: [],
				statements: [`return "This will cause a conflict";`],
			})

			// Try to move a function with a name that already exists in the target
			const result = await executeMoveOperation(project, {
				operation: "move",
				id: "test-move-error-2",
				selector: {
					type: "identifier",
					name: "moveableFunction",
					kind: "function",
					filePath: sourceFile,
				},
				targetFilePath: targetFile,
				reason: "Testing naming conflict",
			})

			// Check that the operation failed
			expect(result.success).toBe(false)
			expect(result.error).toContain("Naming conflict")
		})

		it("should handle moving to a non-existent target file by creating it", async () => {
			// Create a path to a non-existent file
			const newTargetFile = path.join(tempDir, "new-target-file.ts")

			// Try to move a function to a non-existent file
			const result = await executeMoveOperation(project, {
				operation: "move",
				id: "test-move-5",
				selector: {
					type: "identifier",
					name: "moveableFunction",
					kind: "function",
					filePath: sourceFile,
				},
				targetFilePath: newTargetFile,
				reason: "Testing creating new target file",
			})

			// Check that the operation was successful
			expect(result.success).toBe(true)
			expect(result.affectedFiles).toContain(sourceFile)
			expect(result.affectedFiles).toContain(newTargetFile)

			// Verify that the new file was created
			expect(fs.existsSync(newTargetFile)).toBe(true)

			// Get the file from the project and check its content
			const targetSourceFile = project.getSourceFile(newTargetFile)
			expect(targetSourceFile).not.toBeUndefined()

			// Check that the function exists in the target file
			const movedFunction = targetSourceFile!.getFunction("moveableFunction")
			expect(movedFunction).not.toBeUndefined()
		})

		it("should handle attempts to move to the same file", async () => {
			// Try to move to the same file
			const result = await executeMoveOperation(project, {
				operation: "move",
				id: "test-move-error-3",
				selector: {
					type: "identifier",
					name: "moveableFunction",
					kind: "function",
					filePath: sourceFile,
				},
				targetFilePath: sourceFile,
				reason: "Testing same file error",
			})

			// Check that the operation failed
			expect(result.success).toBe(false)
			expect(result.error).toContain("Cannot move symbol to the same file")
		})
	})
})
