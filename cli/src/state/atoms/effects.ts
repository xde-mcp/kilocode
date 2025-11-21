/**
 * Effect atoms for message handling and service initialization
 * These atoms handle side effects like processing messages and initializing the service
 */

import { atom } from "jotai"
import type { ExtensionMessage, ExtensionChatMessage, RouterModels } from "../../types/messages.js"
import type { HistoryItem, CommandExecutionStatus } from "@roo-code/types"
import { extensionServiceAtom, setServiceReadyAtom, setServiceErrorAtom, setIsInitializingAtom } from "./service.js"
import {
	updateExtensionStateAtom,
	updateChatMessageByTsAtom,
	updateRouterModelsAtom,
	chatMessagesAtom,
	updateChatMessagesAtom,
} from "./extension.js"
import { ciCompletionDetectedAtom } from "./ci.js"
import {
	updateProfileDataAtom,
	updateBalanceDataAtom,
	setProfileLoadingAtom,
	setBalanceLoadingAtom,
	setProfileErrorAtom,
	setBalanceErrorAtom,
	type ProfileData,
	type BalanceData,
} from "./profile.js"
import {
	taskHistoryDataAtom,
	taskHistoryLoadingAtom,
	taskHistoryErrorAtom,
	resolveTaskHistoryRequestAtom,
} from "./taskHistory.js"
import { logs } from "../../services/logs.js"

/**
 * Message buffer to handle race conditions during initialization
 * Messages received before state is ready are buffered and processed later
 */
const messageBufferAtom = atom<ExtensionMessage[]>([])

/**
 * Flag to track if we're currently processing buffered messages
 */
const isProcessingBufferAtom = atom<boolean>(false)

/**
 * Map to store pending output updates for command_output asks
 * Key: executionId, Value: latest output data
 * Exported so extension.ts can apply pending updates when asks appear
 */
export const pendingOutputUpdatesAtom = atom<Map<string, { output: string; command?: string; completed?: boolean }>>(
	new Map<string, { output: string; command?: string; completed?: boolean }>(),
)

/**
 * Map to track which commands have shown a command_output ask
 * Key: executionId, Value: true if ask was shown
 */
const commandOutputAskShownAtom = atom<Map<string, boolean>>(new Map<string, boolean>())

// Indexing status types
export interface IndexingStatus {
	systemStatus: string
	message?: string
	processedItems: number
	totalItems: number
	currentItemUnit?: string
	workspacePath?: string
	gitBranch?: string // Current git branch being indexed
	manifest?: {
		totalFiles: number
		totalChunks: number
		lastUpdated: string
	}
}

/**
 * Effect atom to initialize the ExtensionService
 * This sets up event listeners and activates the service
 */
export const initializeServiceEffectAtom = atom(null, async (get, set, store?: { set: typeof set }) => {
	const service = get(extensionServiceAtom)

	if (!service) {
		const error = new Error("ExtensionService not available for initialization")
		set(setServiceErrorAtom, error)
		throw error
	}

	// Get the store reference - if not passed, we can't update atoms from event listeners
	const atomStore = store || (get as { store?: { set: typeof set } }).store
	if (!atomStore) {
		logs.error("No store available for event listeners", "effects")
	}

	try {
		set(setIsInitializingAtom, true)
		logs.info("Initializing ExtensionService...", "effects")

		// Set up event listeners before initialization
		// IMPORTANT: Use atomStore.set() instead of set() for async event handlers
		service.on("ready", (api) => {
			logs.info("Extension ready", "effects")
			if (atomStore) {
				atomStore.set(setServiceReadyAtom, true)

				// Get initial state
				const state = api.getState()
				if (state) {
					atomStore.set(updateExtensionStateAtom, state)
				}

				// Process any buffered messages
				atomStore.set(processMessageBufferAtom)
			}
		})

		service.on("stateChange", (state) => {
			if (atomStore) {
				atomStore.set(updateExtensionStateAtom, state)
			}
		})

		service.on("message", (message) => {
			if (atomStore) {
				atomStore.set(messageHandlerEffectAtom, message)
			}
		})

		service.on("error", (error) => {
			logs.error("Extension service error", "effects", { error })
			if (atomStore) {
				atomStore.set(setServiceErrorAtom, error)
			}
		})

		service.on("disposed", () => {
			logs.info("Extension service disposed", "effects")
			if (atomStore) {
				atomStore.set(setServiceReadyAtom, false)
			}
		})

		// Initialize the service
		await service.initialize()

		logs.info("ExtensionService initialized successfully", "effects")
	} catch (error) {
		logs.error("Failed to initialize ExtensionService", "effects", { error })
		const err = error instanceof Error ? error : new Error(String(error))
		set(setServiceErrorAtom, err)
		set(setIsInitializingAtom, false)
		throw err
	}
})

