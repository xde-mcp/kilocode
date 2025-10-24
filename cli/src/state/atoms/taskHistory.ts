/**
 * Task history state management atoms
 */

import { atom } from "jotai"
import type { HistoryItem } from "@roo-code/types"

/**
 * Task history response data
 */
export interface TaskHistoryData {
	historyItems: HistoryItem[]
	pageIndex: number
	pageCount: number
}

/**
 * Task history filter options
 */
export interface TaskHistoryFilters {
	workspace: "current" | "all"
	sort: "newest" | "oldest" | "mostExpensive" | "mostTokens" | "mostRelevant"
	favoritesOnly: boolean
	search?: string
}

/**
 * Current task history data
 */
export const taskHistoryDataAtom = atom<TaskHistoryData | null>(null)

/**
 * Current filters for task history
 */
export const taskHistoryFiltersAtom = atom<TaskHistoryFilters>({
	workspace: "current",
	sort: "newest",
	favoritesOnly: false,
})

/**
 * Current page index (0-based)
 */
export const taskHistoryPageIndexAtom = atom<number>(0)

/**
 * Loading state for task history
 */
export const taskHistoryLoadingAtom = atom<boolean>(false)

/**
 * Error state for task history
 */
export const taskHistoryErrorAtom = atom<string | null>(null)

/**
 * Request ID counter for tracking responses
 */
export const taskHistoryRequestIdAtom = atom<number>(0)

/**
 * Action atom to fetch task history
 */
export const fetchTaskHistoryAtom = atom(null, async (get, set) => {
	const filters = get(taskHistoryFiltersAtom)
	const pageIndex = get(taskHistoryPageIndexAtom)
	const requestId = get(taskHistoryRequestIdAtom) + 1

	set(taskHistoryRequestIdAtom, requestId)
	set(taskHistoryLoadingAtom, true)
	set(taskHistoryErrorAtom, null)

	// This will be connected to the extension service
	return {
		requestId: requestId.toString(),
		...filters,
		pageIndex,
	}
})

/**
 * Action atom to update filters
 */
export const updateTaskHistoryFiltersAtom = atom(null, (get, set, filters: Partial<TaskHistoryFilters>) => {
	const currentFilters = get(taskHistoryFiltersAtom)
	set(taskHistoryFiltersAtom, { ...currentFilters, ...filters })
	// Reset to first page when filters change
	set(taskHistoryPageIndexAtom, 0)
})

/**
 * Action atom to change page
 */
export const changeTaskHistoryPageAtom = atom(null, (get, set, pageIndex: number) => {
	const data = get(taskHistoryDataAtom)
	if (data && pageIndex >= 0 && pageIndex < data.pageCount) {
		set(taskHistoryPageIndexAtom, pageIndex)
	}
})
