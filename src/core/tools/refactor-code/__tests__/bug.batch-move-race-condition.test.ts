/**
 * Test for Bug Report: Batch Move Operation Race Condition
 *
 * This test reproduces the critical race condition bug where the RefactorCodeTool
 * pre-populates target files with symbols before performing conflict detection,
 * causing false positive naming conflicts in batch operations.
 *
 * Bug Description:
 * - Move operations in batch fail with "Symbol already exists" error
 * - Target files are empty before batch starts
 * - Tool pre-populates target files, then detects conflicts with its own content
 *
 * Expected: Move operations should succeed when target files are empty
 * Actual: Move operations fail due to false positive conflicts
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals"
import {
	createRefactorEngineTestSetup,
	RefactorEngineTestSetup,
	createTestFilesWithAutoLoad,
} from "./utils/standardized-test-setup"
import { RenameOperation, MoveOperation, RemoveOperation, BatchOperations } from "../schema"
import * as path from "path"
import * as fs from "fs"

describe("Batch Move Race Condition Bug", () => {
	let setup: RefactorEngineTestSetup

	beforeAll(() => {
		setup = createRefactorEngineTestSetup()
	})

	afterAll(() => {
		setup.cleanup()
	})

	it("should successfully move functions to empty target files in batch operations", async () => {
		// Create test files using standardized approach
		const testFiles = {
			"src/large-file.ts": `
export class UserService {
    getName() { return 'user' }
}

export class ProductService {
    getPrice() { return 100 }
}

export function formatUserName(name: string): string {
    return name.toUpperCase()
}

export function calculateTotalPrice(price: number, tax: number): number {
    return price + (price * tax)
}

export function complexCalculation(a: number, b: number): number {
    return a * b + Math.sqrt(a)
}

export function dummyFunction11() { return 'dummy11' }
export function dummyFunction12() { return 'dummy12' }
export function dummyFunction13() { return 'dummy13' }
`,
			"src/user-utils.ts": "",
			"src/product-utils.ts": "",
		}

		createTestFilesWithAutoLoad(setup, testFiles)

		const sourceFilePath = path.join(setup.projectDir, "src/large-file.ts")
		const userUtilsPath = path.join(setup.projectDir, "src/user-utils.ts")
		const productUtilsPath = path.join(setup.projectDir, "src/product-utils.ts")

		// Verify target files are actually empty
		expect(fs.readFileSync(userUtilsPath, "utf-8").trim()).toBe("")
		expect(fs.readFileSync(productUtilsPath, "utf-8").trim()).toBe("")

		// Define batch operations that reproduce the exact bug scenario
		const operations: BatchOperations = {
			operations: [
				// 1-2: Rename operations (these should succeed)
				{
					operation: "rename",
					selector: {
						type: "identifier",
						name: "UserService",
						kind: "class",
						filePath: "src/large-file.ts",
					},
					newName: "UserManager",
				} as RenameOperation,
				{
					operation: "rename",
					selector: {
						type: "identifier",
						name: "ProductService",
						kind: "class",
						filePath: "src/large-file.ts",
					},
					newName: "ProductManager",
				} as RenameOperation,

				// 3-5: Move operations to EMPTY target files (these were failing due to race condition)
				{
					operation: "move",
					selector: {
						type: "identifier",
						name: "formatUserName",
						kind: "function",
						filePath: "src/large-file.ts",
					},
					targetFilePath: "src/user-utils.ts",
				} as MoveOperation,
				{
					operation: "move",
					selector: {
						type: "identifier",
						name: "calculateTotalPrice",
						kind: "function",
						filePath: "src/large-file.ts",
					},
					targetFilePath: "src/product-utils.ts",
				} as MoveOperation,
				{
					operation: "move",
					selector: {
						type: "identifier",
						name: "complexCalculation",
						kind: "function",
						filePath: "src/large-file.ts",
					},
					targetFilePath: "src/user-utils.ts",
				} as MoveOperation,
			],
		}

		const result = await setup.engine.executeBatch(operations)

		// All operations should succeed
		expect(result.success).toBe(true)
		result.results.forEach((opResult, index) => {
			if (!opResult.success) {
				console.error(`Operation ${index} failed:`, opResult.error)
			}
			expect(opResult.success).toBe(true)
		})

		// Verify the moves were successful
		const userUtilsContent = fs.readFileSync(userUtilsPath, "utf-8")
		const productUtilsContent = fs.readFileSync(productUtilsPath, "utf-8")

		expect(userUtilsContent).toContain("formatUserName")
		expect(userUtilsContent).toContain("complexCalculation")
		expect(productUtilsContent).toContain("calculateTotalPrice")
	})

	it("should handle multiple moves to the same empty target file", async () => {
		// Create test files using standardized approach
		const testFiles = {
			"src/source.ts": `
export function utilityA() { return 'A' }
export function utilityB() { return 'B' }
export function utilityC() { return 'C' }
`,
			"src/utilities.ts": "",
		}

		createTestFilesWithAutoLoad(setup, testFiles)

		const targetFilePath = path.join(setup.projectDir, "src/utilities.ts")

		// Verify target file is empty
		expect(fs.readFileSync(targetFilePath, "utf-8").trim()).toBe("")

		const operations: BatchOperations = {
			operations: [
				{
					operation: "move",
					selector: {
						type: "identifier",
						name: "utilityA",
						kind: "function",
						filePath: "src/source.ts",
					},
					targetFilePath: "src/utilities.ts",
				} as MoveOperation,
				{
					operation: "move",
					selector: {
						type: "identifier",
						name: "utilityB",
						kind: "function",
						filePath: "src/source.ts",
					},
					targetFilePath: "src/utilities.ts",
				} as MoveOperation,
				{
					operation: "move",
					selector: {
						type: "identifier",
						name: "utilityC",
						kind: "function",
						filePath: "src/source.ts",
					},
					targetFilePath: "src/utilities.ts",
				} as MoveOperation,
			],
		}

		const result = await setup.engine.executeBatch(operations)

		// All operations should succeed
		expect(result.success).toBe(true)
		result.results.forEach((opResult) => {
			expect(opResult.success).toBe(true)
		})

		// Verify all functions are in target file
		const targetContent = fs.readFileSync(targetFilePath, "utf-8")
		expect(targetContent).toContain("utilityA")
		expect(targetContent).toContain("utilityB")
		expect(targetContent).toContain("utilityC")
	})

	it("should properly detect real naming conflicts vs false positives", async () => {
		// Create test files using standardized approach
		const testFiles = {
			"src/source.ts": `
export function myFunction() { return 'source' }
`,
			"src/target.ts": `
export function myFunction() { return 'target' }
`,
		}

		createTestFilesWithAutoLoad(setup, testFiles)

		const operations: BatchOperations = {
			operations: [
				{
					operation: "move",
					selector: {
						type: "identifier",
						name: "myFunction",
						kind: "function",
						filePath: "src/source.ts",
					},
					targetFilePath: "src/target.ts",
				} as MoveOperation,
			],
		}

		const result = await setup.engine.executeBatch(operations)

		// This SHOULD fail due to real naming conflict
		expect(result.success).toBe(false)
		expect(result.results[0].success).toBe(false)
		expect(result.results[0].error).toContain("Naming conflict")
	})
})
