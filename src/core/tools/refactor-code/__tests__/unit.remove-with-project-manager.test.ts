import { RemoveOrchestrator } from "../operations/RemoveOrchestrator"
import {
	createRefactorEngineTestSetup,
	RefactorEngineTestSetup,
	createTestFilesWithAutoLoad,
} from "./utils/standardized-test-setup"

describe("RemoveOrchestrator with ProjectManager", () => {
	jest.setTimeout(30000)

	let setup: RefactorEngineTestSetup
	let orchestrator: RemoveOrchestrator

	beforeEach(() => {
		setup = createRefactorEngineTestSetup()
		orchestrator = new RemoveOrchestrator(setup.engine.getProject())
	})

	afterEach(() => {
		if (orchestrator) {
			orchestrator.dispose()
		}
		setup.cleanup()
	})

	it("should successfully remove a function using ProjectManager", async () => {
		// Create test files
		const testFiles = {
			"test.ts": `
		    /**
		     * Function that is deprecated and should be removed
		     */
		    export function deprecatedHelper(value: string): string {
		      return value.toLowerCase();
		    }

		    export function usefulFunction(x: number): number {
		      return x * 2;
		    }

		    // This comment will be preserved
		    export const CONSTANT = 42;
		  `,
		}

		createTestFilesWithAutoLoad(setup, testFiles)

		// Create a remove operation for the deprecated function
		const operation = {
			operation: "remove" as const,
			selector: {
				type: "identifier" as const,
				name: "deprecatedHelper",
				kind: "function" as const,
				filePath: "test.ts",
			},
			reason: "This function is deprecated and no longer used",
			options: {
				forceRemove: true,
			},
		}

		// Execute the operation using the orchestrator
		const result = await orchestrator.executeRemoveOperation(operation)

		// Get the updated file content
		const sourceFile = setup.engine.getProject().getSourceFile("test.ts")
		const fileContent = sourceFile?.getFullText() || ""

		// Verify the function was removed
		expect(fileContent).not.toContain("deprecatedHelper")
		expect(fileContent).toContain("usefulFunction")
		expect(fileContent).toContain("CONSTANT = 42")
	})

	it("should remove a function with cleanup using ProjectManager", async () => {
		// Create test files
		const testFiles = {
			"test.ts": `
		    export function deprecatedHelper(value: string): string {
		      return value.toLowerCase();
		    }

		    export function usefulFunction(x: number): number {
		      return x * 2;
		    }

		    export const CONSTANT = 42;
		  `,
			"importing.ts": `
	     import { deprecatedHelper, usefulFunction } from "./test";
	     
	     export function wrappedFunction(val: string): string {
	       // Call the deprecated function
	       return deprecatedHelper(val);
	     }
	     
	     export function otherFunction(num: number): number {
	       return usefulFunction(num);
	     }
	   `,
		}

		createTestFilesWithAutoLoad(setup, testFiles)

		// Create a remove operation with cleanup option
		const operation = {
			operation: "remove" as const,
			selector: {
				type: "identifier" as const,
				name: "deprecatedHelper",
				kind: "function" as const,
				filePath: "test.ts",
			},
			reason: "This function is deprecated and no longer used",
			options: {
				cleanupDependencies: true,
				forceRemove: true,
			},
		}

		// Execute the operation using the orchestrator
		const result = await orchestrator.executeRemoveOperation(operation)

		// Get the updated file content
		const sourceFile = setup.engine.getProject().getSourceFile("test.ts")
		const fileContent = sourceFile?.getFullText() || ""

		// Verify the function was removed
		expect(fileContent).not.toContain("deprecatedHelper")
		expect(fileContent).toContain("usefulFunction")
		expect(fileContent).toContain("CONSTANT = 42")
	})

	it("should handle forced removal of functions with references using ProjectManager", async () => {
		// Create test files
		const testFiles = {
			"test.ts": `
		    export function deprecatedHelper(value: string): string {
		      return value.toLowerCase();
		    }

		    export function usefulFunction(x: number): number {
		      return x * 2;
		    }

		    export const CONSTANT = 42;
		  `,
			"importing.ts": `
       import { usefulFunction } from "./test";
       
       export function otherFunction(num: number): number {
         return usefulFunction(num);
       }
     `,
		}

		createTestFilesWithAutoLoad(setup, testFiles)

		// Create a remove operation with force option
		const operation = {
			operation: "remove" as const,
			selector: {
				type: "identifier" as const,
				name: "usefulFunction",
				kind: "function" as const,
				filePath: "test.ts",
			},
			reason: "This function needs to be removed despite references",
			options: {
				forceRemove: true,
			},
		}

		// Execute the operation using the orchestrator
		const result = await orchestrator.executeRemoveOperation(operation)

		// Get the updated file content
		const sourceFile = setup.engine.getProject().getSourceFile("test.ts")
		const fileContent = sourceFile?.getFullText() || ""

		// Verify the function was removed
		expect(fileContent).not.toContain("usefulFunction")
		expect(fileContent).toContain("CONSTANT = 42")
	})
})
