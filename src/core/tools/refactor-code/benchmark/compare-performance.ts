import * as path from "path"
import * as fs from "fs/promises"
import { Project } from "ts-morph"
import { performance } from "perf_hooks"

// Import old and new APIs
import { RefactorEngine } from "../engine"
import { MoveOperation, RemoveOperation } from "../schema"
import { moveSymbol, removeSymbol, batchOperation, resetRefactorApi } from "../api"

// Test setup
const TEST_DIR = path.resolve(__dirname, "../../../../../test-refactor/benchmark")
const SOURCE_DIR = path.join(TEST_DIR, "src")
const RESULTS_FILE = path.join(TEST_DIR, "benchmark-results.json")

interface BenchmarkResults {
	timestamp: string
	environment: {
		node: string
		platform: string
		arch: string
	}
	tests: {
		name: string
		oldApiTime: number
		newApiTime: number
		improvement: number // percentage
		success: boolean
	}[]
	summary: {
		averageImprovement: number
		successRate: number
	}
}

async function setupTestProject() {
	// Ensure test directory exists
	await fs.mkdir(SOURCE_DIR, { recursive: true })

	// Create test files with varying complexity
	// Simple file with a few functions
	await fs.writeFile(
		path.join(SOURCE_DIR, "utils.ts"),
		`
// Simple utility functions
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function formatTime(date: Date): string {
  return date.toISOString().split('T')[1].split('.')[0];
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
`,
	)

	// Complex file with classes, interfaces and type dependencies
	await fs.writeFile(
		path.join(SOURCE_DIR, "components.ts"),
		`
export interface ComponentProps {
  id: string;
  className?: string;
}

export interface ButtonProps extends ComponentProps {
  text: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'tertiary';
  disabled?: boolean;
}

export class Component {
  protected props: ComponentProps;
  
  constructor(props: ComponentProps) {
    this.props = props;
  }
  
  getId(): string {
    return this.props.id;
  }
  
  getClassName(): string {
    return this.props.className || '';
  }
}

export class Button extends Component {
  private buttonProps: ButtonProps;
  
  constructor(props: ButtonProps) {
    super(props);
    this.buttonProps = props;
  }
  
  getText(): string {
    return this.buttonProps.text;
  }
  
  isDisabled(): boolean {
    return this.buttonProps.disabled || false;
  }
  
  getVariant(): string {
    return this.buttonProps.variant || 'primary';
  }
  
  handleClick(): void {
    if (!this.isDisabled()) {
      this.buttonProps.onClick();
    }
  }
}
`,
	)

	// Create a file that uses components
	await fs.writeFile(
		path.join(SOURCE_DIR, "app.ts"),
		`
import { Button, ButtonProps } from './components';
import { formatDate, formatCurrency } from './utils';

export function createButton(text: string, onClick: () => void): Button {
  const props: ButtonProps = {
    id: 'main-button',
    text,
    onClick,
    variant: 'primary'
  };
  
  return new Button(props);
}

export function renderApp() {
  const today = new Date();
  const formattedDate = formatDate(today);
  const button = createButton('Click me', () => console.log('Button clicked'));
  
  console.log(\`Today is \${formattedDate}\`);
  console.log(\`Balance: \${formatCurrency(1250.75)}\`);
  
  return {
    button,
    date: formattedDate
  };
}
`,
	)

	// Create empty target files
	await fs.writeFile(path.join(SOURCE_DIR, "dateUtils.ts"), `// Date utilities will be moved here\n`)
	await fs.writeFile(path.join(SOURCE_DIR, "types.ts"), `// Types will be moved here\n`)
}

