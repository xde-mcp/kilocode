import * as path from "path"
import { ClineSayTool } from "../../shared/ExtensionMessage"
import { Task } from "../task/Task"
import { ToolUse, RemoveClosingTag } from "../../shared/tools"
import { formatResponse } from "../prompts/responses"
import { AskApproval, HandleError, PushToolResult } from "../../shared/tools"
import { fileExistsAtPath } from "../../utils/fs"
import { RecordSource } from "../context-tracking/FileContextTrackerTypes"
import { Project } from "ts-morph"
import { RefactorEngine, RefactorEngineError } from "./refactor-code/engine"
import { RobustLLMRefactorParser, RefactorParseError } from "./refactor-code/parser"
import { BatchOperations } from "./refactor-code/schema"
import { createDiagnostic } from "./refactor-code/utils/file-system"

/**
 * Refactor code tool implementation
 *
 * This tool uses a powerful AST-based engine to perform code refactoring operations
 * with robust validation, error handling, and recovery mechanisms. It supports
 * batch operations for performing multiple refactorings as a single atomic unit.
 *
 * IMPORTANT GUIDELINES:
 * - ALL operations must be provided in an array format, even single operations
 * - Each operation in the batch is processed independently
 * - If any operation fails, the entire batch will be rolled back by default
 * - Path handling is consistent across all operations
 * - Import dependencies are automatically managed during move operations
 *
 * Supported operations:
 * 1. Move: Move code elements from one file to another with automatic import handling
 * 2. Rename: Rename symbols with proper reference handling across the project
 * 3. Remove: Remove code elements with safe validation and cleanup
 *
 * Error handling has been significantly improved with:
 * - Detailed validation before operations are executed
 * - Comprehensive error messages with actionable information
 * - Recovery mechanisms for common failure scenarios
 * - Path normalization to prevent file resolution issues
 */
