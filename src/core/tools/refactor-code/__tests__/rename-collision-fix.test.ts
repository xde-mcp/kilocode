import {
	createRefactorEngineTestSetupWithAutoLoad,
	createTestFilesWithAutoLoad,
	RefactorEngineTestSetup,
} from "./utils/standardized-test-setup"
import { RenameOperation } from "../schema"

describe("RenameOrchestrator - Name Collision Fix", () => {
	let setup: RefactorEngineTestSetup

	beforeAll(() => {
		setup = createRefactorEngineTestSetupWithAutoLoad()
	})

	afterAll(() => {
		setup.cleanup()
	})

	it("should prevent renaming method to existing method name in same class", async () => {
		// Create a class with two methods - this is the exact scenario from the bug report
		createTestFilesWithAutoLoad(setup, {
			"test-class.ts": `
export class StringUtils {
	public capitalize(str: string): string {
		return str.charAt(0).toUpperCase() + str.slice(1)
	}
	
	public lowercase(str: string): string {
		return str.toLowerCase()
	}
}
			`.trim(),
		})

		// Try to rename 'lowercase' to 'capitalize' - this should fail due to collision
		const operation: RenameOperation = {
			operation: "rename",
			scope: "project",
			selector: {
				type: "identifier",
				name: "lowercase",
				kind: "method",
				filePath: "test-class.ts",
			},
			newName: "capitalize", // This should conflict with existing capitalize method
		}

		const result = await setup.engine.executeOperation(operation)

		expect(result.success).toBe(false)
		expect(result.error).toContain("Method 'capitalize' already exists in class 'StringUtils'")
	})

	it("should allow renaming method to unique name in same class", async () => {
		createTestFilesWithAutoLoad(setup, {
			"test-valid.ts": `
export class MathUtils {
	public add(a: number, b: number): number {
		return a + b
	}
	
	public subtract(a: number, b: number): number {
		return a - b
	}
}
			`.trim(),
		})

		// Rename 'add' to 'sum' - this should succeed as 'sum' doesn't exist
		const operation: RenameOperation = {
			operation: "rename",
			scope: "project",
			selector: {
				type: "identifier",
				name: "add",
				kind: "method",
				filePath: "test-valid.ts",
			},
			newName: "sum", // This should be allowed as 'sum' doesn't exist
		}

		const result = await setup.engine.executeOperation(operation)

		expect(result.success).toBe(true)
		expect(result.error).toBeUndefined()
	})
})
