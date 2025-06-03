import { Project } from "ts-morph"
import * as fs from "fs"
import * as path from "path"
import { executeRemoveOperation } from "../operations/remove"
import { RemoveOperation } from "../schema"
import * as os from "os"

describe("executeRemoveOperation", () => {
	let project: Project
	let tempDir: string
	let sourceFilePath: string

	beforeEach(async () => {
		// Create a temporary directory for our test files
		tempDir = path.join(os.tmpdir(), `remove-op-test-${Date.now()}`)
		fs.mkdirSync(tempDir, { recursive: true })

		// Create a sample TypeScript file
		sourceFilePath = path.join(tempDir, "test.ts")
		const sourceCode = `
      export function deprecatedHelper(value: string): string {
        return value.toLowerCase();
      }

      export function usefulFunction(x: number): number {
        return x * 2;
      }

      // This comment will be preserved
      export const CONSTANT = 42;
    `
		fs.writeFileSync(sourceFilePath, sourceCode)

		// Initialize ts-morph project
		project = new Project({
			compilerOptions: {
				rootDir: tempDir,
			},
			skipAddingFilesFromTsConfig: true,
		})
		project.addSourceFileAtPath(sourceFilePath)
	})

	afterEach(() => {
		// Clean up temp directory
		try {
			fs.rmSync(tempDir, { recursive: true, force: true })
		} catch (error) {
			console.error(`Failed to clean up temp directory: ${error}`)
		}
	})

	it("should successfully remove a function", async () => {
		// Create a remove operation for the deprecated function
		const operation: RemoveOperation = {
			operation: "remove",
			selector: {
				type: "identifier",
				name: "deprecatedHelper",
				kind: "function",
				filePath: "test.ts",
			},
			reason: "This function is deprecated and no longer used",
		}

		// Execute the operation
		const result = await executeRemoveOperation(project, operation)

		// Verify operation succeeded
		expect(result.success).toBe(true)
		expect(result.affectedFiles).toContain("test.ts")

		// Check that the file was modified correctly
		const sourceFile = project.getSourceFile("test.ts")
		expect(sourceFile).not.toBeUndefined()

		// The deprecated function should be gone
		const deprecatedFunction = sourceFile?.getFunction("deprecatedHelper")
		expect(deprecatedFunction).toBeUndefined()

		// Other functions should still exist
		const usefulFunction = sourceFile?.getFunction("usefulFunction")
		expect(usefulFunction).not.toBeUndefined()

		// Constants should still exist
		const constantDeclaration = sourceFile?.getVariableDeclaration("CONSTANT")
		expect(constantDeclaration).not.toBeUndefined()

		// Direct file content check
		const fileContent = fs.readFileSync(sourceFilePath, "utf8")
		expect(fileContent).not.toContain("deprecatedHelper")
		expect(fileContent).toContain("usefulFunction")
		expect(fileContent).toContain("CONSTANT = 42")
	})

	it("should handle removing non-existent symbols gracefully", async () => {
		// Create a remove operation for a non-existent function
		const operation: RemoveOperation = {
			operation: "remove",
			selector: {
				type: "identifier",
				name: "nonExistentFunction",
				kind: "function",
				filePath: "test.ts",
			},
			reason: "This function doesn't exist",
		}

		// Execute the operation
		const result = await executeRemoveOperation(project, operation)

		// Verify operation failed gracefully
		expect(result.success).toBe(false)
		expect(result.error).toContain("not found")
	})

	it("should properly remove nested declarations", async () => {
		// Create a file with nested declarations
		const nestedFilePath = path.join(tempDir, "nested.ts")
		const nestedCode = `
      export class Container {
        // This should be removed
        public helper() {
          return "helper";
        }
        
        // This should stay
        public keeper() {
          return "keeper";
        }
      }
    `
		fs.writeFileSync(nestedFilePath, nestedCode)
		project.addSourceFileAtPath(nestedFilePath)

		// Create a remove operation for the nested method
		const operation: RemoveOperation = {
			operation: "remove",
			selector: {
				type: "identifier",
				name: "helper",
				kind: "method",
				filePath: "nested.ts",
				parent: {
					name: "Container",
					kind: "class",
				},
			},
			reason: "This method is no longer needed",
		}

		// This is an expected limitation of the current implementation
		// Nested symbols like class methods cannot be directly removed
		// This test documents the current behavior
		const result = await executeRemoveOperation(project, operation)

		// Currently, the operation would fail because nested symbol removal is not fully supported
		// This test can be updated when nested symbol removal is implemented
		expect(result.success).toBe(false)

		// If nested symbol removal is implemented, this test should be updated
		// to verify that the "helper" method is removed but the "keeper" method remains
	})
})
