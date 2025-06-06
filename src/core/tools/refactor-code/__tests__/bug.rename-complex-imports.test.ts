import { describe, it, expect, beforeAll, afterAll } from "@jest/globals"
import {
	createRefactorEngineTestSetupWithAutoLoad,
	createTestFilesWithAutoLoad,
	RefactorEngineTestSetup,
} from "./utils/standardized-test-setup"
import * as fs from "fs"
import * as path from "path"

describe("Rename Complex Imports Bug", () => {
	let setup: RefactorEngineTestSetup

	beforeAll(() => {
		setup = createRefactorEngineTestSetupWithAutoLoad()
	})

	afterAll(() => {
		setup.cleanup()
	})

	it("should reproduce the bug with mixed import styles", async () => {
		// Create the exact scenario that fails
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
			 return Utils.processData(items)  // Use namespace import for valid TypeScript
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

		// Verify the operation succeeded
		expect(result.success).toBe(true)

		// Read files after rename
		const afterUtils = fs.readFileSync(path.join(setup.projectDir, "utils.ts"), "utf-8")
		const afterComplex = fs.readFileSync(path.join(setup.projectDir, "complexImports.ts"), "utf-8")

		// Check function definition was renamed
		expect(afterUtils).toContain("export function transformData(data: string[]): string[]")
		expect(afterUtils).not.toContain("export function processData")

		// Check aliased import was updated
		expect(afterComplex).toContain("import { transformData as process, validateInput }")
		expect(afterComplex).not.toContain("processData as process")

		// Critical test - namespace function call should be updated
		expect(afterComplex).toContain("return Utils.transformData(items)")
		expect(afterComplex).not.toContain("return Utils.processData(items)")
	})

	it("should debug the exact reference finding issue", async () => {
		// Create the problematic scenario
		createTestFilesWithAutoLoad(setup, {
			"source.ts": `
export function targetFunction(): string {
    return "test"
}
`,
			"problematic.ts": `
import { targetFunction as alias, targetFunction } from './source'
import * as Source from './source'

export function test1(): string {
    return alias()  // This should be renamed
}

export function test2(): string {
    return targetFunction()  // This should be renamed - this is the problem case
}

export function test3(): string {
    return Source.targetFunction()  // This should be renamed
}
`,
		})

		// Get access to the internal project for debugging
		const engine = setup.engine as any
		const project = engine.project

		const sourceFile = project.getSourceFile("source.ts")
		const func = sourceFile.getFunction("targetFunction")

		// Find and verify references
		const references = func.findReferencesAsNodes()
		expect(references.length).toBeGreaterThan(0)

		// Perform the rename
		func.rename("renamedTargetFunction")

		// Verify all references were updated
		const afterProblematic = project.getSourceFile("problematic.ts")?.getFullText()
		expect(afterProblematic).toBeDefined()
		expect(afterProblematic).not.toContain("targetFunction()")
		expect(afterProblematic).toContain("renamedTargetFunction()")
	})
})
