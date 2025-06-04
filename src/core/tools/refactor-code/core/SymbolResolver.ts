import { Project, SourceFile, Node, SyntaxKind } from "ts-morph"
import { SymbolFinder } from "../utils/symbol-finder" // Existing
import { ResolvedSymbol, ValidationResult, ReferenceInfo } from "./types"
import { IdentifierSelector } from "../schema" // Existing

export class SymbolResolver {
	constructor(private project: Project) {}

	/**
	 * Replaces: Scattered symbol finding in both operations
	 * Extract from: Lines 158-175 in remove, Lines 267-284 in move
	 */
	resolveSymbol(selector: IdentifierSelector, sourceFile: SourceFile): ResolvedSymbol | null {
		console.log(`[DEBUG RESOLVER] Looking for symbol: ${selector.name}, kind: ${selector.kind}`)
		const finder = new SymbolFinder(sourceFile)
		const symbol = finder.findSymbol(selector)

		if (!symbol) {
			console.log(`[DEBUG RESOLVER] Symbol not found: ${selector.name}`)
			return null
		}

		const isExported = finder.isExported(symbol)
		console.log(
			`[DEBUG RESOLVER] Symbol found: ${selector.name}, exported: ${isExported}, node type: ${symbol.getKindName()}`,
		)

		return {
			node: symbol,
			name: selector.name,
			isExported: isExported,
			filePath: sourceFile.getFilePath(),
		}
	}

	/**
	 * Replaces: Validation logic scattered in remove operation
	 * Extract from: Lines 176-195 in remove operation
	 */
	validateForRemoval(symbol: ResolvedSymbol): ValidationResult {
		const node = symbol.node
		const blockers: string[] = []
		const warnings: string[] = []

		// Check if symbol type is removable (from remove operation lines 176-185)
		const isRemovable =
			Node.isFunctionDeclaration(node) ||
			Node.isClassDeclaration(node) ||
			Node.isInterfaceDeclaration(node) ||
			Node.isTypeAliasDeclaration(node) ||
			Node.isEnumDeclaration(node) ||
			Node.isMethodDeclaration(node) ||
			Node.isPropertyDeclaration(node) ||
			Node.isExportSpecifier(node) ||
			Node.isVariableDeclaration(node)

		if (!isRemovable) {
			blockers.push(`Symbol '${symbol.name}' cannot be removed (unsupported symbol type)`)
		}

		// Check for external references (from remove operation lines 198-235)
		const externalReferences = this.findExternalReferences(symbol)
		if (externalReferences.length > 0) {
			const referencingFiles = [...new Set(externalReferences.map((ref) => ref.filePath))]
			blockers.push(
				`Cannot remove '${symbol.name}' because it is referenced in ${externalReferences.length} locations across ${referencingFiles.length} files: ${referencingFiles.join(", ")}`,
			)
		}

		return {
			canProceed: blockers.length === 0,
			blockers,
			warnings,
		}
	}

	/**
	 * Replaces: Move operation validation
	 * Extract from: Lines 335-347 in move operation
	 */
	validateForMove(symbol: ResolvedSymbol): ValidationResult {
		const node = symbol.node
		const blockers: string[] = []
		const warnings: string[] = []

		// Check if symbol is top-level (from move operation isTopLevelSymbol function)
		const isTopLevel =
			Node.isFunctionDeclaration(node) ||
			Node.isClassDeclaration(node) ||
			Node.isInterfaceDeclaration(node) ||
			Node.isTypeAliasDeclaration(node) ||
			Node.isEnumDeclaration(node) ||
			(Node.isVariableDeclaration(node) &&
				Node.isVariableStatement(node.getParent()?.getParent()) &&
				node.getParent()?.getParent()?.getParentIfKind(SyntaxKind.SourceFile) !== undefined)

		if (!isTopLevel) {
			blockers.push(`Symbol '${symbol.name}' is not a top-level symbol and cannot be moved`)
		}

		return {
			canProceed: blockers.length === 0,
			blockers,
			warnings,
		}
	}

	/**
	 * Replaces: Complex reference finding in remove operation
	 * Extract from: Lines 198-235 in remove operation
	 */
	findExternalReferences(symbol: ResolvedSymbol): ReferenceInfo[] {
		const node = symbol.node
		const externalReferences: ReferenceInfo[] = []

		if (!Node.isReferenceFindable(node)) {
			return externalReferences
		}

		const references = node.findReferencesAsNodes()

		// Filter logic extracted from remove operation lines 200-230
		const filteredReferences = references.filter((ref) => {
			// Skip the declaration itself
			if (ref === node) return false

			// Skip references in the same file with same logic as original
			if (ref.getSourceFile().getFilePath() === symbol.filePath) {
				// Safely check if a node is inside another node by checking its parents
				const isInsideNode = (refNode: Node, targetNode: Node): boolean => {
					let current = refNode.getParent()
					while (current) {
						if (current === targetNode) return true
						current = current.getParent()
					}
					return false
				}

				// Check if reference is inside the declaration
				const isInDeclaration = isInsideNode(ref, node)

				// Check if reference is in an export declaration
				const isInExportDeclaration = !!ref
					.getAncestors()
					.find((ancestor) => Node.isExportDeclaration(ancestor))

				return !isInDeclaration && !isInExportDeclaration
			}

			return true
		})

		// Convert to ReferenceInfo objects
		return filteredReferences.map((ref) => ({
			filePath: ref.getSourceFile().getFilePath(),
			lineNumber: ref.getStartLineNumber(),
			isInSameFile: ref.getSourceFile().getFilePath() === symbol.filePath,
			isInExportDeclaration: !!ref.getAncestors().find((ancestor) => Node.isExportDeclaration(ancestor)),
		}))
	}
}
