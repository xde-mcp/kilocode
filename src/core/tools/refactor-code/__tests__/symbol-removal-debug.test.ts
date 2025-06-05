import { describe, it, expect, beforeAll, afterAll } from "@jest/globals"
import {
	createRefactorEngineTestSetup,
	RefactorEngineTestSetup,
	createTestFilesWithAutoLoad,
} from "./utils/standardized-test-setup"
import { BatchOperations } from "../schema"

describe("Symbol Removal Debug", () => {
	let setup: RefactorEngineTestSetup

	beforeAll(() => {
		setup = createRefactorEngineTestSetup()
	})

	afterAll(() => {
		setup.cleanup()
	})

	it("should properly remove symbols during batch operations", async () => {
		// Create test files
		const testFiles = {
			"src/utils.ts": `
export function formatUserName(firstName: string, lastName: string): string {
    return \`\${firstName} \${lastName}\`
}

export function calculateTotalPrice(items: Array<{ price: number }>): number {
    return items.reduce((total, item) => total + item.price, 0)
}

export function validateEmail(email: string): boolean {
    return email.includes('@')
}
`,
			"src/user-utils.ts": `
// User-related utilities
export function getUserDisplayName(user: { name: string }): string {
    return user.name
}
`,
			"src/product-utils.ts": `
// Product-related utilities  
export function getProductName(product: { name: string }): string {
    return product.name
}
`,
		}

		createTestFilesWithAutoLoad(setup, testFiles)

		// Test single operation first
		console.log("=== TESTING SINGLE OPERATION ===")
		const singleOperation: BatchOperations = {
			operations: [
				{
					operation: "move" as const,
					selector: {
						name: "formatUserName",
						filePath: "src/utils.ts",
						kind: "function" as const,
					},
					targetFilePath: "src/user-utils.ts",
				},
			],
		}

		const singleResult = await setup.engine.executeBatch(singleOperation)
		expect(singleResult.success).toBe(true)

		// Check that formatUserName was removed from utils.ts
		const utilsFileAfterFirst = setup.engine.getProject().getSourceFile("src/utils.ts")
		console.log("=== UTILS.TS CONTENT AFTER FIRST OPERATION ===")
		console.log(utilsFileAfterFirst?.getFullText())

		const formatUserNameFunction = utilsFileAfterFirst?.getFunction("formatUserName")
		console.log(
			"formatUserName function after first operation:",
			formatUserNameFunction ? "STILL PRESENT" : "REMOVED",
		)
		expect(formatUserNameFunction).toBeUndefined()

		// Test second operation
		console.log("=== TESTING SECOND OPERATION ===")
		const secondOperation: BatchOperations = {
			operations: [
				{
					operation: "move" as const,
					selector: {
						name: "calculateTotalPrice",
						filePath: "src/utils.ts",
						kind: "function" as const,
					},
					targetFilePath: "src/product-utils.ts",
				},
			],
		}

		const secondResult = await setup.engine.executeBatch(secondOperation)
		expect(secondResult.success).toBe(true)

		// Check that calculateTotalPrice was removed from utils.ts
		const utilsFileAfterSecond = setup.engine.getProject().getSourceFile("src/utils.ts")
		console.log("=== UTILS.TS CONTENT AFTER SECOND OPERATION ===")
		console.log(utilsFileAfterSecond?.getFullText())

		const calculateTotalPriceFunction = utilsFileAfterSecond?.getFunction("calculateTotalPrice")
		console.log(
			"calculateTotalPrice function after second operation:",
			calculateTotalPriceFunction ? "STILL PRESENT" : "REMOVED",
		)
		expect(calculateTotalPriceFunction).toBeUndefined()
	})
})
