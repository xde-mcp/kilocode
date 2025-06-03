import { Project, ScriptTarget } from "ts-morph"
import { MoveOrchestrator } from "../MoveOrchestrator"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"

describe("MoveOrchestrator.executeMoveOperation", () => {
	let project: Project
	let tempDir: string
	let sourceFile: string
	let targetFile: string
	let importingFile: string
	let testStartTime: number

	// Helper function to measure and log execution time
	const logExecutionTime = (testName: string) => {
		const endTime = Date.now()
		const executionTime = endTime - testStartTime
		console.log(`[PERF] ${testName} execution time: ${executionTime}ms`)
		return executionTime
	}

	beforeEach(() => {
		// Start timing
		testStartTime = Date.now()

		// Create a temporary directory for test files
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "move-operation-test-"))

		// Copy the fixture files to the temp directory
		const sourceFixture = path.join(__dirname, "fixtures", "move", "single-file.ts")
		const targetFixture = path.join(__dirname, "fixtures", "move", "target-file.ts")
		const importingFixture = path.join(__dirname, "fixtures", "move", "importing-file.ts")

		sourceFile = path.join(tempDir, "single-file.ts")
		targetFile = path.join(tempDir, "target-file.ts")
		importingFile = path.join(tempDir, "importing-file.ts")

		// Create copies of the fixtures in the temp directory
		// We don't need to read the fixtures here since we'll do it later
		fs.mkdirSync(path.dirname(sourceFile), { recursive: true })
		fs.mkdirSync(path.dirname(targetFile), { recursive: true })
		fs.mkdirSync(path.dirname(importingFile), { recursive: true })

		// Set up the project with completely isolated configuration
		project = new Project({
			compilerOptions: {
				target: ScriptTarget.ES2020,
				// Add more compiler options to ensure isolation
				moduleResolution: 99, // Use 99 for NodeNext
				module: 99, // Use 99 for NodeNext
				esModuleInterop: true,
				skipLibCheck: true,
				noResolve: true, // Prevent resolving external modules
			},
			// Ensure complete isolation from the project's tsconfig
			tsConfigFilePath: undefined,
			skipAddingFilesFromTsConfig: true,
			useInMemoryFileSystem: true, // Use in-memory file system for better isolation
		})

		// Add only the fixture files to the project
		// Use createSourceFile instead of addSourceFileAtPath for better isolation
		// Read the original fixture content
		const sourceFixtureContent = fs.readFileSync(sourceFixture, "utf-8")
		const targetFixtureContent = fs.readFileSync(targetFixture, "utf-8")
		const importingFixtureContent = fs.readFileSync(importingFixture, "utf-8")

		// Write to the temp files
		fs.writeFileSync(sourceFile, sourceFixtureContent)
		fs.writeFileSync(targetFile, targetFixtureContent)
		fs.writeFileSync(importingFile, importingFixtureContent)

		// Create the files in the project's in-memory file system
		project.createSourceFile(sourceFile, sourceFixtureContent)
		project.createSourceFile(targetFile, targetFixtureContent)
		project.createSourceFile(importingFile, importingFixtureContent)

		console.log(`[PERF] Test setup time: ${Date.now() - testStartTime}ms`)
	})

	afterEach(async () => {
		// Clean up temp directory
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true })
		}

		// Clear the project to free memory
		if (project) {
			// Remove each source file individually
			project.getSourceFiles().forEach((file) => {
				project.removeSourceFile(file)
			})
			// @ts-ignore - We're intentionally setting this to undefined in the test
			project = undefined
		}

		// Force garbage collection if available
		if (global.gc) {
			try {
				global.gc()
			} catch (e) {
				// Ignore if gc is not available
			}
		}
	})

	describe("moving a function", () => {
		it("should move a function to another file", async () => {
			jest.setTimeout(30000) // Increase timeout for file operations

			// Reset timer for the actual operation
			testStartTime = Date.now()

			// Execute the move operation
			const orchestrator = new MoveOrchestrator(project)
			const result = await orchestrator.executeMoveOperation({
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

			// Log execution time
			const executionTime = logExecutionTime("Move function operation")

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
			jest.setTimeout(30000) // Increase timeout for file operations

			// Reset timer for the actual operation
			testStartTime = Date.now()

			// Execute the move operation
			const orchestrator = new MoveOrchestrator(project)
			const result = await orchestrator.executeMoveOperation({
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

			// Log execution time
			const executionTime = logExecutionTime("Move class operation")

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
			jest.setTimeout(30000) // Increase timeout for file operations

			// Reset timer for the actual operation
			testStartTime = Date.now()

			// Execute the move operation
			const orchestrator = new MoveOrchestrator(project)
			const result = await orchestrator.executeMoveOperation({
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

			// Log execution time
			const executionTime = logExecutionTime("Move variable operation")

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
			jest.setTimeout(30000) // Increase timeout for file operations

			// Reset timer for the actual operation
			testStartTime = Date.now()

			// Execute the move operation
			const orchestrator = new MoveOrchestrator(project)
			const result = await orchestrator.executeMoveOperation({
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

			// Log execution time
			const executionTime = logExecutionTime("Move type operation")

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
			jest.setTimeout(30000) // Increase timeout for file operations
			// Try to move a symbol that doesn't exist
			const orchestrator = new MoveOrchestrator(project)
			const result = await orchestrator.executeMoveOperation({
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
			jest.setTimeout(30000) // Increase timeout for file operations
			// First create a function with the same name in the target file
			const targetSourceFile = project.getSourceFile(targetFile)
			targetSourceFile!.addFunction({
				name: "moveableFunction",
				parameters: [],
				statements: [`return "This will cause a conflict";`],
			})

			// Try to move a function with a name that already exists in the target
			const orchestrator = new MoveOrchestrator(project)
			const result = await orchestrator.executeMoveOperation({
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
			jest.setTimeout(30000) // Increase timeout for file operations

			// Create a path to a non-existent file
			const newTargetFile = path.join(tempDir, "new-target-file.ts")

			// Reset timer for the actual operation
			testStartTime = Date.now()

			// Try to move a function to a non-existent file
			const orchestrator = new MoveOrchestrator(project)
			const result = await orchestrator.executeMoveOperation({
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

			// Log execution time
			const executionTime = logExecutionTime("Create new target file operation")

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
			jest.setTimeout(30000) // Increase timeout for file operations

			// Reset timer for the actual operation
			testStartTime = Date.now()

			// Try to move to the same file
			const orchestrator = new MoveOrchestrator(project)
			const result = await orchestrator.executeMoveOperation({
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

			// Log execution time
			const executionTime = logExecutionTime("Same file error handling")

			// Check that the operation failed
			expect(result.success).toBe(false)
			expect(result.error).toContain("Cannot move symbol to the same file")
		})
	})
})
