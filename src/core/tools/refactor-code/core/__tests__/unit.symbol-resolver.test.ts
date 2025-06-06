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

// Create a shared mock instance
const mockFinderInstance = {
	findSymbol: jest.fn(),
	isExported: jest.fn(),
}

// Mock SymbolFinder
jest.mock("../../utils/symbol-finder", () => {
	return {
		SymbolFinder: jest.fn().mockImplementation(() => mockFinderInstance),
	}
})
// Mock Node static methods
jest.mock("ts-morph", () => {
	const actual = jest.requireActual("ts-morph")
	return {
		...actual,
		Node: {
			...actual.Node,
			isExportDeclaration: jest.fn(),
			isReferenceFindable: jest.fn(),
			isFunctionDeclaration: jest.fn(),
			isClassDeclaration: jest.fn(),
			isInterfaceDeclaration: jest.fn(),
			isTypeAliasDeclaration: jest.fn(),
			isEnumDeclaration: jest.fn(),
			isVariableDeclaration: jest.fn(),
			isMethodDeclaration: jest.fn(),
			isPropertyDeclaration: jest.fn(),
			isExportSpecifier: jest.fn(),
		},
	}
})

describe("SymbolResolver", () => {
	let project: Project
	let sourceFile: SourceFile
	let symbolResolver: SymbolResolver

	beforeEach(() => {
		// Reset all mocks
		jest.clearAllMocks()
		mockFinderInstance.findSymbol.mockReset()
		mockFinderInstance.isExported.mockReset()

		// Setup mocks
		project = {} as Project
		sourceFile = {
			getFilePath: jest.fn().mockReturnValue("/path/to/file.ts"),
		} as unknown as SourceFile

		symbolResolver = new SymbolResolver(project)
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

			const mockNode = {
				getKindName: jest.fn().mockReturnValue("FunctionDeclaration"),
				getAncestors: jest.fn().mockReturnValue([]),
				getParent: jest.fn().mockReturnValue(null),
				getStartLineNumber: jest.fn().mockReturnValue(1),
				getSourceFile: jest
					.fn()
					.mockReturnValue({ getFilePath: jest.fn().mockReturnValue("/path/to/file.ts") }),
			} as unknown as Node

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
						getAncestors: jest.fn().mockReturnValue([]),
						getParent: jest.fn().mockReturnValue(null),
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
			const selfReference = {
				getParent: jest.fn().mockReturnValue(null),
				getAncestors: jest.fn().mockReturnValue([]),
			} as any

			const sameFileReference = {
				getSourceFile: jest.fn().mockReturnValue({
					getFilePath: jest.fn().mockReturnValue("/path/to/file.ts"),
				}),
				getFirstAncestorByKind: jest.fn(),
				getStartLineNumber: jest.fn().mockReturnValue(5),
				getParent: jest.fn(),
				getAncestors: jest.fn().mockReturnValue([]),
			}

			const exportReference = {
				getSourceFile: jest.fn().mockReturnValue({
					getFilePath: jest.fn().mockReturnValue("/path/to/file.ts"),
				}),
				getFirstAncestorByKind: jest.fn(),
				getStartLineNumber: jest.fn().mockReturnValue(10),
				getParent: jest.fn().mockReturnValue(null),
				getAncestors: jest.fn().mockReturnValue([]),
			}

			const externalReference = {
				getSourceFile: jest.fn().mockReturnValue({
					getFilePath: jest.fn().mockReturnValue("/path/to/other-file.ts"),
				}),
				getFirstAncestorByKind: jest.fn().mockReturnValue(undefined),
				getStartLineNumber: jest.fn().mockReturnValue(20),
				getParent: jest.fn().mockReturnValue(null),
				getAncestors: jest.fn().mockReturnValue([]),
			}

			// Now create the node with references
			const mockNode = {
				findReferencesAsNodes: jest.fn(),
				getSourceFile: jest.fn().mockReturnValue({
					getFilePath: jest.fn().mockReturnValue("/path/to/file.ts"),
				}),
				getStartLineNumber: jest.fn().mockReturnValue(1),
				getParent: jest.fn().mockReturnValue(null),
				getAncestors: jest.fn().mockReturnValue([]),
			} as any

			// Set up circular reference - self is the node (should be filtered out)
			// Use the same object reference so ref === node comparison works
			mockNode.findReferencesAsNodes.mockReturnValue([
				mockNode,
				sameFileReference,
				exportReference,
				externalReference,
			])

			// Setup the reference checks - sameFileReference should be inside declaration (filtered out)
			sameFileReference.getFirstAncestorByKind.mockImplementation((kind) =>
				kind === SyntaxKind.FunctionDeclaration ? mockNode : undefined,
			)

			// Mock getParent to simulate sameFileReference being inside the declaration
			// Create a chain where sameFileReference -> mockNode (to be filtered out)
			sameFileReference.getParent.mockReturnValue(mockNode)

			// exportReference should be in export declaration (filtered out)
			exportReference.getFirstAncestorByKind.mockImplementation((kind) =>
				kind === SyntaxKind.ExportDeclaration ? {} : undefined,
			)

			// Mock getAncestors to simulate exportReference being in export declaration
			const mockExportDeclaration = { kind: SyntaxKind.ExportDeclaration }
			exportReference.getAncestors.mockReturnValue([mockExportDeclaration])

			const symbol: ResolvedSymbol = {
				node: mockNode,
				name: "test",
				isExported: true,
				filePath: "/path/to/file.ts",
			}

			// Mock Node functions
			const NodeMock = Node as jest.Mocked<typeof Node>
			NodeMock.isReferenceFindable.mockReturnValue(true)
			NodeMock.isExportDeclaration.mockImplementation(
				(node: any) => node && node.kind === SyntaxKind.ExportDeclaration,
			)

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
