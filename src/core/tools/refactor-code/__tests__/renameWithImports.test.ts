import { Project, ScriptTarget } from "ts-morph"
import { RefactorEngine } from "../engine"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"
import { PerformanceTracker } from "../utils/performance-tracker"
import { setRefactorTestTimeout, TestTimer } from "./utils/test-performance"

describe("Rename With Complex Import Scenarios", () => {
	// Set longer timeout for all tests in this suite
	jest.setTimeout(30000)
	let project: Project
	let tempDir: string
	let indexFile: string
	let moduleFile: string
	let usageFile: string
	let reexportFile: string
	let engine: RefactorEngine

	beforeEach(() => {
		// Create a temporary directory for test files
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rename-import-test-"))

		// Create test directory structure
		fs.mkdirSync(path.join(tempDir, "src", "components"), { recursive: true })
		fs.mkdirSync(path.join(tempDir, "src", "utils"), { recursive: true })
		fs.mkdirSync(path.join(tempDir, "src", "lib"), { recursive: true })

		// Create test files
		moduleFile = path.join(tempDir, "src", "utils", "formatter.ts")
		indexFile = path.join(tempDir, "src", "utils", "index.ts")
		usageFile = path.join(tempDir, "src", "components", "display.ts")
		reexportFile = path.join(tempDir, "src", "lib", "exports.ts")

		// Write content to test files
		fs.writeFileSync(
			moduleFile,
			`// Formatter module
export function formatString(input: string): string {
  return input.trim().toLowerCase();
}

export function formatNumber(num: number): string {
  return num.toFixed(2);
}

export const DEFAULT_FORMAT = "standard";
`,
		)

		fs.writeFileSync(
			indexFile,
			`// Index barrel file
export { formatString, formatNumber, DEFAULT_FORMAT } from './formatter';
export * as formatters from './formatter';
`,
		)

		fs.writeFileSync(
			usageFile,
			`// Component using formatters
import { formatString, formatNumber } from '../utils';
import { DEFAULT_FORMAT } from '../utils/formatter';
import * as AllFormatters from '../utils/formatter';

export function displayFormatted(value: string | number): string {
  if (typeof value === 'string') {
    return formatString(value);
  } else {
    return formatNumber(value);
  }
}

export function getDefaultFormat(): string {
  return DEFAULT_FORMAT;
}

export function useAllFormatters(input: string): string {
  return AllFormatters.formatString(input);
}
`,
		)

		fs.writeFileSync(
			reexportFile,
			`// Re-exports
export { formatString as stringFormat } from '../utils/formatter';
export { formatNumber } from '../utils';
`,
		)

		// Initialize the engine
		engine = new RefactorEngine({ projectRootPath: tempDir })

		// Add the test files to the engine's project
		engine.addSourceFiles([moduleFile, indexFile, usageFile, reexportFile])
	})

	afterEach(async () => {
		// Clean up temp directory
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true })
		}
	})

	test("should rename function and update direct imports, re-exports, and namespace imports", async () => {
		// Using timer to track performance
		const timer = new TestTimer("rename-function-with-imports")
		// Execute the rename operation
		const result = await engine.executeOperation({
			operation: "rename",
			id: "test-rename-with-imports",
			selector: {
				type: "identifier",
				name: "formatString",
				kind: "function",
				filePath: moduleFile,
			},
			newName: "formatText",
			scope: "project",
			reason: "More descriptive name",
		})

		// Check that the operation was successful
		timer.checkpoint("operation-completed")
		expect(result.success).toBe(true)
		expect(result.affectedFiles).toContain(moduleFile)
		expect(result.affectedFiles).toContain(indexFile)
		expect(result.affectedFiles).toContain(usageFile)
		expect(result.affectedFiles).toContain(reexportFile)

		// Verify that the function was renamed in the module file
		const moduleContent = fs.readFileSync(moduleFile, "utf-8")
		expect(moduleContent).toContain("export function formatText(input: string)")
		expect(moduleContent).not.toContain("export function formatString(input: string)")

		// Verify that re-exports were updated in the index file
		const indexContent = fs.readFileSync(indexFile, "utf-8")
		expect(indexContent).toContain("export { formatText, formatNumber, DEFAULT_FORMAT } from './formatter'")
		expect(indexContent).not.toContain("export { formatString")

		// Verify that imports were updated in the usage file
		const usageContent = fs.readFileSync(usageFile, "utf-8")
		expect(usageContent).toContain("import { formatText, formatNumber } from '../utils'")
		expect(usageContent).not.toContain("import { formatString")
		expect(usageContent).toContain("return formatText(value)")
		expect(usageContent).toContain("return AllFormatters.formatText(input)")
		expect(usageContent).not.toContain("return formatString(value)")
		expect(usageContent).not.toContain("return AllFormatters.formatString(input)")

		// Verify that named re-exports were updated
		const reexportContent = fs.readFileSync(reexportFile, "utf-8")
		expect(reexportContent).toContain("export { formatText as stringFormat } from '../utils/formatter'")
		expect(reexportContent).not.toContain("export { formatString as stringFormat }")
	})

	// Test for special characters in paths removed - only supporting valid TypeScript compilation paths
})
