import { createSimpleTestSetup } from "./utils/standardized-test-setup"
import { RenameOrchestrator } from "../operations/RenameOrchestrator"
import { RenameOperation } from "../schema"

describe("RenameOrchestrator - Name Collision Detection", () => {
	let setup: ReturnType<typeof createSimpleTestSetup>
	let renameOrchestrator: RenameOrchestrator

	beforeEach(() => {
		setup = createSimpleTestSetup()
		renameOrchestrator = new RenameOrchestrator(setup.project)
	})

	afterEach(() => {
		setup.cleanup()
	})

	describe("Method Name Collision Detection", () => {
		it("should prevent renaming method to existing method name in same class", async () => {
			// Create a class with two methods
			const sourceFile = setup.project.createSourceFile(
				"test-class.ts",
				`
export class TestClass {
	public methodA(): string {
		return "A"
	}
	
	public methodB(): number {
		return 42
	}
}
				`.trim(),
			)

			const operation: RenameOperation = {
				operation: "rename",
				scope: "project",
				selector: {
					type: "identifier",
					name: "methodA",
					kind: "method",
					filePath: "test-class.ts",
				},
				newName: "methodB", // This should conflict with existing methodB
			}

			const result = await renameOrchestrator.executeRenameOperation(operation)

			expect(result.success).toBe(false)
			expect(result.error).toContain("Method 'methodB' already exists in class 'TestClass'")
		})

		it("should prevent renaming method to existing getter name in same class", async () => {
			const sourceFile = setup.project.createSourceFile(
				"test-class.ts",
				`
export class TestClass {
	public myMethod(): string {
		return "method"
	}
	
	public get myProperty(): string {
		return "property"
	}
}
				`.trim(),
			)

			const operation: RenameOperation = {
				operation: "rename",
				scope: "project",
				selector: {
					type: "identifier",
					name: "myMethod",
					kind: "method",
					filePath: "test-class.ts",
				},
				newName: "myProperty", // This should conflict with existing getter
			}

			const result = await renameOrchestrator.executeRenameOperation(operation)

			expect(result.success).toBe(false)
			expect(result.error).toContain("Getter 'myProperty' already exists in class 'TestClass'")
		})

		it("should prevent renaming method to existing setter name in same class", async () => {
			const sourceFile = setup.project.createSourceFile(
				"test-class.ts",
				`
export class TestClass {
	private _value: string = ""
	
	public myMethod(): string {
		return "method"
	}
	
	public set myProperty(value: string) {
		this._value = value
	}
}
				`.trim(),
			)

			const operation: RenameOperation = {
				operation: "rename",
				scope: "project",
				selector: {
					type: "identifier",
					name: "myMethod",
					kind: "method",
					filePath: "test-class.ts",
				},
				newName: "myProperty", // This should conflict with existing setter
			}

			const result = await renameOrchestrator.executeRenameOperation(operation)

			expect(result.success).toBe(false)
			expect(result.error).toContain("Setter 'myProperty' already exists in class 'TestClass'")
		})

		it("should prevent renaming method to existing property name in same class", async () => {
			const sourceFile = setup.project.createSourceFile(
				"test-class.ts",
				`
export class TestClass {
	public existingProperty: string = "value"
	
	public myMethod(): string {
		return "method"
	}
}
				`.trim(),
			)

			const operation: RenameOperation = {
				operation: "rename",
				scope: "project",
				selector: {
					type: "identifier",
					name: "myMethod",
					kind: "method",
					filePath: "test-class.ts",
				},
				newName: "existingProperty", // This should conflict with existing property
			}

			const result = await renameOrchestrator.executeRenameOperation(operation)

			expect(result.success).toBe(false)
			expect(result.error).toContain("Property 'existingProperty' already exists in class 'TestClass'")
		})
	})

	describe("Property Name Collision Detection", () => {
		it("should prevent renaming property to existing property name in same class", async () => {
			const sourceFile = setup.project.createSourceFile(
				"test-class.ts",
				`
export class TestClass {
	public propertyA: string = "A"
	public propertyB: number = 42
}
				`.trim(),
			)

			const operation: RenameOperation = {
				operation: "rename",
				scope: "project",
				selector: {
					type: "identifier",
					name: "propertyA",
					kind: "property",
					filePath: "test-class.ts",
				},
				newName: "propertyB", // This should conflict with existing propertyB
			}

			const result = await renameOrchestrator.executeRenameOperation(operation)

			expect(result.success).toBe(false)
			expect(result.error).toContain("Property 'propertyB' already exists in class 'TestClass'")
		})

		it("should prevent renaming property to existing method name in same class", async () => {
			const sourceFile = setup.project.createSourceFile(
				"test-class.ts",
				`
export class TestClass {
	public myProperty: string = "value"
	
	public existingMethod(): string {
		return "method"
	}
}
				`.trim(),
			)

			const operation: RenameOperation = {
				operation: "rename",
				scope: "project",
				selector: {
					type: "identifier",
					name: "myProperty",
					kind: "property",
					filePath: "test-class.ts",
				},
				newName: "existingMethod", // This should conflict with existing method
			}

			const result = await renameOrchestrator.executeRenameOperation(operation)

			expect(result.success).toBe(false)
			expect(result.error).toContain("Method 'existingMethod' already exists in class 'TestClass'")
		})
	})

	describe("Getter/Setter Name Collision Detection", () => {
		it("should prevent renaming getter to existing method name in same class", async () => {
			const sourceFile = setup.project.createSourceFile(
				"test-class.ts",
				`
export class TestClass {
	private _value: string = ""
	
	public get myGetter(): string {
		return this._value
	}
	
	public existingMethod(): string {
		return "method"
	}
}
				`.trim(),
			)

			const operation: RenameOperation = {
				operation: "rename",
				scope: "project",
				selector: {
					type: "identifier",
					name: "myGetter",
					kind: "property",
					filePath: "test-class.ts",
				},
				newName: "existingMethod", // This should conflict with existing method
			}

			const result = await renameOrchestrator.executeRenameOperation(operation)

			expect(result.success).toBe(false)
			expect(result.error).toContain("Method 'existingMethod' already exists in class 'TestClass'")
		})

		it("should prevent renaming setter to existing getter name in same class", async () => {
			const sourceFile = setup.project.createSourceFile(
				"test-class.ts",
				`
export class TestClass {
	private _value: string = ""
	
	public get existingGetter(): string {
		return this._value
	}
	
	public set mySetter(value: string) {
		this._value = value
	}
}
				`.trim(),
			)

			const operation: RenameOperation = {
				operation: "rename",
				scope: "project",
				selector: {
					type: "identifier",
					name: "mySetter",
					kind: "property",
					filePath: "test-class.ts",
				},
				newName: "existingGetter", // This should conflict with existing getter
			}

			const result = await renameOrchestrator.executeRenameOperation(operation)

			expect(result.success).toBe(false)
			expect(result.error).toContain("Getter 'existingGetter' already exists in class 'TestClass'")
		})
	})

	describe("Valid Rename Operations", () => {
		it("should allow renaming method to unique name in same class", async () => {
			const sourceFile = setup.project.createSourceFile(
				"test-class.ts",
				`
export class TestClass {
	public methodA(): string {
		return "A"
	}
	
	public methodB(): number {
		return 42
	}
}
				`.trim(),
			)

			const operation: RenameOperation = {
				operation: "rename",
				scope: "project",
				selector: {
					type: "identifier",
					name: "methodA",
					kind: "method",
					filePath: "test-class.ts",
				},
				newName: "uniqueMethodName", // This should be allowed
			}

			const result = await renameOrchestrator.executeRenameOperation(operation)

			expect(result.success).toBe(true)
			expect(result.error).toBeUndefined()

			// Verify the rename actually happened
			const updatedText = sourceFile.getFullText()
			expect(updatedText).toContain("uniqueMethodName()")
			expect(updatedText).not.toContain("methodA()")
		})

		it("should allow renaming method in different classes to same name", async () => {
			const sourceFile = setup.project.createSourceFile(
				"test-classes.ts",
				`
export class ClassA {
	public methodToRename(): string {
		return "A"
	}
}

export class ClassB {
	public existingMethod(): string {
		return "B"
	}
}
				`.trim(),
			)

			const operation: RenameOperation = {
				operation: "rename",
				scope: "project",
				selector: {
					type: "identifier",
					name: "methodToRename",
					kind: "method",
					filePath: "test-classes.ts",
				},
				newName: "existingMethod", // This should be allowed since it's in a different class
			}

			const result = await renameOrchestrator.executeRenameOperation(operation)

			expect(result.success).toBe(true)
			expect(result.error).toBeUndefined()

			// Verify the rename actually happened
			const updatedText = sourceFile.getFullText()
			expect(updatedText).toContain("existingMethod(): string")
			expect(updatedText).not.toContain("methodToRename()")
		})
	})

	describe("Edge Cases", () => {
		it("should handle anonymous classes gracefully", async () => {
			const sourceFile = setup.project.createSourceFile(
				"test-anonymous.ts",
				`
const myClass = class {
	public methodA(): string {
		return "A"
	}
	
	public methodB(): number {
		return 42
	}
}
				`.trim(),
			)

			const operation: RenameOperation = {
				operation: "rename",
				scope: "project",
				selector: {
					type: "identifier",
					name: "methodA",
					kind: "method",
					filePath: "test-anonymous.ts",
				},
				newName: "methodB", // This should conflict
			}

			const result = await renameOrchestrator.executeRenameOperation(operation)

			expect(result.success).toBe(false)
			expect(result.error).toContain("Method 'methodB' already exists in class 'anonymous'")
		})

		it("should not interfere with method names in different scopes", async () => {
			const sourceFile = setup.project.createSourceFile(
				"test-scopes.ts",
				`
export class TestClass {
	public methodA(): string {
		return "A"
	}
}

export function methodA(): string {
	return "function A"
}

export const methodA = "variable A"
				`.trim(),
			)

			const operation: RenameOperation = {
				operation: "rename",
				scope: "project",
				selector: {
					type: "identifier",
					name: "methodA",
					kind: "method",
					filePath: "test-scopes.ts",
				},
				newName: "renamedMethod",
			}

			const result = await renameOrchestrator.executeRenameOperation(operation)

			expect(result.success).toBe(true)
			expect(result.error).toBeUndefined()
		})
	})
})
