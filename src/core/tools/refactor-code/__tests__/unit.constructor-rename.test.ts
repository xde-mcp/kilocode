import { describe, it, expect, beforeAll, afterAll } from "@jest/globals"
import {
	createRefactorEngineTestSetupWithAutoLoad,
	RefactorEngineTestSetup,
	createTestFilesWithAutoLoad,
} from "./utils/standardized-test-setup"

describe("Constructor Rename Bug Fix Test", () => {
	let setup: RefactorEngineTestSetup

	beforeAll(() => {
		setup = createRefactorEngineTestSetupWithAutoLoad()
	})

	afterAll(() => {
		setup.cleanup()
	})

	it("should find and rename a method within a class", async () => {
		// Create test file with a simple class containing a method
		createTestFilesWithAutoLoad(setup, {
			"User.ts": `
export class UserValidationError extends Error {
	 constructor(message: string) {
	   super(message);
	   this.name = 'UserValidationError';
	 }

	 validateMessage(message: string): boolean {
	   return message && message.length > 0;
	 }

	 getErrorDetails(): string {
	   return this.validateMessage(this.message) ? this.message : 'Invalid error message';
	 }
}
	           `.trim(),
		})

		// First, let's verify the method exists
		const project = setup.engine.getProject()
		project.getSourceFiles().forEach((file) => {
			file.refreshFromFileSystemSync()
		})
		const sourceFile = project.getSourceFiles().find((f) => f.getFilePath().endsWith("User.ts"))
		expect(sourceFile).toBeDefined()

		if (sourceFile) {
			const userClass = sourceFile.getClass("UserValidationError")
			expect(userClass).toBeDefined()

			if (userClass) {
				const methods = userClass.getMethods()
				console.log(
					`Found ${methods.length} methods:`,
					methods.map((m) => m.getName()),
				)
				expect(methods.length).toBeGreaterThan(0)
			}
		}

		// Execute rename operation for method
		const result = await setup.engine.executeBatch({
			operations: [
				{
					operation: "rename" as const,
					selector: {
						type: "identifier" as const,
						name: "validateMessage",
						kind: "method" as const,
						filePath: "User.ts",
						scope: {
							type: "class" as const,
							name: "UserValidationError",
						},
					},
					newName: "isValidMessage",
					reason: "Testing renaming a method within a class",
				},
			],
		})

		// Log the result for debugging
		console.log("Rename result:", JSON.stringify(result, null, 2))

		// Verify operation succeeded
		expect(result.success).toBe(true)
		expect(result.results).toHaveLength(1)
		expect(result.results[0].success).toBe(true)
	})
})
