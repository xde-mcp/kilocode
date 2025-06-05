import { Project, SourceFile, ScriptTarget, Node } from "ts-morph"
import { SymbolFinder } from "../symbol-finder"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"

describe("SymbolFinder", () => {
	let project: Project
	let tempDir: string
	let sourceFile: SourceFile

	// Sample TypeScript code with different symbol types
	const sampleCode = `
    // Function declaration
    function greet(name: string): string {
      return \`Hello, \${name}!\`
    }

    // Class declaration
    class Person {
      private name: string;
      
      constructor(name: string) {
        this.name = name;
      }
      
      // Method declaration
      public sayHello(): string {
        return greet(this.name);
      }
      
      // Getter method
      get fullName(): string {
        return this.name;
      }
    }

    // Interface declaration
    interface IVehicle {
      make: string;
      model: string;
      year: number;
      drive(): void;
    }

    // Enum declaration
    enum Color {
      Red,
      Green,
      Blue
    }

    // Type alias
    type StringOrNumber = string | number;

    // Variable declarations
    const PI = 3.14159;
    let counter = 0;
    var legacyVar = "legacy";

    // Export named
    export const exportedValue = 42;

    // Default export
    export default Person;
  `

	beforeEach(() => {
		// Create a temporary directory for test files
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "symbol-finder-test-"))

		// Create a test file
		const filePath = path.join(tempDir, "test-file.ts")
		fs.writeFileSync(filePath, sampleCode)

		// Set up the project
		project = new Project({
			compilerOptions: {
				target: ScriptTarget.ES2020,
			},
		})

		// Add the file to the project
		sourceFile = project.addSourceFileAtPath(filePath)
	})

	afterEach(() => {
		// Clean up temp directory
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true })
		}
	})

	describe("findSymbol", () => {
		it("should find a function declaration", () => {
			const finder = new SymbolFinder(sourceFile)
			const symbol = finder.findSymbol({
				type: "identifier",
				name: "greet",
				kind: "function",
				filePath: sourceFile.getFilePath(),
			})

			expect(symbol).not.toBeUndefined()
			expect(symbol!.getKindName()).toBe("FunctionDeclaration")
			expect(symbol!.getText()).toContain("function greet")
		})

		it("should find a class declaration", () => {
			const finder = new SymbolFinder(sourceFile)
			const symbol = finder.findSymbol({
				type: "identifier",
				name: "Person",
				kind: "class",
				filePath: sourceFile.getFilePath(),
			})

			expect(symbol).not.toBeUndefined()
			expect(symbol!.getKindName()).toBe("ClassDeclaration")
			expect(symbol!.getText()).toContain("class Person")
		})

		it("should find a method in a class", () => {
			const finder = new SymbolFinder(sourceFile)
			const symbol = finder.findSymbol({
				type: "identifier",
				name: "sayHello",
				kind: "method",
				filePath: sourceFile.getFilePath(),
				parent: {
					name: "Person",
					kind: "class",
				},
			})

			expect(symbol).not.toBeUndefined()
			expect(symbol!.getKindName()).toBe("MethodDeclaration")
			expect(symbol!.getText()).toContain("public sayHello")
		})

		it("should find an interface declaration", () => {
			const finder = new SymbolFinder(sourceFile)
			const symbol = finder.findSymbol({
				type: "identifier",
				name: "IVehicle",
				kind: "interface",
				filePath: sourceFile.getFilePath(),
			})

			expect(symbol).not.toBeUndefined()
			expect(symbol!.getKindName()).toBe("InterfaceDeclaration")
			expect(symbol!.getText()).toContain("interface IVehicle")
		})

		it("should find an enum declaration", () => {
			const finder = new SymbolFinder(sourceFile)
			const symbol = finder.findSymbol({
				type: "identifier",
				name: "Color",
				kind: "enum",
				filePath: sourceFile.getFilePath(),
			})

			expect(symbol).not.toBeUndefined()
			expect(symbol!.getKindName()).toBe("EnumDeclaration")
			expect(symbol!.getText()).toContain("enum Color")
		})

		it("should find a type alias", () => {
			const finder = new SymbolFinder(sourceFile)
			const symbol = finder.findSymbol({
				type: "identifier",
				name: "StringOrNumber",
				kind: "type",
				filePath: sourceFile.getFilePath(),
			})

			expect(symbol).not.toBeUndefined()
			expect(symbol!.getKindName()).toBe("TypeAliasDeclaration")
			expect(symbol!.getText()).toContain("type StringOrNumber")
		})

		it("should find a const variable", () => {
			const finder = new SymbolFinder(sourceFile)
			const symbol = finder.findSymbol({
				type: "identifier",
				name: "PI",
				kind: "variable",
				filePath: sourceFile.getFilePath(),
			})

			expect(symbol).not.toBeUndefined()
			expect(symbol!.getKindName()).toBe("VariableDeclaration")
			expect(symbol!.getText()).toContain("PI = 3.14159")
		})

		it("should return undefined for non-existent symbol", () => {
			const finder = new SymbolFinder(sourceFile)
			const symbol = finder.findSymbol({
				type: "identifier",
				name: "NonExistentSymbol",
				kind: "function",
				filePath: sourceFile.getFilePath(),
			})

			expect(symbol).toBeUndefined()
		})
	})

	describe("getReferences", () => {
		it("should find references to a function", () => {
			const finder = new SymbolFinder(sourceFile)
			const symbol = finder.findSymbol({
				type: "identifier",
				name: "greet",
				kind: "function",
				filePath: sourceFile.getFilePath(),
			})

			expect(symbol).not.toBeUndefined()

			const references = finder.getReferences(symbol!)
			// Should find at least one reference (in sayHello method)
			expect(references.length).toBeGreaterThanOrEqual(1)

			// Check if the reference is in the sayHello method
			const referenceInMethod = references.some((ref) => {
				// Find containing method declaration
				const methodDecl = ref
					.getAncestors()
					.find((ancestor) => Node.isMethodDeclaration(ancestor) && ancestor.getName() === "sayHello")
				return !!methodDecl
			})

			expect(referenceInMethod).toBe(true)
		})
	})

	describe("isExported", () => {
		it("should detect exported symbol", () => {
			const finder = new SymbolFinder(sourceFile)
			const symbol = finder.findSymbol({
				type: "identifier",
				name: "exportedValue",
				kind: "variable",
				filePath: sourceFile.getFilePath(),
			})

			expect(symbol).not.toBeUndefined()
			expect(finder.isExported(symbol!)).toBe(true)
		})

		it("should detect non-exported symbol", () => {
			const finder = new SymbolFinder(sourceFile)
			const symbol = finder.findSymbol({
				type: "identifier",
				name: "PI",
				kind: "variable",
				filePath: sourceFile.getFilePath(),
			})

			expect(symbol).not.toBeUndefined()
			expect(finder.isExported(symbol!)).toBe(false)
		})
	})
})