/**
 * Effect atom to handle incoming extension messages
 * This processes messages and updates state accordingly
 */
export const messageHandlerEffectAtom = atom(null, (get, set, message: ExtensionMessage) => {
	try {
		// Check if service is ready
		const service = get(extensionServiceAtom)
		if (!service) {
			logs.warn("Message received but service not available, buffering", "effects")
			const buffer = get(messageBufferAtom)
			set(messageBufferAtom, [...buffer, message])
			return
		}

		// Handle different message types
		switch (message.type) {
			case "state":
				// State messages are handled by the stateChange event listener
				// Skip processing here to avoid duplication

				// Track command_output asks that appear in state updates
				if (message.state?.chatMessages) {
					const askShownMap = get(commandOutputAskShownAtom)
					const newAskShownMap = new Map(askShownMap)

					for (const msg of message.state.chatMessages) {
						if (msg.type === "ask" && msg.ask === "command_output" && msg.text) {
							try {
								const data = JSON.parse(msg.text)
								if (data.executionId) {
									newAskShownMap.set(data.executionId, true)
								}
							} catch {
								// Ignore parse errors
							}
						}
					}

					if (newAskShownMap.size !== askShownMap.size) {
						set(commandOutputAskShownAtom, newAskShownMap)
					}
				}
				break

			case "messageUpdated": {
				const chatMessage = message.chatMessage as ExtensionChatMessage | undefined
				if (chatMessage) {
					set(updateChatMessageByTsAtom, chatMessage)

					// Track command_output asks that appear via messageUpdated
					if (chatMessage.type === "ask" && chatMessage.ask === "command_output" && chatMessage.text) {
						try {
							const data = JSON.parse(chatMessage.text)
							if (data.executionId) {
								const askShownMap = get(commandOutputAskShownAtom)
								const newAskShownMap = new Map(askShownMap)
								newAskShownMap.set(data.executionId, true)
								set(commandOutputAskShownAtom, newAskShownMap)
							}
						} catch {
							// Ignore parse errors
						}
					}
				}
				break
			}

			case "routerModels": {
				const routerModels = message.routerModels as RouterModels | undefined
				if (routerModels) {
					set(updateRouterModelsAtom, routerModels)
				}
				break
			}

			case "profileDataResponse": {
				set(setProfileLoadingAtom, false)
				const payload = message.payload as { success: boolean; data?: unknown; error?: string } | undefined
				if (payload?.success) {
					set(updateProfileDataAtom, payload.data as ProfileData)
				} else {
					set(setProfileErrorAtom, payload?.error || "Failed to fetch profile")
				}
				break
			}

			case "balanceDataResponse": {
				// Handle balance data response
				set(setBalanceLoadingAtom, false)
				const payload = message.payload as { success: boolean; data?: unknown; error?: string } | undefined
				if (payload?.success) {
					set(updateBalanceDataAtom, payload.data as BalanceData)
				} else {
					set(setBalanceErrorAtom, payload?.error || "Failed to fetch balance")
				}
				break
			}

			case "taskHistoryResponse": {
				// Handle task history response
				set(taskHistoryLoadingAtom, false)
				const payload = message.payload as
					| {
							historyItems?: HistoryItem[]
							pageIndex?: number
							pageCount?: number
							requestId?: string
					  }
					| undefined
				if (payload) {
					const { historyItems, pageIndex, pageCount, requestId } = payload
					const data = {
						historyItems: historyItems || [],
						pageIndex: pageIndex || 0,
						pageCount: pageCount || 1,
					}
					set(taskHistoryDataAtom, data)
					set(taskHistoryErrorAtom, null)

					// Resolve any pending request with this requestId
					if (requestId) {
						set(resolveTaskHistoryRequestAtom, { requestId, data })
					}
				} else {
					set(taskHistoryErrorAtom, "Failed to fetch task history")
					// Reject any pending requests
					const payloadWithRequestId = message.payload as { requestId?: string } | undefined
					if (payloadWithRequestId?.requestId) {
						set(resolveTaskHistoryRequestAtom, {
							requestId: payloadWithRequestId.requestId,
							error: "Failed to fetch task history",
						})
					}
				}
				break
			}

			case "action":
				// Action messages are typically handled by the UI
				break

			case "partialMessage":
				// Partial messages update the current message being streamed
				break

			case "invoke":
				// Invoke messages trigger specific UI actions
				break

			case "indexingStatusUpdate": {
				// this message fires rapidly as the scanner is progressing and we don't have a UI for it in the
				// CLI at this point, so just quietly ignore it. Eventually we can add more CLI info about indexing.
				break
			}

			case "commandExecutionStatus": {
				// Handle command execution status messages
				// Store output updates and apply them when the ask appears
				try {
					const statusData = JSON.parse(message.text || "{}") as CommandExecutionStatus
					const pendingUpdates = get(pendingOutputUpdatesAtom)
					const newPendingUpdates = new Map(pendingUpdates)

					if (statusData.status === "started") {
						// Initialize with command info
						// IMPORTANT: Store the command immediately so it's available even if no output is produced
						const command = "command" in statusData ? (statusData.command as string) : undefined
						const updateData: { output: string; command?: string; completed?: boolean } = {
							output: "",
							command: command || "", // Always set command, even if empty
						}
						newPendingUpdates.set(statusData.executionId, updateData)

						// CLI-ONLY WORKAROUND: Immediately create a synthetic command_output ask
						// This allows users to abort the command even before any output is produced
						const syntheticAsk: ExtensionChatMessage = {
							ts: Date.now(),
							type: "ask",
							ask: "command_output",
							text: JSON.stringify({
								executionId: statusData.executionId,
								command: command || "",
								output: "",
							}),
							partial: true, // Mark as partial since command is still running
							isAnswered: false,
						}

						// Add the synthetic message to chat messages
						const currentMessages = get(chatMessagesAtom)
						set(updateChatMessagesAtom, [...currentMessages, syntheticAsk])

						// Mark that we've shown an ask for this execution
						const askShownMap = get(commandOutputAskShownAtom)
						const newAskShownMap = new Map(askShownMap)
						newAskShownMap.set(statusData.executionId, true)
						set(commandOutputAskShownAtom, newAskShownMap)
					} else if (statusData.status === "output") {
						// Update with new output
						const existing = newPendingUpdates.get(statusData.executionId) || { output: "" }
						const command = "command" in statusData ? (statusData.command as string) : existing.command
						const updateData: { output: string; command?: string; completed?: boolean } = {
							output: statusData.output || "",
						}
						if (command) {
							updateData.command = command
						}
						if (existing.completed !== undefined) {
							updateData.completed = existing.completed
						}
						newPendingUpdates.set(statusData.executionId, updateData)

						// Update the synthetic ask with the new output
						// Find and update the synthetic message we created
						const currentMessages = get(chatMessagesAtom)
						const messageIndex = currentMessages.findIndex((msg) => {
							if (msg.type === "ask" && msg.ask === "command_output" && msg.text) {
								try {
									const data = JSON.parse(msg.text)
									return data.executionId === statusData.executionId
								} catch {
									return false
								}
							}
							return false
						})

						if (messageIndex !== -1) {
							const updatedAsk: ExtensionChatMessage = {
								...currentMessages[messageIndex]!,
								text: JSON.stringify({
									executionId: statusData.executionId,
									command: command || "",
									output: statusData.output || "",
								}),
								partial: true, // Still running
							}

							const newMessages = [...currentMessages]
							newMessages[messageIndex] = updatedAsk
							set(updateChatMessagesAtom, newMessages)
						}
					} else if (statusData.status === "exited" || statusData.status === "timeout") {
						// Mark as completed and ensure command is preserved
						const existing = newPendingUpdates.get(statusData.executionId) || { output: "", command: "" }
						// If command wasn't set yet (shouldn't happen but defensive), try to get it from statusData
						const command =
							existing.command || ("command" in statusData ? (statusData.command as string) : "")
						const finalUpdate = {
							...existing,
							command: command,
							completed: true,
						}
						newPendingUpdates.set(statusData.executionId, finalUpdate)
					}

					set(pendingOutputUpdatesAtom, newPendingUpdates)

					// CLI-ONLY WORKAROUND: Mark synthetic ask as complete when command exits
					if (statusData.status === "exited" || statusData.status === "timeout") {
						// Find and update the synthetic ask to mark it as complete
						const currentMessages = get(chatMessagesAtom)
						const messageIndex = currentMessages.findIndex((msg) => {
							if (msg.type === "ask" && msg.ask === "command_output" && msg.text) {
								try {
									const data = JSON.parse(msg.text)
									return data.executionId === statusData.executionId
								} catch {
									return false
								}
							}
							return false
						})

						if (messageIndex !== -1) {
							const pendingUpdate = newPendingUpdates.get(statusData.executionId)
							const updatedAsk: ExtensionChatMessage = {
								...currentMessages[messageIndex]!,
								text: JSON.stringify({
									executionId: statusData.executionId,
									command: pendingUpdate?.command || "",
									output: pendingUpdate?.output || "",
								}),
								partial: false, // Command completed
								isAnswered: false, // Still needs user response
							}

							const newMessages = [...currentMessages]
							newMessages[messageIndex] = updatedAsk
							set(updateChatMessagesAtom, newMessages)
						}
					}
				} catch (error) {
					logs.error("Error handling commandExecutionStatus", "effects", { error })
				}
				break
			}

			default:
				logs.debug(`Unhandled message type: ${message.type}`, "effects")
		}

		// Check for completion_result in chatMessages (for CI mode)
		if (message.state?.chatMessages) {
			const lastMessage = message.state.chatMessages[message.state.chatMessages.length - 1]
			if (lastMessage?.type === "ask" && lastMessage?.ask === "completion_result") {
				logs.info("Completion result detected in state update", "effects")
				set(ciCompletionDetectedAtom, true)
			}
		}
	} catch (error) {
		logs.error("Error handling extension message", "effects", { error, message })
	}
})

