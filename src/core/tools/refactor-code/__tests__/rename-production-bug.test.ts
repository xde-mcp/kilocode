import { describe, it, expect, beforeAll, afterAll } from "@jest/globals"
import {
	createRefactorEngineTestSetupWithAutoLoad,
	createTestFilesWithAutoLoad,
	RefactorEngineTestSetup,
} from "./utils/standardized-test-setup"
import * as fs from "fs"
import * as path from "path"

describe("Rename Production Bug - Valid TypeScript Not Renamed", () => {
	let setup: RefactorEngineTestSetup

	beforeAll(() => {
		setup = createRefactorEngineTestSetupWithAutoLoad()
	})

	afterAll(() => {
		setup.cleanup()
	})

	it("should rename all valid references including namespace-accessible calls", async () => {
		// Reproduce the EXACT production scenario from bug report
		createTestFilesWithAutoLoad(setup, {
			"mathUtils.ts": `
export function calculateTotal(items: number[]): number {
    return items.reduce((sum, item) => sum + item, 0)
}

export function calculateAverage(items: number[]): number {
    return calculateTotal(items) / items.length
}
`,
			"orderService.ts": `
import { calculateTotal, calculateAverage } from './mathUtils'
import * as MathUtils from './mathUtils'

export function processOrder(items: number[]): { total: number, average: number } {
    // These should ALL be renamed to computeSum:
    const total1 = calculateTotal(items)  // Direct import usage
    const total2 = MathUtils.calculateTotal(items)  // Namespace usage
    const average = calculateAverage(items)  // Other function that calls it internally
    
    return { total: total1 + total2, average }
}
`,
			"salesReport.ts": `
import { calculateTotal } from './mathUtils'

export function generateReport(orders: number[][]): number {
    return orders.reduce((sum, order) => sum + calculateTotal(order), 0)
}
`,
		})

		console.log("\n=== BEFORE RENAME ===")
		const beforeOrderService = fs.readFileSync(path.join(setup.projectDir, "orderService.ts"), "utf-8")
		const beforeSalesReport = fs.readFileSync(path.join(setup.projectDir, "salesReport.ts"), "utf-8")
		const beforeMathUtils = fs.readFileSync(path.join(setup.projectDir, "mathUtils.ts"), "utf-8")

		console.log("orderService.ts:", beforeOrderService)
		console.log("salesReport.ts:", beforeSalesReport)
		console.log("mathUtils.ts:", beforeMathUtils)

		// Perform the rename operation that failed in production
		const renameOperation = {
			operation: "rename" as const,
			selector: {
				type: "identifier" as const,
				name: "calculateTotal",
				kind: "function" as const,
				filePath: "mathUtils.ts",
			},
			newName: "computeSum",
		}

		const result = await setup.engine.executeBatch({
			operations: [renameOperation],
		})

		console.log("\n=== RENAME RESULT ===")
		console.log("Success:", result.success)
		if (!result.success) {
			console.log("Error:", result.error)
		}

		console.log("\n=== AFTER RENAME ===")
		const afterOrderService = fs.readFileSync(path.join(setup.projectDir, "orderService.ts"), "utf-8")
		const afterSalesReport = fs.readFileSync(path.join(setup.projectDir, "salesReport.ts"), "utf-8")
		const afterMathUtils = fs.readFileSync(path.join(setup.projectDir, "mathUtils.ts"), "utf-8")

		console.log("orderService.ts:", afterOrderService)
		console.log("salesReport.ts:", afterSalesReport)
		console.log("mathUtils.ts:", afterMathUtils)

		// Verify the operation succeeded
		expect(result.success).toBe(true)

		// Verify function definition was renamed
		expect(afterMathUtils).toContain("export function computeSum(")
		expect(afterMathUtils).not.toContain("export function calculateTotal(")

		// Verify internal reference was renamed
		expect(afterMathUtils).toContain("return computeSum(items) / items.length")

		// CRITICAL: Verify ALL imports were updated
		expect(afterOrderService).toContain("import { computeSum, calculateAverage } from './mathUtils'")
		expect(afterOrderService).not.toContain("calculateTotal")
		expect(afterSalesReport).toContain("import { computeSum } from './mathUtils'")
		expect(afterSalesReport).not.toContain("calculateTotal")

		// CRITICAL: Verify ALL function calls were updated
		expect(afterOrderService).toContain("const total1 = computeSum(items)")
		expect(afterOrderService).toContain("const total2 = MathUtils.computeSum(items)")
		expect(afterSalesReport).toContain("sum + computeSum(order)")

		// Verify no broken references remain
		expect(afterOrderService).not.toContain("calculateTotal")
		expect(afterSalesReport).not.toContain("calculateTotal")
	})
})
