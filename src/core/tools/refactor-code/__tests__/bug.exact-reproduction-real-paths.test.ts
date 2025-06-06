/**
 * Exact Bug Reproduction Test - Real File Paths
 *
 * This test reproduces the exact scenario described in the bug report using
 * the actual file paths mentioned: test-refactor/large-file.ts, etc.
 *
 * The key insight is that our previous test showed the bug is FIXED for the
 * RefactorEngine API, but the AI bot is still reproducing it. This suggests
 * there might be a different edge case or the bug occurs under different conditions.
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals"
import {
	createRefactorEngineTestSetup,
	RefactorEngineTestSetup,
	createTestFilesWithAutoLoad,
	TestFileStructure,
} from "./utils/standardized-test-setup"
import { MoveOperation, RenameOperation, RemoveOperation } from "../schema"
import * as fs from "fs"
import * as path from "path"

describe("Exact Bug Reproduction - Real File Paths", () => {
	let setup: RefactorEngineTestSetup

	beforeAll(() => {
		setup = createRefactorEngineTestSetup()
	})

	afterAll(() => {
		setup.cleanup()
	})

	it("should reproduce the bug using the exact file structure from the bug report", async () => {
		// Create the exact file structure mentioned in the bug report
		// Note: We'll create these in our test directory but with the same relative structure
		const testFiles: TestFileStructure = {
			"test-refactor/large-file.ts": `
// Large file with multiple classes and functions (400+ lines as mentioned in bug report)
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

export class UserService {
    getUser(id: string): User {
        return { id, name: 'Test User', email: 'test@example.com' };
    }
    
    updateUser(user: User): User {
        return { ...user, updatedAt: new Date() };
    }
    
    deleteUser(id: string): boolean {
        return true;
    }
}

export class ProductService {
    getProduct(id: string): Product {
        return { id, name: 'Test Product', price: 100 };
    }
    
    updateProduct(product: Product): Product {
        return { ...product, updatedAt: new Date() };
    }
    
    deleteProduct(id: string): boolean {
        return true;
    }
}

export function formatUserName(user: User): string {
    return user.name.toUpperCase();
}

export function calculateTotalPrice(products: Product[]): number {
    return products.reduce((total, product) => total + product.price, 0);
}

export function complexCalculation(a: number, b: number): number {
    return a * b + Math.sqrt(a + b);
}

export function anotherComplexCalculation(x: number): number {
    return x * 2 + 5;
}

export function yetAnotherFunction(arr: number[]): number[] {
    return arr.map(x => x * 2);
}

// Additional functions to make it closer to 400 lines
export function helperFunction1() { return 'helper1'; }
export function helperFunction2() { return 'helper2'; }
export function helperFunction3() { return 'helper3'; }
export function helperFunction4() { return 'helper4'; }
export function helperFunction5() { return 'helper5'; }
export function helperFunction6() { return 'helper6'; }
export function helperFunction7() { return 'helper7'; }
export function helperFunction8() { return 'helper8'; }
export function helperFunction9() { return 'helper9'; }
export function helperFunction10() { return 'helper10'; }

// Dummy functions for removal (as mentioned in bug report)
export function dummyFunction11() { return 'dummy11'; }
export function dummyFunction12() { return 'dummy12'; }
export function dummyFunction13() { return 'dummy13'; }
export function dummyFunction14() { return 'dummy14'; }
export function dummyFunction15() { return 'dummy15'; }
export function dummyFunction16() { return 'dummy16'; }
export function dummyFunction17() { return 'dummy17'; }
export function dummyFunction18() { return 'dummy18'; }
export function dummyFunction19() { return 'dummy19'; }
export function dummyFunction20() { return 'dummy20'; }

// More content to reach ~400 lines
export const CONFIG = {
    apiUrl: 'https://api.example.com',
    timeout: 5000,
    retries: 3
};

export enum Status {
    ACTIVE = 'active',
    INACTIVE = 'inactive',
    PENDING = 'pending'
}

export type UserRole = 'admin' | 'user' | 'guest';

export interface ApiResponse<T> {
    data: T;
    status: number;
    message: string;
}

// Additional utility functions
export function validateEmail(email: string): boolean {
    return email.includes('@') && email.includes('.');
}

export function generateId(): string {
    return Math.random().toString(36).substr(2, 9);
}

export function formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
}

export function parseJson<T>(json: string): T | null {
    try {
        return JSON.parse(json);
    } catch {
        return null;
    }
}

export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

export function throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number
): (...args: Parameters<T>) => void {
    let inThrottle: boolean;
    return (...args: Parameters<T>) => {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// More dummy content to reach the target line count
export class DataProcessor {
    process(data: any[]): any[] {
        return data.map(item => ({ ...item, processed: true }));
    }
    
    filter(data: any[], predicate: (item: any) => boolean): any[] {
        return data.filter(predicate);
    }
    
    sort(data: any[], key: string): any[] {
        return data.sort((a, b) => a[key] - b[key]);
    }
}

export class Logger {
    log(message: string): void {
        console.log(\`[\${new Date().toISOString()}] \${message}\`);
    }
    
    error(message: string): void {
        console.error(\`[\${new Date().toISOString()}] ERROR: \${message}\`);
    }
    
    warn(message: string): void {
        console.warn(\`[\${new Date().toISOString()}] WARN: \${message}\`);
    }
}

// Final padding to reach approximately 400 lines
export const CONSTANTS = {
    MAX_RETRIES: 3,
    DEFAULT_TIMEOUT: 5000,
    API_VERSION: 'v1',
    SUPPORTED_FORMATS: ['json', 'xml', 'csv'],
    ERROR_CODES: {
        NOT_FOUND: 404,
        UNAUTHORIZED: 401,
        SERVER_ERROR: 500
    }
};
`.trim(),
			"test-refactor/user-utils.ts": "", // Empty target file
			"test-refactor/product-utils.ts": "", // Empty target file
		}

		// Create the test files using the standardized approach
		createTestFilesWithAutoLoad(setup, testFiles)

		// Verify initial state - target files should be empty
		const initialUserUtils = fs.readFileSync(path.join(setup.projectDir, "test-refactor/user-utils.ts"), "utf-8")
		const initialProductUtils = fs.readFileSync(
			path.join(setup.projectDir, "test-refactor/product-utils.ts"),
			"utf-8",
		)
		expect(initialUserUtils).toBe("")
		expect(initialProductUtils).toBe("")

		// Execute the exact batch operation from the bug report
		const operations = [
			// Operations 1-2: Rename classes
			{
				operation: "rename" as const,
				selector: {
					type: "identifier" as const,
					name: "UserService",
					kind: "class" as const,
					filePath: "test-refactor/large-file.ts",
				},
				newName: "UserDataService",
				reason: "Rename UserService class to UserDataService",
			} as RenameOperation,
			{
				operation: "rename" as const,
				selector: {
					type: "identifier" as const,
					name: "ProductService",
					kind: "class" as const,
					filePath: "test-refactor/large-file.ts",
				},
				newName: "ProductDataService",
				reason: "Rename ProductService class to ProductDataService",
			} as RenameOperation,
			// Operation 3: Move formatUserName (this should succeed)
			{
				operation: "move" as const,
				selector: {
					type: "identifier" as const,
					name: "formatUserName",
					kind: "function" as const,
					filePath: "test-refactor/large-file.ts",
				},
				targetFilePath: "test-refactor/user-utils.ts",
				reason: "Move formatUserName function to user-utils.ts",
			} as MoveOperation,
			// Operation 4: Move calculateTotalPrice (this should fail according to bug report)
			{
				operation: "move" as const,
				selector: {
					type: "identifier" as const,
					name: "calculateTotalPrice",
					kind: "function" as const,
					filePath: "test-refactor/large-file.ts",
				},
				targetFilePath: "test-refactor/product-utils.ts",
				reason: "Move calculateTotalPrice function to product-utils.ts",
			} as MoveOperation,
			// Operations 5-7: Rename functions
			{
				operation: "rename" as const,
				selector: {
					type: "identifier" as const,
					name: "complexCalculation",
					kind: "function" as const,
					filePath: "test-refactor/large-file.ts",
				},
				newName: "performComplexCalculation",
				reason: "Rename complexCalculation to performComplexCalculation",
			} as RenameOperation,
			{
				operation: "rename" as const,
				selector: {
					type: "identifier" as const,
					name: "anotherComplexCalculation",
					kind: "function" as const,
					filePath: "test-refactor/large-file.ts",
				},
				newName: "performAnotherComplexCalculation",
				reason: "Rename anotherComplexCalculation to performAnotherComplexCalculation",
			} as RenameOperation,
			{
				operation: "rename" as const,
				selector: {
					type: "identifier" as const,
					name: "yetAnotherFunction",
					kind: "function" as const,
					filePath: "test-refactor/large-file.ts",
				},
				newName: "processArrayData",
				reason: "Rename yetAnotherFunction to processArrayData",
			} as RenameOperation,
			// Operations 8-17: Remove dummy functions
			{
				operation: "remove" as const,
				selector: {
					type: "identifier" as const,
					name: "dummyFunction11",
					kind: "function" as const,
					filePath: "test-refactor/large-file.ts",
				},
				reason: "Remove dummyFunction11",
			} as RemoveOperation,
			{
				operation: "remove" as const,
				selector: {
					type: "identifier" as const,
					name: "dummyFunction12",
					kind: "function" as const,
					filePath: "test-refactor/large-file.ts",
				},
				reason: "Remove dummyFunction12",
			} as RemoveOperation,
			{
				operation: "remove" as const,
				selector: {
					type: "identifier" as const,
					name: "dummyFunction13",
					kind: "function" as const,
					filePath: "test-refactor/large-file.ts",
				},
				reason: "Remove dummyFunction13",
			} as RemoveOperation,
			{
				operation: "remove" as const,
				selector: {
					type: "identifier" as const,
					name: "dummyFunction14",
					kind: "function" as const,
					filePath: "test-refactor/large-file.ts",
				},
				reason: "Remove dummyFunction14",
			} as RemoveOperation,
			{
				operation: "remove" as const,
				selector: {
					type: "identifier" as const,
					name: "dummyFunction15",
					kind: "function" as const,
					filePath: "test-refactor/large-file.ts",
				},
				reason: "Remove dummyFunction15",
			} as RemoveOperation,
			{
				operation: "remove" as const,
				selector: {
					type: "identifier" as const,
					name: "dummyFunction16",
					kind: "function" as const,
					filePath: "test-refactor/large-file.ts",
				},
				reason: "Remove dummyFunction16",
			} as RemoveOperation,
			{
				operation: "remove" as const,
				selector: {
					type: "identifier" as const,
					name: "dummyFunction17",
					kind: "function" as const,
					filePath: "test-refactor/large-file.ts",
				},
				reason: "Remove dummyFunction17",
			} as RemoveOperation,
			{
				operation: "remove" as const,
				selector: {
					type: "identifier" as const,
					name: "dummyFunction18",
					kind: "function" as const,
					filePath: "test-refactor/large-file.ts",
				},
				reason: "Remove dummyFunction18",
			} as RemoveOperation,
			{
				operation: "remove" as const,
				selector: {
					type: "identifier" as const,
					name: "dummyFunction19",
					kind: "function" as const,
					filePath: "test-refactor/large-file.ts",
				},
				reason: "Remove dummyFunction19",
			} as RemoveOperation,
			{
				operation: "remove" as const,
				selector: {
					type: "identifier" as const,
					name: "dummyFunction20",
					kind: "function" as const,
					filePath: "test-refactor/large-file.ts",
				},
				reason: "Remove dummyFunction20",
			} as RemoveOperation,
		]

		// Execute the batch operation
		const result = await setup.engine.executeBatch({
			operations,
			options: { stopOnError: true },
		})

		// Log the result for debugging
		console.log("=== BATCH OPERATION RESULT ===")
		console.log("Success:", result.success)
		console.log("Error:", result.error)
		console.log("Operations completed:", result.results.length)

		// Check the state of target files after the operation
		const userUtilsContent = fs.readFileSync(path.join(setup.projectDir, "test-refactor/user-utils.ts"), "utf-8")
		const productUtilsContent = fs.readFileSync(
			path.join(setup.projectDir, "test-refactor/product-utils.ts"),
			"utf-8",
		)

		console.log("=== FILE CONTENTS AFTER OPERATION ===")
		console.log("user-utils.ts content:", userUtilsContent)
		console.log("product-utils.ts content:", productUtilsContent)

		// If the bug exists, we should see:
		// 1. The operation fails with naming conflict
		// 2. But the target file contains the function anyway (pre-population bug)
		if (!result.success) {
			console.log("=== BUG REPRODUCED ===")
			expect(result.error).toContain("Naming conflict")
			expect(result.error).toContain("calculateTotalPrice")

			// The bug: target file contains the function even though operation failed
			expect(productUtilsContent).toContain("calculateTotalPrice")
		} else {
			console.log("=== BUG NOT REPRODUCED - OPERATION SUCCEEDED ===")
			// If operation succeeded, both functions should be in their target files
			expect(userUtilsContent).toContain("formatUserName")
			expect(productUtilsContent).toContain("calculateTotalPrice")
		}
	})

	it("should test the specific edge case that might trigger the bug", async () => {
		// Test a specific edge case: what if there's already some content in the target file?
		const testFiles: TestFileStructure = {
			"source.ts": 'export function testFunction() { return "test"; }',
			"target.ts": "// Some existing content\n", // Not empty, but no conflicting symbols
		}

		createTestFilesWithAutoLoad(setup, testFiles)

		const result = await setup.engine.executeBatch({
			operations: [
				{
					operation: "move" as const,
					selector: {
						type: "identifier" as const,
						name: "testFunction",
						kind: "function" as const,
						filePath: "source.ts",
					},
					targetFilePath: "target.ts",
					reason: "Move to file with existing content",
				} as MoveOperation,
			],
			options: { stopOnError: true },
		})

		console.log("Edge case result:", result.success, result.error)

		const targetContent = fs.readFileSync(path.join(setup.projectDir, "target.ts"), "utf-8")
		console.log("Target content:", targetContent)

		// This should succeed
		expect(result.success).toBe(true)
		expect(targetContent).toContain("testFunction")
		expect(targetContent).toContain("// Some existing content")
	})
})
