# Phase 1: Core Infrastructure & Safety (1 week)

## Goal

Establish foundational infrastructure with robust validation, error handling, and safety mechanisms. This phase focuses on building the core components that all operations will depend on.

## Prerequisites

- Phase 0 completed with all deliverables
- Architecture design approved
- Development environment set up with TypeScript and required dependencies

## Key Components to Build

### 1. Schema Definition with Zod

**File**: `src/core/tools/refactor-code/schema.ts`

```typescript
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

const SelectorSchema = z.discriminatedUnion("type", [
	IdentifierSelectorSchema,
	CodeBlockSelectorSchema,
	FileSelectorSchema,
])

// Operation-specific schemas
const RenameOperationSchema = z.object({
	id: z.string().optional(),
	operation: z.literal("rename"),
	selector: IdentifierSelectorSchema,
	newName: z.string().min(1),
	scope: z.enum(["file", "project"]).optional().default("project"),
	reason: z.string().min(1),
	requiresReview: z.boolean().optional(),
})

const MoveOperationSchema = z
	.object({
		id: z.string().optional(),
		operation: z.literal("move"),
		selector: IdentifierSelectorSchema,
		targetFilePath: z.string().min(1),
		reason: z.string().min(1),
		requiresReview: z.boolean().optional(),
	})
	.refine((data) => !data.selector.parent, {
		message: "Move operations don't support nested symbols",
	})

const RemoveOperationSchema = z.object({
	id: z.string().optional(),
	operation: z.literal("remove"),
	selector: IdentifierSelectorSchema,
	reason: z.string().min(1),
	requiresReview: z.boolean().optional().default(true), // Always require review
})

const ExtractOperationSchema = z.object({
	id: z.string().optional(),
	operation: z.literal("extract"),
	selector: CodeBlockSelectorSchema,
	extractionType: z.enum(["function", "method", "class", "interface"]),
	newName: z.string().min(1),
	targetFilePath: z.string().optional(),
	reason: z.string().min(1),
})

const RefactorOperationSchema = z.object({
	id: z.string().optional(),
	operation: z.literal("refactor"),
	steps: z.lazy(() => z.array(RefactorOperationSchema)).min(1),
	description: z.string().min(1),
	reason: z.string().min(1),
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
	reason: z.string().min(1),
})

const InlineOperationSchema = z.object({
	id: z.string().optional(),
	operation: z.literal("inline"),
	selector: IdentifierSelectorSchema,
	reason: z.string().min(1),
})

const OptimizeImportsOperationSchema = z.object({
	id: z.string().optional(),
	operation: z.literal("optimize_imports"),
	selector: FileSelectorSchema,
	scope: z.enum(["file", "project"]),
	actions: z.array(z.enum(["remove_unused", "sort", "group_external", "merge_duplicates"])).min(1),
	reason: z.string().min(1),
})

// Main operation schema
const RefactorOperationSchema = z.discriminatedUnion("operation", [
	RenameOperationSchema,
	MoveOperationSchema,
	RemoveOperationSchema,
	ExtractOperationSchema,
	RefactorOperationSchema,
	AddOperationSchema,
	InlineOperationSchema,
	OptimizeImportsOperationSchema,
])

// Batch operations schema
const BatchOperationsSchema = z.object({
	operations: z.array(RefactorOperationSchema).min(1),
	options: z
		.object({
			dryRun: z.boolean().optional(),
			requireHumanReview: z.boolean().optional(),
			stopOnError: z.boolean().optional().default(true),
		})
		.optional(),
})

// Export types
export type RefactorOperation = z.infer<typeof RefactorOperationSchema>
export type BatchOperations = z.infer<typeof BatchOperationsSchema>
export type Selector = z.infer<typeof SelectorSchema>

// Export schemas
export {
	RefactorOperationSchema,
	BatchOperationsSchema,
	SelectorSchema,
	// Individual operation schemas for testing
	RenameOperationSchema,
	MoveOperationSchema,
	RemoveOperationSchema,
	ExtractOperationSchema,
	AddOperationSchema,
	InlineOperationSchema,
	OptimizeImportsOperationSchema,
}
```

### 2. Robust LLM Response Parser

**File**: `src/core/tools/refactor-code/parser.ts`

````typescript
import { z } from "zod"
import { RefactorOperationSchema, BatchOperationsSchema, RefactorOperation } from "./schema"

export class RefactorParseError extends Error {
	constructor(
		message: string,
		public issues: string[],
		public originalInput: string,
	) {
		super(message)
		this.name = "RefactorParseError"
	}
}

