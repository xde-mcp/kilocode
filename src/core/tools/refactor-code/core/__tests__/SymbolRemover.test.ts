import { Project, Node, SyntaxKind } from "ts-morph"
import { SymbolRemover } from "../SymbolRemover"
import { ResolvedSymbol } from "../types"

describe("SymbolRemover", () => {
	let project: Project
	let remover: SymbolRemover

	beforeEach(() => {
		project = new Project({ useInMemoryFileSystem: true })
		remover = new SymbolRemover()
	})

	describe("removeSymbol", () => {
		it("should successfully remove a function using standard strategy", async () => {
			const sourceFile = project.createSourceFile(
				"test.ts",
				`
        /**
         * Adds two numbers together
         * @param a First number
         * @param b Second number
         * @returns Sum of a and b
         */
        export function add(a: number, b: number): number {
          return a + b
        }
        
        export function subtract(a: number, b: number): number {
          return a - b
        }
        `,
			)

			const func = sourceFile.getFunction("add")!
			const resolvedSymbol: ResolvedSymbol = {
				node: func,
				name: "add",
				isExported: true,
				filePath: sourceFile.getFilePath(),
			}

			const result = await remover.removeSymbol(resolvedSymbol)

			expect(result.success).toBe(true)
			expect(result.method).toBe("standard")
			expect(result.symbolStillExists).toBe(false)

			// Verify the function is actually removed
			expect(sourceFile.getFunction("add")).toBeUndefined()
			// Verify other functions are not affected
			expect(sourceFile.getFunction("subtract")).not.toBeUndefined()
		})

		it("should successfully remove a class using standard strategy", async () => {
			const sourceFile = project.createSourceFile(
				"test.ts",
				`
        export class User {
          private name: string;
          
          constructor(name: string) {
            this.name = name;
          }
          
          getName(): string {
            return this.name;
          }
        }
        
        export class Product {
          private id: string;
          
          constructor(id: string) {
            this.id = id;
          }
        }
        `,
			)

			const cls = sourceFile.getClass("User")!
			const resolvedSymbol: ResolvedSymbol = {
				node: cls,
				name: "User",
				isExported: true,
				filePath: sourceFile.getFilePath(),
			}

			const result = await remover.removeSymbol(resolvedSymbol)

			expect(result.success).toBe(true)
			expect(result.method).toBe("standard")
			expect(result.symbolStillExists).toBe(false)

			// Verify the class is actually removed
			expect(sourceFile.getClass("User")).toBeUndefined()
			// Verify other classes are not affected
			expect(sourceFile.getClass("Product")).not.toBeUndefined()
		})

		it("should successfully remove a variable from a multi-declaration statement", async () => {
			const sourceFile = project.createSourceFile(
				"test.ts",
				`
        export const API_URL = "https://api.example.com";
        const DEFAULT_TIMEOUT = 5000, RETRY_COUNT = 3, MAX_REQUESTS = 10;
        `,
			)

			const varDecl = sourceFile.getVariableDeclaration("RETRY_COUNT")!
			const resolvedSymbol: ResolvedSymbol = {
				node: varDecl,
				name: "RETRY_COUNT",
				isExported: false,
				filePath: sourceFile.getFilePath(),
			}

			const result = await remover.removeSymbol(resolvedSymbol)

			expect(result.success).toBe(true)
			expect(result.method).toBe("standard")
			expect(result.symbolStillExists).toBe(false)

			// Verify the variable is actually removed
			expect(sourceFile.getVariableDeclaration("RETRY_COUNT")).toBeUndefined()
			// Verify other variables are not affected
			expect(sourceFile.getVariableDeclaration("DEFAULT_TIMEOUT")).not.toBeUndefined()
			expect(sourceFile.getVariableDeclaration("MAX_REQUESTS")).not.toBeUndefined()

			// Verify the source text doesn't contain the removed variable
			const sourceText = sourceFile.getFullText()
			expect(sourceText).toContain("DEFAULT_TIMEOUT = 5000")
			expect(sourceText).not.toContain("RETRY_COUNT = 3")
			expect(sourceText).toContain("MAX_REQUESTS = 10")
		})

		it("should successfully remove a variable that is the only declaration in its statement", async () => {
			const sourceFile = project.createSourceFile(
				"test.ts",
				`
        export const API_URL = "https://api.example.com";
        const DEFAULT_TIMEOUT = 5000;
        const RETRY_COUNT = 3;
        `,
			)

			const varDecl = sourceFile.getVariableDeclaration("RETRY_COUNT")!
			const resolvedSymbol: ResolvedSymbol = {
				node: varDecl,
				name: "RETRY_COUNT",
				isExported: false,
				filePath: sourceFile.getFilePath(),
			}

			const result = await remover.removeSymbol(resolvedSymbol)

			expect(result.success).toBe(true)
			expect(result.method).toBe("standard")
			expect(result.symbolStillExists).toBe(false)

			// Verify the variable is actually removed
			expect(sourceFile.getVariableDeclaration("RETRY_COUNT")).toBeUndefined()
			// Verify other variables are not affected
			expect(sourceFile.getVariableDeclaration("API_URL")).not.toBeUndefined()
			expect(sourceFile.getVariableDeclaration("DEFAULT_TIMEOUT")).not.toBeUndefined()

			// Verify the source text doesn't contain the removed variable statement
			const sourceText = sourceFile.getFullText()
			expect(sourceText).toContain("API_URL")
			expect(sourceText).toContain("DEFAULT_TIMEOUT")
			expect(sourceText).not.toContain("RETRY_COUNT")
		})

		it("should successfully remove an interface using standard strategy", async () => {
			const sourceFile = project.createSourceFile(
				"test.ts",
				`
        export interface User {
          id: string;
          name: string;
          email: string;
        }
        
        export interface Product {
          id: string;
          name: string;
          price: number;
        }
        `,
			)

			const interfaceDecl = sourceFile.getInterface("User")!
			const resolvedSymbol: ResolvedSymbol = {
				node: interfaceDecl,
				name: "User",
				isExported: true,
				filePath: sourceFile.getFilePath(),
			}

			const result = await remover.removeSymbol(resolvedSymbol)

			expect(result.success).toBe(true)
			expect(result.method).toBe("standard")
			expect(result.symbolStillExists).toBe(false)

			// Verify the interface is actually removed
			expect(sourceFile.getInterface("User")).toBeUndefined()
			// Verify other interfaces are not affected
			expect(sourceFile.getInterface("Product")).not.toBeUndefined()
		})

		it("should successfully remove a type alias using standard strategy", async () => {
			const sourceFile = project.createSourceFile(
				"test.ts",
				`
        export type UserId = string;
        export type UserRole = "admin" | "user" | "guest";
        `,
			)

			const typeAlias = sourceFile.getTypeAlias("UserId")!
			const resolvedSymbol: ResolvedSymbol = {
				node: typeAlias,
				name: "UserId",
				isExported: true,
				filePath: sourceFile.getFilePath(),
			}

			const result = await remover.removeSymbol(resolvedSymbol)

			expect(result.success).toBe(true)
			expect(result.method).toBe("standard")
			expect(result.symbolStillExists).toBe(false)

			// Verify the type alias is actually removed
			expect(sourceFile.getTypeAlias("UserId")).toBeUndefined()
			// Verify other type aliases are not affected
			expect(sourceFile.getTypeAlias("UserRole")).not.toBeUndefined()
		})

		it("should fall back to aggressive strategy when standard strategy fails", async () => {
			// Create a spy on the standard strategy method to force it to fail
			const standardStrategySpy = jest
				.spyOn(remover as any, "removeWithStandardStrategy")
				.mockImplementation(async () => {
					return {
						success: false,
						method: "standard",
						error: "Forced standard strategy failure",
						symbolStillExists: true,
					}
				})

			// Create a spy on the aggressive strategy to ensure it's called
			const aggressiveStrategySpy = jest
				.spyOn(remover as any, "removeWithAggressiveStrategy")
				.mockImplementation(async () => {
					return {
						success: true,
						method: "aggressive",
						symbolStillExists: false,
					}
				})

			const sourceFile = project.createSourceFile("test.ts", `export function testFunction() { return true; }`)

			const func = sourceFile.getFunction("testFunction")!
			const resolvedSymbol: ResolvedSymbol = {
				node: func,
				name: "testFunction",
				isExported: true,
				filePath: sourceFile.getFilePath(),
			}

			const result = await remover.removeSymbol(resolvedSymbol)

			// Verify the standard strategy was attempted
			expect(standardStrategySpy).toHaveBeenCalled()

			// Verify the aggressive strategy was used as fallback
			expect(aggressiveStrategySpy).toHaveBeenCalled()

			// Verify the result
			expect(result.success).toBe(true)
			expect(result.method).toBe("aggressive")
			expect(result.symbolStillExists).toBe(false)

			// Restore the original implementations
			standardStrategySpy.mockRestore()
			aggressiveStrategySpy.mockRestore()
		})

		it("should fall back to manual strategy when aggressive strategy fails", async () => {
			// Create spies to force standard and aggressive strategies to fail
			const standardStrategySpy = jest
				.spyOn(remover as any, "removeWithStandardStrategy")
				.mockImplementation(async () => {
					return {
						success: false,
						method: "standard",
						error: "Forced standard strategy failure",
						symbolStillExists: true,
					}
				})

			const aggressiveStrategySpy = jest
				.spyOn(remover as any, "removeWithAggressiveStrategy")
				.mockImplementation(async () => {
					return {
						success: false,
						method: "aggressive",
						error: "Forced aggressive strategy failure",
						symbolStillExists: true,
					}
				})

			// Create a spy on the manual strategy to ensure it's called
			const manualStrategySpy = jest
				.spyOn(remover as any, "removeWithManualStrategy")
				.mockImplementation(async () => {
					return {
						success: true,
						method: "manual",
						symbolStillExists: false,
					}
				})

			const sourceFile = project.createSourceFile("test.ts", `export function testFunction() { return true; }`)

			const func = sourceFile.getFunction("testFunction")!
			const resolvedSymbol: ResolvedSymbol = {
				node: func,
				name: "testFunction",
				isExported: true,
				filePath: sourceFile.getFilePath(),
			}

			const result = await remover.removeSymbol(resolvedSymbol)

			// Verify all strategies were attempted in order
			expect(standardStrategySpy).toHaveBeenCalled()
			expect(aggressiveStrategySpy).toHaveBeenCalled()
			expect(manualStrategySpy).toHaveBeenCalled()

			// Verify the result
			expect(result.success).toBe(true)
			expect(result.method).toBe("manual")
			expect(result.symbolStillExists).toBe(false)

			// Restore the original implementations
			standardStrategySpy.mockRestore()
			aggressiveStrategySpy.mockRestore()
			manualStrategySpy.mockRestore()
		})

		it("should return failure when all strategies fail", async () => {
			// Create spies to force all strategies to fail
			const standardStrategySpy = jest
				.spyOn(remover as any, "removeWithStandardStrategy")
				.mockImplementation(async () => {
					return {
						success: false,
						method: "standard",
						error: "Forced standard strategy failure",
						symbolStillExists: true,
					}
				})

			const aggressiveStrategySpy = jest
				.spyOn(remover as any, "removeWithAggressiveStrategy")
				.mockImplementation(async () => {
					return {
						success: false,
						method: "aggressive",
						error: "Forced aggressive strategy failure",
						symbolStillExists: true,
					}
				})

			const manualStrategySpy = jest
				.spyOn(remover as any, "removeWithManualStrategy")
				.mockImplementation(async () => {
					return {
						success: false,
						method: "manual",
						error: "Forced manual strategy failure",
						symbolStillExists: true,
					}
				})

			const sourceFile = project.createSourceFile("test.ts", `export function testFunction() { return true; }`)

			const func = sourceFile.getFunction("testFunction")!
			const resolvedSymbol: ResolvedSymbol = {
				node: func,
				name: "testFunction",
				isExported: true,
				filePath: sourceFile.getFilePath(),
			}

			const result = await remover.removeSymbol(resolvedSymbol)

			// Verify all strategies were attempted
			expect(standardStrategySpy).toHaveBeenCalled()
			expect(aggressiveStrategySpy).toHaveBeenCalled()
			expect(manualStrategySpy).toHaveBeenCalled()

			// Verify the failure result
			expect(result.success).toBe(false)
			expect(result.method).toBe("failed")
			expect(result.error).toContain("Failed to remove symbol")
			expect(result.symbolStillExists).toBe(true)

			// Restore the original implementations
			standardStrategySpy.mockRestore()
			aggressiveStrategySpy.mockRestore()
			manualStrategySpy.mockRestore()
		})
	})

	describe("checkIfSymbolExists", () => {
		it("should correctly detect if a symbol still exists", async () => {
			const sourceFile = project.createSourceFile(
				"test.ts",
				`
        export function add(a: number, b: number): number {
          return a + b;
        }
        
        export class User {
          constructor(public name: string) {}
        }
        
        export interface Product {
          id: string;
          name: string;
        }
        
        export type UserRole = "admin" | "user";
        
        export const API_URL = "https://api.example.com";
        `,
			)

			// Test private method using the any type assertion
			const checkIfSymbolExists = (remover as any).checkIfSymbolExists.bind(remover)

			// Test detection of existing symbols
			expect(checkIfSymbolExists("add", sourceFile)).toBe(true)
			expect(checkIfSymbolExists("User", sourceFile)).toBe(true)
			expect(checkIfSymbolExists("Product", sourceFile)).toBe(true)
			expect(checkIfSymbolExists("UserRole", sourceFile)).toBe(true)
			expect(checkIfSymbolExists("API_URL", sourceFile)).toBe(true)

			// Test detection of non-existing symbols
			expect(checkIfSymbolExists("subtract", sourceFile)).toBe(false)
			expect(checkIfSymbolExists("Customer", sourceFile)).toBe(false)
			expect(checkIfSymbolExists("Order", sourceFile)).toBe(false)
			expect(checkIfSymbolExists("CustomerRole", sourceFile)).toBe(false)
			expect(checkIfSymbolExists("BASE_URL", sourceFile)).toBe(false)
		})
	})

	describe("removeWithManualStrategy", () => {
		it("should manually remove a function when other strategies fail", async () => {
			const sourceFile = project.createSourceFile(
				"test.ts",
				`
        /**
         * Function to test manual removal
         */
        export function testFunction(param: string): boolean {
          console.log(param);
          return true;
        }
        
        export function keepThisFunction(): void {
          console.log("Keep me");
        }
        `,
			)

			// Access the private method using any type assertion
			const removeWithManualStrategy = (remover as any).removeWithManualStrategy.bind(remover)

			const result = await removeWithManualStrategy("testFunction", sourceFile)

			expect(result.success).toBe(true)
			expect(result.method).toBe("manual")
			expect(result.symbolStillExists).toBe(false)

			// Verify the function is actually removed
			expect(sourceFile.getFunction("testFunction")).toBeUndefined()
			// Verify other functions are not affected
			expect(sourceFile.getFunction("keepThisFunction")).not.toBeUndefined()

			// Verify the source text
			const sourceText = sourceFile.getFullText()
			expect(sourceText).not.toContain("testFunction")
			expect(sourceText).toContain("keepThisFunction")
		})
	})
})
