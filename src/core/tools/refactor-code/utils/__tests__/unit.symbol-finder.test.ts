import { SourceFile } from "ts-morph"
import { SymbolFinder } from "../symbol-finder"
import { createSimpleTestSetup, StandardTestSetup } from "../../__tests__/utils/standardized-test-setup"

describe("SymbolFinder", () => {
	let setup: StandardTestSetup
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
		setup = createSimpleTestSetup()
		sourceFile = setup.project.createSourceFile("test-file.ts", sampleCode)
	})

	afterEach(() => {
		setup.cleanup()
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

		it("should find a type alias declaration", () => {
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

		it("should find a variable declaration", () => {
			const finder = new SymbolFinder(sourceFile)
			const symbol = finder.findSymbol({
				type: "identifier",
				name: "PI",
				kind: "variable",
				filePath: sourceFile.getFilePath(),
			})

			expect(symbol).not.toBeUndefined()
			expect(symbol!.getText()).toContain("PI")
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

	describe("isExported", () => {
		it("should detect exported symbols", () => {
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

		it("should detect non-exported symbols", () => {
			const finder = new SymbolFinder(sourceFile)
			const symbol = finder.findSymbol({
				type: "identifier",
				name: "greet",
				kind: "function",
				filePath: sourceFile.getFilePath(),
			})

			expect(symbol).not.toBeUndefined()
			expect(finder.isExported(symbol!)).toBe(false)
		})
	})
})
