/**
 * Test for the critical batch context bug fix
 *
 * Bug: RefactorCodeTool was not passing batch context to move operations,
 * causing false naming conflicts when moving symbols to files that already
 * contained symbols moved by previous operations in the same batch.
 *
 * Root Cause: executeOperation() method wasn't passing batchContext parameter
 * to executeMoveOperation(), so the MoveValidator couldn't exclude symbols
 * that were moved by previous operations in the same batch.
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals"
import {
	createRefactorEngineTestSetup,
	RefactorEngineTestSetup,
	createTestFilesWithAutoLoad,
	TestFileStructure,
} from "./utils/standardized-test-setup"
import { MoveOperation } from "../schema"

describe("Batch Context Bug Fix", () => {
	let setup: RefactorEngineTestSetup

	beforeAll(() => {
		setup = createRefactorEngineTestSetup()
	})

	afterAll(() => {
		setup.cleanup()
	})

	it("should handle multiple move operations to the same target file without false conflicts", async () => {
		// Create test files using the standardized approach
		const testFiles: TestFileStructure = {
			"large-file.ts": `
export function formatUserName(firstName: string, lastName: string): string {
	return \`\${firstName} \${lastName}\`
}

export function calculateTotalPrice(price: number, tax: number): number {
	return price + (price * tax)
}

export function validateEmail(email: string): boolean {
	return email.includes('@')
}

export class UserService {
	getName() { return 'user' }
}

export class ProductService {
	getPrice() { return 100 }
}
			`.trim(),
			"utils.ts": "",
		}

		createTestFilesWithAutoLoad(setup, testFiles)

		// Define batch operations that move multiple symbols to the same target file
		const operations: MoveOperation[] = [
			{
				operation: "move",
				selector: {
					type: "identifier",
					name: "formatUserName",
					kind: "function",
					filePath: "large-file.ts",
				},
				targetFilePath: "utils.ts",
			},
			{
				operation: "move",
				selector: {
					type: "identifier",
					name: "calculateTotalPrice",
					kind: "function",
					filePath: "large-file.ts",
				},
				targetFilePath: "utils.ts",
			},
			{
				operation: "move",
				selector: {
					type: "identifier",
					name: "validateEmail",
					kind: "function",
					filePath: "large-file.ts",
				},
				targetFilePath: "utils.ts",
			},
		]

		// Execute batch operation
		const result = await setup.engine.executeBatch({ operations })

		// Verify that all operations succeeded
		expect(result.success).toBe(true)
		expect(result.results).toHaveLength(3)

		// All operations should succeed (no false conflicts)
		const successfulOps = result.results.filter((r) => r.success)
		expect(successfulOps).toHaveLength(3)

		// Verify that all functions were moved to the target file
		const updatedTargetFile = setup.engine.getProject().getSourceFile("utils.ts")
		expect(updatedTargetFile).toBeDefined()

		if (updatedTargetFile) {
			const functions = updatedTargetFile.getFunctions()
			const functionNames = functions.map((f) => f.getName())

			expect(functionNames).toContain("formatUserName")
			expect(functionNames).toContain("calculateTotalPrice")
			expect(functionNames).toContain("validateEmail")
		}

		// Verify that functions were removed from source file
		const updatedSourceFile = setup.engine.getProject().getSourceFile("large-file.ts")
		expect(updatedSourceFile).toBeDefined()

		if (updatedSourceFile) {
			const functions = updatedSourceFile.getFunctions()
			const functionNames = functions.map((f) => f.getName())

			expect(functionNames).not.toContain("formatUserName")
			expect(functionNames).not.toContain("calculateTotalPrice")
			expect(functionNames).not.toContain("validateEmail")
		}
	})

	it("should reproduce the exact bug scenario from the bug report", async () => {
		// Create the exact scenario from the bug report using standardized approach
		const testFiles: TestFileStructure = {
			"test-large-file.ts": `
export function formatUserName(firstName: string, lastName: string): string {
	return \`\${firstName} \${lastName}\`
}

export function calculateTotalPrice(price: number, tax: number): number {
	return price + (price * tax)
}

export class UserService {
	getName() { return 'user' }
}

export class ProductService {
	getPrice() { return 100 }
}
			`.trim(),
			"user-utils.ts": "",
			"product-utils.ts": "",
		}

		createTestFilesWithAutoLoad(setup, testFiles)

		// Define the exact operations from the bug report
		const operations: MoveOperation[] = [
			{
				operation: "move",
				selector: {
					type: "identifier",
					name: "formatUserName",
					kind: "function",
					filePath: "test-large-file.ts",
				},
				targetFilePath: "user-utils.ts",
			},
			{
				operation: "move",
				selector: {
					type: "identifier",
					name: "calculateTotalPrice",
					kind: "function",
					filePath: "test-large-file.ts",
				},
				targetFilePath: "product-utils.ts",
			},
		]

		// Execute batch operation
		const result = await setup.engine.executeBatch({ operations })

		// This should now succeed (previously would fail with naming conflict)
		expect(result.success).toBe(true)
		expect(result.results).toHaveLength(2)

		// Both operations should succeed
		const successfulOps = result.results.filter((r) => r.success)
		expect(successfulOps).toHaveLength(2)

		// Verify no false conflict errors
		const failedOps = result.results.filter((r) => !r.success)
		const conflictErrors = failedOps.filter(
			(r) => r.error?.includes("Naming conflict") || r.error?.includes("already exists in target file"),
		)
		expect(conflictErrors).toHaveLength(0)

		// Verify functions were moved correctly
		const updatedUserUtils = setup.engine.getProject().getSourceFile("user-utils.ts")
		const updatedProductUtils = setup.engine.getProject().getSourceFile("product-utils.ts")

		expect(updatedUserUtils).toBeDefined()
		expect(updatedProductUtils).toBeDefined()

		if (updatedUserUtils) {
			const functions = updatedUserUtils.getFunctions()
			const functionNames = functions.map((f) => f.getName())
			expect(functionNames).toContain("formatUserName")
		}

		if (updatedProductUtils) {
			const functions = updatedProductUtils.getFunctions()
			const functionNames = functions.map((f) => f.getName())
			expect(functionNames).toContain("calculateTotalPrice")
		}
	})

	it("should handle mixed operation types with move operations in batch", async () => {
		// Create test files using standardized approach
		const testFiles: TestFileStructure = {
			"mixed-operations-source.ts": `
export function oldFunctionName(x: number): number {
	return x * 2
}

export function moveMe(y: string): string {
	return y.toUpperCase()
}

export function anotherFunction(z: boolean): boolean {
	return !z
}
			`.trim(),
			"mixed-target.ts": "",
		}

		createTestFilesWithAutoLoad(setup, testFiles)

		// Mixed operations: rename, then move, then another move
		const operations = [
			{
				operation: "rename" as const,
				selector: {
					type: "identifier",
					name: "oldFunctionName",
					kind: "function",
					filePath: "mixed-operations-source.ts",
				},
				newName: "newFunctionName",
			},
			{
				operation: "move" as const,
				selector: {
					type: "identifier",
					name: "moveMe",
					kind: "function",
					filePath: "mixed-operations-source.ts",
				},
				targetFilePath: "mixed-target.ts",
			},
			{
				operation: "move" as const,
				selector: {
					type: "identifier",
					name: "anotherFunction",
					kind: "function",
					filePath: "mixed-operations-source.ts",
				},
				targetFilePath: "mixed-target.ts",
			},
		]

		// Execute batch
		const result = await setup.engine.executeBatch({ operations })

		// Should succeed
		expect(result.success).toBe(true)
		expect(result.results).toHaveLength(3)

		// All operations should succeed
		result.results.forEach((opResult, index) => {
			expect(opResult.success).toBe(true)
			expect(opResult.error).toBeUndefined()
		})

		// Verify rename worked
		const updatedSourceFile = setup.engine.getProject().getSourceFile("mixed-operations-source.ts")
		if (updatedSourceFile) {
			const functions = updatedSourceFile.getFunctions()
			const functionNames = functions.map((f) => f.getName())
			expect(functionNames).toContain("newFunctionName")
			expect(functionNames).not.toContain("oldFunctionName")
		}

		// Verify moves worked
		const updatedTargetFile = setup.engine.getProject().getSourceFile("mixed-target.ts")
		if (updatedTargetFile) {
			const functions = updatedTargetFile.getFunctions()
			const functionNames = functions.map((f) => f.getName())
			expect(functionNames).toContain("moveMe")
			expect(functionNames).toContain("anotherFunction")
		}
	})
})
