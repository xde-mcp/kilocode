import { useEffect, useState } from "react"
import { vscode } from "@/utils/vscode"
import {
	type ManagedIndexerState,
	type WorkspaceFolderState,
	parseManagedIndexerStateMessage,
} from "../kilocode/managedIndexerSchema"

/**
 * Default/initial state for the managed indexer
 */
const DEFAULT_STATE: ManagedIndexerState = {
	isEnabled: false,
	isActive: false,
	workspaceFolders: [],
}

/**
 * Comprehensive hook for managing all managed indexer state
 * Replaces the legacy useManagedCodeIndexingEnabled hook
 *
 * @returns {ManagedIndexerState} The complete managed indexer state with type-safe parsing
 *
 * @example
 * ```tsx
 * const { isEnabled, isActive, workspaceFolders } = useManagedIndexerState()
 *
 * if (!isEnabled) {
 *   return <LocalIndexingUI />
 * }
 *
 * return (
 *   <div>
 *     {workspaceFolders.map(folder => (
 *       <WorkspaceFolderStatus key={folder.workspaceFolderPath} folder={folder} />
 *     ))}
 *   </div>
 * )
 * ```
 */
export function useManagedIndexerState(): ManagedIndexerState {
	const [state, setState] = useState<ManagedIndexerState>(DEFAULT_STATE)

	useEffect(() => {
		// Request initial state
		vscode.postMessage({ type: "requestManagedIndexerState" as any })

		const handleMessage = (event: MessageEvent<any>) => {
			if (event.data.type === "managedIndexerState") {
				// New message format - has full state
				const parsed = parseManagedIndexerStateMessage(event.data)
				if (parsed) {
					setState(parsed)
				}
			}
		}

		window.addEventListener("message", handleMessage)
		return () => {
			window.removeEventListener("message", handleMessage)
		}
	}, [])

	return state
}

/**
 * Convenience hook that returns just the enabled flag
 * Maintains backward compatibility with useManagedCodeIndexingEnabled
 *
 * @deprecated Use useManagedIndexerState() instead for full state access
 */
export function useManagedCodeIndexingEnabled(): boolean {
	const { isEnabled } = useManagedIndexerState()
	return isEnabled
}

/**
 * Hook to get workspace folder states
 * Useful when you only need the workspace folder information
 */
export function useWorkspaceFolderStates(): WorkspaceFolderState[] {
	const { workspaceFolders } = useManagedIndexerState()
	return workspaceFolders
}

/**
 * Hook to check if any workspace folder is currently indexing
 */
export function useIsIndexing(): boolean {
	const { workspaceFolders } = useManagedIndexerState()
	return workspaceFolders.some((folder) => folder.isIndexing)
}

/**
 * Hook to get workspace folders with errors
 */
export function useWorkspaceFoldersWithErrors(): WorkspaceFolderState[] {
	const { workspaceFolders } = useManagedIndexerState()
	return workspaceFolders.filter((folder) => folder.error !== undefined)
}