async function runBenchmark() {
	try {
		// Set up test project
		await fs.rm(TEST_DIR, { recursive: true, force: true }).catch(() => {})
		await setupTestProject()

		const results: BenchmarkResults = {
			timestamp: new Date().toISOString(),
			environment: {
				node: process.version,
				platform: process.platform,
				arch: process.arch,
			},
			tests: [],
			summary: {
				averageImprovement: 0,
				successRate: 0,
			},
		}

		// Test 1: Moving a simple function
		const test1 = await benchmarkMoveFunction()
		results.tests.push(test1)

		// Test 2: Moving an interface
		const test2 = await benchmarkMoveInterface()
		results.tests.push(test2)

		// Test 3: Removing a function
		const test3 = await benchmarkRemoveFunction()
		results.tests.push(test3)

		// Test 4: Batch operations
		const test4 = await benchmarkBatchOperations()
		results.tests.push(test4)

		// Calculate summary statistics
		const successfulTests = results.tests.filter((test) => test.success)
		results.summary.successRate = successfulTests.length / results.tests.length

		if (successfulTests.length > 0) {
			results.summary.averageImprovement =
				successfulTests.reduce((sum, test) => sum + test.improvement, 0) / successfulTests.length
		}

		// Save results
		await fs.mkdir(path.dirname(RESULTS_FILE), { recursive: true })
		await fs.writeFile(RESULTS_FILE, JSON.stringify(results, null, 2))

		console.log("Benchmark results:")
		console.table(
			results.tests.map((t) => ({
				Test: t.name,
				"Old API (ms)": t.oldApiTime.toFixed(2),
				"New API (ms)": t.newApiTime.toFixed(2),
				Improvement: `${t.improvement.toFixed(2)}%`,
				Success: t.success ? "✅" : "❌",
			})),
		)

		console.log("\nSummary:")
		console.log(`Success rate: ${(results.summary.successRate * 100).toFixed(2)}%`)
		console.log(`Average improvement: ${results.summary.averageImprovement.toFixed(2)}%`)

		return results
	} catch (error) {
		console.error("Error running benchmark:", error)
		throw error
	}
}

async function benchmarkMoveFunction() {
	// Reset the test environment
	await fs.rm(path.join(SOURCE_DIR, "dateUtils.ts"), { force: true }).catch(() => {})
	await fs.writeFile(path.join(SOURCE_DIR, "dateUtils.ts"), `// Date utilities will be moved here\n`)
	resetRefactorApi()

	const result = {
		name: "Move function 'formatDate' to dateUtils.ts",
		oldApiTime: 0,
		newApiTime: 0,
		improvement: 0,
		success: false,
	}

	try {
		// Benchmark old API
		const start1 = performance.now()
		const engine = new RefactorEngine({ projectRootPath: TEST_DIR })

		const moveOperation: MoveOperation = {
			operation: "move",
			selector: {
				type: "identifier",
				name: "formatDate",
				kind: "function",
				filePath: path.join("src", "utils.ts"),
			},
			targetFilePath: path.join("src", "dateUtils.ts"),
		}

		const oldResult = await engine.executeOperation(moveOperation)
		const end1 = performance.now()
		result.oldApiTime = end1 - start1

		// Reset the test environment
		await fs.rm(path.join(SOURCE_DIR, "dateUtils.ts"), { force: true }).catch(() => {})
		await fs.writeFile(path.join(SOURCE_DIR, "dateUtils.ts"), `// Date utilities will be moved here\n`)
		await setupTestProject() // Restore original utils.ts
		resetRefactorApi()

		// Benchmark new API
		const start2 = performance.now()
		const newResult = await moveSymbol(
			path.join(SOURCE_DIR, "utils.ts"),
			"formatDate",
			path.join(SOURCE_DIR, "dateUtils.ts"),
			{ symbolKind: "function" },
			{ projectRootPath: TEST_DIR },
		)
		const end2 = performance.now()
		result.newApiTime = end2 - start2

		// Calculate improvement
		result.improvement = ((result.oldApiTime - result.newApiTime) / result.oldApiTime) * 100

		// Check if both operations were successful
		result.success = oldResult.success && newResult.success

		return result
	} catch (error) {
		console.error("Error in benchmarkMoveFunction:", error)
		return result
	}
}

async function benchmarkMoveInterface() {
	// Reset the test environment
	await fs.rm(path.join(SOURCE_DIR, "types.ts"), { force: true }).catch(() => {})
	await fs.writeFile(path.join(SOURCE_DIR, "types.ts"), `// Types will be moved here\n`)
	resetRefactorApi()

	const result = {
		name: "Move interface 'ButtonProps' to types.ts",
		oldApiTime: 0,
		newApiTime: 0,
		improvement: 0,
		success: false,
	}

	try {
		// Benchmark old API
		const start1 = performance.now()
		const engine = new RefactorEngine({ projectRootPath: TEST_DIR })

		const moveOperation: MoveOperation = {
			operation: "move",
			selector: {
				type: "identifier",
				name: "ButtonProps",
				kind: "interface",
				filePath: path.join("src", "components.ts"),
			},
			targetFilePath: path.join("src", "types.ts"),
		}

		const oldResult = await engine.executeOperation(moveOperation)
		const end1 = performance.now()
		result.oldApiTime = end1 - start1

		// Reset the test environment
		await fs.rm(path.join(SOURCE_DIR, "types.ts"), { force: true }).catch(() => {})
		await fs.writeFile(path.join(SOURCE_DIR, "types.ts"), `// Types will be moved here\n`)
		await setupTestProject() // Restore original components.ts
		resetRefactorApi()

		// Benchmark new API
		const start2 = performance.now()
		const newResult = await moveSymbol(
			path.join(SOURCE_DIR, "components.ts"),
			"ButtonProps",
			path.join(SOURCE_DIR, "types.ts"),
			{ symbolKind: "interface" },
			{ projectRootPath: TEST_DIR },
		)
		const end2 = performance.now()
		result.newApiTime = end2 - start2

		// Calculate improvement
		result.improvement = ((result.oldApiTime - result.newApiTime) / result.oldApiTime) * 100

		// Check if both operations were successful
		result.success = oldResult.success && newResult.success

		return result
	} catch (error) {
		console.error("Error in benchmarkMoveInterface:", error)
		return result
	}
}

