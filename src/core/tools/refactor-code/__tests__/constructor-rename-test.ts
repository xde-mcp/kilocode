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

	it("should find and rename constructor method within a class", async () => {
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
				console.log(`Found ${constructors.length} constructors`)
				expect(constructors).toHaveLength(1)
			}
		}

		// Execute rename operation for constructor
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
					reason: "Testing renaming a constructor method within a class",
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
