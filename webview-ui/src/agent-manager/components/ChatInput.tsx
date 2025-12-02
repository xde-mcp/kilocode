import React from "react"

interface ChatInputProps {
	sessionId: string
	disabled?: boolean
}

/**
 * ChatInput - Disabled for MVP
 *
 * Follow-up messages are not supported in the CLI JSON mode.
 * Each agent session runs to completion without user interaction.
 */
export const ChatInput: React.FC<ChatInputProps> = ({ disabled = false }) => {
	if (disabled) {
		return null
	}

	// Show placeholder when agent is "running" but we can't send messages
	return (
		<div className="chat-input-container">
			<div className="chat-input-disabled">
				<span>Agent running in autonomous mode</span>
			</div>
		</div>
	)
}
