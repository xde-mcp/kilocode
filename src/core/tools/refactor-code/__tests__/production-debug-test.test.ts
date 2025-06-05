import { RefactorEngine } from "../engine"
import { MoveOperation } from "../schema"
import * as fs from "fs"
import * as path from "path"
import {
	createRefactorEngineTestSetup,
	RefactorEngineTestSetup,
	createTestFilesWithAutoLoad,
	TestFileStructure,
} from "./utils/standardized-test-setup"

describe("Production Debug Test - Pre-Population Race Condition", () => {
	let setup: RefactorEngineTestSetup

	beforeAll(() => {
		setup = createRefactorEngineTestSetup()
	})

	afterAll(() => {
		setup.cleanup()
	})

	it("should generate comprehensive debug logs for production comparison", async () => {
		console.log(`[PRODUCTION DEBUG] 🚀 === STARTING PRODUCTION DEBUG TEST ===`)
		console.log(`[PRODUCTION DEBUG] 🚀 Test environment: ${setup.projectDir}`)
		console.log(`[PRODUCTION DEBUG] 🚀 Engine instance: ${setup.engine.constructor.name}`)

		// Create initial test files
		const initialFiles: TestFileStructure = {
			"source.ts": 'export function testFunction() { return "test"; }',
			"target.ts": "// Some existing content\n",
		}

		createTestFilesWithAutoLoad(setup, initialFiles)

		console.log(`[PRODUCTION DEBUG] 🚀 Created initial files:`)
		console.log(`[PRODUCTION DEBUG] 🚀 - source.ts: "${initialFiles["source.ts"]}"`)
		console.log(`[PRODUCTION DEBUG] 🚀 - target.ts: "${initialFiles["target.ts"]}"`)

		// First operation - should succeed
		console.log(`[PRODUCTION DEBUG] 🚀 === EXECUTING FIRST OPERATION ===`)
		const firstResult = await setup.engine.executeBatch({
			operations: [
				{
					operation: "move" as const,
					selector: {
						type: "identifier" as const,
						name: "testFunction",
						kind: "function" as const,
						filePath: "source.ts",
					},
					targetFilePath: "target.ts",
					reason: "First move operation - should succeed",
				} as MoveOperation,
			],
			options: { stopOnError: true },
		})

		console.log(`[PRODUCTION DEBUG] 🚀 First operation result: ${firstResult.success}`)
		if (!firstResult.success) {
			console.log(`[PRODUCTION DEBUG] 🚀 First operation error: ${firstResult.error}`)
		}

		// Check target file content after first operation
		const targetContentAfterFirst = fs.readFileSync(path.join(setup.projectDir, "target.ts"), "utf-8")
		console.log(`[PRODUCTION DEBUG] 🚀 Target content after first operation: "${targetContentAfterFirst}"`)

		// Create second source file
		console.log(`[PRODUCTION DEBUG] 🚀 === CREATING SECOND SOURCE FILE ===`)
		const secondFiles: TestFileStructure = {
			"source2.ts": 'export function testFunction() { return "test2"; }',
		}

		createTestFilesWithAutoLoad(setup, secondFiles)

		console.log(`[PRODUCTION DEBUG] 🚀 Created second source file:`)
		console.log(`[PRODUCTION DEBUG] 🚀 - source2.ts: "${secondFiles["source2.ts"]}"`)

		// Second operation - should fail due to naming conflict
		console.log(`[PRODUCTION DEBUG] 🚀 === EXECUTING SECOND OPERATION ===`)
		const secondResult = await setup.engine.executeBatch({
			operations: [
				{
					operation: "move" as const,
					selector: {
						type: "identifier" as const,
						name: "testFunction",
						kind: "function" as const,
						filePath: "source2.ts",
					},
					targetFilePath: "target.ts",
					reason: "Second move operation - should fail due to naming conflict",
				} as MoveOperation,
			],
			options: { stopOnError: true },
		})

		console.log(`[PRODUCTION DEBUG] 🚀 Second operation result: ${secondResult.success}`)
		if (!secondResult.success) {
			console.log(`[PRODUCTION DEBUG] 🚀 Second operation error: ${secondResult.error}`)
		}

		// Check final target file content
		const finalTargetContent = fs.readFileSync(path.join(setup.projectDir, "target.ts"), "utf-8")
		console.log(`[PRODUCTION DEBUG] 🚀 Final target content: "${finalTargetContent}"`)

		// Count function occurrences
		const functionCount = (finalTargetContent.match(/function testFunction/g) || []).length
		console.log(`[PRODUCTION DEBUG] 🚀 Function count in target file: ${functionCount}`)

		// Check all project files
		console.log(`[PRODUCTION DEBUG] 🚀 === FINAL PROJECT STATE ===`)
		const projectFiles = ["source.ts", "target.ts", "source2.ts"]
		for (const fileName of projectFiles) {
			const filePath = path.join(setup.projectDir, fileName)
			if (fs.existsSync(filePath)) {
				const content = fs.readFileSync(filePath, "utf-8")
				console.log(`[PRODUCTION DEBUG] 🚀 File ${fileName}: "${content}"`)
			} else {
				console.log(`[PRODUCTION DEBUG] 🚀 File ${fileName}: NOT FOUND`)
			}
		}

		console.log(`[PRODUCTION DEBUG] 🚀 === TEST COMPLETE ===`)

		// Test expectations
		expect(firstResult.success).toBe(true)

		// In our test environment, this should fail (and it does)
		// In production, this might succeed due to the bug
		console.log(`[PRODUCTION DEBUG] 🚀 Expected second operation to fail: ${!secondResult.success}`)
		console.log(`[PRODUCTION DEBUG] 🚀 Expected function count to be 1: ${functionCount === 1}`)

		// The key test: second operation should fail
		expect(secondResult.success).toBe(false)
		expect(secondResult.error).toContain("Naming conflict")
		expect(functionCount).toBe(1)
	})
})
