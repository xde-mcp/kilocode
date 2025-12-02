import { useEffect } from "react"
import { useSetAtom } from "jotai"
import type { ClineMessage } from "@roo-code/types"
import { updateSessionMessagesAtom } from "../atoms/messages"
import {
	upsertSessionAtom,
	removeSessionAtom,
	updateSessionStatusAtom,
	selectedSessionIdAtom,
	type AgentSession,
} from "../atoms/sessions"

interface AgentManagerState {
	sessions: AgentSession[]
	selectedId: string | null
}

interface ChatMessagesMessage {
	type: "agentManager.chatMessages"
	sessionId: string
	messages: ClineMessage[]
}

interface StateMessage {
	type: "agentManager.state"
	state: AgentManagerState
}

type ExtensionMessage = ChatMessagesMessage | StateMessage | { type: string; [key: string]: unknown }

/**
 * Hook that listens for messages from the extension and updates Jotai state.
 * This bridges the VS Code extension IPC with the Jotai state management.
 */
export function useAgentManagerMessages() {
	const updateSessionMessages = useSetAtom(updateSessionMessagesAtom)
	const upsertSession = useSetAtom(upsertSessionAtom)
	const removeSession = useSetAtom(removeSessionAtom)
	const updateSessionStatus = useSetAtom(updateSessionStatusAtom)
	const setSelectedSessionId = useSetAtom(selectedSessionIdAtom)

	useEffect(() => {
		function handleMessage(event: MessageEvent<ExtensionMessage>) {
			const message = event.data

			switch (message.type) {
				case "agentManager.chatMessages": {
					const { sessionId, messages } = message as ChatMessagesMessage
					updateSessionMessages({ sessionId, messages })
					break
				}

				case "agentManager.state": {
					const { state } = message as StateMessage
					// Sync sessions from extension state to Jotai
					// This handles initial load and session lifecycle events
					for (const session of state.sessions) {
						upsertSession(session)
					}
					if (state.selectedId !== undefined) {
						setSelectedSessionId(state.selectedId)
					}
					break
				}
			}
		}

		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [updateSessionMessages, upsertSession, removeSession, updateSessionStatus, setSelectedSessionId])
}
