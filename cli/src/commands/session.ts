/**
 * /session command - Manage session information
 */

import { generateMessage } from "../ui/utils/messages.js"
import type { Command, CommandContext } from "./core/types.js"
import { SessionService } from "../services/session.js"

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

export const sessionCommand: Command = {
	name: "session",
	aliases: [],
	description: "Manage session information",
	usage: "/session [subcommand]",
	examples: ["/session show"],
	category: "system",
	priority: 5,
	arguments: [
		{
			name: "subcommand",
			description: "Subcommand: show",
			required: false,
			values: [{ value: "show", description: "Display current session ID" }],
		},
	],
	handler: async (context) => {
		const { args, addMessage } = context

		// No arguments - show help
		if (args.length === 0) {
			addMessage({
				...generateMessage(),
				type: "system",
				content:
					"**Session Command**\n\nUsage: /session [subcommand]\n\nAvailable subcommands:\n- **show** - Display current session ID\n\nExample: /session show",
			})
			return
		}

		const subcommand = args[0]?.toLowerCase()

		// Handle subcommands
		switch (subcommand) {
			case "show":
				await showSessionId(context)
				break

			default:
				addMessage({
					...generateMessage(),
					type: "error",
					content: `Unknown subcommand "${subcommand}". Available: show`,
				})
		}
	},
}
