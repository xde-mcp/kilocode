import { describe, it, expect, beforeEach, afterEach } from "@jest/globals"
import { Project } from "ts-morph"
import { MoveExecutor } from "../operations/MoveExecutor"
import { SymbolResolver } from "../core/SymbolResolver"
import { MoveOperation } from "../schema"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"

/**
 * Test suite for move operation bug fixes.
 *
 * This test suite specifically addresses the three critical bugs identified:
 * 1. Redundant self-imports and exports in target files
 * 2. Missing dependency imports when moved functions have dependencies
 * 3. Failure to update imports in dependent files when moving to new files
 */
describe("MoveExecutor Bug Fixes", () => {
	let project: Project
	let moveExecutor: MoveExecutor
	let symbolResolver: SymbolResolver
	let tempDir: string

	beforeEach(() => {
		// Create a temporary directory for test files
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "move-executor-test-"))

		// Initialize ts-morph project
		project = new Project({
			useInMemoryFileSystem: false,
			compilerOptions: {
				target: 99, // Latest
				module: 99, // ESNext
				strict: true,
				esModuleInterop: true,
				skipLibCheck: true,
				forceConsistentCasingInFileNames: true,
			},
		})

		moveExecutor = new MoveExecutor(project)
		symbolResolver = new SymbolResolver(project)
	})

	afterEach(() => {
		// Clean up temporary directory
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true })
		}
	})

	/**
	 * Bug Fix Test 1: Redundant Self-Imports and Exports
	 *
	 * This test ensures that when moving a function to a target file,
	 * the tool does not create imports from the target file to itself.
	 */
	it("should not create self-imports when moving functions", async () => {
		// Create source file with math utilities
		const mathUtilsPath = path.join(tempDir, "mathUtils.ts")
		const mathUtilsContent = `
// Math utility functions

export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}
`
		fs.writeFileSync(mathUtilsPath, mathUtilsContent)

		// Create target file for string utilities
		const stringUtilsPath = path.join(tempDir, "stringUtils.ts")
		const stringUtilsContent = `
// String utility functions

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function reverse(str: string): string {
  return str.split('').reverse().join('');
}
`
		fs.writeFileSync(stringUtilsPath, stringUtilsContent)

		// Add files to project
		const mathUtilsFile = project.addSourceFileAtPath(mathUtilsPath)
		const stringUtilsFile = project.addSourceFileAtPath(stringUtilsPath)

		// Resolve the 'add' function symbol
		const addSymbol = symbolResolver.resolveSymbol(
			{
				type: "identifier",
				name: "add",
				kind: "function",
				filePath: mathUtilsPath,
			},
			mathUtilsFile,
		)
		expect(addSymbol).toBeDefined()

		// Create move operation
		const moveOperation: MoveOperation = {
			operation: "move",
			selector: {
				type: "identifier",
				name: "add",
				kind: "function",
				filePath: mathUtilsPath,
			},
			targetFilePath: stringUtilsPath,
			reason: "Testing self-import prevention",
		}

		// Execute the move operation
		const result = await moveExecutor.execute(
			moveOperation,
			{ symbol: addSymbol!, sourceFile: mathUtilsFile },
			{ copyOnly: false },
		)

		expect(result.success).toBe(true)

		// Refresh files to get updated content
		stringUtilsFile.refreshFromFileSystemSync()
		const updatedStringUtilsContent = stringUtilsFile.getFullText()

		// Verify that the target file does not import from itself
		expect(updatedStringUtilsContent).not.toMatch(/import.*from.*['".].*stringUtils.*['"]/)
		expect(updatedStringUtilsContent).not.toMatch(/import.*from.*['"]\.['"']/)

		// Verify that the function was added
		expect(updatedStringUtilsContent).toContain("function add(a: number, b: number): number")

		// Verify no redundant export statements
		const exportMatches = updatedStringUtilsContent.match(/export.*add/g) || []
		expect(exportMatches.length).toBeLessThanOrEqual(1) // Should only have one export for 'add'
	})

	/**
	 * Bug Fix Test 2: Missing Dependency Imports
	 *
	 * This test ensures that when moving a function that depends on other functions,
	 * the necessary import statements are added to the target file.
	 */
	it("should include dependency imports when moving functions with dependencies", async () => {
		// Create math utilities file
		const mathUtilsPath = path.join(tempDir, "mathUtils.ts")
		const mathUtilsContent = `
export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}
`
		fs.writeFileSync(mathUtilsPath, mathUtilsContent)

		// Create data service file with dependencies
		const dataServicePath = path.join(tempDir, "dataService.ts")
		const dataServiceContent = `
import { add, multiply } from './mathUtils';

export function processData(data: number[]): number {
  return data.reduce((sum, val) => add(sum, val), 0);
}

export function calculateTotal(data: number[], factor: number): number {
  return multiply(processData(data), factor);
}
`
		fs.writeFileSync(dataServicePath, dataServiceContent)

		// Create target file for calculations
		const calculationsPath = path.join(tempDir, "calculations.ts")
		const calculationsContent = `
// Calculation utilities
`
		fs.writeFileSync(calculationsPath, calculationsContent)

		// Add files to project
		const dataServiceFile = project.addSourceFileAtPath(dataServicePath)
		const calculationsFile = project.addSourceFileAtPath(calculationsPath)

		// Resolve the 'calculateTotal' function symbol
		const calculateTotalSymbol = symbolResolver.resolveSymbol(
			{
				type: "identifier",
				name: "calculateTotal",
				kind: "function",
				filePath: dataServicePath,
			},
			dataServiceFile,
		)
		expect(calculateTotalSymbol).toBeDefined()

		// Create move operation
		const moveOperation: MoveOperation = {
			operation: "move",
			selector: {
				type: "identifier",
				name: "calculateTotal",
				kind: "function",
				filePath: dataServicePath,
			},
			targetFilePath: calculationsPath,
			reason: "Testing dependency import inclusion",
		}

		// Execute the move operation
		const result = await moveExecutor.execute(
			moveOperation,
			{ symbol: calculateTotalSymbol!, sourceFile: dataServiceFile },
			{ copyOnly: false },
		)

		expect(result.success).toBe(true)

		// Refresh files to get updated content
		calculationsFile.refreshFromFileSystemSync()
		const updatedCalculationsContent = calculationsFile.getFullText()

		// Verify that the function was moved
		expect(updatedCalculationsContent).toContain("function calculateTotal")

		// Verify that dependency imports were added
		expect(updatedCalculationsContent).toContain("multiply")
		expect(updatedCalculationsContent).toContain("processData")

		// Verify imports point to correct files
		expect(updatedCalculationsContent).toMatch(/import.*multiply.*from.*mathUtils/)
		expect(updatedCalculationsContent).toMatch(/import.*processData.*from.*dataService/)
	})

	/**
	 * Bug Fix Test 3: Update Imports in Dependent Files
	 *
	 * This test ensures that when moving functions to new files,
	 * all files that import those functions are updated to import from the new location.
	 */
	it("should update imports in dependent files when moving to new files", async () => {
		// Create math utilities file
		const mathUtilsPath = path.join(tempDir, "mathUtils.ts")
		const mathUtilsContent = `
export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}
`
		fs.writeFileSync(mathUtilsPath, mathUtilsContent)

		// Create data service file that imports from mathUtils
		const dataServicePath = path.join(tempDir, "dataService.ts")
		const dataServiceContent = `
import { add, multiply } from './mathUtils';

export function processData(data: number[]): number {
  return data.reduce((sum, val) => add(sum, val), 0);
}

export function calculateAverage(data: number[]): number {
  if (data.length === 0) return 0;
  const sum = processData(data);
  return sum / data.length;
}

export function calculateTotal(data: number[], factor: number): number {
  return multiply(processData(data), factor);
}
`
		fs.writeFileSync(dataServicePath, dataServiceContent)

		// Create NEW target file for advanced math
		const advancedMathPath = path.join(tempDir, "advancedMath.ts")
		// Note: This file doesn't exist initially - it will be created by the move operation

		// Add files to project
		const mathUtilsFile = project.addSourceFileAtPath(mathUtilsPath)
		const dataServiceFile = project.addSourceFileAtPath(dataServicePath)

		// Resolve the 'multiply' function symbol
		const multiplySymbol = symbolResolver.resolveSymbol(
			{
				type: "identifier",
				name: "multiply",
				kind: "function",
				filePath: mathUtilsPath,
			},
			mathUtilsFile,
		)
		expect(multiplySymbol).toBeDefined()

		// Create move operation to NEW file
		const moveOperation: MoveOperation = {
			operation: "move",
			selector: {
				type: "identifier",
				name: "multiply",
				kind: "function",
				filePath: mathUtilsPath,
			},
			targetFilePath: advancedMathPath,
			reason: "Testing import updates when moving to new file",
		}

		// Execute the move operation
		const result = await moveExecutor.execute(
			moveOperation,
			{ symbol: multiplySymbol!, sourceFile: mathUtilsFile },
			{ copyOnly: false },
		)

		expect(result.success).toBe(true)

		// Refresh files to get updated content
		dataServiceFile.refreshFromFileSystemSync()
		const updatedDataServiceContent = dataServiceFile.getFullText()

		// Verify that the import in dataService was updated
		// It should now import 'multiply' from the new file and 'add' from the original file
		expect(updatedDataServiceContent).toMatch(/import.*add.*from.*mathUtils/)
		expect(updatedDataServiceContent).toMatch(/import.*multiply.*from.*advancedMath/)

		// Verify that the new file was created and contains the function
		expect(fs.existsSync(advancedMathPath)).toBe(true)
		const advancedMathContent = fs.readFileSync(advancedMathPath, "utf-8")
		expect(advancedMathContent).toContain("function multiply")

		// Verify that multiply was removed from the original file
		mathUtilsFile.refreshFromFileSystemSync()
		const updatedMathUtilsContent = mathUtilsFile.getFullText()
		expect(updatedMathUtilsContent).not.toContain("function multiply")
		expect(updatedMathUtilsContent).toContain("function add") // add should still be there
	})

	/**
	 * Bug Fix Test 4: Complex Scenario with Multiple Dependencies
	 *
	 * This test combines all three bug scenarios in a complex move operation.
	 */
	it("should handle complex move operations without introducing bugs", async () => {
		// Create utilities file with multiple functions
		const utilsPath = path.join(tempDir, "utils.ts")
		const utilsContent = `
export function formatString(str: string): string {
  return str.trim().toLowerCase();
}

export function validateEmail(email: string): boolean {
  return email.includes('@') && email.includes('.');
}

export function processUser(name: string, email: string): { name: string; email: string; valid: boolean } {
  return {
    name: formatString(name),
    email: formatString(email),
    valid: validateEmail(email)
  };
}
`
		fs.writeFileSync(utilsPath, utilsContent)

		// Create service file that uses utilities
		const userServicePath = path.join(tempDir, "userService.ts")
		const userServiceContent = `
import { processUser, validateEmail } from './utils';

export function createUser(name: string, email: string) {
  if (!validateEmail(email)) {
    throw new Error('Invalid email');
  }
  return processUser(name, email);
}
`
		fs.writeFileSync(userServicePath, userServiceContent)

		// Create target file for validation functions
		const validationPath = path.join(tempDir, "validation.ts")
		const validationContent = `
// Validation utilities
`
		fs.writeFileSync(validationPath, validationContent)

		// Add files to project
		const utilsFile = project.addSourceFileAtPath(utilsPath)
		const userServiceFile = project.addSourceFileAtPath(userServicePath)
		const validationFile = project.addSourceFileAtPath(validationPath)

		// Resolve the 'processUser' function symbol
		const processUserSymbol = symbolResolver.resolveSymbol(
			{
				type: "identifier",
				name: "processUser",
				kind: "function",
				filePath: utilsPath,
			},
			utilsFile,
		)
		expect(processUserSymbol).toBeDefined()

		// Create move operation
		const moveOperation: MoveOperation = {
			operation: "move",
			selector: {
				type: "identifier",
				name: "processUser",
				kind: "function",
				filePath: utilsPath,
			},
			targetFilePath: validationPath,
			reason: "Testing complex move scenario",
		}

		// Execute the move operation
		const result = await moveExecutor.execute(
			moveOperation,
			{ symbol: processUserSymbol!, sourceFile: utilsFile },
			{ copyOnly: false },
		)

		expect(result.success).toBe(true)

		// Refresh files to get updated content
		validationFile.refreshFromFileSystemSync()
		userServiceFile.refreshFromFileSystemSync()

		const updatedValidationContent = validationFile.getFullText()
		const updatedUserServiceContent = userServiceFile.getFullText()

		// Verify no self-imports in validation file
		expect(updatedValidationContent).not.toMatch(/import.*from.*validation/)

		// Verify dependencies were imported correctly
		expect(updatedValidationContent).toContain("formatString")
		expect(updatedValidationContent).toContain("validateEmail")
		expect(updatedValidationContent).toMatch(/import.*formatString.*from.*utils/)
		expect(updatedValidationContent).toMatch(/import.*validateEmail.*from.*utils/)

		// Verify userService imports were updated
		expect(updatedUserServiceContent).toMatch(/import.*processUser.*from.*validation/)
		expect(updatedUserServiceContent).toMatch(/import.*validateEmail.*from.*utils/)

		// Verify function was moved correctly
		expect(updatedValidationContent).toContain("function processUser")

		// Verify function was removed from original file
		utilsFile.refreshFromFileSystemSync()
		const updatedUtilsContent = utilsFile.getFullText()
		expect(updatedUtilsContent).not.toContain("function processUser")
	})
})
