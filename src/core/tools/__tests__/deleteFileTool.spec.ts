import { describe, it, expect, vi, beforeEach } from "vitest"
import fs from "fs/promises"
import path from "path"

import { deleteFileTool } from "../deleteFileTool"
import { Task } from "../../task/Task"
import { ToolUse } from "../../../shared/tools"

// Mock dependencies
vi.mock("fs/promises", () => ({
	default: {
		stat: vi.fn(),
		unlink: vi.fn(),
	},
}))
vi.mock("../../../utils/pathUtils", () => ({
	isPathOutsideWorkspace: vi.fn(),
}))
vi.mock("../../prompts/responses", () => ({
	formatResponse: {
		toolError: vi.fn((msg) => `Error: ${msg}`),
		toolResult: vi.fn((msg) => `Result: ${msg}`),
	},
}))
vi.mock("../../../utils/path", () => ({
	getReadablePath: vi.fn((cwd, path) => path || ""),
}))

describe("deleteFileTool", () => {
	let mockCline: Partial<Task>
	let mockAskApproval: any
	let mockHandleError: any
	let mockPushToolResult: any
	let mockRemoveClosingTag: any

	beforeEach(() => {
		vi.clearAllMocks()

		mockCline = {
			cwd: "/test/workspace",
			consecutiveMistakeCount: 0,
			recordToolError: vi.fn(),
			sayAndCreateMissingParamError: vi.fn().mockResolvedValue("Missing parameter error"),
			say: vi.fn(),
			ask: vi.fn(),
		}

		mockAskApproval = vi.fn().mockResolvedValue(true)
		mockHandleError = vi.fn()
		mockPushToolResult = vi.fn()
		mockRemoveClosingTag = vi.fn((tag, content) => content || "")
	})

	it("should handle missing path parameter", async () => {
		const toolUse: ToolUse = {
			type: "tool_use",
			name: "delete_file",
			params: {},
			partial: false,
		}

		await deleteFileTool(
			mockCline as Task,
			toolUse,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockCline.recordToolError).toHaveBeenCalledWith("delete_file")
	})

	it("should successfully delete a file", async () => {
		const { isPathOutsideWorkspace } = await import("../../../utils/pathUtils")
		vi.mocked(isPathOutsideWorkspace).mockReturnValue(false)
		vi.mocked(fs.stat).mockResolvedValue({
			isDirectory: () => false,
		} as any)
		vi.mocked(fs.unlink).mockResolvedValue(undefined)

		const toolUse: ToolUse = {
			type: "tool_use",
			name: "delete_file",
			params: { path: "test.txt" },
			partial: false,
		}

		await deleteFileTool(
			mockCline as Task,
			toolUse,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockAskApproval).toHaveBeenCalled()
		expect(fs.unlink).toHaveBeenCalled()
	})

	it("should reject files outside workspace", async () => {
		const { isPathOutsideWorkspace } = await import("../../../utils/pathUtils")
		vi.mocked(isPathOutsideWorkspace).mockReturnValue(true)

		const toolUse: ToolUse = {
			type: "tool_use",
			name: "delete_file",
			params: { path: "../outside.txt" },
			partial: false,
		}

		await deleteFileTool(
			mockCline as Task,
			toolUse,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockCline.say).toHaveBeenCalledWith("error", expect.stringContaining("outside workspace"))
	})
})
