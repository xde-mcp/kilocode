import path from "path"
import fs from "fs/promises"

import { Task } from "../task/Task"
import { ClineSayTool } from "../../shared/ExtensionMessage"
import { formatResponse } from "../prompts/responses"
import { getReadablePath } from "../../utils/path"
import { isPathOutsideWorkspace } from "../../utils/pathUtils"
import { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../../shared/tools"

/**
 * Implements the delete_file tool.
 */

function isDangerousPath(absolutePath: string): boolean {
	// Basic safety check - prevent deleting system directories
	// TODO: maybe add more patterns later
	const normalizedPath = path.normalize(absolutePath)
	return normalizedPath === "/" || normalizedPath.includes("..")
}

export async function deleteFileTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const relPath: string | undefined = block.params.path

	try {
		if (block.partial) {
			const partialMessage = JSON.stringify({
				tool: "deleteFile",
				path: getReadablePath(cline.cwd, removeClosingTag("path", relPath)),
			} satisfies ClineSayTool)
			await cline.ask("tool", partialMessage, block.partial).catch(() => {})
			return
		}

		if (!relPath) {
			cline.consecutiveMistakeCount++
			cline.recordToolError("delete_file")
			pushToolResult(await cline.sayAndCreateMissingParamError("delete_file", "path"))
			return
		}

		const absolutePath = path.resolve(cline.cwd, relPath)
		const relativePath = path.relative(cline.cwd, absolutePath)

		// Check workspace boundary
		const isOutsideWorkspace = isPathOutsideWorkspace(absolutePath)
		if (isOutsideWorkspace) {
			cline.consecutiveMistakeCount++
			cline.recordToolError("delete_file")
			const errorMsg = `Cannot delete files outside workspace. Path: ${relativePath}`
			await cline.say("error", errorMsg)
			pushToolResult(formatResponse.toolError(errorMsg))
			return
		}

		// Check for dangerous paths
		if (isDangerousPath(absolutePath)) {
			cline.consecutiveMistakeCount++
			cline.recordToolError("delete_file")
			const errorMsg = `Cannot delete system files. Path: ${relativePath}`
			await cline.say("error", errorMsg)
			pushToolResult(formatResponse.toolError(errorMsg))
			return
		}

		let stats
		try {
			stats = await fs.stat(absolutePath)
		} catch (error) {
			cline.consecutiveMistakeCount++
			cline.recordToolError("delete_file")
			const errorMsg = `File or directory does not exist: ${relativePath}`
			await cline.say("error", errorMsg)
			pushToolResult(formatResponse.toolError(errorMsg))
			return
		}

		// Don't allow directory deletion yet
		if (stats.isDirectory()) {
			cline.consecutiveMistakeCount++
			cline.recordToolError("delete_file")
			const errorMsg = `Cannot delete directories yet. Path: ${relativePath}`
			await cline.say("error", errorMsg)
			pushToolResult(formatResponse.toolError(errorMsg))
			return
		}

		cline.consecutiveMistakeCount = 0

		const approvalMessage = JSON.stringify({
			tool: "deleteFile",
			path: getReadablePath(cline.cwd, relativePath),
			isOutsideWorkspace: false,
		} satisfies ClineSayTool)

		const didApprove = await askApproval("tool", approvalMessage)
		if (!didApprove) {
			return
		}

		await fs.unlink(absolutePath)

		const successMsg = `Deleted file: ${relativePath}`
		await cline.say("text", successMsg)
		pushToolResult(formatResponse.toolResult(successMsg))
	} catch (error) {
		await handleError("deleting file", error)
	}
}
