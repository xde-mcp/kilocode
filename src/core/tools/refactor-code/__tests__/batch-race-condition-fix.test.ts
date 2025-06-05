import { describe, it, expect, beforeAll, afterAll } from "@jest/globals"
import { RefactorEngine } from "../engine"
import { createRefactorEngineTestSetup, createTestFilesWithAutoLoad } from "./utils/standardized-test-setup"
import type { RefactorEngineTestSetup } from "./utils/standardized-test-setup"
import type { BatchOperations } from "../schema"

describe("Batch Race Condition Fix", () => {
	let setup: RefactorEngineTestSetup

	beforeAll(() => {
		setup = createRefactorEngineTestSetup()
	})

	afterAll(() => {
		setup.cleanup()
	})

	it("should handle batch operations without false naming conflicts", async () => {
		// Create test files that reproduce the exact bug scenario
		const testFiles = {
			"src/utils.ts": `
export function formatUserName(firstName: string, lastName: string): string {
    return \`\${firstName} \${lastName}\`
}

export function calculateTotalPrice(items: Array<{ price: number }>): number {
    return items.reduce((total, item) => total + item.price, 0)
}

export function validateEmail(email: string): boolean {
    return email.includes('@')
}
`,
			"src/user-utils.ts": `
// User-related utilities
export function getUserDisplayName(user: { name: string }): string {
    return user.name
}
`,
			"src/product-utils.ts": `
// Product-related utilities  
export function getProductName(product: { name: string }): string {
    return product.name
}
`,
		}

		createTestFilesWithAutoLoad(setup, testFiles)

		// Define batch operations that reproduce the race condition
		const batchOperations: BatchOperations = {
			operations: [
				{
					operation: "move" as const,
					selector: {
						name: "formatUserName",
						filePath: "src/utils.ts",
						kind: "function" as const,
					},
					targetFilePath: "src/user-utils.ts",
				},
				{
					operation: "move" as const,
					selector: {
						name: "calculateTotalPrice",
						filePath: "src/utils.ts",
						kind: "function" as const,
					},
					targetFilePath: "src/product-utils.ts",
				},
			],
		}

		// Execute batch operations - this should NOT fail with naming conflicts
		const result = await setup.engine.executeBatch(batchOperations)

		// DEBUG: Check file state after batch operations
		const utilsFileAfterBatch = setup.engine.getProject().getSourceFile("src/utils.ts")
		console.log("=== UTILS.TS CONTENT AFTER BATCH OPERATIONS ===")
		console.log(utilsFileAfterBatch?.getFullText())
		console.log("=== FUNCTIONS IN UTILS.TS AFTER BATCH ===")
		const functionsAfterBatch = utilsFileAfterBatch?.getFunctions()
		console.log(
			"Functions found:",
			functionsAfterBatch?.map((f) => f.getName()),
		)

		// Verify the batch operation succeeded
		expect(result.success).toBe(true)
		expect(result.results).toHaveLength(2)

		// Verify both operations succeeded
		expect(result.results[0].success).toBe(true)
		expect(result.results[1].success).toBe(true)

		// Verify the symbols were moved correctly
		const project = setup.engine.getProject()

		// Force project to refresh all files to get updated content
		project.getSourceFiles().forEach((file) => {
			file.refreshFromFileSystemSync()
		})

		const allFiles = project.getSourceFiles()

		// Debug: log all available files
		console.log(
			"Available files:",
			allFiles.map((f) => f.getFilePath()),
		)

		const userUtilsFile = allFiles.find((f) => f.getFilePath().endsWith("user-utils.ts"))
		const productUtilsFile = allFiles.find((f) => f.getFilePath().endsWith("product-utils.ts"))
		const utilsFile = allFiles.find((f) => f.getFilePath().endsWith("src/utils.ts"))

		// Additional debug: check utils.ts content after refresh
		console.log("=== UTILS.TS CONTENT AFTER REFRESH ===")
		console.log(utilsFile?.getFullText())
		console.log("=== FUNCTIONS IN UTILS.TS AFTER REFRESH ===")
		const functionsAfterRefresh = utilsFile?.getFunctions()
		console.log(
			"Functions found after refresh:",
			functionsAfterRefresh?.map((f) => f.getName()),
		)

		expect(userUtilsFile).toBeDefined()
		expect(productUtilsFile).toBeDefined()
		expect(utilsFile).toBeDefined()

		// Check that formatUserName is now in user-utils.ts
		expect(userUtilsFile!.getFunction("formatUserName")).toBeDefined()

		// Check that calculateTotalPrice is now in product-utils.ts
		expect(productUtilsFile!.getFunction("calculateTotalPrice")).toBeDefined()

		// Check that both functions are removed from utils.ts
		expect(utilsFile!.getFunction("formatUserName")).toBeUndefined()
		expect(utilsFile!.getFunction("calculateTotalPrice")).toBeUndefined()

		// Verify validateEmail remains in utils.ts
		expect(utilsFile!.getFunction("validateEmail")).toBeDefined()
	})

	it("should track moved symbols in batch context correctly", async () => {
		// Create test files
		const testFiles = {
			"src/source.ts": `
export function funcA(): string { return 'A' }
export function funcB(): string { return 'B' }
export function funcC(): string { return 'C' }
`,
			"src/target1.ts": `// Target file 1`,
			"src/target2.ts": `// Target file 2`,
		}

		createTestFilesWithAutoLoad(setup, testFiles)

		// Move multiple functions to the same target file in sequence
		const batchOperations: BatchOperations = {
			operations: [
				{
					operation: "move" as const,
					selector: {
						name: "funcA",
						filePath: "src/source.ts",
						kind: "function" as const,
					},
					targetFilePath: "src/target1.ts",
				},
				{
					operation: "move" as const,
					selector: {
						name: "funcB",
						filePath: "src/source.ts",
						kind: "function" as const,
					},
					targetFilePath: "src/target1.ts", // Same target as funcA
				},
				{
					operation: "move" as const,
					selector: {
						name: "funcC",
						filePath: "src/source.ts",
						kind: "function" as const,
					},
					targetFilePath: "src/target2.ts", // Different target
				},
			],
		}

		// Execute batch - should succeed without conflicts
		const result = await setup.engine.executeBatch(batchOperations)

		expect(result.success).toBe(true)
		expect(result.results).toHaveLength(3)
		expect(result.results.every((r) => r.success)).toBe(true)

		// Verify final state
		const project = setup.engine.getProject()
		const allFiles = project.getSourceFiles()

		const target1File = allFiles.find((f) => f.getFilePath().endsWith("src/target1.ts"))
		const target2File = allFiles.find((f) => f.getFilePath().endsWith("src/target2.ts"))

		expect(target1File).toBeDefined()
		expect(target2File).toBeDefined()
		expect(target1File!.getFunction("funcA")).toBeDefined()
		expect(target1File!.getFunction("funcB")).toBeDefined()
		expect(target2File!.getFunction("funcC")).toBeDefined()
	})

	it("should still detect real naming conflicts", async () => {
		// Create test files with actual conflicts
		const testFiles = {
			"src/source.ts": `
export function conflictingFunction(): string { return 'source' }
`,
			"src/target.ts": `
export function conflictingFunction(): string { return 'target' }
`,
		}

		createTestFilesWithAutoLoad(setup, testFiles)

		// Try to move a function that actually conflicts
		const batchOperations: BatchOperations = {
			operations: [
				{
					operation: "move" as const,
					selector: {
						name: "conflictingFunction",
						filePath: "src/source.ts",
						kind: "function" as const,
					},
					targetFilePath: "src/target.ts",
				},
			],
		}

		// This should fail due to real naming conflict
		const result = await setup.engine.executeBatch(batchOperations)

		expect(result.success).toBe(false)
		expect(result.results[0].success).toBe(false)
		expect(result.results[0].error).toContain("Naming conflict")
	})
})
