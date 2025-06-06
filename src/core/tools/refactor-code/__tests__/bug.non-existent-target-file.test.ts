import { RefactorEngine } from "../engine"
import {
	createRefactorEngineTestSetupWithAutoLoad,
	RefactorEngineTestSetup,
	createTestFilesWithAutoLoad,
} from "./utils/standardized-test-setup"

describe("Non-Existent Target File Bug", () => {
	let setup: RefactorEngineTestSetup

	beforeAll(() => {
		setup = createRefactorEngineTestSetupWithAutoLoad()
	})

	afterAll(() => {
		setup.cleanup()
	})

	it("should handle move to non-existent target file gracefully", async () => {
		// Create source file with enum
		const sourceFileContent = `
export enum OrderStatus {
	PENDING = 'pending',
	PROCESSING = 'processing',
	SHIPPED = 'shipped',
	DELIVERED = 'delivered'
}

export interface Order {
	id: string
	status: OrderStatus
}
`

		// Create a file that imports from the source
		const importingFileContent = `
import { OrderStatus, Order } from './order-types'

export function processOrder(order: Order): string {
	if (order.status === OrderStatus.PENDING) {
		return 'Processing pending order'
	}
	return 'Order already processed'
}
`

		const testFiles = {
			"order-types.ts": sourceFileContent,
			"order-service.ts": importingFileContent,
		}

		createTestFilesWithAutoLoad(setup, testFiles)

		// Attempt to move OrderStatus to a non-existent file
		const operations = [
			{
				operation: "move" as const,
				selector: {
					type: "identifier" as const,
					name: "OrderStatus",
					kind: "enum" as const,
					filePath: "order-types.ts",
				},
				targetFilePath: "non-existent-file.ts", // This file doesn't exist
				reason: "Test non-existent target file handling",
			},
		]

		// This should either:
		// 1. Fail completely without making any changes, OR
		// 2. Create the target file and complete the move successfully
		const result = await setup.engine.executeBatch({ operations })

		console.log("=== OPERATION RESULT ===")
		console.log("Success:", result.success)
		console.log("Operations completed:", result.results.length)
		console.log("Errors:", result.results.map((r) => r.error).filter(Boolean))

		// Check the state of files after the operation
		const sourceFile = setup.engine.getProject().getSourceFile("order-types.ts")
		const targetFile = setup.engine.getProject().getSourceFile("non-existent-file.ts")
		const importingFile = setup.engine.getProject().getSourceFile("order-service.ts")

		console.log("=== SOURCE FILE AFTER OPERATION ===")
		console.log(sourceFile?.getFullText() || "FILE NOT FOUND")

		console.log("=== TARGET FILE AFTER OPERATION ===")
		console.log(targetFile?.getFullText() || "FILE NOT FOUND")

		console.log("=== IMPORTING FILE AFTER OPERATION ===")
		console.log(importingFile?.getFullText() || "FILE NOT FOUND")

		if (result.success) {
			// If operation succeeded, target file should exist and contain the moved symbol
			expect(targetFile).toBeTruthy()
			expect(targetFile?.getFullText()).toContain("enum OrderStatus")

			// Source file should no longer contain the moved symbol
			expect(sourceFile?.getFullText()).not.toContain("enum OrderStatus")

			// Importing file should have updated import
			expect(importingFile?.getFullText()).toContain("from './non-existent-file'")
		} else {
			// If operation failed, no changes should have been made
			expect(sourceFile?.getFullText()).toContain("enum OrderStatus")
			expect(targetFile).toBeFalsy() // Target file should not exist
			expect(importingFile?.getFullText()).toContain("from './order-types'") // Import unchanged
		}

		// CRITICAL: The codebase should NOT be in an inconsistent state
		// Either the move succeeds completely or fails completely
		const sourceHasEnum = sourceFile?.getFullText().includes("enum OrderStatus") || false
		const targetHasEnum = targetFile?.getFullText().includes("enum OrderStatus") || false
		const importingFileText = importingFile?.getFullText() || ""

		// Check specific symbol imports
		// Check for specific import patterns (must be on same line)
		const importsOrderStatusFromTarget = importingFileText.includes("{ OrderStatus } from './non-existent-file'")
		const importsOrderStatusFromSource = importingFileText
			.split("\n")
			.some((line) => line.includes("OrderStatus") && line.includes("from './order-types'"))
		const importsOrderFromSource = importingFileText.includes("{ Order } from './order-types'")

		// Ensure no partial state: enum should exist in exactly one place
		expect(sourceHasEnum || targetHasEnum).toBe(true) // Enum exists somewhere
		expect(sourceHasEnum && targetHasEnum).toBe(false) // Enum doesn't exist in both places

		// Ensure import consistency: OrderStatus import should point to where enum actually exists
		if (sourceHasEnum) {
			expect(importsOrderStatusFromSource).toBe(true)
			expect(importsOrderStatusFromTarget).toBe(false)
		} else if (targetHasEnum) {
			expect(importsOrderStatusFromTarget).toBe(true)
			expect(importsOrderStatusFromSource).toBe(false)
			// Order should still be imported from source (since it wasn't moved)
			expect(importsOrderFromSource).toBe(true)
		}
	})
})
