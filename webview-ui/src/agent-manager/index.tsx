import React from "react"
import { createRoot } from "react-dom/client"
import { AgentManagerApp } from "./components/AgentManagerApp"
import "../../node_modules/@vscode/codicons/dist/codicon.css"
import "../index.css"

// Mount the Agent Manager React app
const container = document.getElementById("root")
if (container) {
	const root = createRoot(container)
	root.render(
		<React.StrictMode>
			<AgentManagerApp />
		</React.StrictMode>,
	)
}

// Notify extension that webview is ready
import { vscode } from "./utils/vscode"
vscode.postMessage({ type: "agentManager.webviewReady" })
