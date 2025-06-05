import { describe, it, expect, beforeAll, afterAll } from "@jest/globals"
import {
	createRefactorEngineTestSetupWithAutoLoad,
	createTestFilesWithAutoLoad,
	RefactorEngineTestSetup,
} from "./utils/standardized-test-setup"
import * as fs from "fs"
import * as path from "path"

describe("Rename Cross-File Bug Reproduction", () => {
	let setup: RefactorEngineTestSetup

	beforeAll(() => {
		setup = createRefactorEngineTestSetupWithAutoLoad()
	})

	afterAll(() => {
		setup.cleanup()
	})

	it("should rename exported function and update all imports and references across files", async () => {
		// Create the main file with the function to be renamed
		createTestFilesWithAutoLoad(setup, {
			"mathUtils.ts": `
export function calculateTotal(items: number[]): number {
    return items.reduce((sum, item) => sum + item, 0)
}

export function getAverage(items: number[]): number {
    return calculateTotal(items) / items.length
}
`,
			"orderService.ts": `
import { calculateTotal, getAverage } from './mathUtils'

export class OrderService {
    getTotalPrice(prices: number[]): number {
        return calculateTotal(prices)
    }
    
    getAveragePrice(prices: number[]): number {
        return calculateTotal(prices) / prices.length
    }
    
    processOrder(items: number[]): { total: number, average: number } {
        const total = calculateTotal(items)
        return { total, average: getAverage(items) }
    }
}
`,
			"salesReport.ts": `
import { calculateTotal } from './mathUtils'

export function generateSalesReport(sales: number[]): string {
    const total = calculateTotal(sales)
    const average = calculateTotal(sales) / sales.length
    return \`Total: \${total}, Average: \${average}\`
}
`,
			"orderSummary.ts": `
import { calculateTotal } from './mathUtils'

export function createOrderSummary(orderValues: number[]): string {
    return \`Order total: \${calculateTotal(orderValues)}\`
}
`,
			"dataProcessor.ts": `
import { calculateTotal } from './mathUtils'

export class DataProcessor {
    processData(data: number[]): number {
        return calculateTotal(data) * 1.1
    }
    
    validateData(data: number[]): boolean {
        return calculateTotal(data) > 0
    }
}
`,
		})

		// Perform the rename operation
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

		// Verify the operation succeeded
		expect(result.success).toBe(true)
		expect(result.results).toHaveLength(1)
		expect(result.results[0].success).toBe(true)

		// Read all files and verify the rename was applied everywhere
		const mathUtils = fs.readFileSync(path.join(setup.projectDir, "mathUtils.ts"), "utf-8")
		const orderService = fs.readFileSync(path.join(setup.projectDir, "orderService.ts"), "utf-8")
		const salesReport = fs.readFileSync(path.join(setup.projectDir, "salesReport.ts"), "utf-8")
		const orderSummary = fs.readFileSync(path.join(setup.projectDir, "orderSummary.ts"), "utf-8")
		const dataProcessor = fs.readFileSync(path.join(setup.projectDir, "dataProcessor.ts"), "utf-8")

		// Verify function definition was renamed
		expect(mathUtils).toContain("export function computeSum(items: number[]): number")
		expect(mathUtils).not.toContain("export function calculateTotal")

		// Verify internal reference in same file was updated
		expect(mathUtils).toContain("return computeSum(items) / items.length")
		expect(mathUtils).not.toContain("calculateTotal(items)")

		// Verify import statements were updated
		expect(orderService).toContain("import { computeSum, getAverage } from './mathUtils'")
		expect(orderService).not.toContain("calculateTotal")

		expect(salesReport).toContain("import { computeSum } from './mathUtils'")
		expect(salesReport).not.toContain("calculateTotal")

		expect(orderSummary).toContain("import { computeSum } from './mathUtils'")
		expect(orderSummary).not.toContain("calculateTotal")

		expect(dataProcessor).toContain("import { computeSum } from './mathUtils'")
		expect(dataProcessor).not.toContain("calculateTotal")

		// Verify function calls were updated
		expect(orderService).toContain("return computeSum(prices)")
		expect(orderService).toContain("return computeSum(prices) / prices.length")
		expect(orderService).toContain("const total = computeSum(items)")

		expect(salesReport).toContain("const total = computeSum(sales)")
		expect(salesReport).toContain("const average = computeSum(sales) / sales.length")

		expect(orderSummary).toContain("Order total: ${computeSum(orderValues)}")

		expect(dataProcessor).toContain("return computeSum(data) * 1.1")
		expect(dataProcessor).toContain("return computeSum(data) > 0")

		// Ensure no old references remain
		expect(orderService).not.toContain("calculateTotal")
		expect(salesReport).not.toContain("calculateTotal")
		expect(orderSummary).not.toContain("calculateTotal")
		expect(dataProcessor).not.toContain("calculateTotal")
	})

	it("should handle complex import scenarios with aliases and multiple imports", async () => {
		// Create files with more complex import patterns
		createTestFilesWithAutoLoad(setup, {
			"utils.ts": `
export function processData(data: string[]): string[] {
    return data.map(item => item.trim())
}

export function validateInput(input: string): boolean {
    return input.length > 0
}
`,
			"complexImports.ts": `
import { processData as process, validateInput } from './utils'
import * as Utils from './utils'

export function handleData(data: string[]): string[] {
    if (Utils.validateInput(data[0])) {
        return process(data)
    }
    return []
}

export function processItems(items: string[]): string[] {
    return processData(items)
}
`,
		})

		// Rename the function
		const renameOperation = {
			operation: "rename" as const,
			selector: {
				type: "identifier" as const,
				name: "processData",
				kind: "function" as const,
				filePath: "utils.ts",
			},
			newName: "transformData",
		}

		const result = await setup.engine.executeBatch({
			operations: [renameOperation],
		})

		expect(result.success).toBe(true)

		const utils = fs.readFileSync(path.join(setup.projectDir, "utils.ts"), "utf-8")
		const complexImports = fs.readFileSync(path.join(setup.projectDir, "complexImports.ts"), "utf-8")

		// Verify function definition was renamed
		expect(utils).toContain("export function transformData(data: string[]): string[]")
		expect(utils).not.toContain("export function processData")

		// Verify aliased import was updated
		expect(complexImports).toContain("import { transformData as process, validateInput }")
		expect(complexImports).not.toContain("processData as process")

		// Verify namespace access was updated
		expect(complexImports).toContain("return transformData(items)")
		expect(complexImports).not.toContain("return processData(items)")
	})
})
