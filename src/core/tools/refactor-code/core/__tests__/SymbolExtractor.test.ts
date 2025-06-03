import { Project, Node, SyntaxKind } from "ts-morph"
import { SymbolExtractor } from "../SymbolExtractor"
import { ResolvedSymbol } from "../types"

describe("SymbolExtractor", () => {
	let project: Project
	let extractor: SymbolExtractor

	beforeEach(() => {
		project = new Project({ useInMemoryFileSystem: true })
		extractor = new SymbolExtractor()
	})

	describe("extractSymbol", () => {
		it("should extract a function with its comments", () => {
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
        `,
			)

			const func = sourceFile.getFunction("add")!
			const resolvedSymbol: ResolvedSymbol = {
				node: func,
				name: "add",
				isExported: true,
				filePath: sourceFile.getFilePath(),
			}

			const extracted = extractor.extractSymbol(resolvedSymbol)

			expect(extracted.comments.length).toBeGreaterThan(0)
			expect(extracted.text).toContain("Adds two numbers together")
			expect(extracted.text).toContain("export function add")
			expect(extracted.isExported).toBe(true)
		})

		it("should extract a variable with appropriate export status", () => {
			const sourceFile = project.createSourceFile(
				"test.ts",
				`
        /**
         * Configuration object
         */
        export const config = {
          apiUrl: "https://api.example.com",
          timeout: 5000
        }
        
        // Internal counter
        let counter = 0
        `,
			)

			// Test exported variable
			const configVar = sourceFile.getVariableDeclaration("config")!
			const exportedSymbol: ResolvedSymbol = {
				node: configVar,
				name: "config",
				isExported: true,
				filePath: sourceFile.getFilePath(),
			}

			const extracted = extractor.extractSymbol(exportedSymbol)
			expect(extracted.text).toContain("export const config")
			expect(extracted.comments[0]).toContain("Configuration object")
			expect(extracted.isExported).toBe(true)

			// Test non-exported variable
			const counterVar = sourceFile.getVariableDeclaration("counter")!
			const nonExportedSymbol: ResolvedSymbol = {
				node: counterVar,
				name: "counter",
				isExported: false,
				filePath: sourceFile.getFilePath(),
			}

			const extractedNonExported = extractor.extractSymbol(nonExportedSymbol)
			expect(extractedNonExported.text).toContain("let counter = 0")
			expect(extractedNonExported.text).not.toContain("export")
			expect(extractedNonExported.comments[0]).toContain("Internal counter")
			expect(extractedNonExported.isExported).toBe(false)
		})

		it("should extract a class with its type dependencies", () => {
			const sourceFile = project.createSourceFile(
				"test.ts",
				`
        interface UserProps {
          id: string;
          name: string;
          age: number;
        }
        
        enum UserRole {
          Admin = "admin",
          User = "user",
          Guest = "guest"
        }
        
        type UserStatus = "active" | "inactive" | "pending";
        
        /**
         * User class represents a user in the system
         */
        export class User {
          private props: UserProps;
          public role: UserRole;
          public status: UserStatus;
          
          constructor(props: UserProps, role: UserRole = UserRole.User, status: UserStatus = "active") {
            this.props = props;
            this.role = role;
            this.status = status;
          }
          
          get id(): string {
            return this.props.id;
          }
          
          get name(): string {
            return this.props.name;
          }
        }
        `,
			)

			const userClass = sourceFile.getClass("User")!
			const resolvedSymbol: ResolvedSymbol = {
				node: userClass,
				name: "User",
				isExported: true,
				filePath: sourceFile.getFilePath(),
			}

			const extracted = extractor.extractSymbol(resolvedSymbol)

			// Should include all related type dependencies
			expect(extracted.text).toContain("interface UserProps")
			expect(extracted.text).toContain("enum UserRole")
			expect(extracted.text).toContain("type UserStatus")
			expect(extracted.text).toContain("export class User")
			expect(extracted.dependencies.types).toContain("UserProps")
			expect(extracted.dependencies.types).toContain("UserRole")
			expect(extracted.dependencies.types).toContain("UserStatus")
		})

		it("should filter out test-related comments", () => {
			const sourceFile = project.createSourceFile(
				"test.ts",
				`
        // TEST FIXTURE: This will be moved
        // This is a test case
        
        /**
         * This function will be moved
         */
        export function doSomething(): void {
          console.log("doing something");
        }
        `,
			)

			const func = sourceFile.getFunction("doSomething")!
			const resolvedSymbol: ResolvedSymbol = {
				node: func,
				name: "doSomething",
				isExported: true,
				filePath: sourceFile.getFilePath(),
			}

			const extracted = extractor.extractSymbol(resolvedSymbol)

			// Test comments should be filtered out
			expect(extracted.comments.length).toBe(0)
			expect(extracted.text).not.toContain("TEST FIXTURE")
			expect(extracted.text).not.toContain("test case")
			expect(extracted.text).not.toContain("will be moved")
		})
	})

	describe("extractDependencies", () => {
		it("should extract imports and local references correctly", () => {
			const sourceFile = project.createSourceFile(
				"test.ts",
				`
        import { useState, useEffect } from 'react';
        import axios from 'axios';
        import { User } from './models/User';
        
        function formatDate(date: Date): string {
          return date.toISOString();
        }
        
        export function UserProfile({ userId }: { userId: string }) {
          const [user, setUser] = useState<User | null>(null);
          const [loading, setLoading] = useState(true);
          
          useEffect(() => {
            async function fetchUser() {
              setLoading(true);
              try {
                const response = await axios.get(\`/api/users/\${userId}\`);
                setUser(response.data);
              } catch (error) {
                console.error("Failed to fetch user:", error);
              } finally {
                setLoading(false);
              }
            }
            
            fetchUser();
          }, [userId]);
          
          const formattedDate = user ? formatDate(new Date(user.createdAt)) : '';
          
          return { user, loading, formattedDate };
        }
        `,
			)

			const userProfileFunc = sourceFile.getFunction("UserProfile")!

			const dependencies = extractor.extractDependencies(userProfileFunc, sourceFile)

			// Imports
			expect(dependencies.imports.get("useState")).toBe("react")
			expect(dependencies.imports.get("useEffect")).toBe("react")
			expect(dependencies.imports.get("axios")).toBe("axios")
			expect(dependencies.imports.get("User")).toBe("./models/User")

			// Local references
			expect(dependencies.localReferences).toContain("formatDate")

			// Not include function itself
			expect(dependencies.localReferences).not.toContain("UserProfile")

			// Type dependencies
			expect(dependencies.types).toContain("User")
		})

		it("should handle property access and object literals correctly", () => {
			const sourceFile = project.createSourceFile(
				"test.ts",
				`
        import { config } from './config';
        
        export function processData(data: any) {
          const result = {
            id: data.id,
            name: data.name,
            timestamp: new Date().toISOString(),
            settings: config.defaultSettings
          };
          
          return result;
        }
        `,
			)

			const processDataFunc = sourceFile.getFunction("processData")!

			const dependencies = extractor.extractDependencies(processDataFunc, sourceFile)

			// Should include config but not property names
			expect(dependencies.imports.get("config")).toBe("./config")
			expect(dependencies.imports.has("id")).toBe(false)
			expect(dependencies.imports.has("name")).toBe(false)
			expect(dependencies.imports.has("settings")).toBe(false)
			expect(dependencies.imports.has("defaultSettings")).toBe(false)

			// Should include Date but not toISOString
			expect(dependencies.localReferences).not.toContain("toISOString")
		})
	})

	describe("findTypeDependencies", () => {
		it("should find all referenced types", () => {
			const sourceFile = project.createSourceFile(
				"types.ts",
				`
        export interface BaseEntity {
          id: string;
          createdAt: Date;
          updatedAt: Date;
        }
        
        export interface UserAttributes {
          name: string;
          email: string;
          age?: number;
        }
        
        export enum UserStatus {
          Active = "active",
          Inactive = "inactive",
          Pending = "pending"
        }
        
        export type UserRole = "admin" | "user" | "guest";
        
        export class UserService {
          public async getUser(id: string): Promise<BaseEntity & UserAttributes> {
            // Implementation
            return {} as BaseEntity & UserAttributes;
          }
          
          public updateStatus(id: string, status: UserStatus): void {
            // Implementation
          }
          
          public assignRole(id: string, role: UserRole): void {
            // Implementation
          }
        }
        `,
			)

			const userServiceClass = sourceFile.getClass("UserService")!

			const typeDependencies = extractor.findTypeDependencies(userServiceClass, sourceFile)

			// Each dependency should be the full text of the type definition
			const typeDependenciesText = typeDependencies.join(" ")
			expect(typeDependenciesText).toContain("interface BaseEntity")
			expect(typeDependenciesText).toContain("interface UserAttributes")
			expect(typeDependenciesText).toContain("enum UserStatus")
			expect(typeDependenciesText).toContain('type UserRole = "admin" | "user" | "guest"')

			// Should not include built-in types
			expect(typeDependenciesText).not.toContain("interface Promise")
			expect(typeDependenciesText).not.toContain("interface String")
		})

		it("should correctly handle function parameter and return types", () => {
			const sourceFile = project.createSourceFile(
				"functions.ts",
				`
        export interface QueryOptions {
          limit?: number;
          offset?: number;
          sort?: "asc" | "desc";
        }
        
        export interface QueryResult<T> {
          data: T[];
          total: number;
          hasMore: boolean;
        }
        
        export type SortDirection = "asc" | "desc";
        
        export function query<T>(
          entity: string, 
          options: QueryOptions, 
          sortDir: SortDirection
        ): Promise<QueryResult<T>> {
          // Implementation
          return {} as QueryResult<T>;
        }
        `,
			)

			const queryFunc = sourceFile.getFunction("query")!

			const typeDependencies = extractor.findTypeDependencies(queryFunc, sourceFile)

			// Function should depend on parameter and return types
			const typeDependenciesText = typeDependencies.join(" ")
			expect(typeDependenciesText).toContain("interface QueryOptions")
			expect(typeDependenciesText).toContain("interface QueryResult")
			expect(typeDependenciesText).toContain('type SortDirection = "asc" | "desc"')
		})
	})
})
