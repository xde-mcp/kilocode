import { Project, SourceFile, Node, SyntaxKind } from "ts-morph"
import { SymbolResolver } from "../SymbolResolver"
import { SymbolFinder } from "../../utils/symbol-finder"
import { IdentifierSelector } from "../../schema"
import { ResolvedSymbol } from "../types"

// Mock ts-morph
jest.mock("ts-morph", () => {
	const originalModule = jest.requireActual("ts-morph")

	return {
		...originalModule,
		Node: {
			...originalModule.Node,
			isFunctionDeclaration: jest.fn(),
			isClassDeclaration: jest.fn(),
			isInterfaceDeclaration: jest.fn(),
			isTypeAliasDeclaration: jest.fn(),
			isEnumDeclaration: jest.fn(),
			isMethodDeclaration: jest.fn(),
			isPropertyDeclaration: jest.fn(),
			isExportSpecifier: jest.fn(),
			isVariableDeclaration: jest.fn(),
			isVariableStatement: jest.fn(),
			isReferenceFindable: jest.fn(),
		},
		SyntaxKind: originalModule.SyntaxKind,
	}
})

// Mock SymbolFinder
jest.mock("../../utils/symbol-finder", () => {
	return {
		SymbolFinder: jest.fn().mockImplementation(() => ({
			findSymbol: jest.fn(),
			isExported: jest.fn(),
		})),
	}
})

