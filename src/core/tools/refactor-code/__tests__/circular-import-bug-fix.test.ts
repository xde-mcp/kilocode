import { describe, it, expect, beforeEach, afterEach } from "@jest/globals"
import {
	createRefactorEngineTestSetupWithAutoLoad,
	RefactorEngineTestSetup,
	createTestFilesWithAutoLoad,
} from "./utils/standardized-test-setup"
import * as fs from "fs"
import * as path from "path"

describe("Circular Import Bug Fix (RCT-001)", () => {
	let setup: RefactorEngineTestSetup

	beforeEach(() => {
		setup = createRefactorEngineTestSetupWithAutoLoad()
	})

	afterEach(() => {
		setup.cleanup()
	})

	it("should prevent circular imports when moving a function to a file that already imports it", async () => {
		// Create the exact scenario from the bug report
		const userUtilsContent = `export interface User {
	name: string
	email: string
}

export function formatUserDisplayName(user: User): string {
	return user.name.toUpperCase()
}

export function validateEmail(email: string): boolean {
	return email.includes('@')
}`

		const largeFileContent = `import { formatUserDisplayName, User } from './user-utils'

export function processUser(user: User): string {
	return formatUserDisplayName(user)
}

export function anotherFunction(): string {
	return 'hello world'
}`

		// Create test files
		createTestFilesWithAutoLoad(setup, {
			"user-utils.ts": userUtilsContent,
			"large-file.ts": largeFileContent,
		})

		// Execute the move operation that previously caused circular imports
		const operations = [
			{
				operation: "move" as const,
				selector: {
					type: "identifier" as const,
					name: "formatUserDisplayName",
					kind: "function" as const,
					filePath: "user-utils.ts",
				},
				targetFilePath: "large-file.ts",
				reason: "Test circular import prevention",
			},
		]

		// Execute the operation
		const result = await setup.engine.executeBatch({ operations })

		// Verify the operation succeeded
		expect(result.success).toBe(true)
		expect(result.results).toHaveLength(1)
		expect(result.results[0].success).toBe(true)

		// Get the updated file contents
		const updatedLargeFile = fs.readFileSync(path.join(setup.projectDir, "large-file.ts"), "utf-8")
		const updatedUserUtils = fs.readFileSync(path.join(setup.projectDir, "user-utils.ts"), "utf-8")

		console.log("=== UPDATED LARGE FILE ===")
		console.log(updatedLargeFile)
		console.log("=== UPDATED USER UTILS ===")
		console.log(updatedUserUtils)

		// CRITICAL: Verify no circular import was created
		expect(updatedLargeFile).not.toContain("import { formatUserDisplayName } from './large-file'")
		expect(updatedLargeFile).not.toContain("from './large-file'")

		// Verify the function was moved to the target file
		expect(updatedLargeFile).toContain("export function formatUserDisplayName(user: User): string {")
		expect(updatedLargeFile).toContain("return user.name.toUpperCase()")

		// Verify the function was removed from the source file
		expect(updatedUserUtils).not.toContain("export function formatUserDisplayName")

		// Verify the User interface import is still present (since it's still needed)
		expect(updatedLargeFile).toContain("import { User } from './user-utils'")

		// Verify the function call still works
		expect(updatedLargeFile).toContain("return formatUserDisplayName(user)")

		// Verify no broken imports remain
		const importLines = updatedLargeFile.split("\n").filter((line) => line.trim().startsWith("import"))
		for (const importLine of importLines) {
			// No import should reference the same file
			expect(importLine).not.toContain("from './large-file'")
		}
	})

	it("should handle multiple imports from the same source file correctly", async () => {
		// Test scenario where target file imports multiple symbols from source
		const sourceContent = `export function functionA(): string {
	return 'A'
}

export function functionB(): string {
	return 'B'
}

export function functionC(): string {
	return 'C'
}`

		const targetContent = `import { functionA, functionB } from './source'

export function useFunction(): string {
	return functionA() + functionB()
}`

		createTestFilesWithAutoLoad(setup, {
			"source.ts": sourceContent,
			"target.ts": targetContent,
		})

		// Move functionA to target (should remove it from import but keep functionB)
		const operations = [
			{
				operation: "move" as const,
				selector: {
					type: "identifier" as const,
					name: "functionA",
					kind: "function" as const,
					filePath: "source.ts",
				},
				targetFilePath: "target.ts",
				reason: "Test partial import cleanup",
			},
		]

		const result = await setup.engine.executeBatch({ operations })
		expect(result.success).toBe(true)

		const updatedTarget = fs.readFileSync(path.join(setup.projectDir, "target.ts"), "utf-8")
		console.log("=== UPDATED TARGET (PARTIAL IMPORT) ===")
		console.log(updatedTarget)

		// Should still import functionB but not import functionA
		expect(updatedTarget).toContain("import { functionB } from './source'")
		expect(updatedTarget).not.toContain("import { functionA")

		// Should contain the moved function
		expect(updatedTarget).toContain("export function functionA(): string {")
	})

	it("should remove entire import declaration when moving the only imported symbol", async () => {
		// Test scenario where target file only imports the symbol being moved
		const sourceContent = `export function onlyFunction(): string {
	return 'only'
}

export function otherFunction(): string {
	return 'other'
}`

		const targetContent = `import { onlyFunction } from './source'

export function useFunction(): string {
	return onlyFunction()
}`

		createTestFilesWithAutoLoad(setup, {
			"source.ts": sourceContent,
			"target.ts": targetContent,
		})

		// Move the only imported function
		const operations = [
			{
				operation: "move" as const,
				selector: {
					type: "identifier" as const,
					name: "onlyFunction",
					kind: "function" as const,
					filePath: "source.ts",
				},
				targetFilePath: "target.ts",
				reason: "Test complete import removal",
			},
		]

		const result = await setup.engine.executeBatch({ operations })
		expect(result.success).toBe(true)

		const updatedTarget = fs.readFileSync(path.join(setup.projectDir, "target.ts"), "utf-8")
		console.log("=== UPDATED TARGET (COMPLETE IMPORT REMOVAL) ===")
		console.log(updatedTarget)

		// Should not contain any import from source
		expect(updatedTarget).not.toContain("from './source'")
		expect(updatedTarget).not.toContain("import")

		// Should contain the moved function
		expect(updatedTarget).toContain("export function onlyFunction(): string {")
	})
})
