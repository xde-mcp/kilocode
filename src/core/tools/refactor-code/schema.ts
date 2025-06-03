import { z } from "zod"

// Base selector schemas
const IdentifierSelectorSchema = z.object({
	type: z.literal("identifier"),
	name: z.string().min(1),
	kind: z.enum(["function", "class", "variable", "type", "interface", "enum", "method", "property"]),
	filePath: z.string().min(1),
	parent: z
		.object({
			name: z.string().min(1),
			kind: z.enum(["class", "interface", "namespace"]),
		})
		.optional(),
	signatureHint: z.string().optional(), // For disambiguating overloads
})

const CodeBlockSelectorSchema = z
	.object({
		type: z.literal("code_block"),
		filePath: z.string().min(1),
		startLine: z.number().int().positive(),
		endLine: z.number().int().positive(),
	})
	.refine((data) => data.endLine >= data.startLine, {
		message: "endLine must be greater than or equal to startLine",
	})

const FileSelectorSchema = z.object({
	type: z.literal("file"),
	filePath: z.string().min(1),
})

// Create discriminated union for selector types
const SelectorSchema = z
	.union([IdentifierSelectorSchema, CodeBlockSelectorSchema, FileSelectorSchema])
	.refine(
		(
			data,
		): data is
			| z.infer<typeof IdentifierSelectorSchema>
			| z.infer<typeof CodeBlockSelectorSchema>
			| z.infer<typeof FileSelectorSchema> => true,
		{
			message: "Invalid selector type",
		},
	)

// Operation-specific schemas
const RenameOperationSchema = z.object({
	id: z.string().optional(),
	operation: z.literal("rename"),
	selector: IdentifierSelectorSchema,
	newName: z.string().min(1),
	scope: z.enum(["file", "project"]).optional().default("project"),
	reason: z.string().min(1).optional(),
})

const MoveOperationSchema = z
	.object({
		id: z.string().optional(),
		operation: z.literal("move"),
		selector: IdentifierSelectorSchema,
		targetFilePath: z.string().min(1),
		reason: z.string().min(1).optional(),
	})
	.refine((data) => !data.selector.parent, {
		message: "Move operations don't support nested symbols",
	})

const RemoveOperationSchema = z.object({
	id: z.string().optional(),
	operation: z.literal("remove"),
	selector: IdentifierSelectorSchema,
	reason: z.string().min(1).optional(),
	options: z
		.object({
			forceRemove: z.boolean().optional(),
			fallbackToAggressive: z.boolean().optional(),
			cleanupDependencies: z.boolean().optional(),
		})
		.optional(),
})

const ExtractOperationSchema = z.object({
	id: z.string().optional(),
	operation: z.literal("extract"),
	selector: CodeBlockSelectorSchema,
	extractionType: z.enum(["function", "method", "class", "interface"]),
	newName: z.string().min(1),
	targetFilePath: z.string().optional(),
	reason: z.string().min(1).optional(),
})

// Forward declaration for recursive types
let RefactorOperationSchemaInternal: z.ZodType

const RefactorCompositeSchema = z.object({
	id: z.string().optional(),
	operation: z.literal("refactor"),
	steps: z.lazy(() => z.array(RefactorOperationSchemaInternal).min(1)),
	description: z.string().min(1),
	reason: z.string().min(1).optional(),
})

const AddOperationSchema = z.object({
	id: z.string().optional(),
	operation: z.literal("add"),
	symbolType: z.enum(["function", "class", "interface", "type", "variable", "method", "property"]),
	symbolName: z.string().min(1),
	targetFilePath: z.string().min(1),
	code: z.string().min(1),
	parentSymbol: z.string().optional(), // For methods, properties
	position: z.enum(["start", "end", "before", "after"]).optional(),
	reason: z.string().min(1).optional(),
})

const InlineOperationSchema = z.object({
	id: z.string().optional(),
	operation: z.literal("inline"),
	selector: IdentifierSelectorSchema,
	reason: z.string().min(1).optional(),
})

const OptimizeImportsOperationSchema = z.object({
	id: z.string().optional(),
	operation: z.literal("optimize_imports"),
	selector: FileSelectorSchema,
	scope: z.enum(["file", "project"]),
	actions: z.array(z.enum(["remove_unused", "sort", "group_external", "merge_duplicates"])).min(1),
	reason: z.string().min(1).optional(),
})

// Main operation schema
RefactorOperationSchemaInternal = z
	.union([
		RenameOperationSchema,
		MoveOperationSchema,
		RemoveOperationSchema,
		ExtractOperationSchema,
		RefactorCompositeSchema,
		AddOperationSchema,
		InlineOperationSchema,
		OptimizeImportsOperationSchema,
	])
	.refine(
		(
			data,
		): data is
			| z.infer<typeof RenameOperationSchema>
			| z.infer<typeof MoveOperationSchema>
			| z.infer<typeof RemoveOperationSchema>
			| z.infer<typeof ExtractOperationSchema>
			| z.infer<typeof RefactorCompositeSchema>
			| z.infer<typeof AddOperationSchema>
			| z.infer<typeof InlineOperationSchema>
			| z.infer<typeof OptimizeImportsOperationSchema> => true,
		{
			message: "Invalid operation type",
		},
	)

const RefactorOperationSchema = RefactorOperationSchemaInternal

// Batch operations schema
const BatchOperationsSchema = z.object({
	operations: z.array(RefactorOperationSchema).min(1),
	options: z
		.object({
			stopOnError: z.boolean().optional().default(true),
		})
		.optional(),
})

// Export types
export type RefactorOperation = z.infer<typeof RefactorOperationSchema>
export type BatchOperations = z.infer<typeof BatchOperationsSchema>
export type Selector = z.infer<typeof SelectorSchema>
export type IdentifierSelector = z.infer<typeof IdentifierSelectorSchema>

// Operation-specific types
export type RenameOperation = z.infer<typeof RenameOperationSchema>
export type MoveOperation = z.infer<typeof MoveOperationSchema>
export type RemoveOperation = z.infer<typeof RemoveOperationSchema>

// Export schemas
export {
	RefactorOperationSchema,
	BatchOperationsSchema,
	SelectorSchema,
	// Individual operation schemas for testing
	RenameOperationSchema,
	MoveOperationSchema,
	RemoveOperationSchema,
}
