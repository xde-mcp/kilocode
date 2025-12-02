import React, { useState } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import { selectedSessionAtom, selectedSessionIdAtom } from "../state/atoms/sessions"
import { MessageList } from "./MessageList"
import { ChatInput } from "./ChatInput"
import { vscode } from "../utils/vscode"
import { SquareTerminal, Clock, Plus, Square, Play } from "lucide-react"

export function SessionDetail() {
	const selectedSession = useAtomValue(selectedSessionAtom)
	const setSelectedId = useSetAtom(selectedSessionIdAtom)

	if (!selectedSession) {
		return <NewAgentForm />
	}

	const handleStop = () => {
		vscode.postMessage({ type: "agentManager.stopSession", sessionId: selectedSession.id })
	}

	const handleNewAgent = () => {
		setSelectedId(null)
	}

	const formatDuration = (start: number, end?: number) => {
		const duration = (end || Date.now()) - start
		const seconds = Math.floor(duration / 1000)
		const minutes = Math.floor(seconds / 60)
		if (minutes > 0) return `${minutes}m ${seconds % 60}s`
		return `${seconds}s`
	}

	return (
		<div className="session-detail">
			<div className="detail-header">
				<div className="header-info">
					<div className="header-title" title={selectedSession.prompt}>
						{selectedSession.label}
					</div>
					<div className="header-meta">
						<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
							<SquareTerminal size={12} />
							<span>{selectedSession.status}</span>
						</div>
						<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
							<Clock size={12} />
							<span>{formatDuration(selectedSession.startTime, selectedSession.endTime)}</span>
						</div>
						{selectedSession.pid && <span>PID: {selectedSession.pid}</span>}
					</div>
				</div>

				<div className="header-actions">
					{selectedSession.status === "running" && (
						<button className="btn btn-danger" onClick={handleStop} title="Stop Agent">
							<Square size={12} fill="currentColor" /> Stop
						</button>
					)}
					<button className="btn btn-secondary" onClick={handleNewAgent} title="New Agent">
						<Plus size={14} /> New
					</button>
				</div>
			</div>

			<MessageList sessionId={selectedSession.id} />

			<ChatInput sessionId={selectedSession.id} disabled={selectedSession.status !== "running"} />
		</div>
	)
}

function NewAgentForm() {
	const [promptText, setPromptText] = useState("")

	const handleStart = () => {
		if (promptText.trim()) {
			vscode.postMessage({ type: "agentManager.startSession", prompt: promptText.trim() })
			setPromptText("")
		}
	}

	return (
		<div className="center-form">
			<h2>Start a new agent</h2>
			<p>Describe the task you want the agent to perform.</p>
			<div style={{ width: "100%", maxWidth: "500px" }}>
				<textarea
					className="prompt-input"
					placeholder="e.g. Create a new React component for a button..."
					value={promptText}
					onChange={(e) => setPromptText(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
							handleStart()
						}
					}}
				/>
				<div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
					<button
						className="btn btn-primary"
						onClick={handleStart}
						style={{ padding: "8px 24px", fontSize: "13px" }}>
						<Play size={14} style={{ marginRight: 6 }} /> Start Agent
					</button>
				</div>
			</div>
		</div>
	)
}