export class RobustLLMRefactorParser {
	private readonly fallbackPatterns = [
		/```(?:refactor_operations|json|typescript)?\s*([\s\S]*?)```/i,
		/\[\s*\{[\s\S]*?\}\s*\]/,
		/operations?\s*[:=]\s*(\[[\s\S]*?\])/i,
	]

	parseResponse(llmResponse: string): RefactorOperation[] {
		let jsonContent: string | null = null

		// Try each pattern until we find valid JSON
		for (const pattern of this.fallbackPatterns) {
			const match = llmResponse.match(pattern)
			if (match) {
				jsonContent = match[1] || match[0]
				break
			}
		}

		if (!jsonContent) {
			throw new RefactorParseError(
				"No refactor operations found in LLM response",
				["Could not extract JSON from response"],
				llmResponse,
			)
		}

		return this.parseAndValidateJSON(jsonContent, llmResponse)
	}

	private parseAndValidateJSON(jsonString: string, originalResponse: string): RefactorOperation[] {
		try {
			// Clean up common LLM formatting issues
			const cleanedJson = this.cleanJsonString(jsonString)
			const rawOperations = JSON.parse(cleanedJson)

			// Ensure it's an array
			const operations = Array.isArray(rawOperations) ? rawOperations : [rawOperations]

			// Validate with Zod schema
			const parseResult = z.array(RefactorOperationSchema).safeParse(operations)

			if (!parseResult.success) {
				// Attempt automatic fixes for common issues
				const fixedOperations = this.attemptAutoFix(operations, parseResult.error)
				const retryResult = z.array(RefactorOperationSchema).safeParse(fixedOperations)

				if (!retryResult.success) {
					throw new RefactorParseError(
						"LLM response validation failed",
						this.formatZodErrors(retryResult.error),
						originalResponse,
					)
				}

				return this.enhanceOperations(retryResult.data)
			}

			return this.enhanceOperations(parseResult.data)
		} catch (error) {
			if (error instanceof SyntaxError) {
				throw new RefactorParseError(
					"Invalid JSON in LLM response",
					[`JSON parse error: ${error.message}`],
					jsonString.slice(0, 500),
				)
			}
			throw error
		}
	}

	private cleanJsonString(json: string): string {
		return json
			.replace(/\/\*[\s\S]*?\*\//g, "") // Remove /* */ comments
			.replace(/\/\/.*$/gm, "") // Remove // comments
			.replace(/,(\s*[}\]])/g, "$1") // Remove trailing commas
			.replace(/'/g, '"') // Replace single quotes with double quotes
			.trim()
	}

	private attemptAutoFix(operations: any[], zodError: z.ZodError): any[] {
		return operations.map((op, index) => {
			const fixed = { ...op }

			// Add missing IDs
			if (!fixed.id) {
				fixed.id = `op-${index + 1}`
			}

			// Add missing reason
			if (!fixed.reason) {
				fixed.reason = `Perform ${fixed.operation} operation`
			}

			// Set default confidence scores for risky operations
			if (fixed.confidenceScore === undefined) {
				const riskScores = {
					remove: 0.7,
					add: 0.7,
					refactor: 0.8,
					extract: 0.8,
					move: 0.85,
					rename: 0.9,
					inline: 0.85,
					optimize_imports: 0.95,
				}
				fixed.confidenceScore = riskScores[fixed.operation] || 0.8
			}

			// Auto-flag operations that should require review
			if (fixed.requiresReview === undefined) {
				const reviewRequired = ["remove", "add"]
				fixed.requiresReview =
					reviewRequired.includes(fixed.operation) || (fixed.confidenceScore && fixed.confidenceScore < 0.8)
			}

			return fixed
		})
	}

	private enhanceOperations(operations: RefactorOperation[]): RefactorOperation[] {
		return operations.map((op, index) => ({
			...op,
			id: op.id || `op-${index + 1}`,
			confidenceScore: op.confidenceScore ?? this.calculateDefaultConfidence(op),
			requiresReview: op.requiresReview ?? this.shouldRequireReview(op),
		}))
	}

	private calculateDefaultConfidence(op: RefactorOperation): number {
		const riskFactors = {
			remove: 0.7,
			add: 0.7,
			refactor: 0.8,
			extract: 0.8,
			move: 0.85,
			rename: 0.9,
			inline: 0.85,
			optimize_imports: 0.95,
		}

		return riskFactors[op.operation] || 0.8
	}

