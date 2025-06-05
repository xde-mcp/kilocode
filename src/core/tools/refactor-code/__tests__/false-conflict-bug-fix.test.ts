import { describe, it, expect, beforeEach, afterEach } from "@jest/globals"
import {
	createRefactorEngineTestSetup,
	RefactorEngineTestSetup,
	createTestFilesWithAutoLoad,
} from "./utils/standardized-test-setup"

describe("RefactorCodeTool False Conflict Bug Fix", () => {
	let setup: RefactorEngineTestSetup

	beforeEach(() => {
		setup = createRefactorEngineTestSetup()
	})

	afterEach(() => {
		setup.cleanup()
	})

	describe("Bug Fix: False Naming Conflict Detection", () => {
		it("should not detect false conflicts when moving to a cleared file", async () => {
			// Create source file with the function to be moved
			const filePaths = createTestFilesWithAutoLoad(setup, {
				"large-file.ts": `
export function calculateTotalPrice(items: any[]): number {
	return items.reduce((total, item) => total + item.price, 0);
}

export function formatUserName(user: any): string {
	return \`\${user.firstName} \${user.lastName}\`;
}

export class UserService {
	getData() {
		return "user data";
	}
}
				`.trim(),
				"product-utils.ts": `
// This file initially has content that will be cleared
export function calculateTotalPrice(items: any[]): number {
	return items.reduce((total, item) => total + item.price * 2, 0); // Different implementation
}

export function someOtherFunction() {
	return "other";
}
				`.trim(),
			})

			// Step 1: Clear the target file (simulating write_to_file with empty content)
			const project = (setup.engine as any).project
			const targetFile = project.getSourceFile(filePaths["product-utils.ts"])
			expect(targetFile).toBeDefined()

			// Clear the file content
			targetFile.replaceWithText("")
			targetFile.saveSync()

			// Step 2: Try to move calculateTotalPrice from large-file.ts to the now-empty product-utils.ts
			const operations = [
				{
					operation: "move" as const,
					selector: {
						type: "identifier" as const,
						name: "calculateTotalPrice",
						kind: "function" as const,
						filePath: filePaths["large-file.ts"],
					},
					targetFilePath: filePaths["product-utils.ts"],
					reason: "Testing move to cleared file - should not detect false conflict",
				},
			]

			const result = await setup.engine.executeBatch({ operations })

			// The operation should succeed - no false conflict should be detected
			expect(result.success).toBe(true)
			expect(result.results).toHaveLength(1)
			expect(result.results[0].success).toBe(true)

			// Verify the function was moved successfully
			const updatedTargetFile = project.getSourceFile(filePaths["product-utils.ts"])
			expect(updatedTargetFile).toBeDefined()

			if (updatedTargetFile) {
				const content = updatedTargetFile.getFullText()
				expect(content).toContain("export function calculateTotalPrice")
				expect(content).toContain("items.reduce((total, item) => total + item.price, 0)")
			}

			// Verify the function was removed from source file
			const updatedSourceFile = project.getSourceFile(filePaths["large-file.ts"])
			expect(updatedSourceFile).toBeDefined()

			if (updatedSourceFile) {
				const content = updatedSourceFile.getFullText()
				expect(content).not.toContain("export function calculateTotalPrice")
				// Should still have other functions
				expect(content).toContain("export function formatUserName")
				expect(content).toContain("export class UserService")
			}
		})

		it("should still detect real naming conflicts", async () => {
			// Create source and target files with actual naming conflict
			const filePaths = createTestFilesWithAutoLoad(setup, {
				"source.ts": `
export function testFunction(): string {
	return "from source";
}
				`.trim(),
				"target.ts": `
export function testFunction(): number {
	return 42;
}
				`.trim(),
			})

			// Try to move testFunction to a file that already has testFunction
			const operations = [
				{
					operation: "move" as const,
					selector: {
						type: "identifier" as const,
						name: "testFunction",
						kind: "function" as const,
						filePath: filePaths["source.ts"],
					},
					targetFilePath: filePaths["target.ts"],
					reason: "Testing real naming conflict detection",
				},
			]

			const result = await setup.engine.executeBatch({ operations })

			// Should fail due to real naming conflict
			expect(result.success).toBe(false)
			expect(result.error).toContain("Naming conflict")
			expect(result.error).toContain("testFunction")
		})

		it("should handle batch operations with cleared files correctly", async () => {
			// Create source file with multiple functions
			const filePaths = createTestFilesWithAutoLoad(setup, {
				"large-file.ts": `
export function calculateTotalPrice(items: any[]): number {
	return items.reduce((total, item) => total + item.price, 0);
}

export function formatUserName(user: any): string {
	return \`\${user.firstName} \${user.lastName}\`;
}

export class UserService {
	getData() {
		return "user data";
	}
}

export class ProductService {
	getProducts() {
		return [];
	}
}
				`.trim(),
				"user-utils.ts": `
// Will be cleared
export function formatUserName(user: any): string {
	return "old implementation";
}
				`.trim(),
				"product-utils.ts": `
// Will be cleared  
export function calculateTotalPrice(items: any[]): number {
	return 0; // old implementation
}
				`.trim(),
			})

			// Clear both target files
			const project = (setup.engine as any).project
			const userUtilsFile = project.getSourceFile(filePaths["user-utils.ts"])
			const productUtilsFile = project.getSourceFile(filePaths["product-utils.ts"])

			userUtilsFile.replaceWithText("")
			userUtilsFile.saveSync()
			productUtilsFile.replaceWithText("")
			productUtilsFile.saveSync()

			// Batch operation: rename classes and move functions
			const operations = [
				{
					operation: "rename" as const,
					selector: {
						type: "identifier" as const,
						name: "UserService",
						kind: "class" as const,
						filePath: filePaths["large-file.ts"],
					},
					newName: "UserDataService",
					reason: "Rename UserService to UserDataService",
				},
				{
					operation: "rename" as const,
					selector: {
						type: "identifier" as const,
						name: "ProductService",
						kind: "class" as const,
						filePath: filePaths["large-file.ts"],
					},
					newName: "ProductDataService",
					reason: "Rename ProductService to ProductDataService",
				},
				{
					operation: "move" as const,
					selector: {
						type: "identifier" as const,
						name: "formatUserName",
						kind: "function" as const,
						filePath: filePaths["large-file.ts"],
					},
					targetFilePath: filePaths["user-utils.ts"],
					reason: "Move formatUserName to user-utils.ts",
				},
				{
					operation: "move" as const,
					selector: {
						type: "identifier" as const,
						name: "calculateTotalPrice",
						kind: "function" as const,
						filePath: filePaths["large-file.ts"],
					},
					targetFilePath: filePaths["product-utils.ts"],
					reason: "Move calculateTotalPrice to product-utils.ts",
				},
			]

			const result = await setup.engine.executeBatch({ operations })

			// All operations should succeed
			expect(result.success).toBe(true)
			expect(result.results).toHaveLength(4)
			expect(result.results.every((r) => r.success)).toBe(true)

			// Verify the moves worked
			const updatedUserUtils = project.getSourceFile(filePaths["user-utils.ts"])
			const updatedProductUtils = project.getSourceFile(filePaths["product-utils.ts"])
			const updatedLargeFile = project.getSourceFile(filePaths["large-file.ts"])

			if (updatedUserUtils) {
				const content = updatedUserUtils.getFullText()
				expect(content).toContain("export function formatUserName")
			}

			if (updatedProductUtils) {
				const content = updatedProductUtils.getFullText()
				expect(content).toContain("export function calculateTotalPrice")
			}

			if (updatedLargeFile) {
				const content = updatedLargeFile.getFullText()
				expect(content).toContain("export class UserDataService")
				expect(content).toContain("export class ProductDataService")
				expect(content).not.toContain("export function formatUserName")
				expect(content).not.toContain("export function calculateTotalPrice")
			}
		})

		it("should handle remove-then-move with same name in batch operation", async () => {
			// This test reproduces a potential bug where removing a function and then moving
			// a function with the same name in a batch operation might cause a false conflict
			const filePaths = createTestFilesWithAutoLoad(setup, {
				"source.ts": `
export function processData(data: any[]): any[] {
	return data.map(item => ({ ...item, processed: true }));
}

export function calculateSum(numbers: number[]): number {
	return numbers.reduce((sum, num) => sum + num, 0);
}
				`.trim(),
				"target.ts": `
export function processData(data: any[]): string {
	// Different implementation - this will be removed first
	return data.join(", ");
}

export function formatOutput(value: any): string {
	return String(value);
}
				`.trim(),
			})

			// Batch operation: remove processData from target, then move processData from source to target
			const operations = [
				{
					operation: "remove" as const,
					selector: {
						type: "identifier" as const,
						name: "processData",
						kind: "function" as const,
						filePath: filePaths["target.ts"],
					},
					reason: "Remove old implementation of processData",
				},
				{
					operation: "move" as const,
					selector: {
						type: "identifier" as const,
						name: "processData",
						kind: "function" as const,
						filePath: filePaths["source.ts"],
					},
					targetFilePath: filePaths["target.ts"],
					reason: "Move new implementation of processData to target",
				},
			]

			const result = await setup.engine.executeBatch({ operations })

			// Should succeed - no false conflict should be detected
			expect(result.success).toBe(true)
			expect(result.results).toHaveLength(2)
			expect(result.results[0].success).toBe(true) // remove operation
			expect(result.results[1].success).toBe(true) // move operation

			// Verify the function was removed and then moved correctly
			const project = (setup.engine as any).project
			const updatedTargetFile = project.getSourceFile(filePaths["target.ts"])
			const updatedSourceFile = project.getSourceFile(filePaths["source.ts"])

			if (updatedTargetFile) {
				const content = updatedTargetFile.getFullText()
				// Should have the new implementation (returns any[])
				expect(content).toContain("export function processData(data: any[]): any[]")
				expect(content).toContain("processed: true")
				// Should not have the old implementation (returns string)
				expect(content).not.toContain('data.join(", ")')
				// Should still have other functions
				expect(content).toContain("export function formatOutput")
			}

			if (updatedSourceFile) {
				const content = updatedSourceFile.getFullText()
				// processData should be removed from source
				expect(content).not.toContain("export function processData")
				// Should still have other functions
				expect(content).toContain("export function calculateSum")
			}
		})

		it("should reproduce exact bug report scenario - 17 operation batch with cleared target files", async () => {
			// Create the large file content that matches the bug report scenario
			const largeFileContent = `
import { formatUserName } from './user-utils';

interface User {
		id: number;
		name: string;
		email: string;
		isActive: boolean;
}

interface Product {
		id: number;
		name: string;
		price: number;
		inStock: boolean;
}

class UserService {
		private users: User[] = [];

		constructor() {
		  this.users = this.generateDummyUsers(200);
		}

		private generateDummyUsers(count: number): User[] {
		  const dummyUsers: User[] = [];
		  for (let i = 1; i <= count; i++) {
		    dummyUsers.push({
		      id: i,
		      name: \`User \${i}\`,
		      email: \`user\${i}@example.com\`,
		      isActive: i % 2 === 0,
		    });
		  }
		  return dummyUsers;
		}

		getAllUsers(): User[] {
		  return this.users;
		}
}

class ProductService {
		private products: Product[] = [];

		constructor() {
		  this.products = this.generateDummyProducts(200);
		}

		private generateDummyProducts(count: number): Product[] {
		  const dummyProducts: Product[] = [];
		  for (let i = 1; i <= count; i++) {
		    dummyProducts.push({
		      id: i,
		      name: \`Product \${i}\`,
		      price: parseFloat((Math.random() * 100).toFixed(2)),
		      inStock: Math.random() > 0.5,
		    });
		  }
		  return dummyProducts;
		}

		getAllProducts(): Product[] {
		  return this.products;
		}
}

export function formatUserName(user: User): string {
		return \`\${user.name} <\${user.email}>\`;
}

export function calculateTotalPrice(products: Product[]): number {
		return products.reduce((total, product) => total + product.price, 0);
}

function complexCalculation(a: number, b: number): number {
		let result = 0;
		for (let i = 0; i < 100; i++) {
		  result += (a * i) - (b / (i + 1));
		}
		return result;
}

function anotherComplexCalculation(x: number, y: number): number {
		let sum = 0;
		for (let i = 0; i < 200; i++) {
		  sum += (x + y) / (i * i + 1);
		}
		return sum;
}

function yetAnotherFunction(data: any[]): number {
		let total = 0;
		data.forEach(item => {
		  if (typeof item === 'number') {
		    total += item;
		  } else if (typeof item === 'string') {
		    total += item.length;
		  }
		});
		return total;
}

// Dummy functions that will be removed
function dummyFunction11() { console.log('dummy11'); }
function dummyFunction12() { console.log('dummy12'); }
function dummyFunction13() { console.log('dummy13'); }
function dummyFunction14() { console.log('dummy14'); }
function dummyFunction15() { console.log('dummy15'); }
function dummyFunction16() { console.log('dummy16'); }
function dummyFunction17() { console.log('dummy17'); }
function dummyFunction18() { console.log('dummy18'); }
function dummyFunction19() { console.log('dummy19'); }
function dummyFunction20() { console.log('dummy20'); }
`.trim()

			// Create the files
			const filePaths = createTestFilesWithAutoLoad(setup, {
				"large-file.ts": largeFileContent,
				"user-utils.ts": "", // Cleared target file
				"product-utils.ts": "", // Cleared target file
			})

			// Execute the exact 17-operation batch from the bug report
			const operations = [
				// 1. Rename UserService to UserDataService
				{
					operation: "rename" as const,
					selector: {
						type: "identifier" as const,
						name: "UserService",
						kind: "class" as const,
						filePath: filePaths["large-file.ts"],
					},
					newName: "UserDataService",
					reason: "Rename UserService to UserDataService",
				},
				// 2. Rename ProductService to ProductDataService
				{
					operation: "rename" as const,
					selector: {
						type: "identifier" as const,
						name: "ProductService",
						kind: "class" as const,
						filePath: filePaths["large-file.ts"],
					},
					newName: "ProductDataService",
					reason: "Rename ProductService to ProductDataService",
				},
				// 3. Move formatUserName to user-utils.ts
				{
					operation: "move" as const,
					selector: {
						type: "identifier" as const,
						name: "formatUserName",
						kind: "function" as const,
						filePath: filePaths["large-file.ts"],
					},
					targetFilePath: filePaths["user-utils.ts"],
					reason: "Move formatUserName to user-utils.ts",
				},
				// 4. Move calculateTotalPrice to product-utils.ts (THIS IS WHERE THE BUG OCCURS)
				{
					operation: "move" as const,
					selector: {
						type: "identifier" as const,
						name: "calculateTotalPrice",
						kind: "function" as const,
						filePath: filePaths["large-file.ts"],
					},
					targetFilePath: filePaths["product-utils.ts"],
					reason: "Move calculateTotalPrice to product-utils.ts",
				},
				// 5. Rename complexCalculation to performComplexCalculation
				{
					operation: "rename" as const,
					selector: {
						type: "identifier" as const,
						name: "complexCalculation",
						kind: "function" as const,
						filePath: filePaths["large-file.ts"],
					},
					newName: "performComplexCalculation",
					reason: "Rename complexCalculation to performComplexCalculation",
				},
				// 6. Rename anotherComplexCalculation to performAnotherComplexCalculation
				{
					operation: "rename" as const,
					selector: {
						type: "identifier" as const,
						name: "anotherComplexCalculation",
						kind: "function" as const,
						filePath: filePaths["large-file.ts"],
					},
					newName: "performAnotherComplexCalculation",
					reason: "Rename anotherComplexCalculation to performAnotherComplexCalculation",
				},
				// 7. Rename yetAnotherFunction to processArrayData
				{
					operation: "rename" as const,
					selector: {
						type: "identifier" as const,
						name: "yetAnotherFunction",
						kind: "function" as const,
						filePath: filePaths["large-file.ts"],
					},
					newName: "processArrayData",
					reason: "Rename yetAnotherFunction to processArrayData",
				},
				// 8-17. Remove dummy functions
				{
					operation: "remove" as const,
					selector: {
						type: "identifier" as const,
						name: "dummyFunction11",
						kind: "function" as const,
						filePath: filePaths["large-file.ts"],
					},
					reason: "Remove dummyFunction11",
				},
				{
					operation: "remove" as const,
					selector: {
						type: "identifier" as const,
						name: "dummyFunction12",
						kind: "function" as const,
						filePath: filePaths["large-file.ts"],
					},
					reason: "Remove dummyFunction12",
				},
				{
					operation: "remove" as const,
					selector: {
						type: "identifier" as const,
						name: "dummyFunction13",
						kind: "function" as const,
						filePath: filePaths["large-file.ts"],
					},
					reason: "Remove dummyFunction13",
				},
				{
					operation: "remove" as const,
					selector: {
						type: "identifier" as const,
						name: "dummyFunction14",
						kind: "function" as const,
						filePath: filePaths["large-file.ts"],
					},
					reason: "Remove dummyFunction14",
				},
				{
					operation: "remove" as const,
					selector: {
						type: "identifier" as const,
						name: "dummyFunction15",
						kind: "function" as const,
						filePath: filePaths["large-file.ts"],
					},
					reason: "Remove dummyFunction15",
				},
				{
					operation: "remove" as const,
					selector: {
						type: "identifier" as const,
						name: "dummyFunction16",
						kind: "function" as const,
						filePath: filePaths["large-file.ts"],
					},
					reason: "Remove dummyFunction16",
				},
				{
					operation: "remove" as const,
					selector: {
						type: "identifier" as const,
						name: "dummyFunction17",
						kind: "function" as const,
						filePath: filePaths["large-file.ts"],
					},
					reason: "Remove dummyFunction17",
				},
				{
					operation: "remove" as const,
					selector: {
						type: "identifier" as const,
						name: "dummyFunction18",
						kind: "function" as const,
						filePath: filePaths["large-file.ts"],
					},
					reason: "Remove dummyFunction18",
				},
				{
					operation: "remove" as const,
					selector: {
						type: "identifier" as const,
						name: "dummyFunction19",
						kind: "function" as const,
						filePath: filePaths["large-file.ts"],
					},
					reason: "Remove dummyFunction19",
				},
				{
					operation: "remove" as const,
					selector: {
						type: "identifier" as const,
						name: "dummyFunction20",
						kind: "function" as const,
						filePath: filePaths["large-file.ts"],
					},
					reason: "Remove dummyFunction20",
				},
			]

			// Execute the batch operation
			const result = await setup.engine.executeBatch({ operations })

			// The bug report says operation 4 (index 3) should fail with false conflict
			// But with our fix, it should succeed
			expect(result.success).toBe(true)
			expect(result.error).toBeUndefined()

			// Verify that calculateTotalPrice was successfully moved to product-utils.ts
			const project = (setup.engine as any).project
			const updatedProductUtils = project.getSourceFile(filePaths["product-utils.ts"])
			const updatedLargeFile = project.getSourceFile(filePaths["large-file.ts"])
			const updatedUserUtils = project.getSourceFile(filePaths["user-utils.ts"])

			if (updatedProductUtils) {
				const content = updatedProductUtils.getFullText()
				expect(content).toContain("calculateTotalPrice")
				expect(content).toContain("function calculateTotalPrice(products: Product[]): number")
			}

			if (updatedLargeFile) {
				const content = updatedLargeFile.getFullText()
				// Verify that calculateTotalPrice was removed from large-file.ts
				expect(content).not.toContain("function calculateTotalPrice")

				// Verify other operations succeeded
				expect(content).toContain("UserDataService") // Rename succeeded
				expect(content).toContain("ProductDataService") // Rename succeeded
				expect(content).toContain("performComplexCalculation") // Rename succeeded
				expect(content).toContain("performAnotherComplexCalculation") // Rename succeeded
				expect(content).toContain("processArrayData") // Rename succeeded
				expect(content).not.toContain("dummyFunction11") // Remove succeeded
				expect(content).not.toContain("dummyFunction20") // Remove succeeded
			}

			if (updatedUserUtils) {
				const content = updatedUserUtils.getFullText()
				// Verify formatUserName was moved to user-utils.ts
				expect(content).toContain("formatUserName")
			}
		})
	})
})
