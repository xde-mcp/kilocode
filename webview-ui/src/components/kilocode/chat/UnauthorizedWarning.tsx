import { useEffect, useRef, useCallback } from "react"
import { ClineMessage } from "@roo-code/types"
import { vscode } from "@src/utils/vscode"
import { Button } from "@src/components/ui"
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
	const hasRetried = useRef(false)

	const data = safeJsonParse<UnauthorizedWarningData>(message.text)

	const handleRetry = useCallback(() => {
		if (hasRetried.current) {
			return
		}
		hasRetried.current = true
		vscode.postMessage({
			type: "askResponse",
			askResponse: "retry_clicked",
			text: message.text,
		})
	}, [message.text])

	// Listen for successful authentication and automatically retry
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const msg = event.data
			if (msg.type === "deviceAuthComplete") {
				// Auth succeeded - wait briefly for token to be saved, then retry
				setTimeout(() => {
					handleRetry()
				}, 500)
			}
		}

		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [handleRetry])

	const modelId = data?.modelId || "(unknown)"

	return (
		<>
			<HeaderContainer>
				<span className="text-yellow-400" style={{ marginBottom: "-1.5px" }}>
					✨
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
				<Button
					variant="primary"
					onClick={() => {
						vscode.postMessage({
							type: "switchTab",
							tab: "auth",
							values: { returnTo: "chat" },
						})
					}}>
					{t("kilocode:unauthorizedError.loginButton")}
				</Button>
				<Button
					variant="secondary"
					onClick={() => {
						vscode.postMessage({
							type: "switchTab",
							tab: "auth",
							values: { returnTo: "chat" },
						})
					}}>
					{t("kilocode:unauthorizedError.signupButton")}
				</Button>
			</div>
		</>
	)
}
