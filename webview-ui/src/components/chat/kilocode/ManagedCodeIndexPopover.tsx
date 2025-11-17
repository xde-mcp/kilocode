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

interface CodeIndexPopoverProps {}

export const ManagedCodeIndexPopoverContent: React.FC<CodeIndexPopoverProps> = () => {
	const { t } = useAppTranslation()
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
			<div className="p-3 border-b border-vscode-dropdown-border cursor-default">
				<div className="flex flex-row items-center gap-1 p-0 mt-0 mb-1 w-full">
					<h4 className="m-0 pb-2 flex-1">{t("settings:codeIndex.title")}</h4>
				</div>
				<p className="my-0 pr-4 text-sm w-full">
					<Trans i18nKey="settings:codeIndex.description">
						<VSCodeLink
							href={buildDocLink("features/codebase-indexing", "settings")}
							style={{ display: "inline" }}
						/>
					</Trans>
				</p>
			</div>

			<div className="p-4">
				<ManagedIndexerStatus workspaceFolders={workspaceFolders} />
			</div>
		</>
	)
}
