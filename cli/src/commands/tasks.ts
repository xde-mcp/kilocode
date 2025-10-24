/**
 * /tasks command - View and manage task history
 */

import type { Command, ArgumentProviderContext } from "./core/types.js"
import type { HistoryItem } from "@roo-code/types"

/**
 * Map kebab-case sort options to camelCase
 */
const SORT_OPTION_MAP: Record<string, string> = {
	newest: "newest",
	oldest: "oldest",
	"most-expensive": "mostExpensive",
	"most-tokens": "mostTokens",
	"most-relevant": "mostRelevant",
}

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
 * Format cost as a currency string
 */
function formatCost(cost: number): string {
	if (cost === 0) return "$0.00"
	if (cost < 0.01) return "<$0.01"
	return `$${cost.toFixed(2)}`
}

/**
 * Format tokens as a readable string
 */
function formatTokens(tokens: number): string {
	if (tokens >= 1000000) {
		return `${(tokens / 1000000).toFixed(1)}M`
	}
	if (tokens >= 1000) {
		return `${(tokens / 1000).toFixed(1)}K`
	}
	return tokens.toString()
}

/**
 * Truncate text to a maximum length
 */
function truncate(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text
	return text.substring(0, maxLength - 3) + "..."
}

/**
 * Show current task history
 */
async function showTaskHistory(context: any): Promise<void> {
	const { taskHistoryData, taskHistoryLoading, taskHistoryError, fetchTaskHistory, addMessage } = context

	// If loading, show loading message
	if (taskHistoryLoading) {
		addMessage({
			id: Date.now().toString(),
			type: "system",
			content: "Loading task history...",
			ts: Date.now(),
		})
		return
	}

	// If error, show error message
	if (taskHistoryError) {
		addMessage({
			id: Date.now().toString(),
			type: "error",
			content: `Failed to load task history: ${taskHistoryError}`,
			ts: Date.now(),
		})
		return
	}

	// If no data, fetch it
	if (!taskHistoryData) {
		await fetchTaskHistory()
		addMessage({
			id: Date.now().toString(),
			type: "system",
			content: "Loading task history...",
			ts: Date.now(),
		})
		return
	}

	const { historyItems, pageIndex, pageCount } = taskHistoryData

	if (historyItems.length === 0) {
		addMessage({
			id: Date.now().toString(),
			type: "system",
			content: "No tasks found in history.",
			ts: Date.now(),
		})
		return
	}

	// Build the task list display
	let content = `**Task History** (Page ${pageIndex + 1}/${pageCount}):\n\n`

	historyItems.forEach((task: HistoryItem, index: number) => {
		const taskNum = pageIndex * 10 + index + 1
		const taskText = truncate(task.task || "Untitled task", 60)
		const time = formatRelativeTime(task.ts || 0)
		const cost = formatCost(task.totalCost || 0)
		const totalTokens = (task.tokensIn || 0) + (task.tokensOut || 0)
		const tokens = formatTokens(totalTokens)
		const favorite = task.isFavorited ? "⭐ " : ""

		content += `${favorite}**${taskNum}.** ${taskText}\n`
		content += `   ID: ${task.id} | ${time} | ${cost} | ${tokens} tokens\n\n`
	})

	addMessage({
		id: Date.now().toString(),
		type: "system",
		content,
		ts: Date.now(),
	})
}

/**
 * Search tasks
 */
async function searchTasks(context: any, query: string): Promise<void> {
	const { updateTaskHistoryFilters, addMessage } = context

	if (!query) {
		addMessage({
			id: Date.now().toString(),
			type: "error",
			content: "Usage: /tasks search <query>",
			ts: Date.now(),
		})
		return
	}

	await updateTaskHistoryFilters({ search: query, sort: "mostRelevant" })

	addMessage({
		id: Date.now().toString(),
		type: "system",
		content: `Searching for "${query}"...`,
		ts: Date.now(),
	})

	// Show results after a brief delay
	setTimeout(() => showTaskHistory(context), 100)
}

/**
 * Select a task by ID
 */
async function selectTask(context: any, taskId: string): Promise<void> {
	const { sendWebviewMessage, addMessage, replaceMessages, refreshTerminal } = context

	if (!taskId) {
		addMessage({
			id: Date.now().toString(),
			type: "error",
			content: "Usage: /tasks select <task-id>",
			ts: Date.now(),
		})
		return
	}

	try {
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
				content: `Switching to task ${taskId}...`,
				ts: 2,
			},
		])

		await refreshTerminal()

		sendWebviewMessage({
			type: "showTaskWithId",
			text: taskId,
		})
	} catch (error) {
		addMessage({
			id: Date.now().toString(),
			type: "error",
			content: `Failed to switch to task: ${error instanceof Error ? error.message : String(error)}`,
			ts: Date.now(),
		})
	}
}

