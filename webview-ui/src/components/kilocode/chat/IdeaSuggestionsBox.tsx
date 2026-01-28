import { useState } from "react"
import { telemetryClient } from "@/utils/TelemetryClient"
import { vscode } from "@/utils/vscode"
import { TelemetryEventName } from "@roo-code/types"
import { useTranslation } from "react-i18next"
import { useTaskHistory } from "@/kilocode/hooks/useTaskHistory"
import { useExtensionState } from "@/context/ExtensionStateContext"

export const IdeaSuggestionsBox = () => {
	const { t } = useTranslation("kilocode")
	const { taskHistoryVersion } = useExtensionState()
	const ideas = Object.values(t("ideaSuggestionsBox.ideas", { returnObjects: true }))

	const [iconsBaseUri] = useState(() => {
		const w = window as any
		return w.ICONS_BASE_URI || ""
	})

	// Check if current workspace has any tasks
	const { data } = useTaskHistory(
		{
			workspace: "current",
			sort: "newest",
			favoritesOnly: false,
			pageIndex: 0,
		},
		taskHistoryVersion,
	)
	const hasWorkspaceTasks = (data?.historyItems?.length ?? 0) > 0

	// Don't show if workspace has tasks
	if (hasWorkspaceTasks) {
		return null
	}

	const handleIdeaClick = (idea: string) => {
		vscode.postMessage({
			type: "insertTextToChatArea",
			text: idea,
		})

		telemetryClient.capture(TelemetryEventName.SUGGESTION_BUTTON_CLICKED, {
			idea,
		})
	}

	// Show 3-4 random ideas
	const shuffledIdeas = [...ideas].sort(() => Math.random() - 0.5).slice(0, 4)

	return (
		<div className="mt-6 mb-4 flex flex-col items-center">
			{/* Kilo Logo */}
			<div
				className="mb-4 flex items-center justify-center"
				style={{
					width: "48px",
					height: "48px",
				}}>
				<img
					src={`${iconsBaseUri}/kilo-dark.svg`}
					alt="Kilo Code"
					className="w-full h-full object-contain"
					style={{
						filter: "var(--vscode-icon-foreground)",
					}}
				/>
			</div>

			{/* Content Box */}
			<div className="w-full p-4 bg-vscode-input-background rounded-lg border border-vscode-panel-border">
				<div className="text-center mb-3">
					<p className="text-base font-semibold text-vscode-foreground mb-1">
						{t("ideaSuggestionsBox.newHere")}
					</p>
					<p className="text-sm text-vscode-descriptionForeground">{t("ideaSuggestionsBox.tryOneOfThese")}</p>
				</div>

				{/* Suggestion Buttons */}
				<div className="flex flex-col gap-2">
					{shuffledIdeas.map((idea, index) => (
						<button
							key={index}
							onClick={() => handleIdeaClick(idea)}
							className="w-full px-3 py-2.5 text-left text-sm bg-vscode-button-secondaryBackground hover:bg-vscode-button-secondaryHoverBackground text-vscode-button-secondaryForeground rounded border border-vscode-button-border transition-colors cursor-pointer">
							<span className="codicon codicon-lightbulb mr-2" />
							{idea}
						</button>
					))}
				</div>

				<div className="mt-3 text-center text-xs text-vscode-descriptionForeground">
					<span className="codicon codicon-info mr-1" />
					{t("ideaSuggestionsBox.clickToInsert")}
				</div>
			</div>
		</div>
	)
}
