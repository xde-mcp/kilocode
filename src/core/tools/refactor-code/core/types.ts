import { Node } from "ts-morph"

/**
 * Result of resolving a symbol - replaces inline symbol handling
 */
export interface ResolvedSymbol {
	node: Node
	name: string
	isExported: boolean
	filePath: string
}

/**
 * Result of validation checks - replaces scattered boolean checks
 */
export interface ValidationResult {
	canProceed: boolean
	blockers: string[] // Hard stops that prevent operation
	warnings: string[] // Issues that should be logged but don't block
}

/**
 * Dependencies needed by a symbol - replaces Map<string, ImportInfo>
 */
export interface SymbolDependencies {
	imports: Map<string, string> // symbolName -> moduleSpecifier
	types: string[] // Type names that must be available
	localReferences: string[] // Other symbols in same file this depends on
}

/**
 * Result of removing a symbol - replaces success/error handling
 */
export interface RemovalResult {
	success: boolean
	method: "standard" | "aggressive" | "manual" | "failed"
	error?: string
	symbolStillExists: boolean
}

/**
 * Extracted symbol content - replaces extractSymbolText return
 */
export interface ExtractedSymbol {
	text: string // Full symbol text with comments
	comments: string[] // Leading comments
	dependencies: SymbolDependencies
	isExported: boolean
}

/**
 * Reference to symbol found in project
 */
export interface ReferenceInfo {
	filePath: string
	lineNumber: number
	isInSameFile: boolean
	isInExportDeclaration: boolean
}
