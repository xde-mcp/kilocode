import * as vscode from "vscode"
import { parseImports, getContextFiles } from "../importParser"

// Mock vscode.workspace
jest.mock("vscode", () => ({
	Uri: {
		file: (path: string) => ({ fsPath: path, toString: () => path }),
		parse: (uri: string) => ({ fsPath: uri, toString: () => uri }),
	},
	workspace: {
		getWorkspaceFolder: jest.fn(() => ({ uri: { fsPath: "/workspace" } })),
		fs: {
			stat: jest.fn(),
		},
		openTextDocument: jest.fn(),
	},
}))

describe("importParser", () => {
	beforeEach(() => {
		jest.clearAllMocks()
	})

	describe("parseImports", () => {
		it("should parse ES6 imports", async () => {
			const content = `
                import React from 'react';
                import { useState } from 'react';
                import { addNumbers } from './utils';
                import * as helpers from './helpers';
                import defaultExport, { namedExport } from './mixed';
            `

			const fileUri = vscode.Uri.file("/workspace/src/component.tsx")

			// Mock file existence checks
			const mockStat = vscode.workspace.fs.stat as jest.Mock
			mockStat.mockImplementation((uri: any) => {
				const filePath = uri.fsPath
				// Only resolve for files with extensions
				if (filePath.endsWith("utils.ts") || filePath.endsWith("helpers.ts") || filePath.endsWith("mixed.ts")) {
					return Promise.resolve()
				}
				return Promise.reject(new Error("File not found"))
			})

			const imports = await parseImports(fileUri, content)

			// Should only include local imports, not node_modules
			expect(imports).toHaveLength(3)
			expect(imports.map((i) => i.fsPath)).toContain("/workspace/src/utils.ts")
			expect(imports.map((i) => i.fsPath)).toContain("/workspace/src/helpers.ts")
			expect(imports.map((i) => i.fsPath)).toContain("/workspace/src/mixed.ts")
		})

		it("should parse CommonJS requires", async () => {
			const content = `
                const fs = require('fs');
                const utils = require('./utils');
                const { helper } = require('./helpers');
            `

			const fileUri = vscode.Uri.file("/workspace/src/component.js")

			const mockStat = vscode.workspace.fs.stat as jest.Mock
			mockStat.mockImplementation((uri: any) => {
				const filePath = uri.fsPath
				// Only resolve for files with extensions
				if (filePath.endsWith("utils.js") || filePath.endsWith("helpers.js")) {
					return Promise.resolve()
				}
				return Promise.reject(new Error("File not found"))
			})

			const imports = await parseImports(fileUri, content)

			expect(imports).toHaveLength(2)
			expect(imports.map((i) => i.fsPath)).toContain("/workspace/src/utils.js")
			expect(imports.map((i) => i.fsPath)).toContain("/workspace/src/helpers.js")
		})

		it("should handle imports without file extensions", async () => {
			const content = `import { something } from './noExtension';`
			const fileUri = vscode.Uri.file("/workspace/src/component.tsx")

			const mockStat = vscode.workspace.fs.stat as jest.Mock
			mockStat.mockImplementation((uri: any) => {
				const filePath = uri.fsPath
				// First call will fail (no extension), second call will succeed (.ts extension)
				if (filePath.endsWith("noExtension")) {
					return Promise.reject(new Error("File not found"))
				}
				if (filePath.endsWith("noExtension.ts")) {
					return Promise.resolve()
				}
				return Promise.reject(new Error("File not found"))
			})

			const imports = await parseImports(fileUri, content)

			expect(imports).toHaveLength(1)
			expect(imports[0].fsPath).toBe("/workspace/src/noExtension.ts")
		})

		it("should handle index file imports", async () => {
			const content = `import utils from './utils';` // utils is a directory
			const fileUri = vscode.Uri.file("/workspace/src/component.tsx")

			const mockStat = vscode.workspace.fs.stat as jest.Mock
			mockStat.mockImplementation((uri: any) => {
				const filePath = uri.fsPath
				// Simulate that ./utils is a directory with index.ts
				if (filePath.endsWith("utils/index.ts")) {
					return Promise.resolve()
				}
				return Promise.reject(new Error("File not found"))
			})

			const imports = await parseImports(fileUri, content)

			expect(imports).toHaveLength(1)
			expect(imports[0].fsPath).toBe("/workspace/src/utils/index.ts")
		})

		it("should skip external packages", async () => {
			const content = `
                import React from 'react';
                import lodash from 'lodash';
                import { something } from '@company/package';
                import local from './local';
            `

			const fileUri = vscode.Uri.file("/workspace/src/component.tsx")

			const mockStat = vscode.workspace.fs.stat as jest.Mock
			mockStat.mockImplementation((uri: any) => {
				if (uri.fsPath.includes("local")) {
					return Promise.resolve()
				}
				return Promise.reject(new Error("File not found"))
			})

			const imports = await parseImports(fileUri, content)

			// Should only include the local import
			expect(imports).toHaveLength(1)
			expect(imports[0].fsPath).toContain("local")
		})
	})

	describe("getContextFiles", () => {
		it("should get direct imports", async () => {
			const content = `
                import { helper } from './helper';
                import { utils } from './utils';
            `

			const fileUri = vscode.Uri.file("/workspace/src/component.tsx")

			const mockStat = vscode.workspace.fs.stat as jest.Mock
			mockStat.mockImplementation((uri: any) => {
				if (uri.fsPath.endsWith("helper.ts") || uri.fsPath.endsWith("utils.ts")) {
					return Promise.resolve()
				}
				return Promise.reject(new Error("File not found"))
			})

			const mockOpenTextDocument = vscode.workspace.openTextDocument as jest.Mock
			mockOpenTextDocument.mockResolvedValue({
				getText: () => "// No imports in these files",
			})

			const contextFiles = await getContextFiles(fileUri, content, 1)

			expect(contextFiles).toHaveLength(2)
			expect(contextFiles.map((f) => f.fsPath)).toContain("/workspace/src/helper.ts")
			expect(contextFiles.map((f) => f.fsPath)).toContain("/workspace/src/utils.ts")
		})

		it("should get transitive imports up to maxDepth", async () => {
			const componentContent = `import { helper } from './helper';`
			const helperContent = `import { utils } from './utils';`
			const utilsContent = `import { deep } from './deep';`

			const fileUri = vscode.Uri.file("/workspace/src/component.tsx")

			const mockStat = vscode.workspace.fs.stat as jest.Mock
			mockStat.mockImplementation((uri: any) => {
				const filePath = uri.fsPath
				if (filePath.endsWith("helper.ts") || filePath.endsWith("utils.ts") || filePath.endsWith("deep.ts")) {
					return Promise.resolve()
				}
				return Promise.reject(new Error("File not found"))
			})

			const mockOpenTextDocument = vscode.workspace.openTextDocument as jest.Mock
			mockOpenTextDocument.mockImplementation((uri: any) => {
				if (uri.fsPath.includes("helper")) {
					return Promise.resolve({ getText: () => helperContent })
				}
				if (uri.fsPath.includes("utils")) {
					return Promise.resolve({ getText: () => utilsContent })
				}
				return Promise.resolve({ getText: () => "// No imports" })
			})

			// With maxDepth=2, should get helper.ts and utils.ts but not deep.ts
			const contextFiles = await getContextFiles(fileUri, componentContent, 2)

			expect(contextFiles).toHaveLength(2)
			expect(contextFiles.map((f) => f.fsPath)).toContain("/workspace/src/helper.ts")
			expect(contextFiles.map((f) => f.fsPath)).toContain("/workspace/src/utils.ts")
			expect(contextFiles.map((f) => f.fsPath)).not.toContain("/workspace/src/deep.ts")

			// With maxDepth=3, should get all three
			const contextFilesDeep = await getContextFiles(fileUri, componentContent, 3)

			expect(contextFilesDeep).toHaveLength(3)
			expect(contextFilesDeep.map((f) => f.fsPath)).toContain("/workspace/src/helper.ts")
			expect(contextFilesDeep.map((f) => f.fsPath)).toContain("/workspace/src/utils.ts")
			expect(contextFilesDeep.map((f) => f.fsPath)).toContain("/workspace/src/deep.ts")
		})

		it("should handle circular dependencies", async () => {
			const fileAContent = `import { b } from './fileB';`
			const fileBContent = `import { a } from './fileA';`

			const fileUri = vscode.Uri.file("/workspace/src/fileA.ts")

			const mockStat = vscode.workspace.fs.stat as jest.Mock
			mockStat.mockImplementation((uri: any) => {
				const filePath = uri.fsPath
				if (filePath.endsWith("fileA.ts") || filePath.endsWith("fileB.ts")) {
					return Promise.resolve()
				}
				return Promise.reject(new Error("File not found"))
			})

			const mockOpenTextDocument = vscode.workspace.openTextDocument as jest.Mock
			mockOpenTextDocument.mockImplementation((uri: any) => {
				if (uri.fsPath.includes("fileA")) {
					return Promise.resolve({ getText: () => fileAContent })
				}
				if (uri.fsPath.includes("fileB")) {
					return Promise.resolve({ getText: () => fileBContent })
				}
				return Promise.resolve({ getText: () => "" })
			})

			// Should not get stuck in infinite loop
			const contextFiles = await getContextFiles(fileUri, fileAContent, 10)

			// Should include fileB but not fileA again (circular dependency prevention)
			const filePaths = contextFiles.map((f) => f.fsPath)
			expect(filePaths.filter((p) => p.includes("fileB"))).toHaveLength(1)
			// fileA might be included once if the implementation includes it, but not multiple times
			expect(filePaths.filter((p) => p.includes("fileA")).length).toBeLessThanOrEqual(1)
		})

		it("should remove duplicate files", async () => {
			const content = `
                import { helper } from './helper';
                import { default as helperAgain } from './helper';
                import * as allHelper from './helper';
            `

			const fileUri = vscode.Uri.file("/workspace/src/component.tsx")

			const mockStat = vscode.workspace.fs.stat as jest.Mock
			mockStat.mockImplementation((uri: any) => {
				if (uri.fsPath.endsWith("helper.ts")) {
					return Promise.resolve()
				}
				return Promise.reject(new Error("File not found"))
			})

			const mockOpenTextDocument = vscode.workspace.openTextDocument as jest.Mock
			mockOpenTextDocument.mockResolvedValue({
				getText: () => "// No imports",
			})

			const contextFiles = await getContextFiles(fileUri, content, 1)

			// Should only include helper.ts once despite multiple imports
			expect(contextFiles).toHaveLength(1)
			expect(contextFiles[0].fsPath).toContain("helper")
		})
	})
})
