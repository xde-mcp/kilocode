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

		console.log("\n=== BEFORE RENAME ===")
		const beforeUtils = fs.readFileSync(path.join(setup.projectDir, "utils.ts"), "utf-8")
		const beforeComplex = fs.readFileSync(path.join(setup.projectDir, "complexImports.ts"), "utf-8")
		console.log("utils.ts:", beforeUtils)
		console.log("complexImports.ts:", beforeComplex)

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

		console.log("\n=== RENAME RESULT ===")
		console.log("Success:", result.success)

		console.log("\n=== AFTER RENAME ===")
		const afterUtils = fs.readFileSync(path.join(setup.projectDir, "utils.ts"), "utf-8")
		const afterComplex = fs.readFileSync(path.join(setup.projectDir, "complexImports.ts"), "utf-8")
		console.log("utils.ts:", afterUtils)
		console.log("complexImports.ts:", afterComplex)

		// Verify the operation succeeded
		expect(result.success).toBe(true)

		// Check function definition was renamed
		expect(afterUtils).toContain("export function transformData(data: string[]): string[]")
		expect(afterUtils).not.toContain("export function processData")

		// Check aliased import was updated
		expect(afterComplex).toContain("import { transformData as process, validateInput }")
		expect(afterComplex).not.toContain("processData as process")

		// This is the critical test - the direct function call should be updated
		console.log("\n=== CRITICAL TEST ===")
		console.log("Looking for: return transformData(items)")
		console.log("File contains:", afterComplex.includes("return transformData(items)"))
		console.log("File still contains old call:", afterComplex.includes("return processData(items)"))

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

		// Get access to the internal project to debug
		const engine = setup.engine as any
		const project = engine.project

		console.log("\n=== DEBUGGING REFERENCE FINDING ===")

		const sourceFile = project.getSourceFile("source.ts")
		const func = sourceFile.getFunction("targetFunction")

		console.log("Function found:", func.getName())

		// Find references manually
		const references = func.findReferencesAsNodes()
		console.log("Total references found:", references.length)

		references.forEach((ref: any, index: number) => {
			const sourceFile = ref.getSourceFile()
			const filePath = sourceFile.getFilePath()
			const fileName = path.basename(filePath)
			const text = ref.getText()
			const parent = ref.getParent()
			const parentText = parent?.getText() || "NO PARENT"

			console.log(`Reference ${index + 1}:`, {
				file: fileName,
				text: text,
				kind: ref.getKindName(),
				parentKind: parent?.getKindName(),
				parentText: parentText.substring(0, 50) + (parentText.length > 50 ? "..." : ""),
				pos: ref.getPos(),
			})
		})

		// Try the rename and see what happens
		console.log("\n=== PERFORMING RENAME ===")
		func.rename("renamedTargetFunction")

		const afterProblematic = project.getSourceFile("problematic.ts")?.getFullText()
		console.log("\n=== AFTER RENAME ===")
		console.log("Problematic file after rename:", afterProblematic)

		// Check if all references were updated
		const hasOldReference = afterProblematic?.includes("targetFunction()")
		const hasNewReference = afterProblematic?.includes("renamedTargetFunction()")

		console.log("Still has old reference:", hasOldReference)
		console.log("Has new reference:", hasNewReference)
	})
})