	private shouldRequireReview(op: RefactorOperation): boolean {
		const reviewRequired = ["remove", "add"]
		return reviewRequired.includes(op.operation) || (op.confidenceScore !== undefined && op.confidenceScore < 0.8)
	}

	private formatZodErrors(error: z.ZodError): string[] {
		return error.errors.map((err) => `${err.path.join(".")}: ${err.message}`)
	}
}
````

### 3. Transaction System

**File**: `src/core/tools/refactor-code/transaction.ts`

```typescript
import { Project, SourceFile } from "ts-morph"
import * as fs from "fs/promises"
import * as path from "path"

export interface FileSnapshot {
	path: string
	content: string
	timestamp: number
}

export interface OperationRecord {
	id: string
	type: string
	undo: () => void
}

export class RefactorTransaction {
	private snapshots: Map<string, FileSnapshot> = new Map()
	private operations: OperationRecord[] = []
	private transactionId: string = ""
	private project: Project

	constructor(project: Project) {
		this.project = project
	}

	async begin(): Promise<string> {
		this.transactionId = `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
		this.snapshots.clear()
		this.operations = []
		return this.transactionId
	}

	async snapshot(filePath: string): Promise<void> {
		if (this.snapshots.has(filePath)) {
			return // Already snapshotted
		}

		try {
			const absolutePath = path.isAbsolute(filePath)
				? filePath
				: path.join(this.project.getCompilerOptions().rootDir || process.cwd(), filePath)

			const content = await fs.readFile(absolutePath, "utf-8")

			this.snapshots.set(filePath, {
				path: filePath,
				content,
				timestamp: Date.now(),
			})
		} catch (error) {
			throw new Error(`Failed to snapshot file ${filePath}: ${error.message}`)
		}
	}

	async rollback(): Promise<void> {
		// Restore files in reverse order
		const snapshots = Array.from(this.snapshots.entries()).reverse()

		for (const [filePath, snapshot] of snapshots) {
			try {
				const absolutePath = path.isAbsolute(filePath)
					? filePath
					: path.join(this.project.getCompilerOptions().rootDir || process.cwd(), filePath)

				await fs.writeFile(absolutePath, snapshot.content, "utf-8")

				// Refresh the source file in the project
				const sourceFile = this.project.getSourceFile(filePath)
				if (sourceFile) {
					sourceFile.refreshFromFileSystemSync()
				}
			} catch (error) {
				console.error(`Failed to rollback file ${filePath}: ${error.message}`)
			}
		}

		// Execute undo operations in reverse order
		for (const operation of this.operations.reverse()) {
			try {
				operation.undo()
			} catch (error) {
				console.error(`Failed to undo operation ${operation.id}: ${error.message}`)
			}
		}

		this.clear()
	}

	async commit(): Promise<void> {
		this.clear()
	}

	recordOperation(operation: OperationRecord): void {
		this.operations.push(operation)
	}

	getTransactionId(): string {
		return this.transactionId
	}

	getSnapshotCount(): number {
		return this.snapshots.size
	}

	getOperationCount(): number {
		return this.operations.length
	}

	private clear(): void {
		this.snapshots.clear()
		this.operations = []
	}
}
```

### 4. Human Review System

**File**: `src/core/tools/refactor-code/human-review.ts`

```typescript
import { RefactorOperation } from "./schema"

export interface ReviewGuide {
	summary: string
	risks: RiskAssessment[]
	preview: string
	checklist: ReviewChecklistItem[]
}

export interface RiskAssessment {
	level: "low" | "medium" | "high"
	description: string
	mitigation: string
	affectedFiles: string[]
}

export interface ReviewChecklistItem {
	checked: boolean
	description: string
	required: boolean
}

export class HumanReviewSystem {
	generateReviewGuide(operations: RefactorOperation[]): ReviewGuide {
		return {
			summary: this.summarizeOperations(operations),
			risks: this.assessRisks(operations),
			preview: this.generatePreview(operations),
			checklist: this.createReviewChecklist(operations),
		}
	}

	private summarizeOperations(operations: RefactorOperation[]): string {
		const summary = [`Refactoring Summary: ${operations.length} operation(s)`]

		const opCounts = operations.reduce(
			(acc, op) => {
				acc[op.operation] = (acc[op.operation] || 0) + 1
				return acc
			},
			{} as Record<string, number>,
		)

		for (const [op, count] of Object.entries(opCounts)) {
			summary.push(`- ${op}: ${count}`)
		}

		return summary.join("\n")
	}

