import { Project, SourceFile, Node } from "ts-morph"
import { RemoveOrchestrator } from "../RemoveOrchestrator"
import { RemoveOperation } from "../../schema"
import { PathResolver } from "../../utils/PathResolver"
import { FileManager } from "../../utils/FileManager"
import { SymbolResolver } from "../../core/SymbolResolver"
import { SymbolRemover } from "../../core/SymbolRemover"
import { ResolvedSymbol, RemovalResult, ValidationResult } from "../../core/types"

// Mock dependencies
jest.mock("../../utils/PathResolver")
jest.mock("../../utils/FileManager")
jest.mock("../../core/SymbolResolver")
jest.mock("../../core/SymbolRemover")

describe("RemoveOrchestrator", () => {
	// Test fixtures
	const mockProject = {
		getCompilerOptions: jest.fn().mockReturnValue({ rootDir: "/project/root" }),
	} as unknown as Project

	const mockSourceFile = {} as SourceFile
	const mockNode = {} as Node

	const mockSymbol: ResolvedSymbol = {
		node: mockNode,
		name: "testFunction",
		isExported: true,
		filePath: "/project/root/src/file.ts",
	}

	const mockOperation: RemoveOperation = {
		operation: "remove",
		selector: {
			type: "identifier",
			name: "testFunction",
			kind: "function",
			filePath: "src/file.ts",
		},
		id: "test-remove-operation",
	}

	// Mock implementations
	const mockNormalizeFilePath = jest.fn().mockReturnValue("src/file.ts")
	const mockEnsureFileInProject = jest.fn().mockResolvedValue(mockSourceFile)
	const mockResolveSymbol = jest.fn().mockReturnValue(mockSymbol)
	const mockValidateForRemoval = jest.fn().mockReturnValue({ canProceed: true, blockers: [], warnings: [] })
	const mockRemoveSymbol = jest
		.fn()
		.mockResolvedValue({ success: true, method: "standard", symbolStillExists: false })

	// Reset mocks before each test
	beforeEach(() => {
		jest.resetAllMocks()

		// Setup default mocks with specific implementations
		mockNormalizeFilePath.mockReturnValue("src/file.ts")
		mockEnsureFileInProject.mockResolvedValue(mockSourceFile)
		mockResolveSymbol.mockReturnValue(mockSymbol)
		mockValidateForRemoval.mockReturnValue({ canProceed: true, blockers: [], warnings: [] })
		mockRemoveSymbol.mockResolvedValue({ success: true, method: "standard", symbolStillExists: false })

		// Set up the prototype mocks
		PathResolver.prototype.normalizeFilePath = mockNormalizeFilePath
		FileManager.prototype.ensureFileInProject = mockEnsureFileInProject
		SymbolResolver.prototype.resolveSymbol = mockResolveSymbol
		SymbolResolver.prototype.validateForRemoval = mockValidateForRemoval
		SymbolRemover.prototype.removeSymbol = mockRemoveSymbol
	})

	test("successfully removes a symbol", async () => {
		// Arrange
		const orchestrator = new RemoveOrchestrator(mockProject)

		// Act
		const result = await orchestrator.executeRemoveOperation(mockOperation)

		// Assert
		expect(result.success).toBe(true)
		expect(result.affectedFiles).toEqual(["src/file.ts"])
		expect(result.removalMethod).toBe("standard")
		expect(mockNormalizeFilePath).toHaveBeenCalledWith("src/file.ts")
		expect(mockEnsureFileInProject).toHaveBeenCalledWith("src/file.ts")
		expect(mockResolveSymbol).toHaveBeenCalledWith(mockOperation.selector, mockSourceFile)
		expect(mockValidateForRemoval).toHaveBeenCalledWith(mockSymbol)
		expect(mockRemoveSymbol).toHaveBeenCalledWith(mockSymbol)

		// Verify complete result object structure
		expect(result).toEqual({
			success: true,
			operation: mockOperation,
			affectedFiles: ["src/file.ts"],
			removalMethod: "standard",
		})
	})

	test("handles source file not found", async () => {
		// Arrange
		const orchestrator = new RemoveOrchestrator(mockProject)

		// Override with a specific implementation for this test
		mockEnsureFileInProject.mockReset()
		mockEnsureFileInProject.mockResolvedValue(null)

		// Act
		const result = await orchestrator.executeRemoveOperation(mockOperation)

		// Assert
		expect(result.success).toBe(false)
		expect(result.error).toContain("Source file not found")
		expect(result.affectedFiles).toEqual([])
		expect(mockRemoveSymbol).not.toHaveBeenCalled()
	})

	test("handles symbol not found", async () => {
		// Arrange
		const orchestrator = new RemoveOrchestrator(mockProject)

		// Override with a specific implementation for this test
		mockResolveSymbol.mockReset()
		mockResolveSymbol.mockReturnValue(null)

		// Act
		const result = await orchestrator.executeRemoveOperation(mockOperation)

		// Assert
		expect(result.success).toBe(false)
		expect(result.error).toContain("Symbol 'testFunction' not found")
		expect(result.affectedFiles).toEqual([])
		expect(mockRemoveSymbol).not.toHaveBeenCalled()
	})

	test("handles validation failures", async () => {
		// Arrange
		const orchestrator = new RemoveOrchestrator(mockProject)
		const validationResult: ValidationResult = {
			canProceed: false,
			blockers: ["Symbol is referenced in other files", "Symbol cannot be removed"],
			warnings: [],
		}

		// Override with a specific implementation for this test
		mockValidateForRemoval.mockReset()
		mockValidateForRemoval.mockReturnValue(validationResult)

		// Act
		const result = await orchestrator.executeRemoveOperation(mockOperation)

		// Assert
		expect(result.success).toBe(false)
		expect(result.error).toContain("Symbol is referenced in other files")
		expect(result.error).toContain("Symbol cannot be removed")
		expect(result.affectedFiles).toEqual(["src/file.ts"])
		expect(mockRemoveSymbol).not.toHaveBeenCalled()
	})

	test("handles symbol removal failures", async () => {
		// Arrange
		const orchestrator = new RemoveOrchestrator(mockProject)
		const removalResult: RemovalResult = {
			success: false,
			method: "failed",
			error: "Failed to remove symbol due to syntax error",
			symbolStillExists: true,
		}

		// Override with a specific implementation for this test
		mockRemoveSymbol.mockReset()
		mockRemoveSymbol.mockResolvedValue(removalResult)

		// Act
		const result = await orchestrator.executeRemoveOperation(mockOperation)

		// Assert
		expect(result.success).toBe(false)
		expect(result.error).toContain("Failed to remove symbol due to syntax error")
		expect(result.affectedFiles).toEqual(["src/file.ts"])
	})

	test("handles unexpected errors", async () => {
		// Arrange
		const orchestrator = new RemoveOrchestrator(mockProject)

		// Override with a specific implementation for this test
		mockResolveSymbol.mockReset()
		mockResolveSymbol.mockImplementation(() => {
			throw new Error("Unexpected error occurred")
		})

		// Act
		const result = await orchestrator.executeRemoveOperation(mockOperation)

		// Assert
		expect(result.success).toBe(false)
		expect(result.error).toContain("Unexpected error during remove operation")
		expect(result.error).toContain("Unexpected error occurred")
		expect(result.affectedFiles).toEqual([])
	})

	test("returns different removal methods based on SymbolRemover result", async () => {
		// Arrange
		const orchestrator = new RemoveOrchestrator(mockProject)

		// Test for aggressive removal
		mockRemoveSymbol.mockResolvedValueOnce({
			success: true,
			method: "aggressive",
			symbolStillExists: false,
		})

		// Act
		const result = await orchestrator.executeRemoveOperation(mockOperation)

		// Assert
		expect(result.success).toBe(true)
		expect(result.removalMethod).toBe("aggressive")
		expect(mockRemoveSymbol).toHaveBeenCalledWith(mockSymbol)
	})

	test("handles compiler options being undefined", async () => {
		// Arrange
		const projectWithoutOptions = {
			getCompilerOptions: jest.fn().mockReturnValue(undefined),
		} as unknown as Project

		// Reset all mocks and set them up again for this specific test
		mockNormalizeFilePath.mockReturnValue("src/file.ts")
		mockEnsureFileInProject.mockResolvedValue(mockSourceFile)
		mockResolveSymbol.mockReturnValue(mockSymbol)
		mockValidateForRemoval.mockReturnValue({ canProceed: true, blockers: [], warnings: [] })
		mockRemoveSymbol.mockResolvedValue({ success: true, method: "standard", symbolStillExists: false })

		const orchestrator = new RemoveOrchestrator(projectWithoutOptions)

		// Act
		const result = await orchestrator.executeRemoveOperation(mockOperation)

		// Assert
		expect(result.success).toBe(true)
		expect(result.affectedFiles).toEqual(["src/file.ts"])
		expect(result.removalMethod).toBe("standard")
	})
})
