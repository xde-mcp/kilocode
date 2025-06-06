import { describe, it, expect, beforeAll, afterAll } from "@jest/globals"
import {
	createRefactorEngineTestSetupWithAutoLoad,
	createTestFilesWithAutoLoad,
	RefactorEngineTestSetup,
} from "./utils/standardized-test-setup"
import * as fs from "fs"
import * as path from "path"

describe("Rename With Complex Import Scenarios", () => {
	jest.setTimeout(30000)
	let setup: RefactorEngineTestSetup

	beforeAll(() => {
		setup = createRefactorEngineTestSetupWithAutoLoad()
	})

	afterAll(() => {
		setup.cleanup()
	})

	it("should rename function and update direct imports, re-exports, and namespace imports", async () => {
		// Create test files using standardized setup
		createTestFilesWithAutoLoad(setup, {
			"src/utils/formatter.ts": `// Formatter module
export function formatString(input: string): string {
  return input.trim().toLowerCase();
}

export function formatNumber(num: number): string {
  return num.toFixed(2);
}

export const DEFAULT_FORMAT = "standard";
`,
			"src/utils/index.ts": `// Index file with re-exports
export { formatString, formatNumber, DEFAULT_FORMAT } from './formatter';
`,
			"src/components/display.ts": `// Usage file with various import styles
import { formatString, formatNumber } from '../utils';
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
			"src/lib/exports.ts": `// Re-exports
export { formatString as stringFormat } from '../utils/formatter';
export { formatNumber } from '../utils';
`,
		})

		// Execute the rename operation
		const result = await setup.engine.executeBatch({
			operations: [
				{
					operation: "rename" as const,
					selector: {
						type: "identifier" as const,
						name: "formatString",
						kind: "function" as const,
						filePath: "src/utils/formatter.ts",
					},
					newName: "formatText",
					reason: "More descriptive name",
				},
			],
		})

		// Check that the operation was successful
		expect(result.success).toBe(true)

		// Read updated files
		const moduleContent = fs.readFileSync(path.join(setup.projectDir, "src/utils/formatter.ts"), "utf-8")
		const indexContent = fs.readFileSync(path.join(setup.projectDir, "src/utils/index.ts"), "utf-8")
		const usageContent = fs.readFileSync(path.join(setup.projectDir, "src/components/display.ts"), "utf-8")
		const reexportContent = fs.readFileSync(path.join(setup.projectDir, "src/lib/exports.ts"), "utf-8")

		// Verify that the function was renamed in the module file
		expect(moduleContent).toContain("export function formatText(input: string)")
		expect(moduleContent).not.toContain("export function formatString(input: string)")

		// Verify that re-exports were updated in the index file
		expect(indexContent).toContain("export { formatText, formatNumber, DEFAULT_FORMAT } from './formatter'")
		expect(indexContent).not.toContain("export { formatString")

		// Verify that imports were updated in the usage file
		expect(usageContent).toContain("import { formatText, formatNumber } from '../utils'")
		expect(usageContent).not.toContain("import { formatString")
		expect(usageContent).toContain("return formatText(value)")
		expect(usageContent).toContain("return AllFormatters.formatText(input)")
		expect(usageContent).not.toContain("return formatString(value)")
		expect(usageContent).not.toContain("return AllFormatters.formatString(input)")

		// Verify that named re-exports were updated
		expect(reexportContent).toContain("export { formatText as stringFormat } from '../utils/formatter'")
		expect(reexportContent).not.toContain("export { formatString as stringFormat }")
	})
})
