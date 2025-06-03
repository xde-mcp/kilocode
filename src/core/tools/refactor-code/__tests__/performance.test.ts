import { Project } from "ts-morph"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"
import { performance } from "perf_hooks"
import { RefactorEngine } from "../engine"
import { BatchOperations } from "../schema"

/**
 * Performance tests for the refactoring engine
 *
 * These tests measure the performance improvements from our optimizations.
 * They run a series of operations in batch mode and compare the execution time
 * with and without various optimizations.
 */
describe("Refactor Engine Performance Tests", () => {
	// Setup temp directories and files for testing
	let tempDir: string
	let projectDir: string
	let srcDir: string
	let utilsDir: string
	let componentsDir: string
	let testFilePaths: string[] = []

	/**
	 * Generate a TypeScript file with a specified number of functions
	 */
	function generateTsFile(functions: number, prefix: string): string {
		let content = "// Generated TypeScript file\n\n"

		for (let i = 1; i <= functions; i++) {
			content += `/**\n * ${prefix}Function${i} description\n */\nexport function ${prefix}Function${i}(param${i}: string): string {\n  return param${i} + "${i}";\n}\n\n`
		}

		return content
	}

	/**
	 * Generate a TypeScript file that imports functions from other files
	 */
	function generateImportFile(functionNames: string[], importPath: string, prefix: string): string {
		let content = `// Generated Import File\n\n`
		content += `import { ${functionNames.join(", ")} } from "${importPath}";\n\n`

		for (let i = 0; i < functionNames.length; i++) {
			content += `export function use${prefix}${i}(): string {\n  return ${functionNames[i]}("test");\n}\n\n`
		}

		return content
	}

	/**
	 * Run a performance test with the given operations
	 */
	async function runPerformanceTest(
		engine: RefactorEngine,
		operations: BatchOperations,
		testName: string,
	): Promise<number> {
		const start = performance.now()
		const result = await engine.executeBatch(operations)
		const duration = performance.now() - start

		console.log(`[PERF TEST] ${testName} completed in ${duration.toFixed(2)}ms`)
		console.log(
			`[PERF TEST] ${testName} average per operation: ${(duration / operations.operations.length).toFixed(2)}ms`,
		)

		// Verify success
		expect(result.success).toBe(true)

		return duration
	}

	beforeAll(() => {
		// Create temp directory structure for tests
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "refactor-performance-test-"))
		projectDir = path.join(tempDir, "project")
		srcDir = path.join(projectDir, "src")
		utilsDir = path.join(srcDir, "utils")
		componentsDir = path.join(srcDir, "components")

		// Create directories
		fs.mkdirSync(projectDir, { recursive: true })
		fs.mkdirSync(srcDir, { recursive: true })
		fs.mkdirSync(utilsDir, { recursive: true })
		fs.mkdirSync(componentsDir, { recursive: true })

		// Create test files
		const utilsFunctionsFile = path.join(utilsDir, "functions.ts")
		const mathFunctionsFile = path.join(utilsDir, "math.ts")
		const stringFunctionsFile = path.join(utilsDir, "string.ts")
		const componentAFile = path.join(componentsDir, "ComponentA.ts")
		const componentBFile = path.join(componentsDir, "ComponentB.ts")
		const componentCFile = path.join(componentsDir, "ComponentC.ts")

		// Generate content for each file
		fs.writeFileSync(utilsFunctionsFile, generateTsFile(50, "utils"))
		fs.writeFileSync(mathFunctionsFile, generateTsFile(50, "math"))
		fs.writeFileSync(stringFunctionsFile, generateTsFile(50, "string"))

		// Generate components that import utility functions
		const utilsFunctionNames = Array.from({ length: 20 }, (_, i) => `utilsFunction${i + 1}`)
		const mathFunctionNames = Array.from({ length: 20 }, (_, i) => `mathFunction${i + 1}`)
		const stringFunctionNames = Array.from({ length: 20 }, (_, i) => `stringFunction${i + 1}`)

		fs.writeFileSync(
			componentAFile,
			generateImportFile(utilsFunctionNames.slice(0, 10), "../utils/functions", "Utils"),
		)
		fs.writeFileSync(componentBFile, generateImportFile(mathFunctionNames.slice(0, 10), "../utils/math", "Math"))
		fs.writeFileSync(
			componentCFile,
			generateImportFile(
				[...stringFunctionNames.slice(0, 5), ...utilsFunctionNames.slice(10, 15)],
				"../utils/string",
				"Mixed",
			),
		)

		// Save file paths for later use
		testFilePaths = [
			utilsFunctionsFile,
			mathFunctionsFile,
			stringFunctionsFile,
			componentAFile,
			componentBFile,
			componentCFile,
		]

		console.log(`[TEST SETUP] Created test project at: ${projectDir}`)
	})

	afterAll(() => {
		// Clean up temp directory
		fs.rmSync(tempDir, { recursive: true, force: true })
	})

	test("Batch rename operations performance test", async () => {
		// Initialize RefactorEngine
		const engine = new RefactorEngine({
			projectRootPath: projectDir,
		})

		// Create a batch of rename operations
		const operations: BatchOperations = {
			operations: Array.from({ length: 20 }, (_, i) => ({
				operation: "rename",
				selector: {
					type: "identifier",
					name: `utilsFunction${i + 1}`,
					kind: "function",
					filePath: path.relative(projectDir, path.join(utilsDir, "functions.ts")),
				},
				newName: `optimizedFunction${i + 1}`,
				scope: "project",
				reason: "Performance testing of rename operations",
			})),
			options: {
				stopOnError: true,
			},
		}

		// Run the test
		const duration = await runPerformanceTest(engine, operations, "Batch rename operations")

		// We're not making assertions about specific timings since they can vary by environment,
		// but we can log them for manual verification
		console.log(`[PERF RESULT] Batch rename operations completed in ${duration.toFixed(2)}ms`)
	})

	test("Mixed operations performance test", async () => {
		// Initialize RefactorEngine
		const engine = new RefactorEngine({
			projectRootPath: projectDir,
		})

		// Create a mixed batch of operations (rename, move)
		const operations: BatchOperations = {
			operations: [
				// 5 rename operations
				...Array.from({ length: 5 }, (_, i) => ({
					operation: "rename",
					selector: {
						type: "identifier",
						name: `mathFunction${i + 1}`,
						kind: "function",
						filePath: path.relative(projectDir, path.join(utilsDir, "math.ts")),
					},
					newName: `calculationFunction${i + 1}`,
					scope: "project",
					reason: "Performance testing of mixed operations",
				})),

				// 5 move operations
				...Array.from({ length: 5 }, (_, i) => ({
					operation: "move",
					selector: {
						type: "identifier",
						name: `stringFunction${i + 6}`,
						kind: "function",
						filePath: path.relative(projectDir, path.join(utilsDir, "string.ts")),
					},
					targetFilePath: path.relative(projectDir, path.join(componentsDir, "StringUtils.ts")),
					reason: "Performance testing of mixed operations",
				})),
			],
			options: {
				stopOnError: true,
			},
		}

		// Run the test
		const duration = await runPerformanceTest(engine, operations, "Mixed operations")

		// Log performance results
		console.log(`[PERF RESULT] Mixed operations completed in ${duration.toFixed(2)}ms`)
	})

	test("Large batch operations performance test", async () => {
		// Skip in CI environments if needed
		if (process.env.CI) {
			console.log("Skipping large performance test in CI environment")
			return
		}

		// Initialize RefactorEngine
		const engine = new RefactorEngine({
			projectRootPath: projectDir,
		})

		// Create a large batch of operations
		const operations: BatchOperations = {
			operations: [
				// 30 rename operations
				...Array.from({ length: 30 }, (_, i) => ({
					operation: "rename",
					selector: {
						type: "identifier",
						name: `mathFunction${i + 11}`,
						kind: "function",
						filePath: path.relative(projectDir, path.join(utilsDir, "math.ts")),
					},
					newName: `performanceFunction${i + 1}`,
					scope: "project",
					reason: "Performance testing of large batch",
				})),
			],
			options: {
				stopOnError: false, // Continue on error for stress testing
			},
		}

		// Run the test
		const duration = await runPerformanceTest(engine, operations, "Large batch operations")

		// Log performance results
		console.log(`[PERF RESULT] Large batch operations completed in ${duration.toFixed(2)}ms`)
		console.log(
			`[PERF RESULT] Average time per operation: ${(duration / operations.operations.length).toFixed(2)}ms`,
		)
	})

	test("Multiple file operations performance test", async () => {
		// Initialize RefactorEngine
		const engine = new RefactorEngine({
			projectRootPath: projectDir,
		})

		// Create operations that touch different files
		const operations: BatchOperations = {
			operations: [
				// Operations on ComponentA
				{
					operation: "rename",
					selector: {
						type: "identifier",
						name: "useUtils0",
						kind: "function",
						filePath: path.relative(projectDir, path.join(componentsDir, "ComponentA.ts")),
					},
					newName: "useUtilityFunction0",
					scope: "file",
					reason: "Performance testing of multi-file operations",
				},

				// Operations on ComponentB
				{
					operation: "rename",
					selector: {
						type: "identifier",
						name: "useMath0",
						kind: "function",
						filePath: path.relative(projectDir, path.join(componentsDir, "ComponentB.ts")),
					},
					newName: "useCalculation0",
					scope: "file",
					reason: "Performance testing of multi-file operations",
				},

				// Operations on ComponentC
				{
					operation: "rename",
					selector: {
						type: "identifier",
						name: "useMixed0",
						kind: "function",
						filePath: path.relative(projectDir, path.join(componentsDir, "ComponentC.ts")),
					},
					newName: "useHelperFunction0",
					scope: "file",
					reason: "Performance testing of multi-file operations",
				},
			],
			options: {
				stopOnError: true,
			},
		}

		// Run the test
		const duration = await runPerformanceTest(engine, operations, "Multi-file operations")

		// Log performance results
		console.log(`[PERF RESULT] Multi-file operations completed in ${duration.toFixed(2)}ms`)
	})
})
