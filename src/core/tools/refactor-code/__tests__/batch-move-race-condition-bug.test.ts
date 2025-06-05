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
import { createRefactorEngineTestSetup, RefactorEngineTestSetup } from "./utils/standardized-test-setup"
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
		// Create source file with functions to move
		const sourceFilePath = path.join(setup.projectDir, "src/large-file.ts")
		const userUtilsPath = path.join(setup.projectDir, "src/user-utils.ts")
		const productUtilsPath = path.join(setup.projectDir, "src/product-utils.ts")

		// Ensure directories exist
		fs.mkdirSync(path.dirname(sourceFilePath), { recursive: true })
		fs.mkdirSync(path.dirname(userUtilsPath), { recursive: true })
		fs.mkdirSync(path.dirname(productUtilsPath), { recursive: true })

		// Create source file with functions to move
		fs.writeFileSync(
			sourceFilePath,
			`
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
			"utf-8",
		)

		// Create EMPTY target files - this is critical for reproducing the bug
		fs.writeFileSync(userUtilsPath, "", "utf-8")
		fs.writeFileSync(productUtilsPath, "", "utf-8")

		// Verify target files are actually empty
		expect(fs.readFileSync(userUtilsPath, "utf-8").trim()).toBe("")
		expect(fs.readFileSync(productUtilsPath, "utf-8").trim()).toBe("")

		// CRITICAL: Load all files into the RefactorEngine project
		// This ensures the engine can find and manipulate the files
		const project = setup.engine.getProject()
		if (project) {
			project.addSourceFileAtPath(sourceFilePath)
			project.addSourceFileAtPath(userUtilsPath)
			project.addSourceFileAtPath(productUtilsPath)
		}

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
					newName: "UserDataService",
				} as RenameOperation,
				{
					operation: "rename",
					selector: {
						type: "identifier",
						name: "ProductService",
						kind: "class",
						filePath: "src/large-file.ts",
					},
					newName: "ProductDataService",
				} as RenameOperation,
				// 3: First move operation (this should succeed)
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
				// 4: Second move operation (THIS IS WHERE THE BUG OCCURS)
				// The tool pre-populates product-utils.ts with calculateTotalPrice,
				// then detects a "conflict" with the content it just added
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
				// 5-6: Additional operations to match bug report
				{
					operation: "rename",
					selector: {
						type: "identifier",
						name: "complexCalculation",
						kind: "function",
						filePath: "src/large-file.ts",
					},
					newName: "performComplexCalculation",
				} as RenameOperation,
				{
					operation: "remove",
					selector: {
						type: "identifier",
						name: "dummyFunction11",
						kind: "function",
						filePath: "src/large-file.ts",
					},
				} as RemoveOperation,
			],
		}

		// Execute batch operation - this should succeed but currently fails
		const result = await setup.engine.executeBatch(operations)

		// CRITICAL ASSERTION: The batch should succeed
		// Currently this fails with "Naming conflict: Symbol with name 'calculateTotalPrice' already exists in target file"
		expect(result.success).toBe(true)
		expect(result.results).toHaveLength(6)

		// Verify all operations succeeded
		result.results.forEach((opResult, index) => {
			expect(opResult.success).toBe(true)
			expect(opResult.error).toBeUndefined()
		})

		// Verify the move operations actually worked
		const userUtilsContent = fs.readFileSync(userUtilsPath, "utf-8")
		const productUtilsContent = fs.readFileSync(productUtilsPath, "utf-8")

		// formatUserName should be in user-utils.ts
		expect(userUtilsContent).toContain("formatUserName")
		expect(userUtilsContent).toContain("function formatUserName(name: string): string")

		// calculateTotalPrice should be in product-utils.ts
		expect(productUtilsContent).toContain("calculateTotalPrice")
		expect(productUtilsContent).toContain("function calculateTotalPrice(price: number, tax: number): number")

		// Verify functions were removed from source
		const sourceContent = fs.readFileSync(path.join(setup.projectDir, "src/large-file.ts"), "utf-8")
		expect(sourceContent).not.toContain("function formatUserName")
		expect(sourceContent).not.toContain("function calculateTotalPrice")
		expect(sourceContent).not.toContain("function dummyFunction11")

		// Verify renames worked
		expect(sourceContent).toContain("UserDataService")
		expect(sourceContent).toContain("ProductDataService")
		expect(sourceContent).toContain("performComplexCalculation")
		expect(sourceContent).not.toContain("UserService")
		expect(sourceContent).not.toContain("ProductService")
		expect(sourceContent).not.toContain("complexCalculation")
	})

	it("should handle multiple moves to the same empty target file", async () => {
		// Create source file with multiple functions
		const sourceFilePath = path.join(setup.projectDir, "src/source.ts")
		const targetFilePath = path.join(setup.projectDir, "src/utilities.ts")

		fs.mkdirSync(path.dirname(sourceFilePath), { recursive: true })
		fs.writeFileSync(
			sourceFilePath,
			`
export function utilityA() { return 'A' }
export function utilityB() { return 'B' }
export function utilityC() { return 'C' }
`,
			"utf-8",
		)

		// Create empty target file
		fs.writeFileSync(targetFilePath, "", "utf-8")
		expect(fs.readFileSync(targetFilePath, "utf-8").trim()).toBe("")

		// Move multiple functions to the same empty target
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
		// Create source file
		const sourceFilePath = path.join(setup.projectDir, "src/source.ts")
		const targetFilePath = path.join(setup.projectDir, "src/target.ts")

		fs.mkdirSync(path.dirname(sourceFilePath), { recursive: true })
		fs.writeFileSync(
			sourceFilePath,
			`
export function myFunction() { return 'source' }
`,
			"utf-8",
		)

		// Create target file with ACTUAL existing function
		fs.writeFileSync(
			targetFilePath,
			`
export function myFunction() { return 'target' }
`,
			"utf-8",
		)

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
