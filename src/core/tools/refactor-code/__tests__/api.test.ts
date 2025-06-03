import { Project } from "ts-morph"
import * as path from "path"
import * as fs from "fs/promises"
import { moveSymbol, removeSymbol, batchOperation, resetRefactorApi } from "../api"
import { fileExists, ensureDirectoryExists } from "../utils/file-system"

// Test setup helpers
const TEST_PROJECT_DIR = path.join(__dirname, "../../../../../test-refactor-output/api-test")

/**
 * Set up a test project with necessary files for testing
 */
async function setupTestProject(): Promise<void> {
	// Ensure test directory exists
	await ensureDirectoryExists(TEST_PROJECT_DIR)

	// Create source files
	await fs.writeFile(
		path.join(TEST_PROJECT_DIR, "utils.ts"),
		`
/**
 * Helper function to format a date
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Helper function to format a time
 */
export function formatTime(date: Date): string {
  return date.toISOString().split('T')[1].split('.')[0];
}

/**
 * Helper class for date operations
 */
export class DateHelper {
  static isLeapYear(year: number): boolean {
    return ((year % 4 === 0) && (year % 100 !== 0)) || (year % 400 === 0);
  }
}
`,
	)

	// Create a component file
	await fs.writeFile(
		path.join(TEST_PROJECT_DIR, "Button.tsx"),
		`
import React from 'react';

/**
 * Props for the Button component
 */
export interface ButtonProps {
  text: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}

/**
 * A reusable button component
 */
export const Button: React.FC<ButtonProps> = ({ 
  text, 
  onClick, 
  disabled = false, 
  variant = 'primary' 
}) => {
  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      className={\`btn btn-\${variant}\`}
    >
      {text}
    </button>
  );
};

/**
 * A simple helper function to create a button with default props
 */
export function createDefaultButton(text: string, onClick: () => void) {
  return <Button text={text} onClick={onClick} />;
}
`,
	)

	// Create a file that uses the components
	await fs.writeFile(
		path.join(TEST_PROJECT_DIR, "App.tsx"),
		`
import React from 'react';
import { Button, createDefaultButton } from './Button';
import { formatDate } from './utils';

export function App() {
  const today = new Date();
  
  return (
    <div>
      <h1>Today is {formatDate(today)}</h1>
      <Button 
        text="Click me" 
        onClick={() => console.log('Button clicked')} 
      />
      {createDefaultButton('Default Button', () => console.log('Default button clicked'))}
    </div>
  );
}
`,
	)

	// Create an empty types file
	await fs.writeFile(
		path.join(TEST_PROJECT_DIR, "types.ts"),
		`
// Common types for the application
export type SizeVariant = 'small' | 'medium' | 'large';
`,
	)
}

/**
 * Clean up test project after tests
 */
async function cleanupTestProject(): Promise<void> {
	try {
		// Remove test directory recursively
		await fs.rm(TEST_PROJECT_DIR, { recursive: true, force: true })
	} catch (error) {
		console.error("Error cleaning up test project:", error)
	}
}

// Reset the refactor API before each test
beforeEach(() => {
	resetRefactorApi()
})

// Set up test project before all tests
beforeAll(async () => {
	await setupTestProject()
})

// Clean up after all tests
afterAll(async () => {
	await cleanupTestProject()
})

