import * as vscode from "vscode"
import { buildAIPrompt } from "../commentProcessor"
import { AICommentData, TriggerType } from "../types"

// Mock vscode
jest.mock("vscode", () => ({
	workspace: {
		asRelativePath: jest.fn((uri: any) => {
			// Extract the path from the URI
			const path = uri.path || uri.fsPath || uri.toString()
			// Remove the /workspace/ prefix if present
			return path.replace(/^\/workspace\//, "")
		}),
	},
	Position: jest.fn((line: number, character: number) => ({ line, character })),
	Uri: {
		file: jest.fn((path: string) => ({
			path,
			fsPath: path,
			toString: () => path,
		})),
	},
}))

describe("commentProcessor - Import Context", () => {
	it("should include active files in the AI prompt", () => {
		// Create test data
		const comment: AICommentData = {
			content: "rename addNumbers to add",
			startPos: new vscode.Position(5, 0),
			endPos: new vscode.Position(5, 30),
			context: `
import { addNumbers } from './utils';

const result = addNumbers(1, 2);
`,
			fileUri: vscode.Uri.file("/workspace/src/TestComponent.tsx"),
		}

		const activeFiles = [
			{
				uri: vscode.Uri.file("/workspace/src/utils.ts"),
				content: `export function addNumbers(a: number, b: number): number {
    return a + b;
}`,
			},
			{
				uri: vscode.Uri.file("/workspace/src/helpers.ts"),
				content: `export function formatNumber(num: number): string {
    return num.toLocaleString();
}`,
			},
		]

		// Build the prompt with active files
		const prompt = buildAIPrompt(comment, TriggerType.Edit, activeFiles)

		// Verify the prompt includes the main file content
		expect(prompt).toContain("TestComponent.tsx")
		expect(prompt).toContain("import { addNumbers } from './utils'")
		expect(prompt).toContain("rename addNumbers to add")

		// Verify the prompt includes the additional context section
		expect(prompt).toContain("# Additional context from open files")

		// Verify the prompt includes content from active files
		expect(prompt).toContain("## File: src/utils.ts")
		expect(prompt).toContain("export function addNumbers(a: number, b: number): number")

		expect(prompt).toContain("## File: src/helpers.ts")
		expect(prompt).toContain("export function formatNumber(num: number): string")

		// Verify the prompt does NOT include the current file again in additional context
		expect(prompt).not.toContain("## File: src/TestComponent.tsx")
	})

	it("should not include additional context section when no active files", () => {
		const comment: AICommentData = {
			content: "add error handling",
			startPos: new vscode.Position(5, 0),
			endPos: new vscode.Position(5, 30),
			context: `function divide(a, b) {
    return a / b;
}`,
			fileUri: vscode.Uri.file("/workspace/src/math.js"),
		}

		// Build prompt without active files
		const prompt = buildAIPrompt(comment, TriggerType.Edit, [])

		// Verify the prompt includes the main content
		expect(prompt).toContain("math.js")
		expect(prompt).toContain("add error handling")
		expect(prompt).toContain("function divide(a, b)")

		// Verify no additional context section
		expect(prompt).not.toContain("# Additional context from open files")
	})

	it("should skip the file with the comment from active files", () => {
		const comment: AICommentData = {
			content: "optimize this function",
			startPos: new vscode.Position(5, 0),
			endPos: new vscode.Position(5, 30),
			context: `function process() {
    // some code
}`,
			fileUri: vscode.Uri.file("/workspace/src/processor.ts"),
		}

		const activeFiles = [
			{
				uri: vscode.Uri.file("/workspace/src/processor.ts"), // Same file as comment
				content: `// This should not be included`,
			},
			{
				uri: vscode.Uri.file("/workspace/src/utils.ts"),
				content: `export const helper = () => {}`,
			},
		]

		const prompt = buildAIPrompt(comment, TriggerType.Edit, activeFiles)

		// Verify only utils.ts is included in additional context
		expect(prompt).toContain("## File: src/utils.ts")
		expect(prompt).not.toContain("This should not be included")
	})

	it("should handle question mode with active files", () => {
		const comment: AICommentData = {
			content: "? what does this function do",
			startPos: new vscode.Position(5, 0),
			endPos: new vscode.Position(5, 30),
			context: `function mystery(arr) {
    return arr.reduce((a, b) => a ^ b, 0);
}`,
			fileUri: vscode.Uri.file("/workspace/src/mystery.js"),
		}

		const activeFiles = [
			{
				uri: vscode.Uri.file("/workspace/src/test.js"),
				content: `// Test file for mystery function
const result = mystery([1, 2, 3, 2, 1]);
console.log(result); // 3`,
			},
		]

		const prompt = buildAIPrompt(comment, TriggerType.Ask, activeFiles)

		// Verify question mode format
		expect(prompt).toContain("Since this appears to be a question")
		expect(prompt).toContain("provide a detailed analysis or explanation")

		// Verify active files are still included for context
		expect(prompt).toContain("# Additional context from open files")
		expect(prompt).toContain("## File: src/test.js")
		expect(prompt).toContain("// Test file for mystery function")
	})
})
