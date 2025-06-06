/**
 * Pre-Population Bug Fix Test
 *
 * This test verifies the fix for the pre-population race condition bug where:
 * 1. Tool pre-populates target files with symbols during execution
 * 2. Subsequent operations detect conflicts with content the tool itself added
 * 3. Instead of silently skipping (production bug), tool should fail with proper error
 *
 * The fix ensures MoveExecutor throws naming conflict errors instead of silently
 * returning success when symbols already exist in target files.
 */

import { RefactorEngine } from "../engine"
import {
	createRefactorEngineTestSetup,
	RefactorEngineTestSetup,
	createTestFilesWithAutoLoad,
	TestFileStructure,
} from "./utils/standardized-test-setup"
import { MoveOperation } from "../schema"
import * as fs from "fs"
import * as path from "path"

describe("Pre-Population Bug Fix", () => {
	let setup: RefactorEngineTestSetup

	beforeAll(() => {
		setup = createRefactorEngineTestSetup()
	})

	afterAll(() => {
		setup.cleanup()
	})

	describe("Validation Bypass Prevention", () => {
		it("should fail with naming conflict when symbol already exists (not silently skip)", async () => {
			// Create initial files
			const initialFiles: TestFileStructure = {
				"source1.ts": 'export function testFunction() { return "first"; }',
				"source2.ts": 'export function testFunction() { return "second"; }',
				"target.ts": "// Target file",
			}
			createTestFilesWithAutoLoad(setup, initialFiles)

			// First operation: Move testFunction from source1 to target
			const firstResult = await setup.engine.executeBatch({
				operations: [
					{
						operation: "move" as const,
						selector: {
							type: "identifier" as const,
							name: "testFunction",
							kind: "function" as const,
							filePath: "source1.ts",
						},
						targetFilePath: "target.ts",
						reason: "First move operation",
					} as MoveOperation,
				],
				options: { stopOnError: true },
			})

			expect(firstResult.success).toBe(true)
			expect(firstResult.results).toHaveLength(1)
			expect(firstResult.results[0].success).toBe(true)

			// Verify target file has the function
			const targetContent = fs.readFileSync(path.join(setup.projectDir, "target.ts"), "utf-8")
			expect(targetContent).toContain("export function testFunction()")
			expect(targetContent).toContain('return "first"')

			// Second operation: Try to move another testFunction from source2 to target
			// This should FAIL with naming conflict, not silently skip
			const secondResult = await setup.engine.executeBatch({
				operations: [
					{
						operation: "move" as const,
						selector: {
							type: "identifier" as const,
							name: "testFunction",
							kind: "function" as const,
							filePath: "source2.ts",
						},
						targetFilePath: "target.ts",
						reason: "Second move operation - should fail",
					} as MoveOperation,
				],
				options: { stopOnError: true },
			})

			// CRITICAL: This should fail, not succeed
			expect(secondResult.success).toBe(false)
			expect(secondResult.results).toHaveLength(1)
			expect(secondResult.results[0].success).toBe(false)
			expect(secondResult.results[0].error).toContain("Naming conflict")
			expect(secondResult.results[0].error).toContain("testFunction")
			expect(secondResult.results[0].error).toContain("already exists")

			// Verify target file still only has the first function
			const finalTargetContent = fs.readFileSync(path.join(setup.projectDir, "target.ts"), "utf-8")
			expect(finalTargetContent).toContain('return "first"')
			expect(finalTargetContent).not.toContain('return "second"')

			// Count function declarations - should be exactly 1
			const functionCount = (finalTargetContent.match(/function testFunction/g) || []).length
			expect(functionCount).toBe(1)
		})

		it("should fail when trying to move to file with existing symbol (direct conflict)", async () => {
			// Create files where target already has the symbol
			const files: TestFileStructure = {
				"source.ts": 'export function conflictFunction() { return "source"; }',
				"target.ts": 'export function conflictFunction() { return "target"; }',
			}
			createTestFilesWithAutoLoad(setup, files)

			// Try to move conflictFunction from source to target
			const result = await setup.engine.executeBatch({
				operations: [
					{
						operation: "move" as const,
						selector: {
							type: "identifier" as const,
							name: "conflictFunction",
							kind: "function" as const,
							filePath: "source.ts",
						},
						targetFilePath: "target.ts",
						reason: "Direct conflict test",
					} as MoveOperation,
				],
				options: { stopOnError: true },
			})

			// Should fail with naming conflict
			expect(result.success).toBe(false)
			expect(result.results[0].success).toBe(false)
			expect(result.results[0].error).toContain("Naming conflict")
			expect(result.results[0].error).toContain("conflictFunction")

			// Verify target file unchanged
			const targetContent = fs.readFileSync(path.join(setup.projectDir, "target.ts"), "utf-8")
			expect(targetContent).toContain('return "target"')
			expect(targetContent).not.toContain('return "source"')
		})

		it("should handle batch operations with proper conflict detection", async () => {
			// Create multiple source files trying to move same symbol to same target
			const files: TestFileStructure = {
				"source1.ts": 'export function batchFunction() { return "first"; }',
				"source2.ts": 'export function batchFunction() { return "second"; }',
				"source3.ts": 'export function batchFunction() { return "third"; }',
				"target.ts": "// Batch target",
			}
			createTestFilesWithAutoLoad(setup, files)

			// Try to move all three functions to same target in one batch
			const result = await setup.engine.executeBatch({
				operations: [
					{
						operation: "move" as const,
						selector: {
							type: "identifier" as const,
							name: "batchFunction",
							kind: "function" as const,
							filePath: "source1.ts",
						},
						targetFilePath: "target.ts",
						reason: "Batch operation 1",
					} as MoveOperation,
					{
						operation: "move" as const,
						selector: {
							type: "identifier" as const,
							name: "batchFunction",
							kind: "function" as const,
							filePath: "source2.ts",
						},
						targetFilePath: "target.ts",
						reason: "Batch operation 2",
					} as MoveOperation,
					{
						operation: "move" as const,
						selector: {
							type: "identifier" as const,
							name: "batchFunction",
							kind: "function" as const,
							filePath: "source3.ts",
						},
						targetFilePath: "target.ts",
						reason: "Batch operation 3",
					} as MoveOperation,
				],
				options: { stopOnError: false }, // Continue on error to see all failures
			})

			// First operation should succeed, subsequent should fail
			expect(result.success).toBe(false) // Overall batch fails
			expect(result.results).toHaveLength(3)

			// First operation succeeds
			expect(result.results[0].success).toBe(true)

			// Second and third operations fail with naming conflicts
			expect(result.results[1].success).toBe(false)
			expect(result.results[1].error).toContain("Naming conflict")
			expect(result.results[2].success).toBe(false)
			expect(result.results[2].error).toContain("Naming conflict")

			// Verify only first function made it to target
			const targetContent = fs.readFileSync(path.join(setup.projectDir, "target.ts"), "utf-8")
			expect(targetContent).toContain('return "first"')
			expect(targetContent).not.toContain('return "second"')
			expect(targetContent).not.toContain('return "third"')

			// Verify function count
			const functionCount = (targetContent.match(/function batchFunction/g) || []).length
			expect(functionCount).toBe(1)
		})
	})

	describe("Production Environment Alignment", () => {
		it("should use same validation logic as production RefactorCodeTool", async () => {
			// This test ensures our test environment uses the same code paths as production
			// to prevent validation bypass bugs from going undetected

			const files: TestFileStructure = {
				"source.ts": 'export function prodFunction() { return "test"; }',
				"target.ts": 'export function prodFunction() { return "existing"; }',
			}
			createTestFilesWithAutoLoad(setup, files)

			// Use the same operation structure as production RefactorCodeTool
			const result = await setup.engine.executeBatch({
				operations: [
					{
						operation: "move" as const,
						selector: {
							type: "identifier" as const,
							name: "prodFunction",
							kind: "function" as const,
							filePath: "source.ts",
						},
						targetFilePath: "target.ts",
						reason: "Production alignment test",
					} as MoveOperation,
				],
				options: { stopOnError: true },
			})

			// Should fail exactly like production would
			expect(result.success).toBe(false)
			expect(result.results[0].success).toBe(false)
			expect(result.results[0].error).toMatch(/naming conflict/i)
			expect(result.results[0].error).toContain("prodFunction")

			// Verify no silent skipping occurred
			const targetContent = fs.readFileSync(path.join(setup.projectDir, "target.ts"), "utf-8")
			expect(targetContent).toContain('return "existing"')
			expect(targetContent).not.toContain('return "test"')
		})

		it("should prevent silent success when MoveExecutor encounters existing symbols", async () => {
			// This specifically tests the MoveExecutor.addSymbolToTargetFile fix
			// where it used to return true (success) when symbols already existed

			const files: TestFileStructure = {
				"source.ts": 'export function silentFunction() { return "new"; }',
				"target.ts": 'export function silentFunction() { return "old"; }',
			}
			createTestFilesWithAutoLoad(setup, files)

			const result = await setup.engine.executeBatch({
				operations: [
					{
						operation: "move" as const,
						selector: {
							type: "identifier" as const,
							name: "silentFunction",
							kind: "function" as const,
							filePath: "source.ts",
						},
						targetFilePath: "target.ts",
						reason: "Silent success prevention test",
					} as MoveOperation,
				],
				options: { stopOnError: true },
			})

			// CRITICAL: Must fail, not silently succeed
			expect(result.success).toBe(false)
			expect(result.results[0].success).toBe(false)
			expect(result.results[0].error).toContain("Naming conflict")

			// Verify original content preserved
			const targetContent = fs.readFileSync(path.join(setup.projectDir, "target.ts"), "utf-8")
			expect(targetContent).toContain('return "old"')
			expect(targetContent).not.toContain('return "new"')
		})
	})
})
