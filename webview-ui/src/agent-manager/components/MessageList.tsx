import React, { useEffect, useRef } from "react"
import { useAtomValue } from "jotai"
import { sessionMessagesAtomFamily } from "../state/atoms/messages"
import type { ClineMessage } from "@roo-code/types"
import { SimpleMarkdown } from "./SimpleMarkdown"
import {
	MessageCircle,
	MessageCircleQuestion,
	ArrowRightLeft,
	TerminalSquare,
	CheckCircle2,
	AlertCircle,
	User,
} from "lucide-react"

interface MessageListProps {
	sessionId: string
}

/**
 * Displays messages for a session from Jotai state.
 */
export function MessageList({ sessionId }: MessageListProps) {
	const messages = useAtomValue(sessionMessagesAtomFamily(sessionId))
	const containerRef = useRef<HTMLDivElement>(null)

	// Auto-scroll to bottom when new messages arrive
	useEffect(() => {
		if (containerRef.current) {
			// Use requestAnimationFrame to ensure the DOM has updated
			requestAnimationFrame(() => {
				if (containerRef.current) {
					containerRef.current.scrollTop = containerRef.current.scrollHeight
				}
			})
		}
	}, [messages])

	if (messages.length === 0) {
		return (
			<div className="messages-empty">
				<MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-20" />
				<p>Waiting for agent response...</p>
			</div>
		)
	}

	return (
		<div className="messages-container" ref={containerRef}>
			<div className="messages-list">
				{messages.map((msg, idx) => (
					<MessageItem key={msg.ts || idx} message={msg} />
				))}
			</div>
		</div>
	)
}

function safeJsonParse<T>(text: string | undefined): T | null {
	if (!text) return null
	try {
		return JSON.parse(text) as T
	} catch (error) {
		// Debug-level log for JSON parse failures (visible in browser dev tools)
		console.debug("[MessageList] JSON parse failed:", { text: text.slice(0, 100), error })
		return null
	}
}

function MessageItem({ message }: { message: ClineMessage }) {
	// --- 1. Determine Message Style & Content ---

	let icon = <MessageCircle size={16} />
	let title = "Kilo said"
	let content: React.ReactNode = null
	let extraInfo: React.ReactNode = null

	// --- SAY ---
	if (message.type === "say") {
		switch (message.say) {
			case "api_req_started": {
				icon = <ArrowRightLeft size={16} className="opacity-70" />
				title = "API Request"
				const info = safeJsonParse<{ cost?: number }>(message.text)
				if (info?.cost !== undefined) {
					extraInfo = <span className="message-cost">$${info.cost.toFixed(4)}</span>
				}
				// Don't show content for API req started, just header
				content = null
				break
			}
			case "text": {
				icon = <MessageCircle size={16} />
				title = "Kilo said"
				content = <SimpleMarkdown content={message.text || ""} />
				break
			}
			case "user_feedback": {
				icon = <User size={16} />
				title = "You said"
				content = <SimpleMarkdown content={message.text || ""} />
				break
			}
			case "completion_result": {
				icon = <CheckCircle2 size={16} className="text-green-500" />
				title = "Task Completed"
				content = <SimpleMarkdown content={message.text || ""} />
				break
			}
			case "error": {
				icon = <AlertCircle size={16} className="text-red-500" />
				title = "Error"
				content = <SimpleMarkdown content={message.text || ""} />
				break
			}
			case "api_req_finished":
				return null // Skip
			default:
				content = <SimpleMarkdown content={message.text || ""} />
		}
	}

	// --- ASK ---
	if (message.type === "ask") {
		switch (message.ask) {
			case "followup": {
				icon = <MessageCircleQuestion size={16} />
				title = "Kilo Code has a question"
				const info = safeJsonParse<{ question: string; suggest?: string[] }>(message.text)
				content = (
					<div>
						<SimpleMarkdown content={info?.question || message.text || ""} />
						{/* We could render suggestions here, but for MVP text is fine */}
					</div>
				)
				break
			}
			case "command": {
				icon = <TerminalSquare size={16} />
				title = "Kilo wants to run a command"
				content = <SimpleMarkdown content={`\`${message.text}\``} />
				break
			}
			case "tool": {
				// Tool asks usually have JSON content describing the tool use
				icon = <TerminalSquare size={16} />
				title = "Kilo wants to use a tool"
				// Try to parse tool use for better display
				const toolInfo = safeJsonParse<{ tool: string; path?: string }>(message.text)
				if (toolInfo) {
					const toolDetails = toolInfo.path ? `(${toolInfo.path})` : ""
					content = <SimpleMarkdown content={`Using tool: **${toolInfo.tool}** ${toolDetails}`} />
				} else {
					content = <SimpleMarkdown content={message.text || ""} />
				}
				break
			}
			default:
				content = <SimpleMarkdown content={message.text || ""} />
		}
	}

	if (message.say === "api_req_started" && !extraInfo) {
		// Compact view for API requests without cost yet or just minimal info
		// If you prefer to hide them completely until finished or show a spinner:
		// For now, let's show the header.
	}

	return (
		<div className={`message-item ${message.type === "say" && message.say === "api_req_started" ? "api-req" : ""}`}>
			<div className="message-icon">{icon}</div>
			<div className="message-content-wrapper">
				<div className="message-header">
					<span className="message-author">{title}</span>
					<span className="message-ts">{new Date(message.ts).toLocaleTimeString()}</span>
					{extraInfo}
				</div>
				{content && <div className="message-body">{content}</div>}
			</div>
		</div>
	)
}
