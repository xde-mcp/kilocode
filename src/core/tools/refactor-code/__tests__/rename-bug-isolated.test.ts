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

		console.log("\n=== BEFORE RENAME ===")
		const beforeUtils = fs.readFileSync(path.join(setup.projectDir, "utils.ts"), "utf-8")
		const beforeConsumer = fs.readFileSync(path.join(setup.projectDir, "consumer.ts"), "utf-8")
		console.log("utils.ts:", beforeUtils)
		console.log("consumer.ts:", beforeConsumer)

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
		console.log("Results:", result.results)

		console.log("\n=== AFTER RENAME ===")
		const afterUtils = fs.readFileSync(path.join(setup.projectDir, "utils.ts"), "utf-8")
		const afterConsumer = fs.readFileSync(path.join(setup.projectDir, "consumer.ts"), "utf-8")
		console.log("utils.ts:", afterUtils)
		console.log("consumer.ts:", afterConsumer)

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

		console.log("\n=== TS-MORPH DEBUG ===")
		console.log(
			"Project files:",
			project.getSourceFiles().map((f: any) => f.getFilePath()),
		)

		// Find the function
		const sourceFile = project.getSourceFile("source.ts")
		if (!sourceFile) {
			throw new Error("Source file not found")
		}

		const func = sourceFile.getFunction("myFunction")
		if (!func) {
			throw new Error("Function not found")
		}

		console.log("Function found:", func.getName())
		console.log("Function text:", func.getText())

		// Check if function is renameable
		console.log("Is renameable:", func.isRenameable?.() ?? "method not available")

		// Find references manually
		const references = func.findReferencesAsNodes()
		console.log("References found:", references.length)
		references.forEach((ref: any, index: number) => {
			console.log(`Reference ${index + 1}:`, {
				file: ref.getSourceFile().getFilePath(),
				text: ref.getText(),
				kind: ref.getKindName(),
				pos: ref.getPos(),
			})
		})

		// Try the rename
		console.log("\n=== PERFORMING RENAME ===")
		func.rename("renamedFunction")

		// Check results
		console.log("\n=== AFTER RENAME ===")
		const afterSource = sourceFile.getFullText()
		const callerFile = project.getSourceFile("caller.ts")
		const afterCaller = callerFile?.getFullText() || "FILE NOT FOUND"

		console.log("Source after rename:", afterSource)
		console.log("Caller after rename:", afterCaller)

		// Verify rename worked
		expect(afterSource).toContain("export function renamedFunction(): string")
		expect(afterCaller).toContain("import { renamedFunction } from")
		expect(afterCaller).toContain("return renamedFunction()")
	})
})