/**
 * Effect atom to process buffered messages
 * This is called after the service becomes ready
 */
export const processMessageBufferAtom = atom(null, (get, set) => {
	// Prevent concurrent processing
	if (get(isProcessingBufferAtom)) {
		return
	}

	const buffer = get(messageBufferAtom)
	if (buffer.length === 0) {
		return
	}

	try {
		set(isProcessingBufferAtom, true)
		logs.info(`Processing ${buffer.length} buffered messages`, "effects")

		// Process each buffered message
		for (const message of buffer) {
			set(messageHandlerEffectAtom, message)
		}

		// Clear the buffer
		set(messageBufferAtom, [])
		logs.info("Buffered messages processed", "effects")
	} catch (error) {
		logs.error("Error processing message buffer", "effects", { error })
	} finally {
		set(isProcessingBufferAtom, false)
	}
})

/**
 * Effect atom to dispose the service
 * This cleans up resources and removes event listeners
 */
export const disposeServiceEffectAtom = atom(null, async (get, set) => {
	const service = get(extensionServiceAtom)

	if (!service) {
		logs.warn("No service to dispose", "effects")
		return
	}

	try {
		logs.info("Disposing ExtensionService...", "effects")

		// Clear any buffered messages
		set(messageBufferAtom, [])

		// Clear pending output updates
		set(pendingOutputUpdatesAtom, new Map<string, { output: string; command?: string; completed?: boolean }>())

		// Clear command output ask tracking
		set(commandOutputAskShownAtom, new Map<string, boolean>())

		// Dispose the service
		await service.dispose()

		// Clear state
		set(updateExtensionStateAtom, null)
		set(setServiceReadyAtom, false)

		logs.info("ExtensionService disposed successfully", "effects")
	} catch (error) {
		logs.error("Error disposing ExtensionService", "effects", { error })
		const err = error instanceof Error ? error : new Error(String(error))
		set(setServiceErrorAtom, err)
		throw err
	}
})

/**
 * Derived atom to get the message buffer size
 * Useful for debugging and monitoring
 */
export const messageBufferSizeAtom = atom<number>((get) => {
	const buffer = get(messageBufferAtom)
	return buffer.length
})

/**
 * Derived atom to check if there are buffered messages
 */
export const hasBufferedMessagesAtom = atom<boolean>((get) => {
	return get(messageBufferSizeAtom) > 0
})

/**
 * Action atom to clear the message buffer
 * Useful for error recovery
 */
export const clearMessageBufferAtom = atom(null, (get, set) => {
	const bufferSize = get(messageBufferSizeAtom)
	if (bufferSize > 0) {
		logs.warn(`Clearing ${bufferSize} buffered messages`, "effects")
		set(messageBufferAtom, [])
	}
})
