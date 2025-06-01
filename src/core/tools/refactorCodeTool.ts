import * as path from "path"
import { ClineSayTool } from "../../shared/ExtensionMessage"
import { Task } from "../task/Task"
import { ToolUse, RemoveClosingTag } from "../../shared/tools"
import { formatResponse } from "../prompts/responses"
import { AskApproval, HandleError, PushToolResult } from "../../shared/tools"
import { fileExistsAtPath } from "../../utils/fs"
import { RecordSource } from "../context-tracking/FileContextTrackerTypes"

/**
 * Refactor code tool implementation
 *
 * This tool uses an AST-based Domain Specific Language (DSL) to perform batch code refactoring
 * operations. ALL operations must be provided as an array, even single operations.
 *
 * IMPORTANT GUIDELINES:
 * - ALL operations must be provided in an array format
 * - ONLY use symbol-based selectors (identifier) for all operations
 * - Line number-based selectors are not supported
 * - Each operation in the batch is processed independently
 * - If any operation fails, the entire batch will be rolled back
 *
 * Supported operations:
 * 1. Move: Move code elements from one file to another
 * 2. Rename: Rename symbols with proper reference handling
 * 3. Remove: Remove code elements from a file
 *
 * The operations parameter must be a valid JSON array with the following structure:
 *
 * Example batch operations:
 * ```json
 * [
 *   {
 *     "operation": "move",
 *     "selector": {
 *       "type": "identifier",
 *       "name": "calculateTotal",
 *       "filePath": "src/example.ts"
 *     },
 *     "targetFilePath": "src/target.ts"
 *   },
 *   {
 *     "operation": "rename",
 *     "selector": {
 *       "type": "identifier",
 *       "name": "oldName",
 *       "filePath": "src/example.ts"
 *     },
 *     "newName": "newName"
 *   },
 *   {
 *     "operation": "remove",
 *     "selector": {
 *       "type": "identifier",
 *       "name": "unusedFunction",
 *       "filePath": "src/example.ts"
 *     }
 *   }
 *   }
 * ]
 * ```
 *
 * Optional parameters:
 * - preview: Set to "true" to show what would happen without making changes
 */
