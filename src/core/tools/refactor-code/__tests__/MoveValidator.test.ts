import { Project } from "ts-morph"
import { MoveValidator } from "../operations/MoveValidator"
import { MoveOperation } from "../schema"
import * as fs from "fs"
import * as path from "path"

// Mock fs and path modules
jest.mock("fs", () => ({
	existsSync: jest.fn(),
	writeFileSync: jest.fn(),
	unlinkSync: jest.fn(),
	readFileSync: jest.fn(),
}))

jest.mock("path", () => {
	const originalPath = jest.requireActual("path")
	return {
		...originalPath,
		dirname: jest.fn(originalPath.dirname),
		join: jest.fn(originalPath.join),
	}
})

// Mock ts-morph Project and related classes
jest.mock("ts-morph", () => {
	// Create a mock source file
	const mockSourceFile = {
		getFilePath: jest.fn().mockReturnValue("/project/src/file.ts"),
		getFullText: jest.fn().mockReturnValue("function testFunction() { return true; }"),
		getImportDeclarations: jest.fn().mockReturnValue([]),
		getNamedImports: jest.fn().mockReturnValue([]),
		getName: jest.fn().mockReturnValue("testFunction"),
	}

	// Create a mock target file
	const mockTargetFile = {
		getFilePath: jest.fn().mockReturnValue("/project/src/target.ts"),
		getFullText: jest.fn().mockReturnValue(""),
		getImportDeclarations: jest.fn().mockReturnValue([]),
		getNamedImports: jest.fn().mockReturnValue([]),
		getName: jest.fn().mockReturnValue(""),
	}

	return {
		Project: jest.fn().mockImplementation(() => ({
			getCompilerOptions: jest.fn().mockReturnValue({ rootDir: "/project" }),
			getSourceFile: jest.fn().mockImplementation((path) => {
				if (path && path.includes("target")) {
					return mockTargetFile
				}
				return mockSourceFile
			}),
			addSourceFileAtPath: jest.fn().mockReturnValue(mockSourceFile),
		})),
		Node: {
			isFunctionDeclaration: jest.fn(),
			isClassDeclaration: jest.fn(),
		},
	}
})

// Mock FileManager to return a source file
jest.mock("../utils/FileManager", () => {
	return {
		FileManager: jest.fn().mockImplementation(() => ({
			ensureFileInProject: jest.fn().mockResolvedValue({
				getFilePath: jest.fn().mockReturnValue("/project/src/file.ts"),
				getFullText: jest.fn().mockReturnValue("function testFunction() { return true; }"),
				getImportDeclarations: jest.fn().mockReturnValue([]),
				getNamedImports: jest.fn().mockReturnValue([]),
				getName: jest.fn().mockReturnValue("testFunction"),
			}),
			createFileIfNeeded: jest.fn().mockResolvedValue({
				getFilePath: jest.fn().mockReturnValue("/project/src/target.ts"),
				getFullText: jest.fn().mockReturnValue(""),
				getImportDeclarations: jest.fn().mockReturnValue([]),
				getNamedImports: jest.fn().mockReturnValue([]),
				getName: jest.fn().mockReturnValue(""),
			}),
		})),
	}
})

// Mock SymbolResolver to return a resolved symbol
jest.mock("../core/SymbolResolver", () => {
	return {
		SymbolResolver: jest.fn().mockImplementation(() => ({
			resolveSymbol: jest.fn().mockReturnValue({
				name: "testFunction",
				kind: "function",
				filePath: "/project/src/file.ts",
				node: {
					getKindName: jest.fn().mockReturnValue("FunctionDeclaration"),
					getText: jest.fn().mockReturnValue("function testFunction() { return true; }"),
				},
			}),
			validateForMove: jest.fn().mockReturnValue({
				canProceed: true,
				blockers: [],
				warnings: [],
			}),
		})),
	}
})

describe("MoveValidator", () => {
	let project: Project
	let validator: MoveValidator
	let mockOperation: MoveOperation

	beforeEach(() => {
		jest.clearAllMocks()

		project = new Project()
		validator = new MoveValidator(project)

		// Create a basic mock operation
		mockOperation = {
			operation: "move",
			selector: {
				type: "identifier",
				name: "testFunction",
				kind: "function",
				filePath: "/project/src/file.ts",
			},
			targetFilePath: "/project/src/target.ts",
		} as MoveOperation

		// Default mock implementations
		;(fs.existsSync as jest.Mock).mockReturnValue(true)
	})

	describe("validateParameters", () => {
		it("should return success when all parameters are valid", async () => {
			const result = await validator.validate(mockOperation)
			expect(result.success).toBe(true)
		})

		it("should fail when source file path is empty", async () => {
			mockOperation.selector.filePath = ""
			const result = await validator.validate(mockOperation)
			expect(result.success).toBe(false)
			expect(result.error).toContain("Source file path cannot be empty")
		})

		it("should fail when target file path is empty", async () => {
			mockOperation.targetFilePath = ""
			const result = await validator.validate(mockOperation)
			expect(result.success).toBe(false)
			expect(result.error).toContain("Target file path cannot be empty")
		})

		it("should fail when symbol name is empty", async () => {
			mockOperation.selector.name = ""
			const result = await validator.validate(mockOperation)
			expect(result.success).toBe(false)
			expect(result.error).toContain("Symbol name cannot be empty")
		})

		it("should fail when source file doesn't exist", async () => {
			;(fs.existsSync as jest.Mock).mockImplementation((path) => {
				return !path.includes("file.ts")
			})

			const result = await validator.validate(mockOperation)
			expect(result.success).toBe(false)
			expect(result.error).toContain("Source file does not exist")
		})

		it("should fail when source and target files are the same", async () => {
			mockOperation.targetFilePath = mockOperation.selector.filePath
			const result = await validator.validate(mockOperation)
			expect(result.success).toBe(false)
			expect(result.error).toContain("Cannot move symbol to the same file")
		})
	})

	// Note: In a real test environment, we would have more comprehensive tests for:
	// - validateSourceFile
	// - validateSymbol
	// - validateTargetLocation
	// Those would require more complex mocks for ts-morph's Project, SourceFile, etc.
	// For this basic test file, we've focused on parameter validation which is more straightforward.
})
