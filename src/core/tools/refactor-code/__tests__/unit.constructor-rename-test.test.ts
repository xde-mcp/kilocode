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

	it("should handle constructor rename gracefully (expected to fail)", async () => {
		// Create test file with a simple class containing a constructor
		createTestFilesWithAutoLoad(setup, {
			"User.ts": `
export class UserValidationError extends Error {
	 constructor(message: string) {
	   super(message);
	   this.name = 'UserValidationError';
	 }
}
	           `.trim(),
		})

		// First, let's verify the constructor exists
		const sourceFile = setup.engine.getProject().getSourceFile("User.ts")
		expect(sourceFile).toBeDefined()

		if (sourceFile) {
			const userClass = sourceFile.getClass("UserValidationError")
			expect(userClass).toBeDefined()

			if (userClass) {
				const constructors = userClass.getConstructors()
				expect(constructors).toHaveLength(1)
			}
		}

		// Execute rename operation for constructor - this should fail gracefully
		// because constructors cannot be renamed in TypeScript/JavaScript
		const result = await setup.engine.executeBatch({
			operations: [
				{
					operation: "rename" as const,
					selector: {
						type: "identifier" as const,
						name: "constructor",
						kind: "method" as const,
						filePath: "User.ts",
						scope: {
							type: "class" as const,
							name: "UserValidationError",
						},
					},
					newName: "initialize",
					reason: "Testing constructor rename handling (should fail gracefully)",
				},
			],
		})

		// Verify operation fails gracefully (constructors cannot be renamed)
		expect(result.success).toBe(false)
		expect(result.results).toHaveLength(1)
		expect(result.results[0].success).toBe(false)
		expect(result.results[0].error).toContain("constructor")
	})
})