async function benchmarkRemoveFunction() {
	// Reset the test environment
	await setupTestProject() // Reset everything
	resetRefactorApi()

	const result = {
		name: "Remove function 'capitalize'",
		oldApiTime: 0,
		newApiTime: 0,
		improvement: 0,
		success: false,
	}

	try {
		// Benchmark old API
		const start1 = performance.now()
		const engine = new RefactorEngine({ projectRootPath: TEST_DIR })

		const removeOperation: RemoveOperation = {
			operation: "remove",
			selector: {
				type: "identifier",
				name: "capitalize",
				kind: "function",
				filePath: path.join("src", "utils.ts"),
			},
		}

		const oldResult = await engine.executeOperation(removeOperation)
		const end1 = performance.now()
		result.oldApiTime = end1 - start1

		// Reset the test environment
		await setupTestProject() // Reset everything
		resetRefactorApi()

		// Benchmark new API
		const start2 = performance.now()
		const newResult = await removeSymbol(
			path.join(SOURCE_DIR, "utils.ts"),
			"capitalize",
			{ symbolKind: "function" },
			{ projectRootPath: TEST_DIR },
		)
		const end2 = performance.now()
		result.newApiTime = end2 - start2

		// Calculate improvement
		result.improvement = ((result.oldApiTime - result.newApiTime) / result.oldApiTime) * 100

		// Check if both operations were successful
		result.success = oldResult.success && newResult.success

		return result
	} catch (error) {
		console.error("Error in benchmarkRemoveFunction:", error)
		return result
	}
}

async function benchmarkBatchOperations() {
	// Reset the test environment
	await setupTestProject() // Reset everything
	resetRefactorApi()

	const result = {
		name: "Batch operations (move and remove)",
		oldApiTime: 0,
		newApiTime: 0,
		improvement: 0,
		success: false,
	}

	try {
		// Benchmark old API
		const start1 = performance.now()
		const engine = new RefactorEngine({ projectRootPath: TEST_DIR })

		const batchOps = {
			operations: [
				{
					operation: "move",
					selector: {
						type: "identifier",
						name: "formatTime",
						kind: "function",
						filePath: path.join("src", "utils.ts"),
					},
					targetFilePath: path.join("src", "dateUtils.ts"),
				} as MoveOperation,
				{
					operation: "remove",
					selector: {
						type: "identifier",
						name: "capitalize",
						kind: "function",
						filePath: path.join("src", "utils.ts"),
					},
				} as RemoveOperation,
			],
			options: {
				stopOnError: true,
			},
		}

		const oldResult = await engine.executeBatch(batchOps)
		const end1 = performance.now()
		result.oldApiTime = end1 - start1

		// Reset the test environment
		await setupTestProject() // Reset everything
		resetRefactorApi()

		// Benchmark new API
		const start2 = performance.now()
		const newResult = await batchOperation(
			[
				{
					type: "move",
					sourceFile: path.join(SOURCE_DIR, "utils.ts"),
					symbolName: "formatTime",
					targetFile: path.join(SOURCE_DIR, "dateUtils.ts"),
					options: { symbolKind: "function" },
				},
				{
					type: "remove",
					sourceFile: path.join(SOURCE_DIR, "utils.ts"),
					symbolName: "capitalize",
					options: { symbolKind: "function" },
				},
			],
			{ projectRootPath: TEST_DIR },
		)
		const end2 = performance.now()
		result.newApiTime = end2 - start2

		// Calculate improvement
		result.improvement = ((result.oldApiTime - result.newApiTime) / result.oldApiTime) * 100

		// Check if both operations were successful
		result.success = oldResult.success && newResult.success

		return result
	} catch (error) {
		console.error("Error in benchmarkBatchOperations:", error)
		return result
	}
}

// Only run if this file is executed directly
if (require.main === module) {
	runBenchmark()
		.then(() => console.log("Benchmark completed successfully"))
		.catch((err) => console.error("Benchmark failed:", err))
}

export { runBenchmark }