export async function refactorCodeTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
) {
	// Extract operations from the parameters
	const operationsJson: string | undefined = block.params.operations

	// Tool message properties
	const sharedMessageProps: ClineSayTool = {
		tool: "refactorCode",
		path: "",
		content: "",
	}

	try {
		// Handle partial execution
		if (block.partial) {
			await cline.ask("tool", JSON.stringify(sharedMessageProps), block.partial).catch(() => {})
			return
		}

		// Verify required operations parameter
		if (!operationsJson) {
			cline.consecutiveMistakeCount++
			cline.recordToolError("refactor_code")
			pushToolResult(await cline.sayAndCreateMissingParamError("refactor_code", "operations"))
			return
		}

		// DIAGNOSTIC: Log current directories to help debug path issues
		console.log(`[DIAGNOSTIC] Working directory (cline.cwd): "${cline.cwd}"`)
		console.log(`[DIAGNOSTIC] Process directory (process.cwd()): "${process.cwd()}"`)

		// Create diagnostic function
		const diagnose = createDiagnostic(cline.cwd)

		// Initialize the RefactorEngine
		const engine = new RefactorEngine({
			projectRootPath: cline.cwd,
		})

		// Parse the operations
		let operations: BatchOperations
		try {
			// Parse the operations using the robust parser
			let parser = new RobustLLMRefactorParser()
			let parsedOperations: any[]

			try {
				// Attempt to parse the raw operations
				parsedOperations = parser.parseResponse(operationsJson)
			} catch (parseError) {
				// If parsing fails, try to directly parse as JSON without the parser's extra logic
				try {
					// The input might already be a JSON array
					const directJson = JSON.parse(operationsJson as string)
					parsedOperations = Array.isArray(directJson) ? directJson : [directJson]
				} catch (jsonError) {
					// If direct parsing also fails, throw the original error
					throw parseError
				}
			}

			// Create a batch operations object
			operations = {
				operations: parsedOperations,
				options: {
					stopOnError: true,
				},
			}
		} catch (error) {
			const err = error as Error
			cline.consecutiveMistakeCount++
			cline.recordToolError("refactor_code")
			const formattedError = `Failed to parse refactor operations: ${err.message}`
			await cline.say("error", formattedError)
			pushToolResult(formattedError)
			return
		}

		// Validate all file paths exist and are accessible
		const filesToCheck = new Set<string>()
		for (const op of operations.operations) {
			if ("filePath" in op.selector) {
				filesToCheck.add(op.selector.filePath)
			}

			// Check target file for move operations
			if (op.operation === "move") {
				filesToCheck.add(op.targetFilePath)
			}
		}

		for (const filePath of filesToCheck) {
			// Verify path is accessible
			const accessAllowed = cline.rooIgnoreController?.validateAccess(filePath)
			if (!accessAllowed) {
				await cline.say("rooignore_error", filePath)
				pushToolResult(formatResponse.toolError(formatResponse.rooIgnoreError(filePath)))
				return
			}

			// For source files, verify the file exists
			// (but don't check for target files in move operations, as they may not exist yet)
			const isTargetFile = operations.operations.some(
				(op) => op.operation === "move" && op.targetFilePath === filePath,
			)

			if (!isTargetFile) {
				// Verify file exists for source files
				const absolutePath = path.resolve(cline.cwd, filePath)
				const fileExists = await fileExistsAtPath(absolutePath)

				// DIAGNOSTIC: Log file existence check
				console.log(
					`[DIAGNOSTIC] File check - Path: "${filePath}", Absolute: "${absolutePath}", Exists: ${fileExists}`,
				)

				if (!fileExists) {
					// Run diagnostic on this file
					await diagnose(filePath, "File existence check")

					cline.consecutiveMistakeCount++
					cline.recordToolError("refactor_code")
					const formattedError = `File does not exist at path: ${filePath}\n\n<error_details>\nThe specified file could not be found. Please verify the file path is relative to the workspace directory: ${cline.cwd}\nResolved absolute path: ${absolutePath}\n</error_details>`
					await cline.say("error", formattedError)
					pushToolResult(formattedError)
					return
				}
			}
		}

		// Create human-readable operation description for approval with validation info
		let operationDescription = `Batch refactoring: ${operations.operations.length} operation${operations.operations.length > 1 ? "s" : ""}\n\n`

		for (let i = 0; i < operations.operations.length; i++) {
			const op = operations.operations[i]
			let description = `${i + 1}. `

			switch (op.operation) {
				case "rename":
					description += `Rename ${op.selector.name} to ${op.newName} in ${op.selector.filePath}`
					break
				case "move":
					description += `Move ${op.selector.name} from ${op.selector.filePath} to ${op.targetFilePath}`
					break
				case "remove":
					description += `Remove ${op.selector.name} from ${op.selector.filePath}`
					break
				default:
					description += `Unsupported operation: ${op.operation}`
			}

			if (op.reason) {
				description += ` (Reason: ${op.reason})`
			}

			operationDescription += `${description}\n`
		}

		// Add note about validation and rollback behavior
		operationDescription += `\n${operations.options?.stopOnError ? "NOTE: If any operation fails, the entire batch will be rolled back." : "NOTE: Operations will continue executing even if some fail."}`
		operationDescription += `\nAll imports and references will be automatically updated.`

		// Ask for approval before performing refactoring
		const approvalMessage = JSON.stringify({
			...sharedMessageProps,
			content: operationDescription,
		} satisfies ClineSayTool)

		const didApprove = await askApproval("tool", approvalMessage)
		if (!didApprove) {
			pushToolResult("Refactoring cancelled by user")
			return
		}

		// Execute the batch operations
		let result
		try {
			// DIAGNOSTIC: Log file state before operation
			for (const filePath of filesToCheck) {
				await diagnose(filePath, "Before refactoring")
			}

			result = await engine.executeBatch(operations)

			// Track all modified files
			const modifiedFiles = new Set<string>()
			if (result.success) {
				for (const opResult of result.results) {
					for (const file of opResult.affectedFiles) {
						const absoluteFilePath = path.resolve(cline.cwd, file)
						modifiedFiles.add(absoluteFilePath)
						await cline.fileContextTracker.trackFileContext(file, "roo_edited" as RecordSource)
					}
				}
			}

			// DIAGNOSTIC: Log file state after operation
			for (const filePath of modifiedFiles) {
				await diagnose(filePath, "After refactoring")
			}
		} catch (error) {
			// Handle errors in batch execution
			const errorMessage = `Batch refactoring failed with error: ${(error as Error).message}`
			console.error(`[ERROR] ${errorMessage}`)

			cline.consecutiveMistakeCount++
			cline.recordToolError("refactor_code", errorMessage)
			await cline.say("error", errorMessage)
			pushToolResult(errorMessage)
			return
		}

		// Format results with detailed diagnostic information
		const resultMessages: string[] = []
		for (let i = 0; i < result.results.length; i++) {
			const opResult = result.results[i]
			const op = result.allOperations[i]

			if (opResult.success) {
				let message = ""
				switch (op.operation) {
					case "rename":
						message = `Renamed ${op.selector.name} to ${op.newName} in ${op.selector.filePath}`
						break
					case "move":
						message = `Moved ${op.selector.name} from ${op.selector.filePath} to ${op.targetFilePath}`
						break
					case "remove":
						message = `Removed ${op.selector.name} from ${op.selector.filePath}`
						break
					default:
						message = `Executed ${op.operation} operation successfully`
				}
				resultMessages.push(`✓ ${message}`)

				// Add warnings if present
				if (opResult.warnings && opResult.warnings.length > 0) {
					resultMessages.push(`  Warnings: ${opResult.warnings.join(", ")}`)
				}
			} else {
				resultMessages.push(`✗ Operation failed: ${opResult.error}`)

				// Add any diagnostic information for failed operations
				if (opResult.warnings && opResult.warnings.length > 0) {
					resultMessages.push(`  Additional info: ${opResult.warnings.join(", ")}`)
				}
			}
		}

		// Report results
		const finalResult = resultMessages.join("\n")
		if (result.success) {
			cline.consecutiveMistakeCount = 0
			cline.didEditFile = true
			pushToolResult(`Batch refactoring completed successfully:\n\n${finalResult}`)
		} else {
			cline.consecutiveMistakeCount++
			cline.recordToolError("refactor_code", result.error || finalResult)
			await cline.say("error", `Batch refactoring failed:\n\n${result.error || finalResult}`)
			pushToolResult(`Batch refactoring failed:\n\n${result.error || finalResult}`)
		}
	} catch (error) {
		await handleError("refactoring code", error)
	}
}
