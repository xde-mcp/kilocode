import { Project, SourceFile, ScriptTarget } from "ts-morph"
import { ImportManager } from "../import-manager"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"

describe("ImportManager", () => {
	let project: Project
	let tempDir: string
	let sourceFile: SourceFile
	let importingFile: SourceFile
	let reExportingFile: SourceFile
	let targetFile: SourceFile

	// Sample source file with exportable symbols
	const sourceCode = `
    export function utilFunction(): string {
      return "This is a utility function";
    }

    export class UtilClass {
      static method() {
        return "Static method";
      }
    }

    export const CONSTANT = 42;

    export type UtilType = string | number;

    function privateFunction() {
      return "This is private";
    }
  `

	// Sample importing file
	const importingCode = `
    import { utilFunction, UtilClass, CONSTANT, UtilType } from "./source";

    function consumer() {
      const value = utilFunction();
      const classInstance = new UtilClass();
      console.log(CONSTANT);
      
      const variable: UtilType = "string or number";
    }
  `

	// Sample re-exporting file
	const reExportingCode = `
    export { utilFunction, UtilClass } from "./source";
    
    // Other content
    export const localExport = "local";
  `

	// Sample target file (where symbols will be moved)
	const targetCode = `
    // Target file initial content
    export function existingFunction() {
      return "I already exist here";
    }
  `

	beforeEach(() => {
		// Create a temporary directory for test files
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "import-manager-test-"))

		// Create test files
		const sourcePath = path.join(tempDir, "source.ts")
		const importingPath = path.join(tempDir, "importing.ts")
		const reExportingPath = path.join(tempDir, "reexporting.ts")
		const targetPath = path.join(tempDir, "target.ts")

		fs.writeFileSync(sourcePath, sourceCode)
		fs.writeFileSync(importingPath, importingCode)
		fs.writeFileSync(reExportingPath, reExportingCode)
		fs.writeFileSync(targetPath, targetCode)

		// Set up the project
		project = new Project({
			compilerOptions: {
				target: ScriptTarget.ES2020,
			},
		})

		// Add files to the project
		sourceFile = project.addSourceFileAtPath(sourcePath)
		importingFile = project.addSourceFileAtPath(importingPath)
		reExportingFile = project.addSourceFileAtPath(reExportingPath)
		targetFile = project.addSourceFileAtPath(targetPath)
	})

	afterEach(() => {
		// Clean up temp directory
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true })
		}
	})

	describe("calculateRelativePath", () => {
		it("should calculate correct relative path between files", () => {
			const manager = new ImportManager(project)

			// Use the private method via any cast
			const calculatePath = (manager as any).calculateRelativePath.bind(manager)

			// Same directory
			expect(calculatePath(path.join(tempDir, "file1.ts"), path.join(tempDir, "file2.ts"))).toBe("./file2")

			// Child directory
			expect(calculatePath(path.join(tempDir, "file.ts"), path.join(tempDir, "subdir", "file.ts"))).toBe(
				"./subdir/file",
			)

			// Parent directory
			expect(calculatePath(path.join(tempDir, "subdir", "file.ts"), path.join(tempDir, "file.ts"))).toBe(
				"../file",
			)
		})
	})

	describe("pathsMatch", () => {
		it("should correctly match equivalent paths with different extensions", () => {
			const manager = new ImportManager(project)

			// Use the private method via any cast
			const pathsMatch = (manager as any).pathsMatch.bind(manager)

			// Same path with different extensions
			expect(pathsMatch(path.join(tempDir, "file.ts"), path.join(tempDir, "file.js"))).toBe(true)

			// Different paths
			expect(pathsMatch(path.join(tempDir, "file1.ts"), path.join(tempDir, "file2.ts"))).toBe(false)

			// Same filename in different directories
			expect(pathsMatch(path.join(tempDir, "dir1", "file.ts"), path.join(tempDir, "dir2", "file.ts"))).toBe(false)
		})
	})

	describe("findFilesImporting", () => {
		it("should find files that import from the source file", () => {
			const manager = new ImportManager(project)

			// Use the private method via any cast
			const findImporting = (manager as any).findFilesImporting.bind(manager)

			const files = findImporting(sourceFile.getFilePath())

			expect(files).toHaveLength(1)
			expect(files[0].getBaseName()).toBe("importing.ts")
		})

		it("should return empty array for non-existent file", () => {
			const manager = new ImportManager(project)

			// Use the private method via any cast
			const findImporting = (manager as any).findFilesImporting.bind(manager)

			const files = findImporting("non-existent-file.ts")

			expect(files).toHaveLength(0)
		})
	})

	describe("findFilesReExporting", () => {
		it("should find files that re-export from the source file", () => {
			const manager = new ImportManager(project)

			// Use the private method via any cast
			const findReExporting = (manager as any).findFilesReExporting.bind(manager)

			const files = findReExporting(sourceFile.getFilePath())

			expect(files).toHaveLength(1)
			expect(files[0].getBaseName()).toBe("reexporting.ts")
		})
	})

	describe("updateImportsAfterMove", () => {
		it("should update imports when a symbol is moved to a new file", async () => {
			const manager = new ImportManager(project)

			// Move the utilFunction symbol
			await manager.updateImportsAfterMove("utilFunction", sourceFile.getFilePath(), targetFile.getFilePath())

			// Check if importing file's imports were updated
			const importingFileText = importingFile.getText()
			expect(importingFileText).toContain('import { utilFunction } from "./target"')
			expect(importingFileText).toContain('import { UtilClass, CONSTANT, UtilType } from "./source"')

			// Check if re-exporting file's exports were updated
			const reExportingFileText = reExportingFile.getText()
			expect(reExportingFileText).toContain('export { utilFunction } from "./target"')
			expect(reExportingFileText).toContain('export { UtilClass } from "./source"')

			// Check updated files list
			const updatedFiles = manager.getUpdatedFiles()
			expect(updatedFiles).toContain(importingFile.getFilePath())
			expect(updatedFiles).toContain(reExportingFile.getFilePath())
		})
	})

	describe("addImport", () => {
		it("should add a new import to a file", () => {
			const manager = new ImportManager(project)

			// Use the private method via any cast
			const addImport = (manager as any).addImport.bind(manager)

			// Add an import to the target file
			addImport(targetFile, "newSymbol", "./external")

			// Check if import was added
			const targetFileText = targetFile.getText()
			expect(targetFileText).toContain('import { newSymbol } from "./external"')
		})

		it("should add to existing import if module already imported", () => {
			const manager = new ImportManager(project)

			// Use the private method via any cast
			const addImport = (manager as any).addImport.bind(manager)

			// First add an import
			addImport(targetFile, "symbol1", "./external")

			// Then add another symbol from the same module
			addImport(targetFile, "symbol2", "./external")

			// Check if import contains both symbols
			const targetFileText = targetFile.getText()
			expect(targetFileText).toContain('import { symbol1, symbol2 } from "./external"')
		})
	})

	describe("hasImport", () => {
		it("should detect if a file already imports a symbol", () => {
			const manager = new ImportManager(project)

			// Use the private method via any cast
			const hasImport = (manager as any).hasImport.bind(manager)

			// Check for existing imports
			expect(hasImport(importingFile, "utilFunction")).toBe(true)
			expect(hasImport(importingFile, "nonExistentSymbol")).toBe(false)
		})
	})

	describe("removeUnusedImports", () => {
		it("should remove unused imports from a file", () => {
			// Add an unused import
			importingFile.addImportDeclaration({
				moduleSpecifier: "./unused",
				namedImports: ["unusedSymbol"],
			})

			const manager = new ImportManager(project)

			// Original text should contain the unused import
			const originalText = importingFile.getText()
			expect(originalText).toContain('import { unusedSymbol } from "./unused"')

			// Remove unused imports
			manager.removeUnusedImports(importingFile)

			// The unused import should be gone
			const updatedText = importingFile.getText()
			expect(updatedText).not.toContain('import { unusedSymbol } from "./unused"')
		})
	})
})