	private assessRisks(operations: RefactorOperation[]): RiskAssessment[] {
		const risks: RiskAssessment[] = []

		for (const op of operations) {
			if (op.operation === "remove") {
				risks.push({
					level: "high",
					description: `Removing ${op.selector.name} - potential breaking change`,
					mitigation: "Verify no external dependencies before proceeding",
					affectedFiles: [op.selector.filePath],
				})
			}

			if (op.operation === "add") {
				risks.push({
					level: "medium",
					description: `Adding new code - potential conflicts or duplicates`,
					mitigation: "Review generated code for correctness and style",
					affectedFiles: [op.targetFilePath],
				})
			}

			if (op.operation === "move" && this.isPublicAPI(op)) {
				risks.push({
					level: "high",
					description: `Moving public API ${op.selector.name}`,
					mitigation: "Update documentation and notify consumers",
					affectedFiles: [op.selector.filePath, op.targetFilePath],
				})
			}
		}

		return risks
	}

	private generatePreview(operations: RefactorOperation[]): string {
		const preview: string[] = ["Operation Preview:"]

		for (const op of operations) {
			switch (op.operation) {
				case "rename":
					preview.push(`- Rename ${op.selector.name} to ${op.newName} in ${op.selector.filePath}`)
					break
				case "move":
					preview.push(`- Move ${op.selector.name} from ${op.selector.filePath} to ${op.targetFilePath}`)
					break
				case "remove":
					preview.push(`- Remove ${op.selector.name} from ${op.selector.filePath}`)
					break
				case "add":
					preview.push(`- Add ${op.symbolType} ${op.symbolName} to ${op.targetFilePath}`)
					break
				// Add other operations
			}
		}

		return preview.join("\n")
	}

	private createReviewChecklist(operations: RefactorOperation[]): ReviewChecklistItem[] {
		const checklist: ReviewChecklistItem[] = [
			{
				checked: false,
				description: "All affected files have been backed up",
				required: true,
			},
			{
				checked: false,
				description: "Tests are passing before refactoring",
				required: true,
			},
		]

		if (operations.some((op) => op.operation === "remove")) {
			checklist.push({
				checked: false,
				description: "Verified no external dependencies on removed symbols",
				required: true,
			})
		}

		if (operations.some((op) => op.operation === "move")) {
			checklist.push({
				checked: false,
				description: "Import statements will be updated correctly",
				required: true,
			})
		}

		if (operations.some((op) => op.operation === "add")) {
			checklist.push({
				checked: false,
				description: "Generated code follows project conventions",
				required: false,
			})
		}

		return checklist
	}

	shouldRequireReview(operation: RefactorOperation): boolean {
		const highRiskOps = ["remove", "add", "refactor"]
		return (
			highRiskOps.includes(operation.operation) ||
			(operation.confidenceScore !== undefined && operation.confidenceScore < 0.8) ||
			this.affectsPublicAPI(operation)
		)
	}

	private isPublicAPI(operation: RefactorOperation): boolean {
		// Check if the operation affects exported symbols
		if ("selector" in operation && operation.selector.type === "identifier") {
			// This is a simplified check - in reality, we'd analyze the AST
			return operation.selector.name[0] === operation.selector.name[0].toUpperCase()
		}
		return false
	}