describe("Refactor Code API", () => {
	describe("moveSymbol", () => {
		it("should move a function between files", async () => {
			// Move formatDate from utils.ts to a new file
			const result = await moveSymbol(
				path.join(TEST_PROJECT_DIR, "utils.ts"),
				"formatDate",
				path.join(TEST_PROJECT_DIR, "dateUtils.ts"),
				{ symbolKind: "function" },
				{ projectRootPath: path.dirname(TEST_PROJECT_DIR) },
			)

			// Check the result
			expect(result.success).toBe(true)
			expect(result.affectedFiles.length).toBeGreaterThan(0)

			// Verify that the function was moved
			const targetExists = await fileExists(path.join(TEST_PROJECT_DIR, "dateUtils.ts"))
			expect(targetExists).toBe(true)

			// Check that target file contains the moved function
			const targetContent = await fs.readFile(path.join(TEST_PROJECT_DIR, "dateUtils.ts"), "utf-8")
			expect(targetContent).toContain("export function formatDate")

			// Check that the source file no longer contains the function
			const sourceContent = await fs.readFile(path.join(TEST_PROJECT_DIR, "utils.ts"), "utf-8")
			expect(sourceContent).not.toContain("export function formatDate")

			// Check that the App file now imports from the new location
			const appContent = await fs.readFile(path.join(TEST_PROJECT_DIR, "App.tsx"), "utf-8")
			expect(appContent).toContain("import { formatDate } from './dateUtils'")
		})

		it("should move a component interface to types file", async () => {
			// Move ButtonProps from Button.tsx to types.ts
			const result = await moveSymbol(
				path.join(TEST_PROJECT_DIR, "Button.tsx"),
				"ButtonProps",
				path.join(TEST_PROJECT_DIR, "types.ts"),
				{ symbolKind: "interface" },
				{ projectRootPath: path.dirname(TEST_PROJECT_DIR) },
			)

			// Check the result
			expect(result.success).toBe(true)
			expect(result.affectedFiles.length).toBeGreaterThan(0)

			// Check that target file contains the moved interface
			const typesContent = await fs.readFile(path.join(TEST_PROJECT_DIR, "types.ts"), "utf-8")
			expect(typesContent).toContain("export interface ButtonProps")

			// Check that the Button file now imports the interface
			const buttonContent = await fs.readFile(path.join(TEST_PROJECT_DIR, "Button.tsx"), "utf-8")
			expect(buttonContent).toContain("import { ButtonProps } from './types'")
		})
	})

	describe("removeSymbol", () => {
		it("should remove an unused function", async () => {
			// Remove the createDefaultButton function
			const result = await removeSymbol(
				path.join(TEST_PROJECT_DIR, "Button.tsx"),
				"createDefaultButton",
				{ symbolKind: "function" },
				{ projectRootPath: path.dirname(TEST_PROJECT_DIR) },
			)

			// Check the result
			expect(result.success).toBe(true)
			expect(result.affectedFiles.length).toBeGreaterThan(0)

			// Check that the file no longer contains the function
			const buttonContent = await fs.readFile(path.join(TEST_PROJECT_DIR, "Button.tsx"), "utf-8")
			expect(buttonContent).not.toContain("export function createDefaultButton")
		})

		it("should fail to remove a function with references", async () => {
			// Try to remove the Button component that's used in App.tsx
			const result = await removeSymbol(
				path.join(TEST_PROJECT_DIR, "Button.tsx"),
				"Button",
				{ symbolKind: "variable" },
				{ projectRootPath: path.dirname(TEST_PROJECT_DIR) },
			)

			// Check that the operation failed due to external references
			expect(result.success).toBe(false)
			expect(result.error).toContain("external reference")
		})

		it("should force remove a function with references", async () => {
			// Force remove the Button component
			const result = await removeSymbol(
				path.join(TEST_PROJECT_DIR, "Button.tsx"),
				"Button",
				{
					symbolKind: "variable",
					forceRemove: true,
				},
				{ projectRootPath: path.dirname(TEST_PROJECT_DIR) },
			)

			// Check that the operation succeeded with force option
			expect(result.success).toBe(true)

			// Check for warning about forced removal
			expect(result.diagnostics?.removalMethod).not.toBe("standard")

			// Check that the file no longer contains the component
			const buttonContent = await fs.readFile(path.join(TEST_PROJECT_DIR, "Button.tsx"), "utf-8")
			expect(buttonContent).not.toContain("export const Button")
		})
	})

	describe("batchOperation", () => {
		it("should execute multiple operations as a batch", async () => {
			// Batch multiple operations
			const result = await batchOperation(
				[
					{
						type: "move",
						sourceFile: path.join(TEST_PROJECT_DIR, "utils.ts"),
						symbolName: "formatTime",
						targetFile: path.join(TEST_PROJECT_DIR, "dateUtils.ts"),
						options: { symbolKind: "function" },
					},
					{
						type: "remove",
						sourceFile: path.join(TEST_PROJECT_DIR, "utils.ts"),
						symbolName: "DateHelper",
						options: { symbolKind: "class" },
					},
				],
				{
					projectRootPath: path.dirname(TEST_PROJECT_DIR),
					stopOnError: false,
				},
			)

			// Check overall result
			expect(result.success).toBe(true)
			expect(result.totalOperations).toBe(2)
			expect(result.successfulOperations).toBe(2)

			// Check that utils.ts no longer contains DateHelper
			const utilsContent = await fs.readFile(path.join(TEST_PROJECT_DIR, "utils.ts"), "utf-8")
			expect(utilsContent).not.toContain("export class DateHelper")

			// Check that dateUtils.ts now contains formatTime
			const dateUtilsContent = await fs.readFile(path.join(TEST_PROJECT_DIR, "dateUtils.ts"), "utf-8")
			expect(dateUtilsContent).toContain("export function formatTime")
		})
	})

	describe("Migration from old API", () => {
		it("demonstrates migration from old RefactorEngine API", async () => {
			// Old API example (commented out):
			/*
      // Old API usage
      const engine = new RefactorEngine({ projectRootPath: '/path/to/project' });
      
      const moveOperation: MoveOperation = {
        operation: "move",
        selector: {
          type: "identifier",
          name: "myFunction",
          kind: "function",
          filePath: "src/originalFile.ts"
        },
        targetFilePath: "src/targetFile.ts"
      };
      
      const result = await engine.executeOperation(moveOperation);
      */

			// New API usage:
			const result = await moveSymbol(
				"src/originalFile.ts", // sourceFile
				"myFunction", // symbolName
				"src/targetFile.ts", // targetFile
			)

			// Both would have the same outcome, but the new API is much simpler
		})

		it("demonstrates migration for batch operations", async () => {
			// Old API example (commented out):
			/*
      // Old API usage
      const engine = new RefactorEngine({ projectRootPath: '/path/to/project' });
      
      const batchOperations = {
        operations: [
          {
            operation: "move",
            selector: {
              type: "identifier",
              name: "myFunction",
              kind: "function",
              filePath: "src/originalFile.ts"
            },
            targetFilePath: "src/targetFile.ts"
          },
          {
            operation: "remove",
            selector: {
              type: "identifier",
              name: "unusedFunction",
              kind: "function",
              filePath: "src/file.ts"
            }
          }
        ],
        options: {
          stopOnError: true
        }
      };
      
      const result = await engine.executeBatch(batchOperations);
      */

			// New API usage:
			const result = await batchOperation([
				{
					type: "move",
					sourceFile: "src/originalFile.ts",
					symbolName: "myFunction",
					targetFile: "src/targetFile.ts",
				},
				{
					type: "remove",
					sourceFile: "src/file.ts",
					symbolName: "unusedFunction",
				},
			])

			// The new API is much more concise and intuitive
		})
	})
})