describe("SymbolResolver", () => {
	let project: Project
	let sourceFile: SourceFile
	let symbolResolver: SymbolResolver
	let mockFinderInstance: { findSymbol: jest.Mock; isExported: jest.Mock }

	beforeEach(() => {
		// Reset all mocks
		jest.clearAllMocks()

		// Setup mocks
		project = {} as Project
		sourceFile = {
			getFilePath: jest.fn().mockReturnValue("/path/to/file.ts"),
		} as unknown as SourceFile

		symbolResolver = new SymbolResolver(project)

		// Get the mocked instance that will be returned when SymbolFinder is constructed
		mockFinderInstance = (SymbolFinder as jest.Mock)() as any
	})

	describe("resolveSymbol", () => {
		it("should return null when symbol is not found", () => {
			// Setup
			const selector: IdentifierSelector = {
				type: "identifier",
				name: "nonExistentFunction",
				kind: "function",
				filePath: "/path/to/file.ts",
			}

			// Mock findSymbol to return undefined (symbol not found)
			mockFinderInstance.findSymbol.mockReturnValue(undefined)

			// Execute
			const result = symbolResolver.resolveSymbol(selector, sourceFile)

			// Verify
			expect(result).toBeNull()
			expect(mockFinderInstance.findSymbol).toHaveBeenCalledWith(selector)
		})

		it("should return a ResolvedSymbol when symbol is found", () => {
			// Setup
			const selector: IdentifierSelector = {
				type: "identifier",
				name: "testFunction",
				kind: "function",
				filePath: "/path/to/file.ts",
			}

			const mockNode = {} as Node

			// Mock findSymbol to return a node
			mockFinderInstance.findSymbol.mockReturnValue(mockNode)
			mockFinderInstance.isExported.mockReturnValue(true)

			// Execute
			const result = symbolResolver.resolveSymbol(selector, sourceFile)

			// Verify
			expect(result).not.toBeNull()
			expect(result).toEqual({
				node: mockNode,
				name: "testFunction",
				isExported: true,
				filePath: "/path/to/file.ts",
			})
			expect(mockFinderInstance.findSymbol).toHaveBeenCalledWith(selector)
			expect(mockFinderInstance.isExported).toHaveBeenCalledWith(mockNode)
		})
	})

	describe("validateForRemoval", () => {
		it("should allow removal when symbol is removable and has no external references", () => {
			// Setup
			const mockNode = {
				getText: jest.fn().mockReturnValue("function test() {}"),
			} as unknown as Node

			const symbol: ResolvedSymbol = {
				node: mockNode,
				name: "test",
				isExported: false,
				filePath: "/path/to/file.ts",
			}

			// Mock Node type checks
			const NodeMock = Node as jest.Mocked<typeof Node>
			NodeMock.isFunctionDeclaration.mockReturnValue(true)
			NodeMock.isReferenceFindable.mockReturnValue(false) // No references to check

			// Execute
			const result = symbolResolver.validateForRemoval(symbol)

			// Verify
			expect(result.canProceed).toBe(true)
			expect(result.blockers).toHaveLength(0)
		})

		it("should block removal when symbol type is not removable", () => {
			// Setup
			const mockNode = {
				getText: jest.fn().mockReturnValue("// Some non-removable node"),
			} as unknown as Node

			const symbol: ResolvedSymbol = {
				node: mockNode,
				name: "nonRemovableSymbol",
				isExported: false,
				filePath: "/path/to/file.ts",
			}

			// Mock all Node type checks to return false (not a removable type)
			const NodeMock = Node as jest.Mocked<typeof Node>
			NodeMock.isFunctionDeclaration.mockReturnValue(false)
			NodeMock.isClassDeclaration.mockReturnValue(false)
			NodeMock.isInterfaceDeclaration.mockReturnValue(false)
			NodeMock.isTypeAliasDeclaration.mockReturnValue(false)
			NodeMock.isEnumDeclaration.mockReturnValue(false)
			NodeMock.isMethodDeclaration.mockReturnValue(false)
			NodeMock.isPropertyDeclaration.mockReturnValue(false)
			NodeMock.isExportSpecifier.mockReturnValue(false)
			NodeMock.isVariableDeclaration.mockReturnValue(false)

			// Execute
			const result = symbolResolver.validateForRemoval(symbol)

			// Verify
			expect(result.canProceed).toBe(false)
			expect(result.blockers).toHaveLength(1)
			expect(result.blockers[0]).toContain("cannot be removed")
		})

		it("should block removal when symbol has external references", () => {
			// Setup
			const mockNode = {
				getText: jest.fn().mockReturnValue("function test() {}"),
				findReferencesAsNodes: jest.fn().mockReturnValue([
					{
						getSourceFile: jest.fn().mockReturnValue({
							getFilePath: jest.fn().mockReturnValue("/path/to/other-file.ts"),
						}),
						getStartLineNumber: jest.fn().mockReturnValue(10),
						getFirstAncestorByKind: jest.fn().mockReturnValue(undefined),
					},
				]),
			} as unknown as Node

			const symbol: ResolvedSymbol = {
				node: mockNode,
				name: "test",
				isExported: true,
				filePath: "/path/to/file.ts",
			}

			// Mock Node type checks
			const NodeMock = Node as jest.Mocked<typeof Node>
			NodeMock.isFunctionDeclaration.mockReturnValue(true)
			NodeMock.isReferenceFindable.mockReturnValue(true)

			// Execute
			const result = symbolResolver.validateForRemoval(symbol)

			// Verify
			expect(result.canProceed).toBe(false)
			expect(result.blockers).toHaveLength(1)
			expect(result.blockers[0]).toContain("referenced in")
		})
	})

	describe("validateForMove", () => {
		it("should allow moving when symbol is a top-level symbol", () => {
			// Setup
			const mockNode = {
				getText: jest.fn().mockReturnValue("function test() {}"),
			} as unknown as Node

			const symbol: ResolvedSymbol = {
				node: mockNode,
				name: "test",
				isExported: false,
				filePath: "/path/to/file.ts",
			}

			// Mock Node type checks for top-level symbol
			const NodeMock = Node as jest.Mocked<typeof Node>
			NodeMock.isFunctionDeclaration.mockReturnValue(true)

			// Execute
			const result = symbolResolver.validateForMove(symbol)

			// Verify
			expect(result.canProceed).toBe(true)
			expect(result.blockers).toHaveLength(0)
		})

		it("should block moving when symbol is not a top-level symbol", () => {
			// Setup
			const mockNode = {
				getText: jest.fn().mockReturnValue("class Test { method() {} }"),
				getParent: jest.fn().mockReturnValue({}),
			} as unknown as Node

			const symbol: ResolvedSymbol = {
				node: mockNode,
				name: "method",
				isExported: false,
				filePath: "/path/to/file.ts",
			}

			// Mock all Node type checks to indicate not a top-level symbol
			const NodeMock = Node as jest.Mocked<typeof Node>
			NodeMock.isFunctionDeclaration.mockReturnValue(false)
			NodeMock.isClassDeclaration.mockReturnValue(false)
			NodeMock.isInterfaceDeclaration.mockReturnValue(false)
			NodeMock.isTypeAliasDeclaration.mockReturnValue(false)
			NodeMock.isEnumDeclaration.mockReturnValue(false)
			NodeMock.isVariableDeclaration.mockReturnValue(false)

			// Execute
			const result = symbolResolver.validateForMove(symbol)

			// Verify
			expect(result.canProceed).toBe(false)
			expect(result.blockers).toHaveLength(1)
			expect(result.blockers[0]).toContain("not a top-level symbol")
		})
	})

	describe("findExternalReferences", () => {
		it("should return empty array for non-reference-findable nodes", () => {
			// Setup
			const mockNode = {} as unknown as Node

			const symbol: ResolvedSymbol = {
				node: mockNode,
				name: "test",
				isExported: false,
				filePath: "/path/to/file.ts",
			}

			// Mock Node.isReferenceFindable to return false
			const NodeMock = Node as jest.Mocked<typeof Node>
			NodeMock.isReferenceFindable.mockReturnValue(false)

			// Execute
			const result = symbolResolver.findExternalReferences(symbol)

			// Verify
			expect(result).toEqual([])
		})

		it("should filter out declaration and same-file references", () => {
			// Setup
			// Create references without circular dependencies
			const selfReference = {} as any
			const sameFileReference = {
				getSourceFile: jest.fn().mockReturnValue({
					getFilePath: jest.fn().mockReturnValue("/path/to/file.ts"),
				}),
				getFirstAncestorByKind: jest.fn(),
				getStartLineNumber: jest.fn().mockReturnValue(5),
			}

			const exportReference = {
				getSourceFile: jest.fn().mockReturnValue({
					getFilePath: jest.fn().mockReturnValue("/path/to/file.ts"),
				}),
				getFirstAncestorByKind: jest.fn(),
				getStartLineNumber: jest.fn().mockReturnValue(10),
			}

			const externalReference = {
				getSourceFile: jest.fn().mockReturnValue({
					getFilePath: jest.fn().mockReturnValue("/path/to/other-file.ts"),
				}),
				getFirstAncestorByKind: jest.fn().mockReturnValue(undefined),
				getStartLineNumber: jest.fn().mockReturnValue(20),
			}

			// Now create the node with references
			const mockNode = {
				findReferencesAsNodes: jest
					.fn()
					.mockReturnValue([selfReference, sameFileReference, exportReference, externalReference]),
			} as any

			// Set up circular reference - self is the node
			selfReference.getSourceFile = jest.fn().mockReturnValue({
				getFilePath: jest.fn().mockReturnValue("/path/to/file.ts"),
			})
			selfReference.getStartLineNumber = jest.fn().mockReturnValue(1)

			// Setup the reference checks
			sameFileReference.getFirstAncestorByKind.mockImplementation((kind) =>
				kind === SyntaxKind.FunctionDeclaration ? mockNode : undefined,
			)

			exportReference.getFirstAncestorByKind.mockImplementation((kind) =>
				kind === SyntaxKind.ExportDeclaration ? {} : undefined,
			)

			const symbol: ResolvedSymbol = {
				node: mockNode,
				name: "test",
				isExported: true,
				filePath: "/path/to/file.ts",
			}

			// Mock Node.isReferenceFindable
			const NodeMock = Node as jest.Mocked<typeof Node>
			NodeMock.isReferenceFindable.mockReturnValue(true)

			// Execute
			const result = symbolResolver.findExternalReferences(symbol)

			// Verify
			expect(result).toHaveLength(1)
			expect(result[0].filePath).toBe("/path/to/other-file.ts")
			expect(result[0].lineNumber).toBe(20)
			expect(result[0].isInSameFile).toBe(false)
		})
	})
})
