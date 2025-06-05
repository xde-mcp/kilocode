import * as path from "path"
import * as fs from "fs"
import { PathResolver } from "../PathResolver"

// Mock fs.existsSync
jest.mock("fs", () => ({
	...jest.requireActual("fs"),
	existsSync: jest.fn(),
}))

describe("PathResolver", () => {
	const projectRoot = "/project/root"
	let pathResolver: PathResolver

	beforeEach(() => {
		pathResolver = new PathResolver(projectRoot)
		jest.clearAllMocks()
	})

	describe("resolveAbsolutePath", () => {
		it("should resolve a relative path to absolute path", () => {
			const relativePath = "src/components/Button.tsx"
			const expected = path.resolve(projectRoot, relativePath)

			const result = pathResolver.resolveAbsolutePath(relativePath)

			expect(result).toBe(expected)
		})

		it("should return absolute path unchanged", () => {
			const absolutePath = "/absolute/path/to/file.ts"

			const result = pathResolver.resolveAbsolutePath(absolutePath)

			expect(result).toBe(absolutePath)
		})
	})

	describe("normalizeFilePath", () => {
		it("should convert backslashes to forward slashes", () => {
			const filePath = "src\\components\\Button\\index.tsx"
			const expected = "src/components/Button/index.tsx"

			const result = pathResolver.normalizeFilePath(filePath)

			expect(result).toBe(expected)
		})

		it("should leave paths with forward slashes unchanged", () => {
			const filePath = "src/components/Button/index.tsx"

			const result = pathResolver.normalizeFilePath(filePath)

			expect(result).toBe(filePath)
		})
	})

	describe("getRelativeImportPath", () => {
		it("should calculate correct relative import path between files", () => {
			const fromFile = "/project/root/src/components/Button/index.tsx"
			const toFile = "/project/root/src/utils/helpers.ts"
			const expected = "../../utils/helpers"

			const result = pathResolver.getRelativeImportPath(fromFile, toFile)

			expect(result).toBe(expected)
		})

		it("should add ./ prefix when files are in the same directory", () => {
			const fromFile = "/project/root/src/components/Button.tsx"
			const toFile = "/project/root/src/components/Input.ts"
			const expected = "./Input"

			const result = pathResolver.getRelativeImportPath(fromFile, toFile)

			expect(result).toBe(expected)
		})

		it("should strip file extensions from the import path", () => {
			const fromFile = "/project/root/src/components/index.tsx"
			const toFile = "/project/root/src/components/forms/Form.tsx"
			const expected = "./forms/Form"

			const result = pathResolver.getRelativeImportPath(fromFile, toFile)

			expect(result).toBe(expected)
		})

		it("should handle various file extensions", () => {
			const fromFile = "/project/root/src/components/index.js"
			const toFile = "/project/root/src/components/forms/Form.jsx"
			const expected = "./forms/Form"

			const result = pathResolver.getRelativeImportPath(fromFile, toFile)

			expect(result).toBe(expected)
		})

		it("should normalize backslashes in paths", () => {
			// Create a PathResolver with Windows-style project root for this test
			const windowsPathResolver = new PathResolver("C:\\project\\root")
			const fromFile = "C:\\project\\root\\src\\components\\Button\\index.tsx"
			const toFile = "C:\\project\\root\\src\\utils\\helpers.ts"
			const expected = "../../utils/helpers"

			const result = windowsPathResolver.getRelativeImportPath(fromFile, toFile)

			expect(result).toBe(expected)
		})
	})

	describe("pathExists", () => {
		it("should return true when path exists", () => {
			const filePath = "src/components/Button.tsx"
			const absolutePath = path.resolve(projectRoot, filePath)

			// Mock fs.existsSync to return true
			jest.mocked(fs.existsSync).mockReturnValue(true)

			const result = pathResolver.pathExists(filePath)

			expect(result).toBe(true)
			expect(fs.existsSync).toHaveBeenCalledWith(absolutePath)
		})

		it("should return false when path does not exist", () => {
			const filePath = "src/components/NonExistent.tsx"
			const absolutePath = path.resolve(projectRoot, filePath)

			// Mock fs.existsSync to return false
			jest.mocked(fs.existsSync).mockReturnValue(false)

			const result = pathResolver.pathExists(filePath)

			expect(result).toBe(false)
			expect(fs.existsSync).toHaveBeenCalledWith(absolutePath)
		})
	})
})
