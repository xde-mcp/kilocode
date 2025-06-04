import { Project, SourceFile, Node } from "ts-morph"
import { MoveOrchestrator } from "../MoveOrchestrator"
import { MoveOperation } from "../../schema"
import { PathResolver } from "../../utils/PathResolver"
import { FileManager } from "../../utils/FileManager"
import { SymbolResolver } from "../../core/SymbolResolver"
import { SymbolExtractor } from "../../core/SymbolExtractor"
import { SymbolRemover } from "../../core/SymbolRemover"
import { ImportManager } from "../../utils/import-manager"
import { ResolvedSymbol, RemovalResult, ValidationResult, ExtractedSymbol, SymbolDependencies } from "../../core/types"

// Mock dependencies
jest.mock("../../utils/PathResolver")
jest.mock("../../utils/FileManager")
jest.mock("../../core/SymbolResolver")
jest.mock("../../core/SymbolExtractor")
jest.mock("../../core/SymbolRemover")
jest.mock("../../utils/import-manager")

describe("MoveOrchestrator", () => {
	// Test fixtures
	const mockProject = {
		getCompilerOptions: jest.fn().mockReturnValue({ rootDir: "/project/root" }),
		getSourceFile: jest.fn(),
		addSourceFileAtPath: jest.fn(),
		getSourceFiles: jest.fn().mockReturnValue([]),
		save: jest.fn(),
	} as unknown as Project

	const mockSourceFile = {
		getFullText: jest.fn().mockReturnValue("function testFunction() { return true; }"),
		// Add missing methods needed by MoveValidator
		getFunction: jest.fn().mockReturnValue(undefined),
		getClass: jest.fn().mockReturnValue(undefined),
		getInterface: jest.fn().mockReturnValue(undefined),
		getTypeAlias: jest.fn().mockReturnValue(undefined),
		getEnum: jest.fn().mockReturnValue(undefined),
	} as unknown as SourceFile

	const mockTargetFile = {
		getFullText: jest.fn().mockReturnValue("// Target file content"),
		// Add missing methods needed by MoveValidator
		getFunction: jest.fn().mockReturnValue(undefined),
		getClass: jest.fn().mockReturnValue(undefined),
		getInterface: jest.fn().mockReturnValue(undefined),
		getTypeAlias: jest.fn().mockReturnValue(undefined),
		getEnum: jest.fn().mockReturnValue(undefined),
	} as unknown as SourceFile

	const mockNode = {
		getAncestors: jest.fn().mockReturnValue([]),
		getParent: jest.fn().mockReturnValue(undefined),
	} as unknown as Node

	const mockSymbol: ResolvedSymbol = {
		node: mockNode,
		name: "testFunction",
		isExported: true,
		filePath: "/project/root/src/file.ts",
	}

	const mockDependencies: SymbolDependencies = {
		imports: new Map(),
		types: [],
		localReferences: [],
	}

	const mockExtractedSymbol: ExtractedSymbol = {
		text: "function testFunction() { return true; }",
		comments: [],
		dependencies: mockDependencies,
		isExported: true,
	}

	const mockOperation: MoveOperation = {
		operation: "move",
		selector: {
			type: "identifier",
			name: "testFunction",
			kind: "function",
			filePath: "src/file.ts",
		},
		targetFilePath: "src/target/file.ts",
		id: "test-move-operation",
	}

	// Mock implementations
	const mockNormalizeFilePath = jest
		.fn()
		.mockImplementation((path) => (path === "src/file.ts" ? "src/file.ts" : "src/target/file.ts"))

	const mockIsTestEnvironment = jest.fn().mockImplementation((path) => {
		return path && (path.includes("test") || path.includes("__tests__") || path.includes("__mocks__"))
	})

	const mockEnsureFileInProject = jest.fn().mockImplementation((path) => {
		if (path === "src/file.ts") return Promise.resolve(mockSourceFile)
		if (path === "src/target/file.ts") return Promise.resolve(mockTargetFile)
		return Promise.resolve(null)
	})

	const mockCreateFileIfNeeded = jest.fn().mockResolvedValue(mockTargetFile)
	const mockWriteToFile = jest.fn().mockResolvedValue(true)
	const mockResolveSymbol = jest.fn().mockReturnValue(mockSymbol)
	const mockValidateForMove = jest.fn().mockReturnValue({ canProceed: true, blockers: [], warnings: [] })
	const mockExtractSymbol = jest.fn().mockReturnValue(mockExtractedSymbol)
	const mockRemoveSymbol = jest
		.fn()
		.mockResolvedValue({ success: true, method: "standard", symbolStillExists: false })
	const mockUpdateImportsAfterMove = jest.fn().mockResolvedValue(undefined)
	const mockGetUpdatedFiles = jest.fn().mockReturnValue(["src/another/file.ts", "src/index.ts"])

	// Reset mocks before each test
	beforeEach(() => {
		jest.resetAllMocks()

		// Setup default mock implementations
		mockNormalizeFilePath.mockImplementation((path) =>
			path === "src/file.ts" ? "src/file.ts" : "src/target/file.ts",
		)
		mockEnsureFileInProject.mockImplementation((path) => {
			if (path === "src/file.ts") return Promise.resolve(mockSourceFile)
			if (path === "src/target/file.ts") return Promise.resolve(mockTargetFile)
			return Promise.resolve(null)
		})
		mockCreateFileIfNeeded.mockResolvedValue(mockTargetFile)
		mockWriteToFile.mockResolvedValue(true)
		mockResolveSymbol.mockReturnValue(mockSymbol)
		mockValidateForMove.mockReturnValue({ canProceed: true, blockers: [], warnings: [] })
		mockExtractSymbol.mockReturnValue(mockExtractedSymbol)
		mockRemoveSymbol.mockResolvedValue({ success: true, method: "standard", symbolStillExists: false })
		mockUpdateImportsAfterMove.mockResolvedValue(undefined)
		mockGetUpdatedFiles.mockReturnValue(["src/another/file.ts", "src/index.ts"])

		// Setup project mock
		;(mockProject.getSourceFile as jest.Mock).mockImplementation((path: string) => {
			if (path === "src/file.ts" || path.includes("file.ts")) return mockSourceFile
			if (path === "src/target/file.ts" || path.includes("target")) return mockTargetFile
			return undefined
		})

		// Assign mocks to prototypes
		PathResolver.prototype.normalizeFilePath = mockNormalizeFilePath
		PathResolver.prototype.isTestEnvironment = mockIsTestEnvironment
		FileManager.prototype.ensureFileInProject = mockEnsureFileInProject
		FileManager.prototype.createFileIfNeeded = mockCreateFileIfNeeded
		FileManager.prototype.writeToFile = mockWriteToFile
		SymbolResolver.prototype.resolveSymbol = mockResolveSymbol
		SymbolResolver.prototype.validateForMove = mockValidateForMove
		SymbolExtractor.prototype.extractSymbol = mockExtractSymbol
		SymbolRemover.prototype.removeSymbol = mockRemoveSymbol
		ImportManager.prototype.updateImportsAfterMove = mockUpdateImportsAfterMove
		ImportManager.prototype.getUpdatedFiles = mockGetUpdatedFiles
	})

	test("successfully moves a symbol", async () => {
		// Arrange
		const orchestrator = new MoveOrchestrator(mockProject)

		// Setup mocks for success case
		mockEnsureFileInProject.mockImplementation((path) => {
			if (path === "src/file.ts") return Promise.resolve(mockSourceFile)
			if (path === "src/target/file.ts") {
				// For verification, ensure target file has the symbol text
				const targetFileWithSymbol = {
					getFullText: jest.fn().mockReturnValue("function testFunction() { return true; }"),
				} as unknown as SourceFile
				return Promise.resolve(targetFileWithSymbol)
			}
			return Promise.resolve(null)
		})

		// Act
		const result = await orchestrator.executeMoveOperation(mockOperation)

		// Assert
		expect(result.success).toBe(true)
		expect(result.removalMethod).toBe("standard")
		expect(result.affectedFiles).toContain("src/file.ts")
		expect(result.affectedFiles).toContain("src/target/file.ts")
		expect(result.affectedFiles).toContain("src/another/file.ts")
		expect(result.affectedFiles).toContain("src/index.ts")

		expect(mockNormalizeFilePath).toHaveBeenCalledWith("src/file.ts")
		expect(mockNormalizeFilePath).toHaveBeenCalledWith("src/target/file.ts")
		expect(mockEnsureFileInProject).toHaveBeenCalledWith("src/file.ts")
		expect(mockCreateFileIfNeeded).toHaveBeenCalledWith("src/target/file.ts")
		expect(mockResolveSymbol).toHaveBeenCalledWith(mockOperation.selector, mockSourceFile)
		expect(mockValidateForMove).toHaveBeenCalledWith(mockSymbol)
		expect(mockExtractSymbol).toHaveBeenCalledWith(mockSymbol)
		expect(mockWriteToFile).toHaveBeenCalledWith(
			"src/target/file.ts",
			expect.stringContaining("function testFunction()"),
		)
		expect(mockRemoveSymbol).toHaveBeenCalledWith(mockSymbol)
		expect(mockUpdateImportsAfterMove).toHaveBeenCalledWith("testFunction", "src/file.ts", "src/target/file.ts")
	})

	test("validates target file path is provided", async () => {
		// Arrange
		const orchestrator = new MoveOrchestrator(mockProject)
		const invalidOperation = {
			...mockOperation,
			targetFilePath: "",
		}

		// Act
		const result = await orchestrator.executeMoveOperation(invalidOperation)

		// Assert
		expect(result.success).toBe(false)
		expect(result.error).toContain("Target file path is required")
		expect(mockEnsureFileInProject).not.toHaveBeenCalled()
		expect(mockResolveSymbol).not.toHaveBeenCalled()
	})

	test("validates source and target files are different", async () => {
		// Arrange
		const orchestrator = new MoveOrchestrator(mockProject)
		const invalidOperation = {
			...mockOperation,
			targetFilePath: "src/file.ts", // Same as source
		}

		// Act
		const result = await orchestrator.executeMoveOperation(invalidOperation)

		// Assert
		expect(result.success).toBe(false)
		expect(result.error).toContain("Cannot move symbol to the same file")
		expect(mockEnsureFileInProject).not.toHaveBeenCalled()
		expect(mockResolveSymbol).not.toHaveBeenCalled()
	})

	test("handles source file not found", async () => {
		// Arrange
		const orchestrator = new MoveOrchestrator(mockProject)

		// Reset the mock and provide a specific implementation for this test
		mockEnsureFileInProject.mockReset()
		mockEnsureFileInProject.mockImplementation((path) => {
			// Return null for the source file to simulate "not found"
			return Promise.resolve(null)
		})

		// Act
		const result = await orchestrator.executeMoveOperation(mockOperation)

		// Assert
		expect(result.success).toBe(false)
		expect(result.error).toContain("Source file not found")
		expect(mockResolveSymbol).not.toHaveBeenCalled()
		expect(mockCreateFileIfNeeded).not.toHaveBeenCalled()
	})

	test("handles symbol not found", async () => {
		// Arrange
		const orchestrator = new MoveOrchestrator(mockProject)

		// Reset mocks to ensure clean state
		mockResolveSymbol.mockReset()
		mockResolveSymbol.mockReturnValue(null)

		// Make sure source file is found
		mockEnsureFileInProject.mockImplementation((path) => {
			if (path === "src/file.ts") return Promise.resolve(mockSourceFile)
			return Promise.resolve(null)
		})

		// Act
		const result = await orchestrator.executeMoveOperation(mockOperation)

		// Assert
		expect(result.success).toBe(false)
		expect(result.error).toContain("Symbol 'testFunction' not found")
		expect(mockValidateForMove).not.toHaveBeenCalled()
		expect(mockCreateFileIfNeeded).not.toHaveBeenCalled()
	})

	test("handles validation failures", async () => {
		// Arrange
		const orchestrator = new MoveOrchestrator(mockProject)
		const validationResult: ValidationResult = {
			canProceed: false,
			blockers: ["Symbol is not a top-level declaration", "Symbol has local dependencies"],
			warnings: [],
		}

		// Reset mocks to ensure clean state
		mockValidateForMove.mockReset()
		mockValidateForMove.mockReturnValue(validationResult)

		// Make sure source file is found and symbol resolves
		mockEnsureFileInProject.mockImplementation((path) => {
			if (path === "src/file.ts") return Promise.resolve(mockSourceFile)
			return Promise.resolve(null)
		})
		mockResolveSymbol.mockReturnValue(mockSymbol)

		// Set up the normalizeFilePath to return the exact expected path
		mockNormalizeFilePath.mockImplementation((path) => "src/file.ts")

		// Act
		const result = await orchestrator.executeMoveOperation(mockOperation)

		// Assert
		expect(result.success).toBe(false)
		expect(result.error).toContain("Symbol is not a top-level declaration")
		expect(result.error).toContain("Symbol has local dependencies")
		// Accept either normalized path or full path based on what the implementation returns
		expect(result.affectedFiles.length).toBe(1)
		expect(result.affectedFiles[0]).toMatch(/src\/file\.ts$/)
		expect(mockCreateFileIfNeeded).not.toHaveBeenCalled()
		expect(mockExtractSymbol).not.toHaveBeenCalled()
	})

	test("handles symbol removal failures", async () => {
		// Arrange
		const orchestrator = new MoveOrchestrator(mockProject)

		// Reset all mocks
		jest.clearAllMocks()

		// Setup all required mocks to get to the removal step
		mockEnsureFileInProject.mockImplementation((path) => {
			if (path === "src/file.ts") return Promise.resolve(mockSourceFile)
			if (path === "src/target/file.ts") return Promise.resolve(mockTargetFile)
			return Promise.resolve(null)
		})
		mockCreateFileIfNeeded.mockResolvedValue(mockTargetFile)
		mockWriteToFile.mockResolvedValue(true)

		// Set up the normalizeFilePath to always return paths without the project root
		mockNormalizeFilePath.mockImplementation((path) => {
			// Extract just the relative path portion
			if (path.includes("/project/root/")) {
				return path.replace("/project/root/", "")
			}
			return path
		})

		// Then make the removal fail with the exact expected error message
		mockRemoveSymbol.mockReset()
		mockRemoveSymbol.mockResolvedValue({
			success: false,
			method: "failed",
			error: "Failed to remove symbol from source file after moving",
			symbolStillExists: true,
		})

		// Act
		const result = await orchestrator.executeMoveOperation(mockOperation)

		// Assert
		expect(result.success).toBe(false)
		expect(result.error).toContain("Failed to remove symbol from source file")
		// Check for file paths using a more flexible approach that works with or without project root
		expect(result.affectedFiles.some((path) => path.endsWith("src/file.ts"))).toBe(true)
		expect(result.affectedFiles.some((path) => path.endsWith("src/target/file.ts"))).toBe(true)
		expect(mockUpdateImportsAfterMove).not.toHaveBeenCalled()
	})

	test("handles verification failures", async () => {
		// Arrange
		const orchestrator = new MoveOrchestrator(mockProject)

		// Setup all required mocks to get to the verification step
		mockEnsureFileInProject.mockImplementation((path) => {
			if (path === "src/file.ts") return Promise.resolve(mockSourceFile)
			if (path === "src/target/file.ts") {
				// For the first call return normal file, for verification step return empty file
				const emptyTargetFile = {
					getFullText: jest.fn().mockReturnValue("// Empty target file"),
				} as unknown as SourceFile
				return Promise.resolve(emptyTargetFile)
			}
			return Promise.resolve(null)
		})

		// Reset to make sure all mocks are clean
		mockCreateFileIfNeeded.mockResolvedValue(mockTargetFile)
		mockWriteToFile.mockResolvedValue(true)
		mockRemoveSymbol.mockResolvedValue({ success: true, method: "standard", symbolStillExists: false })

		// Act
		const result = await orchestrator.executeMoveOperation(mockOperation)

		// Assert
		expect(result.success).toBe(false)
		expect(result.error).toContain("Move operation failed: Symbol not found in target file")
		expect(result.affectedFiles).toContain("src/file.ts")
		expect(result.affectedFiles).toContain("src/target/file.ts")
	})

	test("handles unexpected errors", async () => {
		// Arrange
		const orchestrator = new MoveOrchestrator(mockProject)

		// Reset mocks and make resolveSymbol throw an error
		mockEnsureFileInProject.mockImplementation((path) => {
			if (path === "src/file.ts") return Promise.resolve(mockSourceFile)
			return Promise.resolve(null)
		})

		mockResolveSymbol.mockReset()
		mockResolveSymbol.mockImplementation(() => {
			throw new Error("Unexpected error occurred")
		})

		// Act
		const result = await orchestrator.executeMoveOperation(mockOperation)

		// Assert
		expect(result.success).toBe(false)
		expect(result.error).toContain("Unexpected error during move operation")
		expect(result.error).toContain("Unexpected error occurred")
		expect(result.affectedFiles).toEqual([])
	})
})
