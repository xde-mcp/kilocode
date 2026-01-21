// kilocode_change - new file
import { useState } from "react"
import { Users2 } from "lucide-react"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { SectionHeader } from "@src/components/settings/SectionHeader"
import { Section } from "@src/components/settings/Section"
import { TabButton } from "@src/components/kilocodeMcp/McpView"
import ModesView from "@src/components/modes/ModesView"
import McpView from "@src/components/mcp/McpView"

const AgentBehaviourView = () => {
	const [activeTab, setActiveTab] = useState<"modes" | "mcp">("modes")
	const { t } = useAppTranslation()

	return (
		<div>
			<SectionHeader>
				<div className="flex items-center gap-2">
					<Users2 className="w-4" />
					<div>{t("kilocode:settings.sections.agentBehaviour")}</div>
				</div>
			</SectionHeader>

			<Section>
				{/* Tab buttons */}
				<div
					style={{
						display: "flex",
						gap: "1px",
						padding: "0 20px 0 20px",
						borderBottom: "1px solid var(--vscode-panel-border)",
					}}>
					<TabButton isActive={activeTab === "modes"} onClick={() => setActiveTab("modes")}>
						{t("settings:sections.modes")}
					</TabButton>
					<TabButton isActive={activeTab === "mcp"} onClick={() => setActiveTab("mcp")}>
						{t("kilocode:settings.sections.mcp")}
					</TabButton>
				</div>

				{/* Content */}
				<div style={{ width: "100%" }}>
					{activeTab === "modes" && <ModesView hideHeader />}
					{activeTab === "mcp" && <McpView hideHeader onDone={() => {}} />}
				</div>
			</Section>
		</div>
	)
}

export default AgentBehaviourView
