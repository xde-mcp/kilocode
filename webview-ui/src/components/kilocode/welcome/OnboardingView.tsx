// kilocode_change - new file
import React from "react"
import Logo from "../common/Logo"
import { useAppTranslation } from "@/i18n/TranslationContext"

interface OnboardingOptionProps {
	title: string
	description: string
	onClick: () => void
}

const OnboardingOption: React.FC<OnboardingOptionProps> = ({ title, description, onClick }) => {
	return (
		<button
			className="w-full p-5 rounded-lg border border-vscode-panel-border bg-vscode-editor-background hover:bg-vscode-list-hoverBackground cursor-pointer text-left transition-colors"
			onClick={onClick}>
			<h3 className="text-lg font-semibold text-vscode-foreground m-0 mb-2">{title}</h3>
			<p className="text-sm text-vscode-descriptionForeground m-0">{description}</p>
		</button>
	)
}

interface OnboardingViewProps {
	onSelectFreeModels: () => void
	onSelectPremiumModels: () => void
	onSelectBYOK: () => void
}

const OnboardingView: React.FC<OnboardingViewProps> = ({ onSelectFreeModels, onSelectPremiumModels, onSelectBYOK }) => {
	const { t } = useAppTranslation()

	return (
		<div className="flex flex-col items-center justify-center min-h-screen p-6 bg-vscode-sideBar-background">
			<Logo width={80} height={80} />

			<h1 className="text-2xl font-bold text-vscode-foreground text-center mt-4 mb-10">
				{t("kilocode:onboarding.title")}
			</h1>

			<div className="w-full max-w-md flex flex-col gap-4">
				<OnboardingOption
					title={t("kilocode:onboarding.freeModels.title")}
					description={t("kilocode:onboarding.freeModels.description")}
					onClick={onSelectFreeModels}
				/>

				<OnboardingOption
					title={t("kilocode:onboarding.premiumModels.title")}
					description={t("kilocode:onboarding.premiumModels.description")}
					onClick={onSelectPremiumModels}
				/>

				<OnboardingOption
					title={t("kilocode:onboarding.byok.title")}
					description={t("kilocode:onboarding.byok.description")}
					onClick={onSelectBYOK}
				/>
			</div>
		</div>
	)
}

export default OnboardingView