/**
 * Change page
 */
async function changePage(context: any, pageNum: string): Promise<void> {
	const { taskHistoryData, changeTaskHistoryPage, addMessage } = context

	if (!taskHistoryData) {
		addMessage({
			id: Date.now().toString(),
			type: "error",
			content: "No task history loaded. Use /tasks to load history first.",
			ts: Date.now(),
		})
		return
	}

	const pageIndex = parseInt(pageNum, 10) - 1 // Convert to 0-based index

	if (isNaN(pageIndex) || pageIndex < 0 || pageIndex >= taskHistoryData.pageCount) {
		addMessage({
			id: Date.now().toString(),
			type: "error",
			content: `Invalid page number. Must be between 1 and ${taskHistoryData.pageCount}.`,
			ts: Date.now(),
		})
		return
	}

	await changeTaskHistoryPage(pageIndex)

	addMessage({
		id: Date.now().toString(),
		type: "system",
		content: `Loading page ${pageIndex + 1}...`,
		ts: Date.now(),
	})

	// Show results after a brief delay
	setTimeout(() => showTaskHistory(context), 100)
}

/**
 * Go to next page
 */
async function nextPage(context: any): Promise<void> {
	const { taskHistoryData, nextTaskHistoryPage, addMessage } = context

	if (!taskHistoryData) {
		addMessage({
			id: Date.now().toString(),
			type: "error",
			content: "No task history loaded. Use /tasks to load history first.",
			ts: Date.now(),
		})
		return
	}

	if (taskHistoryData.pageIndex >= taskHistoryData.pageCount - 1) {
		addMessage({
			id: Date.now().toString(),
			type: "system",
			content: "Already on the last page.",
			ts: Date.now(),
		})
		return
	}

	await nextTaskHistoryPage()

	addMessage({
		id: Date.now().toString(),
		type: "system",
		content: "Loading next page...",
		ts: Date.now(),
	})

	// Show results after a brief delay
	setTimeout(() => showTaskHistory(context), 100)
}

/**
 * Go to previous page
 */
async function previousPage(context: any): Promise<void> {
	const { taskHistoryData, previousTaskHistoryPage, addMessage } = context

	if (!taskHistoryData) {
		addMessage({
			id: Date.now().toString(),
			type: "error",
			content: "No task history loaded. Use /tasks to load history first.",
			ts: Date.now(),
		})
		return
	}

	if (taskHistoryData.pageIndex <= 0) {
		addMessage({
			id: Date.now().toString(),
			type: "system",
			content: "Already on the first page.",
			ts: Date.now(),
		})
		return
	}

	await previousTaskHistoryPage()

	addMessage({
		id: Date.now().toString(),
		type: "system",
		content: "Loading previous page...",
		ts: Date.now(),
	})

	// Show results after a brief delay
	setTimeout(() => showTaskHistory(context), 100)
}

/**
 * Change sort order
 */
async function changeSortOrder(context: any, sortOption: string): Promise<void> {
	const { updateTaskHistoryFilters, addMessage } = context

	const validSorts = Object.keys(SORT_OPTION_MAP)
	const mappedSort = SORT_OPTION_MAP[sortOption]

	if (!mappedSort) {
		addMessage({
			id: Date.now().toString(),
			type: "error",
			content: `Invalid sort option. Valid options: ${validSorts.join(", ")}`,
			ts: Date.now(),
		})
		return
	}

	await updateTaskHistoryFilters({ sort: mappedSort as any })

	addMessage({
		id: Date.now().toString(),
		type: "system",
		content: `Sorting by ${sortOption}...`,
		ts: Date.now(),
	})

	// Show results after a brief delay
	setTimeout(() => showTaskHistory(context), 100)
}

/**
 * Change filter
 */
async function changeFilter(context: any, filterOption: string): Promise<void> {
	const { updateTaskHistoryFilters, addMessage } = context

	switch (filterOption) {
		case "current":
			await updateTaskHistoryFilters({ workspace: "current" })
			addMessage({
				id: Date.now().toString(),
				type: "system",
				content: "Filtering to current workspace...",
				ts: Date.now(),
			})
			break

		case "all":
			await updateTaskHistoryFilters({ workspace: "all" })
			addMessage({
				id: Date.now().toString(),
				type: "system",
				content: "Showing all workspaces...",
				ts: Date.now(),
			})
			break

		case "favorites":
			await updateTaskHistoryFilters({ favoritesOnly: true })
			addMessage({
				id: Date.now().toString(),
				type: "system",
				content: "Showing favorites only...",
				ts: Date.now(),
			})
			break

		case "all-tasks":
			await updateTaskHistoryFilters({ favoritesOnly: false })
			addMessage({
				id: Date.now().toString(),
				type: "system",
				content: "Showing all tasks...",
				ts: Date.now(),
			})
			break

		default:
			addMessage({
				id: Date.now().toString(),
				type: "error",
				content: "Invalid filter option. Valid options: current, all, favorites, all-tasks",
				ts: Date.now(),
			})
			return
	}

	// Show results after a brief delay
	setTimeout(() => showTaskHistory(context), 100)
}

