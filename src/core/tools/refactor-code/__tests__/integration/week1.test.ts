import { Project, SourceFile } from "ts-morph"
import { PathResolver } from "../../utils/PathResolver"
import { SymbolResolver } from "../../core/SymbolResolver"
import { FileManager } from "../../utils/FileManager"
import { IdentifierSelector } from "../../schema"
import * as path from "path"

// Mock fs functions to work with in-memory filesystem
jest.mock("../../utils/file-system", () => ({
	ensureDirectoryExists: jest.fn().mockResolvedValue(undefined),
	writeFile: jest.fn().mockImplementation((filePath, content) => Promise.resolve()),
	readFile: jest.fn().mockResolvedValue("mocked content"),
}))

// Mock fs synchronous functions used in FileManager
jest.mock("fs", () => ({
	existsSync: jest.fn().mockReturnValue(true),
	readFileSync: jest.fn().mockReturnValue("mocked content"),
	readdirSync: jest.fn().mockReturnValue(["test.ts", "user.ts"]),
}))

describe("Refactor Tool Foundation Integration", () => {
	// Use in-memory file system for tests
	const project = new Project({ useInMemoryFileSystem: true })
	const pathResolver = new PathResolver("/project/root")
	const symbolResolver = new SymbolResolver(project)
	const fileManager = new FileManager(project, pathResolver)

	beforeEach(() => {
		// Create some test files in the project for testing
		project.createSourceFile(
			"src/test.ts",
			`
        export function testFunction() {
          return "test"
        }
        
        export interface TestInterface {
          id: number
          name: string
        }
        
        export class TestClass {
          private value: string
          
          constructor(value: string) {
            this.value = value
          }
          
          getValue(): string {
            return this.value
          }
        }
      `,
		)

		project.createSourceFile(
			"src/user.ts",
			`
        import { TestInterface } from "./test"
        
        export function createUser(data: TestInterface) {
          return {
            ...data,
            createdAt: new Date()
          }
        }
      `,
		)
	})

	afterEach(() => {
		// Clear the project after each test
		for (const sourceFile of project.getSourceFiles()) {
			project.removeSourceFile(sourceFile)
		}
	})

	test("PathResolver properly handles paths", () => {
		// Test normalized paths
		const normalizedPath = pathResolver.normalizeFilePath("src\\test.ts")
		expect(normalizedPath).toBe("src/test.ts")

		// Test absolute paths
		const absolutePath = pathResolver.resolveAbsolutePath("src/test.ts")
		expect(absolutePath).toBe("/project/root/src/test.ts")

		// Test relative import paths
		const relativePath = pathResolver.getRelativeImportPath(
			"/project/root/src/user.ts",
			"/project/root/src/test.ts",
		)
		expect(relativePath).toBe("./test")

		// Test path existence (will be false in in-memory filesystem)
		const pathExists = pathResolver.pathExists("src/test.ts")
		expect(pathExists).toBe(false) // Because the path exists in in-memory fs but not in real fs
	})

	test("SymbolResolver can find and validate symbols", () => {
		const testFile = project.getSourceFile("src/test.ts")!

		// Create selector for finding the function
		const functionSelector: IdentifierSelector = {
			type: "identifier",
			name: "testFunction",
			filePath: "src/test.ts",
			kind: "function",
		}

		// Test finding a function
		const functionSymbol = symbolResolver.resolveSymbol(functionSelector, testFile)
		expect(functionSymbol).not.toBeNull()
		expect(functionSymbol!.name).toBe("testFunction")
		expect(functionSymbol!.isExported).toBe(true)

		// Create selector for finding the class
		const classSelector: IdentifierSelector = {
			type: "identifier",
			name: "TestClass",
			filePath: "src/test.ts",
			kind: "class",
		}

		// Test finding a class
		const classSymbol = symbolResolver.resolveSymbol(classSelector, testFile)
		expect(classSymbol).not.toBeNull()
		expect(classSymbol!.name).toBe("TestClass")

		// Test validation for move
		const moveValidation = symbolResolver.validateForMove(functionSymbol!)
		expect(moveValidation.canProceed).toBe(true)

		// Create selector for finding the interface
		const interfaceSelector: IdentifierSelector = {
			type: "identifier",
			name: "TestInterface",
			filePath: "src/test.ts",
			kind: "interface",
		}

		// Test validation with references
		const interfaceSymbol = symbolResolver.resolveSymbol(interfaceSelector, testFile)
		expect(interfaceSymbol).not.toBeNull()

		// This should detect the reference in user.ts
		const references = symbolResolver.findExternalReferences(interfaceSymbol!)
		expect(references.length).toBeGreaterThan(0)
		expect(references[0].filePath).toContain("user.ts")

		// Test removal validation
		const removalValidation = symbolResolver.validateForRemoval(interfaceSymbol!)
		expect(removalValidation.canProceed).toBe(false)
		expect(removalValidation.blockers[0]).toContain("referenced in")
	})

	test("FileManager can handle file operations", async () => {
		// Test creating a new file
		const newFile = await fileManager.createFileIfNeeded("src/newfile.ts", 'export const test = "Hello World"')
		expect(newFile).not.toBeNull()
		expect(project.getSourceFile("src/newfile.ts")).toBe(newFile)

		// Test reading file content
		const content = project.getSourceFile("src/newfile.ts")!.getFullText()
		expect(content).toContain("Hello World")

		// Test ensuring a file is in the project
		const existingFile = await fileManager.ensureFileInProject("src/test.ts")
		expect(existingFile).not.toBeNull()
		expect(existingFile!.getFilePath()).toContain("src/test.ts")

		// Test writing to file
		await fileManager.writeToFile("src/newfile.ts", 'export const updatedTest = "Updated Content"')
		const updatedContent = project.getSourceFile("src/newfile.ts")!.getFullText()
		expect(updatedContent).toContain("Updated Content")
		expect(updatedContent).not.toContain("Hello World")
	})

	test("All modules work together in a typical refactor scenario", async () => {
		// 1. Find a symbol
		const testFile = project.getSourceFile("src/test.ts")!
		const functionSelector: IdentifierSelector = {
			type: "identifier",
			name: "testFunction",
			filePath: "src/test.ts",
			kind: "function",
		}

		const functionSymbol = symbolResolver.resolveSymbol(functionSelector, testFile)
		expect(functionSymbol).not.toBeNull()

		// 2. Validate it can be moved
		const moveValidation = symbolResolver.validateForMove(functionSymbol!)
		expect(moveValidation.canProceed).toBe(true)

		// 3. Create a target file using normalized path
		const normalizedPath = pathResolver.normalizeFilePath("src/target.ts")
		const targetFile = await fileManager.createFileIfNeeded(normalizedPath)
		expect(targetFile).not.toBeNull()

		// 4. Create symbol content and write to the target file
		const symbolText = 'export function testFunction() {\n  return "test"\n}'
		await fileManager.writeToFile(normalizedPath, symbolText)

		// 5. Verify the content was written correctly
		const content = project.getSourceFile(normalizedPath)!.getFullText()
		expect(content).toContain("function testFunction")
		expect(content).toContain('return "test"')

		// 6. Ensure we can resolve the symbol in the new location
		const movedFunctionSelector: IdentifierSelector = {
			type: "identifier",
			name: "testFunction",
			filePath: normalizedPath,
			kind: "function",
		}

		const movedSymbol = symbolResolver.resolveSymbol(movedFunctionSelector, project.getSourceFile(normalizedPath)!)
		expect(movedSymbol).not.toBeNull()
		expect(movedSymbol!.name).toBe("testFunction")
		expect(movedSymbol!.isExported).toBe(true)
	})
})