	private affectsPublicAPI(operation: RefactorOperation): boolean {
		return this.isPublicAPI(operation)
	}
}
```

### 5. Update System Prompt

**File**: `src/core/prompts/tools/refactor-code.ts`

Update the existing prompt to include all operations and the new response format:

```typescript
export const systemPrompt = `
You are a TypeScript refactoring specialist. Generate precise refactoring operations using this exact JSON structure.

## Available Operations

1. **rename**: Change symbol names project-wide
2. **move**: Relocate top-level symbols between files  
3. **remove**: Delete unused symbols safely
4. **extract**: Move code blocks to new functions/methods/classes
5. **refactor**: Multi-step refactoring sequences
6. **add**: Add new code elements (functions, classes, etc.)
7. **inline**: Replace symbol references with their values
8. **optimize_imports**: Clean up and organize imports

## Required Response Format

ALWAYS respond with a JSON array of operations, even for single operations:

\`\`\`refactor_operations
[
  {
    "operation": "rename|move|remove|extract|refactor|add|inline|optimize_imports",
    "selector": {
      "type": "identifier|code_block|file",
      "name": "symbolName",
      "kind": "function|class|variable|type|interface|enum|method|property", 
      "filePath": "relative/path/to/file.ts",
      "parent": {
        "name": "ParentClassName",
        "kind": "class|interface|namespace"
      },
      "startLine": 10,
      "endLine": 25,
      "signatureHint": "functionName(param: Type)"
    },
    "newName": "newSymbolName",
    "targetFilePath": "destination/path.ts",
    "extractionType": "function|method|class|interface",
    "symbolType": "function|class|interface|type|variable|method|property",
    "symbolName": "newSymbolName",
    "code": "implementation code...",
    "parentSymbol": "ParentClass",
    "scope": "file|project",
    "actions": ["remove_unused", "sort", "group_external", "merge_duplicates"],
    "steps": [...], // For refactor operation
    "reason": "Clear explanation of why this change is needed",
    "confidenceScore": 0.95,
    "requiresReview": false
  }
]
\`\`\`

## Operation-Specific Requirements

### rename
- **Required**: selector (identifier only), newName, reason
- **Optional**: scope, confidenceScore, requiresReview

### move  
- **Required**: selector (identifier only, top-level), targetFilePath, reason
- **Optional**: confidenceScore, requiresReview

### remove
- **Required**: selector (identifier only), reason
- **Optional**: confidenceScore
- **Note**: Always sets requiresReview to true

### extract
- **Required**: selector (code_block only), extractionType, newName, reason
- **Optional**: targetFilePath, confidenceScore, requiresReview

### refactor
- **Required**: steps (array of operations), description, reason
- **Optional**: confidenceScore, requiresReview

### add
- **Required**: symbolType, symbolName, targetFilePath, code, reason
- **Optional**: parentSymbol, position, confidenceScore
- **Note**: Always sets requiresReview to true

### inline
- **Required**: selector (identifier only), reason
- **Optional**: confidenceScore, requiresReview

### optimize_imports
- **Required**: selector (file only), scope, actions, reason
- **Optional**: confidenceScore, requiresReview

## Safety Guidelines

- Set confidenceScore between 0.0-1.0 (lower = more review needed)
- High-risk operations: remove, add (default confidence ≤ 0.7)
- Always provide clear reason for each operation
- Use signatureHint to disambiguate overloaded functions
- For nested symbols (methods, properties), include parent information
`
```

## Testing Strategy

### Unit Tests

Create comprehensive unit tests for each component:

**File**: `src/core/tools/refactor-code/__tests__/parser.test.ts`

```typescript
import { RobustLLMRefactorParser } from "../parser"

describe("RobustLLMRefactorParser", () => {
	const parser = new RobustLLMRefactorParser()

	describe("parseResponse", () => {
		it("should parse operations in code blocks", () => {
			const response = `
        Here are the refactoring operations:
        
        \`\`\`refactor_operations
        [
          {
            "operation": "rename",
            "selector": {
              "type": "identifier",
              "name": "oldName",
              "kind": "function",
              "filePath": "src/utils.ts"
            },
            "newName": "newName",
            "reason": "Better naming convention"
          }
        ]
        \`\`\`
      `

			const operations = parser.parseResponse(response)
			expect(operations).toHaveLength(1)
			expect(operations[0].operation).toBe("rename")
		})

		it("should handle missing fields with auto-fix", () => {
			const response = `[{"operation": "rename", "selector": {"type": "identifier", "name": "test", "filePath": "test.ts"}, "newName": "newTest"}]`

			const operations = parser.parseResponse(response)
			expect(operations[0].reason).toBeDefined()
			expect(operations[0].id).toBeDefined()
			expect(operations[0].confidenceScore).toBeDefined()
		})

		it("should throw on invalid JSON", () => {
			const response = `This is not JSON`

			expect(() => parser.parseResponse(response)).toThrow("No refactor operations found")
		})
	})
})
```

**File**: `src/core/tools/refactor-code/__tests__/transaction.test.ts`

```typescript
import { RefactorTransaction } from "../transaction"
import { Project } from "ts-morph"
import * as fs from "fs/promises"

jest.mock("fs/promises")

