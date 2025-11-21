// kilocode_change - new file
import React, { useState, useEffect } from "react"
import { Trans } from "react-i18next"
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react"

import { vscode } from "@src/utils/vscode"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { buildDocLink } from "@src/utils/docLinks"
import { useEscapeKey } from "@src/hooks/useEscapeKey"
import { ManagedIndexerStatus } from "./ManagedIndexerStatus"

interface WorkspaceFolderState {
	workspaceFolderPath: string
	workspaceFolderName: string
	gitBranch: string | null
	projectId: string | null
	isIndexing: boolean
	hasManifest: boolean
	manifestFileCount: number
	hasWatcher: boolean
	error?: {
		type: string
		message: string
		timestamp: string
		context?: {
			filePath?: string
			branch?: string
			operation?: string
		}
	}
}

export const ManagedCodeIndexPopoverContent: React.FC = () => {
	const [open, setOpen] = useState(false)
	const [workspaceFolders, setWorkspaceFolders] = useState<WorkspaceFolderState[]>([])

	// Request initial state when popover opens
	useEffect(() => {
		if (open) {
			vscode.postMessage({ type: "requestManagedIndexerState" })
		}
	}, [open])

	// Listen for managed indexer state updates
	useEffect(() => {
		const handleMessage = (event: MessageEvent<any>) => {
			if (event.data.type === "managedIndexerState") {
				setWorkspaceFolders(event.data.managedIndexerState || [])
			}
		}

		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [])

	// Use the shared ESC key handler hook
	useEscapeKey(open, () => setOpen(false))

	return (
		<>
			<div className="p-4">
				<div>This is ManagedCodeIndexPopover.tsx - we can do whatever we want here</div>
				<div>we should</div>
				<ul>
					<li>have links to backend for docs & setup guide</li>
					<li>show status of each workspace folder</li>
					<li>show errors/warnings if any</li>
					<li>show indexing progress if possible</li>
				</ul>
				<ManagedIndexerStatus workspaceFolders={workspaceFolders} />
			</div>
		</>
	)
}
