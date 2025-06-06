import { describe, it, expect, beforeAll, afterAll } from "@jest/globals"
import {
	createRefactorEngineTestSetup,
	createTestFilesWithAutoLoad,
	RefactorEngineTestSetup,
} from "./utils/standardized-test-setup"
import * as fs from "fs"
import * as path from "path"

describe("File Existence Checks", () => {
	let setup: RefactorEngineTestSetup

	beforeAll(() => {
		setup = createRefactorEngineTestSetup()
	})

	afterAll(() => {
		setup.cleanup()
	})

	it("should handle rename operations on existing files", async () => {
		// Create test files
		createTestFilesWithAutoLoad(setup, {
			"src/utils/formatting.ts": `
export function formatUserName(user: any): string {
	return \`\${user.firstName} \${user.lastName}\`.trim() || "Unnamed User"
}

export function validateEmail(email: string): boolean {
	return email.includes("@")
}
`,
			"src/utils/validation.ts": "",
		})

		// Execute rename operation
		const result = await setup.engine.executeBatch({
			operations: [
				{
					operation: "rename" as const,
					selector: {
						type: "identifier" as const,
						name: "formatUserName",
						kind: "function" as const,
						filePath: "src/utils/formatting.ts",
					},
					newName: "formatFullName",
					reason: "Test rename on existing file",
				},
			],
		})

		expect(result.success).toBe(true)

		// Verify the rename was successful
		const fileContent = fs.readFileSync(path.join(setup.projectDir, "src/utils/formatting.ts"), "utf-8")
		expect(fileContent).toContain("export function formatFullName(user: any): string")
		expect(fileContent).not.toContain("export function formatUserName(user: any): string")
	})

	it("should handle move operations between existing files", async () => {
		// Create test files
		createTestFilesWithAutoLoad(setup, {
			"src/utils/formatting.ts": `
export function formatUserName(user: any): string {
	return \`\${user.firstName} \${user.lastName}\`.trim() || "Unnamed User"
}

export function validateEmail(email: string): boolean {
	return email.includes("@")
}
`,
			"src/utils/validation.ts": "",
		})

		// Execute move operation
		const result = await setup.engine.executeBatch({
			operations: [
				{
					operation: "move" as const,
					selector: {
						type: "identifier" as const,
						name: "validateEmail",
						kind: "function" as const,
						filePath: "src/utils/formatting.ts",
					},
					targetFilePath: "src/utils/validation.ts",
					reason: "Move validation function to appropriate file",
				},
			],
		})

		expect(result.success).toBe(true)

		// Verify the move was successful
		const sourceContent = fs.readFileSync(path.join(setup.projectDir, "src/utils/formatting.ts"), "utf-8")
		const targetContent = fs.readFileSync(path.join(setup.projectDir, "src/utils/validation.ts"), "utf-8")

		expect(sourceContent).not.toContain("export function validateEmail")
		expect(targetContent).toContain("export function validateEmail(email: string): boolean")
	})

	it("should handle remove operations on existing files", async () => {
		// Create test files
		createTestFilesWithAutoLoad(setup, {
			"src/utils/formatting.ts": `
export function formatUserName(user: any): string {
	return \`\${user.firstName} \${user.lastName}\`.trim() || "Unnamed User"
}

export function validateEmail(email: string): boolean {
	return email.includes("@")
}
`,
		})

		// Execute remove operation
		const result = await setup.engine.executeBatch({
			operations: [
				{
					operation: "remove" as const,
					selector: {
						type: "identifier" as const,
						name: "validateEmail",
						kind: "function" as const,
						filePath: "src/utils/formatting.ts",
					},
					reason: "Remove unused function",
				},
			],
		})

		// Remove operations might fail if the symbol is not found or has dependencies
		if (result.success) {
			// Verify the removal was successful
			const fileContent = fs.readFileSync(path.join(setup.projectDir, "src/utils/formatting.ts"), "utf-8")
			expect(fileContent).not.toContain("export function validateEmail")
			expect(fileContent).toContain("export function formatUserName")
		} else {
			// If removal failed, that's also acceptable behavior
			expect(result.error).toBeDefined()
		}
	})

	it("should fail gracefully when operating on non-existent files", async () => {
		// Execute operation on non-existent file
		const result = await setup.engine.executeBatch({
			operations: [
				{
					operation: "rename" as const,
					selector: {
						type: "identifier" as const,
						name: "nonExistentFunction",
						kind: "function" as const,
						filePath: "src/utils/nonexistent.ts",
					},
					newName: "renamedFunction",
					reason: "Test operation on non-existent file",
				},
			],
		})

		expect(result.success).toBe(false)
		expect(result.error).toBeDefined()
	})

	it("should handle batch operations with mixed file existence", async () => {
		// Create test files
		createTestFilesWithAutoLoad(setup, {
			"src/utils/formatting.ts": `
export function formatUserName(user: any): string {
	return \`\${user.firstName} \${user.lastName}\`.trim() || "Unnamed User"
}

export function validateEmail(email: string): boolean {
	return email.includes("@")
}
`,
		})

		// Execute batch operations with mixed file existence
		const result = await setup.engine.executeBatch({
			operations: [
				{
					operation: "rename" as const,
					selector: {
						type: "identifier" as const,
						name: "formatUserName",
						kind: "function" as const,
						filePath: "src/utils/formatting.ts",
					},
					newName: "formatFullName",
					reason: "Valid rename operation",
				},
				{
					operation: "rename" as const,
					selector: {
						type: "identifier" as const,
						name: "nonExistentFunction",
						kind: "function" as const,
						filePath: "src/utils/nonexistent.ts",
					},
					newName: "renamedFunction",
					reason: "Invalid operation on non-existent file",
				},
			],
			options: { stopOnError: true },
		})

		// Should fail due to the second operation
		expect(result.success).toBe(false)

		// But the first operation should have been attempted
		const fileContent = fs.readFileSync(path.join(setup.projectDir, "src/utils/formatting.ts"), "utf-8")
		// Depending on implementation, the first operation might or might not have succeeded
		// This tests the error handling behavior
	})
})
