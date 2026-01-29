import { ClineMessage } from "@roo-code/types"
import { vscode } from "@src/utils/vscode"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import styled from "styled-components"
import { useTranslation } from "react-i18next"
import { safeJsonParse } from "@roo/safeJsonParse"

type UnauthorizedWarningProps = {
	message: ClineMessage
}

type UnauthorizedWarningData = {
	modelId?: string
	loginUrl?: string
	signupUrl?: string
}

const HeaderContainer = styled.div`
	display: flex;
	align-items: center;
	gap: 10px;
	margin-bottom: 10px;
`

const Description = styled.div`
	margin: 0;
	white-space: pre-wrap;
	word-break: break-word;
	overflow-wrap: anywhere;
`

export const UnauthorizedWarning = ({ message }: UnauthorizedWarningProps) => {
	const { t } = useTranslation()

	const data = safeJsonParse<UnauthorizedWarningData>(message.text)

	const modelId = data?.modelId || "(unknown)"
	const loginUrl = data?.loginUrl || "https://kilocode.com/login"
	const signupUrl = data?.signupUrl || "https://kilocode.com/signup"

	const handleLogin = () => {
		vscode.postMessage({
			type: "openInBrowser",
			url: loginUrl,
		})
	}

	const handleSignup = () => {
		vscode.postMessage({
			type: "openInBrowser",
			url: signupUrl,
		})
	}

	return (
		<>
			<HeaderContainer>
				<span className="text-yellow-400" style={{ marginBottom: "-1.5px" }}>
					🔐
				</span>
				<span style={{ fontWeight: "bold" }}>{t("kilocode:unauthorizedError.title")}</span>
			</HeaderContainer>
			<Description>{t("kilocode:unauthorizedError.message", { model: modelId })}</Description>

			<div
				className="bg-vscode-panel-border flex flex-col gap-3"
				style={{
					borderRadius: "4px",
					display: "flex",
					marginTop: "15px",
					padding: "14px 16px 22px",
					justifyContent: "center",
				}}>
				<VSCodeButton className="p-1 w-full rounded" appearance="primary" onClick={handleLogin}>
					{t("kilocode:unauthorizedError.loginButton")}
				</VSCodeButton>
				<VSCodeButton className="p-1 w-full rounded" onClick={handleSignup}>
					{t("kilocode:unauthorizedError.signupButton")}
				</VSCodeButton>
			</div>
		</>
	)
}