/**
 * Autocomplete provider for task IDs
 */
async function taskIdAutocompleteProvider(context: ArgumentProviderContext) {
	if (!context.commandContext) {
		return []
	}

	const { taskHistoryData } = context.commandContext

	if (!taskHistoryData || !taskHistoryData.historyItems) {
		return []
	}

	return taskHistoryData.historyItems.map((task: HistoryItem) => ({
		value: task.id,
		title: truncate(task.task || "Untitled task", 50),
		description: `${formatRelativeTime(task.ts || 0)} | ${formatCost(task.totalCost || 0)}`,
		matchScore: 1.0,
		highlightedValue: task.id,
	}))
}

/**
 * Autocomplete provider for sort options
 */
async function sortOptionAutocompleteProvider(_context: ArgumentProviderContext) {
	return Object.keys(SORT_OPTION_MAP).map((option) => ({
		value: option,
		description: `Sort by ${option}`,
		matchScore: 1.0,
		highlightedValue: option,
	}))
}

/**
 * Autocomplete provider for filter options
 */
async function filterOptionAutocompleteProvider(_context: ArgumentProviderContext) {
	return [
		{ value: "current", description: "Current workspace only", matchScore: 1.0, highlightedValue: "current" },
		{ value: "all", description: "All workspaces", matchScore: 1.0, highlightedValue: "all" },
		{ value: "favorites", description: "Favorites only", matchScore: 1.0, highlightedValue: "favorites" },
		{ value: "all-tasks", description: "All tasks (no filter)", matchScore: 1.0, highlightedValue: "all-tasks" },
	]
}

export const tasksCommand: Command = {
	name: "tasks",
	aliases: ["t", "history"],
	description: "View and manage task history",
	usage: "/tasks [subcommand] [args]",
	examples: [
		"/tasks",
		"/tasks search bug fix",
		"/tasks select abc123",
		"/tasks page 2",
		"/tasks next",
		"/tasks prev",
		"/tasks sort most-expensive",
		"/tasks filter favorites",
	],
	category: "navigation",
	priority: 9,
	arguments: [
		{
			name: "subcommand",
			description: "Subcommand: search, select, page, next, prev, sort, filter",
			required: false,
			values: [
				{ value: "search", description: "Search tasks by query" },
				{ value: "select", description: "Switch to a specific task" },
				{ value: "page", description: "Go to a specific page" },
				{ value: "next", description: "Go to next page" },
				{ value: "prev", description: "Go to previous page" },
				{ value: "sort", description: "Change sort order" },
				{ value: "filter", description: "Filter tasks" },
			],
		},
		{
			name: "argument",
			description: "Argument for the subcommand",
			required: false,
			conditionalProviders: [
				{
					condition: (context) => context.getArgument("subcommand") === "select",
					provider: taskIdAutocompleteProvider,
				},
				{
					condition: (context) => context.getArgument("subcommand") === "sort",
					provider: sortOptionAutocompleteProvider,
				},
				{
					condition: (context) => context.getArgument("subcommand") === "filter",
					provider: filterOptionAutocompleteProvider,
				},
			],
		},
	],
	handler: async (context) => {
		const { args } = context

		// No arguments - show current task history
		if (args.length === 0) {
			await showTaskHistory(context)
			return
		}

		const subcommand = args[0]?.toLowerCase()
		if (!subcommand) {
			await showTaskHistory(context)
			return
		}

		// Handle subcommands
		switch (subcommand) {
			case "search":
				await searchTasks(context, args.slice(1).join(" "))
				break

			case "select":
				await selectTask(context, args[1] || "")
				break

			case "page":
				await changePage(context, args[1] || "")
				break

			case "next":
				await nextPage(context)
				break

			case "prev":
			case "previous":
				await previousPage(context)
				break

			case "sort":
				await changeSortOrder(context, args[1] || "")
				break

			case "filter":
				await changeFilter(context, args[1] || "")
				break

			default:
				context.addMessage({
					id: Date.now().toString(),
					type: "error",
					content: `Unknown subcommand "${subcommand}". Available: search, select, page, next, prev, sort, filter`,
					ts: Date.now(),
				})
		}
	},
}
