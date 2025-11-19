/**
 * /session command - Manage session information
 */

import { generateMessage } from "../ui/utils/messages.js"
import type { Command, CommandContext, ArgumentProviderContext, ArgumentSuggestion } from "./core/types.js"
import { SessionService } from "../services/session.js"
import { SessionClient } from "../services/sessionClient.js"

/**
 * Format a timestamp as a relative time string
 */
function formatRelativeTime(ts: number): string {
	const now = Date.now()
	const diff = now - ts
	const seconds = Math.floor(diff / 1000)
	const minutes = Math.floor(seconds / 60)
	const hours = Math.floor(minutes / 60)
	const days = Math.floor(hours / 24)

	if (days > 0) return `${days}d ago`
	if (hours > 0) return `${hours}h ago`
	if (minutes > 0) return `${minutes}m ago`
	return "just now"
}

/**
 * Show current session ID
 */
async function showSessionId(context: CommandContext): Promise<void> {
	const { addMessage } = context

	const sessionService = SessionService.init()
	const sessionId = sessionService.sessionId

	if (!sessionId) {
		addMessage({
			...generateMessage(),
			type: "system",
			content: "No active session. Start a new task to create a session.",
		})
		return
	}

	addMessage({
		...generateMessage(),
		type: "system",
		content: `**Current Session ID:** ${sessionId}`,
	})
}

/**
 * List all sessions
 */
async function listSessions(context: CommandContext): Promise<void> {
	const { addMessage } = context
	const sessionService = SessionService.init()
	const sessionClient = SessionClient.getInstance()

	try {
		const result = await sessionClient.list({ limit: 50 })
		const { sessions } = result

		if (sessions.length === 0) {
			addMessage({
				...generateMessage(),
				type: "system",
				content: "No sessions found.",
			})
			return
		}

		// Format and display sessions
		let content = `**Available Sessions:**\n\n`
		sessions.forEach((session, index) => {
			const isActive = session.id === sessionService.sessionId ? " 🟢 [Active]" : ""
			const title = session.title || "Untitled"
			const createdTime = formatRelativeTime(new Date(session.created_at).getTime())

			content += `${index + 1}. **${title}**${isActive}\n`
			content += `   ID: \`${session.id}\`\n`
			content += `   Created: ${createdTime}\n\n`
		})

		if (result.nextCursor) {
			content += `\n_Showing first ${sessions.length} sessions. More available._`
		}

		addMessage({
			...generateMessage(),
			type: "system",
			content,
		})
	} catch (error) {
		addMessage({
			...generateMessage(),
			type: "error",
			content: `Failed to list sessions: ${error instanceof Error ? error.message : String(error)}`,
		})
	}
}

/**
 * Select a specific session
 */
async function selectSession(context: CommandContext, sessionId: string): Promise<void> {
	const { addMessage, replaceMessages, refreshTerminal } = context
	const sessionService = SessionService.init()

	if (!sessionId) {
		addMessage({
			...generateMessage(),
			type: "error",
			content: "Usage: /session select <sessionId>",
		})
		return
	}

	try {
		// Clear messages and show loading state
		const now = Date.now()
		replaceMessages([
			{
				id: `empty-${now}`,
				type: "empty",
				content: "",
				ts: 1,
			},
			{
				id: `system-${now + 1}`,
				type: "system",
				content: `Restoring session \`${sessionId}\`...`,
				ts: 2,
			},
		])

		await refreshTerminal()
		await sessionService.restoreSession(sessionId, true)

		// Success message is handled by restoreSession via extension messages
	} catch (error) {
		addMessage({
			...generateMessage(),
			type: "error",
			content: `Failed to restore session: ${error instanceof Error ? error.message : String(error)}`,
		})
	}
}

/**
 * Autocomplete provider for session IDs
 */
async function sessionIdAutocompleteProvider(_context: ArgumentProviderContext): Promise<ArgumentSuggestion[]> {
	const sessionClient = SessionClient.getInstance()

	try {
		const result = await sessionClient.list({ limit: 20 })
		return result.sessions.map((session, index) => ({
			value: session.id,
			title: session.title || "Untitled",
			description: `Created: ${new Date(session.created_at).toLocaleDateString()}`,
			matchScore: 100 - index,
			highlightedValue: session.id,
		}))
	} catch (_error) {
		return []
	}
}

export const sessionCommand: Command = {
	name: "session",
	aliases: [],
	description: "Manage sessions",
	usage: "/session [subcommand] [args]",
	examples: ["/session show", "/session list", "/session select <sessionId>"],
	category: "system",
	priority: 5,
	arguments: [
		{
			name: "subcommand",
			description: "Subcommand: show, list, select",
			required: false,
			values: [
				{ value: "show", description: "Display current session ID" },
				{ value: "list", description: "List all sessions" },
				{ value: "select", description: "Restore a session" },
			],
		},
		{
			name: "sessionId",
			description: "Session ID to restore (for 'select' subcommand)",
			required: false,
			provider: sessionIdAutocompleteProvider,
		},
	],
	handler: async (context) => {
		const { args, addMessage } = context

		if (args.length === 0) {
			addMessage({
				...generateMessage(),
				type: "system",
				content: "Usage: /session [show|list|select] [sessionId]",
			})
			return
		}

		const subcommand = args[0]?.toLowerCase()

		switch (subcommand) {
			case "show":
				await showSessionId(context)
				break
			case "list":
				await listSessions(context)
				break
			case "select":
				await selectSession(context, args[1] || "")
				break
			default:
				addMessage({
					...generateMessage(),
					type: "error",
					content: `Unknown subcommand "${subcommand}". Available: show, list, select`,
				})
		}
	},
}
