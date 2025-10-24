/**
 * Hook for managing task history
 */

import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { useCallback } from "react"
import {
	taskHistoryDataAtom,
	taskHistoryFiltersAtom,
	taskHistoryPageIndexAtom,
	taskHistoryLoadingAtom,
	taskHistoryErrorAtom,
	updateTaskHistoryFiltersAtom,
	changeTaskHistoryPageAtom,
	type TaskHistoryFilters,
} from "../atoms/taskHistory.js"
import { extensionServiceAtom } from "../atoms/service.js"

export function useTaskHistory() {
	const service = useAtomValue(extensionServiceAtom)
	const [data] = useAtom(taskHistoryDataAtom)
	const [filters] = useAtom(taskHistoryFiltersAtom)
	const [pageIndex] = useAtom(taskHistoryPageIndexAtom)
	const loading = useAtomValue(taskHistoryLoadingAtom)
	const error = useAtomValue(taskHistoryErrorAtom)
	const updateFilters = useSetAtom(updateTaskHistoryFiltersAtom)
	const changePage = useSetAtom(changeTaskHistoryPageAtom)

	/**
	 * Fetch task history from the extension
	 */
	const fetchTaskHistory = useCallback(async () => {
		if (!service) {
			return
		}

		try {
			// Send task history request to extension
			await service.sendWebviewMessage({
				type: "taskHistoryRequest",
				payload: {
					requestId: Date.now().toString(),
					workspace: filters.workspace,
					sort: filters.sort,
					favoritesOnly: filters.favoritesOnly,
					pageIndex,
					search: filters.search,
				},
			})
		} catch (err) {
			console.error("Failed to fetch task history:", err)
		}
	}, [service, filters, pageIndex])

	/**
	 * Update filters and fetch new data
	 */
	const updateFiltersAndFetch = useCallback(
		async (newFilters: Partial<TaskHistoryFilters>) => {
			updateFilters(newFilters)
			// Wait a bit for the atom to update
			setTimeout(() => fetchTaskHistory(), 50)
		},
		[updateFilters, fetchTaskHistory],
	)

	/**
	 * Change page and fetch new data
	 */
	const changePageAndFetch = useCallback(
		async (newPageIndex: number) => {
			changePage(newPageIndex)
			// Wait a bit for the atom to update
			setTimeout(() => fetchTaskHistory(), 50)
		},
		[changePage, fetchTaskHistory],
	)

	/**
	 * Go to next page
	 */
	const nextPage = useCallback(async () => {
		if (data && pageIndex < data.pageCount - 1) {
			await changePageAndFetch(pageIndex + 1)
		}
	}, [data, pageIndex, changePageAndFetch])

	/**
	 * Go to previous page
	 */
	const previousPage = useCallback(async () => {
		if (pageIndex > 0) {
			await changePageAndFetch(pageIndex - 1)
		}
	}, [pageIndex, changePageAndFetch])

	return {
		data,
		filters,
		pageIndex,
		loading,
		error,
		fetchTaskHistory,
		updateFilters: updateFiltersAndFetch,
		changePage: changePageAndFetch,
		nextPage,
		previousPage,
	}
}