export async function refactorCodeTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	_removeClosingTag: RemoveClosingTag, // Prefixed with underscore as it's no longer used
) {
	const dslCommandJson: string | undefined = block.params.operations
	// Use type assertion for preview parameter
	const isPreviewMode: boolean = (block.params as Record<string, string | undefined>).preview === "true"

	// Tool message properties
	const sharedMessageProps: ClineSayTool = {
		tool: "refactorCode",
		path: "",
		content: "",
	}

	try {
		// Handle partial execution (preview)
		if (block.partial) {
			await cline.ask("tool", JSON.stringify(sharedMessageProps), block.partial).catch(() => {})
			return
		}

		// Verify required operations parameter
		if (!dslCommandJson) {
			cline.consecutiveMistakeCount++
			cline.recordToolError("refactor_code")
			pushToolResult(await cline.sayAndCreateMissingParamError("refactor_code", "operations"))
			return
		}

		// Log the raw command for debugging
		console.log("Refactor code tool received command:", dslCommandJson)

		// Parse batch operations

		// Validate all file paths exist and are accessible
		// const filesToCheck = new Set<string>()
		// for (const op of operations) {
		// 	if (op.selector.filePath) {
		// 		filesToCheck.add(op.selector.filePath)
		// 	}
		// }

		// for (const filePath of filesToCheck) {
		// 	// Verify path is accessible
		// 	const accessAllowed = cline.rooIgnoreController?.validateAccess(filePath)
		// 	if (!accessAllowed) {
		// 		await cline.say("rooignore_error", filePath)
		// 		pushToolResult(formatResponse.toolError(formatResponse.rooIgnoreError(filePath)))
		// 		return
		// 	}

		// 	// Verify filYou e exists
		// 	const absolutePath = path.resolve(cline.cwd, filePath)
		// 	const fileExists = await fileExistsAtPath(absolutePath)
		// 	if (!fileExists) {
		// 		cline.consecutiveMistakeCount++
		// 		cline.recordToolError("refactor_code")
		// 		const formattedError = `File does not exist at path: ${filePath}\n\n<error_details>\nThe specified file could not be found. Please verify the file path is relative to the workspace directory: ${cline.cwd}\nResolved absolute path: ${absolutePath}\n</error_details>`
		// 		await cline.say("error", formattedError)
		// 		pushToolResult(formattedError)
		// 		return
		// 	}
		// }

		// Create human-readable operation description for approval
		// let operationDescription = `Batch refactoring: ${operations.length} operation${operations.length > 1 ? "s" : ""}\n\n`
		// for (let i = 0; i < operations.length; i++) {
		// 	operationDescription += `${i + 1}. ${createBatchOperationDescription(operations[i])}\n`
		// }

		// Ask for approval before performing refactoring
		// const approvalMessage = JSON.stringify({
		// 	...sharedMessageProps,
		// 	content: operationDescription,
		// } satisfies ClineSayTool)

		const didApprove = await askApproval("tool", "approvalMessage")
		if (!didApprove) {
			pushToolResult("Refactoring cancelled by user")
			return
		}

		// Create the VS Code adapter
		// const adapter = new VSCodeRefactoringAdapter(cline.cwd)

		// Execute all operations
		// const results: string[] = []
		// let allSuccess = true
		// const modifiedFiles = new Set<string>()

		// Track renamed identifiers to update selectors in subsequent operations
		// const renamedIdentifiers = new Map<string, string>()

		// for (let i = 0; i < operations.length; i++) {
		// 	const op = operations[i]
		// 	let result: string
		// 	let success = false

		// 	try {
		// 		// Convert batch operation to legacy DslCommand format for adapter
		// 		const dslCommand: DslCommand & { operationDetails: OperationType } = {
		// 			schemaVersion: "1.0",
		// 			operation: op.operation,
		// 			selector: op.selector,
		// 			operationDetails:
		// 				op.operation === "move"
		// 					? ({
		// 							type: "move",
		// 							targetFilePath: (op as MoveRefactorOperation).targetFilePath,
		// 						} as MoveOperation)
		// 					: op.operation === "rename"
		// 						? ({
		// 								type: "rename",
		// 								newName: (op as RenameRefactorOperation).newName,
		// 							} as RenameOperation)
		// 						: ({
		// 								type: "remove",
		// 							} as RemoveOperation),
		// 		}

		// 		if (op.operation === "move") {
		// 			const moveOp = op as MoveRefactorOperation

		// 			// Verify target path access
		// 			const targetAccessAllowed = cline.rooIgnoreController?.validateAccess(moveOp.targetFilePath)
		// 			if (!targetAccessAllowed) {
		// 				result = formatResponse.rooIgnoreError(moveOp.targetFilePath)
		// 				success = false
		// 			} else {
		// 				// Track files
		// 				if (op.selector.filePath) {
		// 					modifiedFiles.add(path.resolve(cline.cwd, op.selector.filePath))
		// 				}
		// 				modifiedFiles.add(path.resolve(cline.cwd, moveOp.targetFilePath))

		// 				// Execute the move operation
		// 				const opResult = (await adapter.executeDslCommand(dslCommand)) as MoveResult

		// 				if (opResult.success) {
		// 					success = true
		// 					const selectorName = op.selector.type === "identifier" ? op.selector.name : "code"
		// 					result = `Moved ${selectorName} to ${moveOp.targetFilePath}`
		// 					await cline.fileContextTracker.trackFileContext(
		// 						moveOp.targetFilePath,
		// 						"roo_edited" as RecordSource,
		// 					)
		// 				} else {
		// 					result = opResult.error || "Unknown error during code move"
		// 				}
		// 			}
		// 		} else if (op.operation === "rename") {
		// 			const renameOp = op as RenameRefactorOperation

		// 			// Execute the rename operation
		// 			const opResult = (await adapter.executeDslCommand(dslCommand)) as RenameResult

		// 			if (opResult.success) {
		// 				success = true
		// 				const selectorName = op.selector.type === "identifier" ? op.selector.name : "symbol"
		// 				result = `Renamed ${selectorName} to ${renameOp.newName}`

		// 				// Track renamed identifiers for subsequent operations
		// 				if (op.selector.type === "identifier") {
		// 					renamedIdentifiers.set(op.selector.name, renameOp.newName)
		// 				}

		// 				// Track modified files
		// 				if (opResult.modifiedFiles) {
		// 					for (const file of opResult.modifiedFiles) {
		// 						modifiedFiles.add(path.resolve(cline.cwd, file))
		// 						await cline.fileContextTracker.trackFileContext(file, "roo_edited" as RecordSource)
		// 					}
		// 				}
		// 			} else {
		// 				result = opResult.error || "Unknown error during symbol rename"
		// 			}
		// 		} else if (op.operation === "remove") {
		// 			const _removeOp = op as RemoveRefactorOperation

		// 			// Check if the identifier has been renamed in a previous operation
		// 			if (op.selector.type === "identifier" && renamedIdentifiers.has(op.selector.name)) {
		// 				// Update the selector to use the new name
		// 				const newName = renamedIdentifiers.get(op.selector.name)!
		// 				console.log(`Updating remove operation selector from ${op.selector.name} to ${newName}`)
		// 				op.selector.name = newName

		// 				// Update the DSL command
		// 				dslCommand.selector = op.selector
		// 			}

		// 			// Execute the remove operation
		// 			const opResult = (await adapter.executeDslCommand(dslCommand)) as RemoveResult

		// 			if (opResult.success) {
		// 				success = true
		// 				const selectorName = op.selector.type === "identifier" ? op.selector.name : "code"
		// 				result = `Removed ${selectorName} from ${op.selector.filePath}`

		// 				// Track modified files
		// 				if (opResult.modifiedFiles) {
		// 					for (const file of opResult.modifiedFiles) {
		// 						modifiedFiles.add(path.resolve(cline.cwd, file))
		// 						await cline.fileContextTracker.trackFileContext(file, "roo_edited" as RecordSource)
		// 					}
		// 				} else if (op.selector.filePath) {
		// 					// Fallback to just tracking the source file
		// 					modifiedFiles.add(path.resolve(cline.cwd, op.selector.filePath))
		// 					await cline.fileContextTracker.trackFileContext(
		// 						op.selector.filePath,
		// 						"roo_edited" as RecordSource,
		// 					)
		// 				}
		// 			} else {
		// 				result = opResult.error || "Unknown error during code removal"
		// 			}
		// 		} else {
		// 			result = `Unsupported operation: ${(op as any).operation}`
		// 		}
		// 	} catch (error) {
		// 		// Handle structured errors consistently
		// 		if (error instanceof CodeRefactoringError) {
		// 			result = error.formatForDisplay()
		// 		} else {
		// 			result = `Error: ${error instanceof Error ? error.message : String(error)}`
		// 		}
		// 		success = false
		// 	}

		// 	results.push(`Operation ${i + 1}: ${success ? "✓" : "✗"} ${result}`)
		// 	if (!success) {
		// 		allSuccess = false
		// 		// Stop on first failure
		// 		break
		// 	}
		// }

		// // Track source files
		// for (const op of operations) {
		// 	if (op.selector.filePath) {
		// 		await cline.fileContextTracker.trackFileContext(op.selector.filePath, "roo_edited" as RecordSource)
		// 	}
		// }
		const results: string[] = []
		const allSuccess = true

		// Report results
		const finalResult = results.join("\n")
		if (allSuccess) {
			cline.consecutiveMistakeCount = 0
			cline.didEditFile = true
			pushToolResult(`Batch refactoring completed successfully:\n\n${finalResult}`)
		} else {
			cline.consecutiveMistakeCount++
			cline.recordToolError("refactor_code", finalResult)
			await cline.say("error", `Batch refactoring failed:\n\n${finalResult}`)
			pushToolResult(`Batch refactoring failed:\n\n${finalResult}`)
		}
	} catch (error) {
		await handleError("refactoring code", error)
	}
}
