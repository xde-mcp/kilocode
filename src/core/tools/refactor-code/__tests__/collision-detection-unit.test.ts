import { createSimpleTestSetup } from "./utils/standardized-test-setup"
import { RenameOrchestrator } from "../operations/RenameOrchestrator"

describe("Name Collision Detection Unit Test", () => {
	let setup: ReturnType<typeof createSimpleTestSetup>
	let renameOrchestrator: RenameOrchestrator

	beforeEach(() => {
		setup = createSimpleTestSetup()
		renameOrchestrator = new RenameOrchestrator(setup.project)
	})

	afterEach(() => {
		setup.cleanup()
	})

	it("should detect method name collision in class", () => {
		// Create a source file with a class containing two methods
		const sourceFile = setup.project.createSourceFile(
			"test.ts",
			`
export class TestClass {
	public methodA(): string {
		return "A"
	}
	
	public methodB(): string {
		return "B"
	}
}
			`.trim(),
		)

		// Get the class and methods
		const testClass = sourceFile.getClass("TestClass")!
		const methodA = testClass.getMethod("methodA")!
		const methodB = testClass.getMethod("methodB")!

		// Test the collision detection logic directly
		const renameOrchestrator = new RenameOrchestrator(setup.project)

		// Access the private method using bracket notation for testing
		const checkNamingConflict = (renameOrchestrator as any).checkNamingConflict.bind(renameOrchestrator)

		// Create a mock resolved symbol for methodA
		const mockSymbol = {
			node: methodA,
			name: "methodA",
			kind: "method" as const,
		}

		// Test collision detection - trying to rename methodA to methodB should fail
		const result = checkNamingConflict(mockSymbol, "methodB", sourceFile)

		expect(result.hasConflict).toBe(true)
		expect(result.message).toContain("Method 'methodB' already exists in class 'TestClass'")
	})

	it("should allow renaming to unique name", () => {
		// Create a source file with a class containing two methods
		const sourceFile = setup.project.createSourceFile(
			"test.ts",
			`
export class TestClass {
	public methodA(): string {
		return "A"
	}
	
	public methodB(): string {
		return "B"
	}
}
			`.trim(),
		)

		// Get the class and method
		const testClass = sourceFile.getClass("TestClass")!
		const methodA = testClass.getMethod("methodA")!

		// Test the collision detection logic directly
		const renameOrchestrator = new RenameOrchestrator(setup.project)

		// Access the private method using bracket notation for testing
		const checkNamingConflict = (renameOrchestrator as any).checkNamingConflict.bind(renameOrchestrator)

		// Create a mock resolved symbol for methodA
		const mockSymbol = {
			node: methodA,
			name: "methodA",
			kind: "method" as const,
		}

		// Test collision detection - trying to rename methodA to uniqueName should succeed
		const result = checkNamingConflict(mockSymbol, "uniqueName", sourceFile)

		expect(result.hasConflict).toBe(false)
		expect(result.message).toBeUndefined()
	})

	it("should detect property name collision in class", () => {
		// Create a source file with a class containing two properties
		const sourceFile = setup.project.createSourceFile(
			"test.ts",
			`
export class TestClass {
	public propA: string = "A"
	public propB: string = "B"
}
			`.trim(),
		)

		// Get the class and properties
		const testClass = sourceFile.getClass("TestClass")!
		const propA = testClass.getProperty("propA")!

		// Test the collision detection logic directly
		const renameOrchestrator = new RenameOrchestrator(setup.project)

		// Access the private method using bracket notation for testing
		const checkNamingConflict = (renameOrchestrator as any).checkNamingConflict.bind(renameOrchestrator)

		// Create a mock resolved symbol for propA
		const mockSymbol = {
			node: propA,
			name: "propA",
			kind: "property" as const,
		}

		// Test collision detection - trying to rename propA to propB should fail
		const result = checkNamingConflict(mockSymbol, "propB", sourceFile)

		expect(result.hasConflict).toBe(true)
		expect(result.message).toContain("Property 'propB' already exists in class 'TestClass'")
	})

	it("should detect method-property collision in class", () => {
		// Create a source file with a class containing a method and property
		const sourceFile = setup.project.createSourceFile(
			"test.ts",
			`
export class TestClass {
	public data: string = "data"
	
	public process(): void {
		// process data
	}
}
			`.trim(),
		)

		// Get the class and method
		const testClass = sourceFile.getClass("TestClass")!
		const processMethod = testClass.getMethod("process")!

		// Test the collision detection logic directly
		const renameOrchestrator = new RenameOrchestrator(setup.project)

		// Access the private method using bracket notation for testing
		const checkNamingConflict = (renameOrchestrator as any).checkNamingConflict.bind(renameOrchestrator)

		// Create a mock resolved symbol for process method
		const mockSymbol = {
			node: processMethod,
			name: "process",
			kind: "method" as const,
		}

		// Test collision detection - trying to rename process method to data should fail
		const result = checkNamingConflict(mockSymbol, "data", sourceFile)

		expect(result.hasConflict).toBe(true)
		expect(result.message).toContain("Property 'data' already exists in class 'TestClass'")
	})

	it("should detect property-method collision in class", () => {
		// Create a source file with a class containing a property and method
		const sourceFile = setup.project.createSourceFile(
			"test.ts",
			`
export class TestClass {
	public result: number = 0
	
	public calculate(): number {
		return this.result
	}
}
			`.trim(),
		)

		// Get the class and property
		const testClass = sourceFile.getClass("TestClass")!
		const resultProperty = testClass.getProperty("result")!

		// Test the collision detection logic directly
		const renameOrchestrator = new RenameOrchestrator(setup.project)

		// Access the private method using bracket notation for testing
		const checkNamingConflict = (renameOrchestrator as any).checkNamingConflict.bind(renameOrchestrator)

		// Create a mock resolved symbol for result property
		const mockSymbol = {
			node: resultProperty,
			name: "result",
			kind: "property" as const,
		}

		// Test collision detection - trying to rename result property to calculate should fail
		const result = checkNamingConflict(mockSymbol, "calculate", sourceFile)

		expect(result.hasConflict).toBe(true)
		expect(result.message).toContain("Method 'calculate' already exists in class 'TestClass'")
	})
})
