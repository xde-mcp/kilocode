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
		// Create initial test files
		const initialFiles: TestFileStructure = {
			"source.ts": 'export function testFunction() { return "test"; }',
			"target.ts": "// Some existing content\n",
		}

		createTestFilesWithAutoLoad(setup, initialFiles)

		// First operation - should succeed
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

		// Check target file content after first operation
		const targetContentAfterFirst = fs.readFileSync(path.join(setup.projectDir, "target.ts"), "utf-8")

		// Create second source file
		const secondFiles: TestFileStructure = {
			"source2.ts": 'export function testFunction() { return "test2"; }',
		}

		createTestFilesWithAutoLoad(setup, secondFiles)

		// Second operation - should fail due to naming conflict
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

		// Check final target file content
		const finalTargetContent = fs.readFileSync(path.join(setup.projectDir, "target.ts"), "utf-8")

		// Count function occurrences
		const functionCount = (finalTargetContent.match(/function testFunction/g) || []).length

		// Test expectations
		expect(firstResult.success).toBe(true)

		// The key test: second operation should fail
		expect(secondResult.success).toBe(false)
		expect(secondResult.error).toContain("Naming conflict")
		expect(functionCount).toBe(1)
	})
})
