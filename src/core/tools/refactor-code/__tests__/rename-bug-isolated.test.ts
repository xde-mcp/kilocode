import { describe, it, expect, beforeAll, afterAll } from "@jest/globals"
import {
	createRefactorEngineTestSetupWithAutoLoad,
	createTestFilesWithAutoLoad,
	RefactorEngineTestSetup,
} from "./utils/standardized-test-setup"
import * as fs from "fs"
import * as path from "path"

describe("Rename Bug - Isolated Reproduction", () => {
	let setup: RefactorEngineTestSetup

	beforeAll(() => {
		setup = createRefactorEngineTestSetupWithAutoLoad()
	})

	afterAll(() => {
		setup.cleanup()
	})

	it("should reproduce the exact rename bug - missing direct function call references", async () => {
		// Create minimal test case that reproduces the bug
		createTestFilesWithAutoLoad(setup, {
			"utils.ts": `
export function processData(data: string[]): string[] {
    return data.map(item => item.trim())
}
`,
			"consumer.ts": `
import { processData } from './utils'

export function processItems(items: string[]): string[] {
    return processData(items)  // This should be renamed but isn't
}
`,
		})

		// Perform rename operation
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

		const afterUtils = fs.readFileSync(path.join(setup.projectDir, "utils.ts"), "utf-8")
		const afterConsumer = fs.readFileSync(path.join(setup.projectDir, "consumer.ts"), "utf-8")

		// Verify the operation succeeded
		expect(result.success).toBe(true)

		// Check what was actually renamed
		expect(afterUtils).toContain("export function transformData(data: string[]): string[]")
		expect(afterUtils).not.toContain("export function processData")

		// This is where the bug manifests - the import should be updated
		expect(afterConsumer).toContain("import { transformData } from './utils'")
		expect(afterConsumer).not.toContain("processData")

		// This is the critical test - the function call should be updated
		expect(afterConsumer).toContain("return transformData(items)")
		expect(afterConsumer).not.toContain("return processData(items)")
	})

	it("should debug ts-morph rename behavior step by step", async () => {
		// Create test files
		createTestFilesWithAutoLoad(setup, {
			"source.ts": `
export function myFunction(): string {
    return "hello"
}
`,
			"caller.ts": `
import { myFunction } from './source'

export function callIt(): string {
    return myFunction()
}
`,
		})

		// Get access to the internal project to debug ts-morph behavior
		const engine = setup.engine as any
		const project = engine.project

		// Find the function
		const sourceFile = project.getSourceFile("source.ts")
		if (!sourceFile) {
			throw new Error("Source file not found")
		}

		const func = sourceFile.getFunction("myFunction")
		if (!func) {
			throw new Error("Function not found")
		}

		// Try the rename
		func.rename("renamedFunction")

		// Check results
		const afterSource = sourceFile.getFullText()
		const callerFile = project.getSourceFile("caller.ts")
		const afterCaller = callerFile?.getFullText() || "FILE NOT FOUND"

		// Verify rename worked
		expect(afterSource).toContain("export function renamedFunction(): string")
		expect(afterCaller).toContain("import { renamedFunction } from")
		expect(afterCaller).toContain("return renamedFunction()")
	})
})