describe("RefactorTransaction", () => {
	let project: Project
	let transaction: RefactorTransaction

	beforeEach(() => {
		project = new Project({ useInMemoryFileSystem: true })
		transaction = new RefactorTransaction(project)
	})

	describe("snapshot and rollback", () => {
		it("should snapshot and restore file content", async () => {
			const filePath = "test.ts"
			const originalContent = "const x = 1;"
			const modifiedContent = "const x = 2;"

			;(fs.readFile as jest.Mock).mockResolvedValue(originalContent)

			const txId = await transaction.begin()
			await transaction.snapshot(filePath)

			// Simulate file modification
			;(fs.writeFile as jest.Mock).mockResolvedValue(undefined)

			await transaction.rollback()

			expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining(filePath), originalContent, "utf-8")
		})
	})
})
```

### Integration Tests

Create integration tests that verify the components work together:

**File**: `src/core/tools/refactor-code/__tests__/integration.test.ts`

```typescript
import { RobustLLMRefactorParser } from "../parser"
import { RefactorTransaction } from "../transaction"
import { HumanReviewSystem } from "../human-review"
import { Project } from "ts-morph"

describe("Core Infrastructure Integration", () => {
	it("should parse LLM response and generate review guide", () => {
		const parser = new RobustLLMRefactorParser()
		const reviewSystem = new HumanReviewSystem()

		const llmResponse = `
      \`\`\`json
      [
        {
          "operation": "remove",
          "selector": {
            "type": "identifier",
            "name": "deprecatedFunction",
            "kind": "function",
            "filePath": "src/utils.ts"
          },
          "reason": "Function is no longer used"
        }
      ]
      \`\`\`
    `

		const operations = parser.parseResponse(llmResponse)
		const reviewGuide = reviewSystem.generateReviewGuide(operations)

		expect(reviewGuide.risks).toHaveLength(1)
		expect(reviewGuide.risks[0].level).toBe("high")
		expect(operations[0].requiresReview).toBe(true)
	})
})
```

## Environment Parity Validation

Create tests to ensure the test environment matches the production environment:

**File**: `src/core/tools/refactor-code/__tests__/environment-parity.test.ts`

```typescript
import { Project } from "ts-morph"
import * as path from "path"
import * as fs from "fs"

describe("Environment Parity Tests", () => {
	test("TS-Morph project configuration matches production", () => {
		const testProject = new Project({
			tsConfigFilePath: path.join(__dirname, "../../../../../tsconfig.json"),
		})

		const prodProject = new Project({
			tsConfigFilePath: "tsconfig.json",
		})

		expect(testProject.getCompilerOptions()).toEqual(prodProject.getCompilerOptions())
	})

	test("File system access works consistently", async () => {
		const testPath = "src/test.ts"

		// Test both sync and async file operations
		const existsSync = fs.existsSync(testPath)
		const existsAsync = await fs.promises
			.access(testPath)
			.then(() => true)
			.catch(() => false)

		expect(existsSync).toBe(existsAsync)
	})
})
```

## Implementation Checklist

### Core Components

- [ ] Create `src/core/tools/refactor-code/schema.ts` with all Zod schemas
- [ ] Create `src/core/tools/refactor-code/parser.ts` with robust parsing
- [ ] Create `src/core/tools/refactor-code/transaction.ts` with rollback support
- [ ] Create `src/core/tools/refactor-code/human-review.ts` with review generation
- [ ] Create `src/core/tools/refactor-code/types.ts` for shared types
- [ ] Update `src/core/prompts/tools/refactor-code.ts` with new prompt

### Tests

- [ ] Create unit tests for schema validation
- [ ] Create unit tests for parser with various LLM responses
- [ ] Create unit tests for transaction rollback
- [ ] Create unit tests for human review generation
- [ ] Create integration tests for component interaction
- [ ] Create environment parity tests

### Documentation

- [ ] Document all public APIs
- [ ] Create examples for each component
- [ ] Document error handling strategies
- [ ] Create troubleshooting guide

## Success Criteria

- [ ] Parser successfully handles 20+ different LLM response formats
- [ ] Transaction rollback works reliably in all test cases
- [ ] Human review correctly identifies all high-risk operations
- [ ] All schemas validate correctly with helpful error messages
- [ ] > 90% test coverage for all components
- [ ] Environment parity tests all passing
- [ ] No TypeScript errors or warnings
- [ ] All components properly integrated

## Dependencies to Install

```json
{
	"dependencies": {
		"ts-morph": "^21.0.0",
		"zod": "^3.22.0"
	},
	"devDependencies": {
		"@types/jest": "^29.5.0",
		"jest": "^29.5.0",
		"ts-jest": "^29.1.0"
	}
}
```

## Next Steps

After completing Phase 1, we'll have:

- Robust infrastructure for all operations
- Safety mechanisms in place
- Comprehensive validation
- Human review system ready

This foundation will enable us to implement the actual refactoring operations in Phase 2 with confidence that errors will be caught and changes can be rolled back safely.
