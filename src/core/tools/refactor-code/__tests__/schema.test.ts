import { z } from "zod"
import {
	RefactorOperationSchema,
	BatchOperationsSchema,
	RenameOperationSchema,
	MoveOperationSchema,
	RemoveOperationSchema,
	SelectorSchema,
} from "../schema"

describe("Schema Validation", () => {
	describe("Selector Schema", () => {
		it("should validate a valid identifier selector", () => {
			const validSelector = {
				type: "identifier",
				name: "myFunction",
				kind: "function",
				filePath: "src/utils.ts",
			}

			const result = SelectorSchema.safeParse(validSelector)
			expect(result.success).toBe(true)
		})

		it("should validate a selector with parent information", () => {
			const validSelector = {
				type: "identifier",
				name: "myMethod",
				kind: "method",
				filePath: "src/utils.ts",
				parent: {
					name: "MyClass",
					kind: "class",
				},
			}

			const result = SelectorSchema.safeParse(validSelector)
			expect(result.success).toBe(true)
		})

		it("should reject an invalid selector type", () => {
			const invalidSelector = {
				type: "invalid_type",
				name: "myFunction",
				kind: "function",
				filePath: "src/utils.ts",
			}

			const result = SelectorSchema.safeParse(invalidSelector)
			expect(result.success).toBe(false)
		})

		it("should reject a selector with missing required fields", () => {
			const invalidSelector = {
				type: "identifier",
				name: "myFunction",
				// missing kind
				filePath: "src/utils.ts",
			}

			const result = SelectorSchema.safeParse(invalidSelector)
			expect(result.success).toBe(false)
		})
	})

	describe("Rename Operation Schema", () => {
		it("should validate a valid rename operation", () => {
			const validOperation = {
				operation: "rename",
				selector: {
					type: "identifier",
					name: "oldName",
					kind: "function",
					filePath: "src/utils.ts",
				},
				newName: "newName",
				reason: "Better naming convention",
			}

			const result = RenameOperationSchema.safeParse(validOperation)
			expect(result.success).toBe(true)
		})

		it("should reject a rename operation without newName", () => {
			const invalidOperation = {
				operation: "rename",
				selector: {
					type: "identifier",
					name: "oldName",
					kind: "function",
					filePath: "src/utils.ts",
				},
				// missing newName
				reason: "Better naming convention",
			}

			const result = RenameOperationSchema.safeParse(invalidOperation)
			expect(result.success).toBe(false)
		})

		it("should reject a rename operation with empty newName", () => {
			const invalidOperation = {
				operation: "rename",
				selector: {
					type: "identifier",
					name: "oldName",
					kind: "function",
					filePath: "src/utils.ts",
				},
				newName: "",
				reason: "Better naming convention",
			}

			const result = RenameOperationSchema.safeParse(invalidOperation)
			expect(result.success).toBe(false)
		})
	})

	describe("Move Operation Schema", () => {
		it("should validate a valid move operation", () => {
			const validOperation = {
				operation: "move",
				selector: {
					type: "identifier",
					name: "myFunction",
					kind: "function",
					filePath: "src/utils.ts",
				},
				targetFilePath: "src/helpers.ts",
				reason: "Better code organization",
			}

			const result = MoveOperationSchema.safeParse(validOperation)
			expect(result.success).toBe(true)
		})

		it("should reject a move operation without targetFilePath", () => {
			const invalidOperation = {
				operation: "move",
				selector: {
					type: "identifier",
					name: "myFunction",
					kind: "function",
					filePath: "src/utils.ts",
				},
				// missing targetFilePath
				reason: "Better code organization",
			}

			const result = MoveOperationSchema.safeParse(invalidOperation)
			expect(result.success).toBe(false)
		})

		it("should reject a move operation with parent (nested symbols)", () => {
			const invalidOperation = {
				operation: "move",
				selector: {
					type: "identifier",
					name: "myMethod",
					kind: "method",
					filePath: "src/utils.ts",
					parent: {
						name: "MyClass",
						kind: "class",
					},
				},
				targetFilePath: "src/helpers.ts",
				reason: "Better code organization",
			}

			const result = MoveOperationSchema.safeParse(invalidOperation)
			expect(result.success).toBe(false)
		})
	})

	describe("Remove Operation Schema", () => {
		it("should validate a valid remove operation", () => {
			const validOperation = {
				operation: "remove",
				selector: {
					type: "identifier",
					name: "unusedFunction",
					kind: "function",
					filePath: "src/utils.ts",
				},
				reason: "Function is no longer used",
			}

			const result = RemoveOperationSchema.safeParse(validOperation)
			expect(result.success).toBe(true)
		})

		// No longer testing requiresReview as it was removed from the schema
	})

	describe("RefactorOperation Schema", () => {
		it("should validate rename operations", () => {
			const validOperation = {
				operation: "rename",
				selector: {
					type: "identifier",
					name: "oldName",
					kind: "function",
					filePath: "src/utils.ts",
				},
				newName: "newName",
				reason: "Better naming convention",
			}

			const result = RefactorOperationSchema.safeParse(validOperation)
			expect(result.success).toBe(true)
		})

		it("should validate move operations", () => {
			const validOperation = {
				operation: "move",
				selector: {
					type: "identifier",
					name: "myFunction",
					kind: "function",
					filePath: "src/utils.ts",
				},
				targetFilePath: "src/helpers.ts",
				reason: "Better code organization",
			}

			const result = RefactorOperationSchema.safeParse(validOperation)
			expect(result.success).toBe(true)
		})

		it("should validate remove operations", () => {
			const validOperation = {
				operation: "remove",
				selector: {
					type: "identifier",
					name: "unusedFunction",
					kind: "function",
					filePath: "src/utils.ts",
				},
				reason: "Function is no longer used",
			}

			const result = RefactorOperationSchema.safeParse(validOperation)
			expect(result.success).toBe(true)
		})

		it("should reject unsupported operation types", () => {
			const invalidOperation = {
				operation: "unsupported",
				selector: {
					type: "identifier",
					name: "someFunction",
					kind: "function",
					filePath: "src/utils.ts",
				},
				reason: "Some reason",
			}

			const result = RefactorOperationSchema.safeParse(invalidOperation)
			expect(result.success).toBe(false)
		})
	})

	describe("BatchOperations Schema", () => {
		it("should validate a batch with a single operation", () => {
			const validBatch = {
				operations: [
					{
						operation: "rename",
						selector: {
							type: "identifier",
							name: "oldName",
							kind: "function",
							filePath: "src/utils.ts",
						},
						newName: "newName",
						reason: "Better naming convention",
					},
				],
			}

			const result = BatchOperationsSchema.safeParse(validBatch)
			expect(result.success).toBe(true)
		})

		it("should validate a batch with multiple operations", () => {
			const validBatch = {
				operations: [
					{
						operation: "rename",
						selector: {
							type: "identifier",
							name: "oldName",
							kind: "function",
							filePath: "src/utils.ts",
						},
						newName: "newName",
						reason: "Better naming convention",
					},
					{
						operation: "move",
						selector: {
							type: "identifier",
							name: "myFunction",
							kind: "function",
							filePath: "src/utils.ts",
						},
						targetFilePath: "src/helpers.ts",
						reason: "Better code organization",
					},
				],
				options: {
					dryRun: true,
					stopOnError: true,
				},
			}

			const result = BatchOperationsSchema.safeParse(validBatch)
			expect(result.success).toBe(true)
		})

		it("should reject a batch with no operations", () => {
			const invalidBatch = {
				operations: [],
			}

			const result = BatchOperationsSchema.safeParse(invalidBatch)
			expect(result.success).toBe(false)
		})

		it("should reject a batch with invalid operations", () => {
			const invalidBatch = {
				operations: [
					{
						operation: "unsupported",
						selector: {
							type: "identifier",
							name: "someFunction",
							kind: "function",
							filePath: "src/utils.ts",
						},
						reason: "Some reason",
					},
				],
			}

			const result = BatchOperationsSchema.safeParse(invalidBatch)
			expect(result.success).toBe(false)
		})
	})
})
