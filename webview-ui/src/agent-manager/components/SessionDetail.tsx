import React, { useState } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import { selectedSessionAtom, selectedSessionIdAtom } from "../state/atoms/sessions"
import { MessageList } from "./MessageList"
import { ChatInput } from "./ChatInput"
import { vscode } from "../utils/vscode"
import { SquareTerminal, Clock, Plus, Square, Play, AlertCircle, Loader2, Zap } from "lucide-react"

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

	const isError = selectedSession.status === "error"

	return (
		<div className="session-detail">
			<div className="detail-header">
				<div className="header-info">
					<div className="header-title" title={selectedSession.prompt}>
						{selectedSession.label}
					</div>
					<div className="header-meta">
						<div
							style={{ display: "flex", alignItems: "center", gap: 4 }}
							className={isError ? "status-error" : undefined}>
							{isError ? <AlertCircle size={12} /> : <SquareTerminal size={12} />}
							<span>{selectedSession.status}</span>
						</div>
						<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
							<Clock size={12} />
							<span>{formatDuration(selectedSession.startTime, selectedSession.endTime)}</span>
						</div>
					</div>
				</div>

				<div className="header-actions">
					{selectedSession.status === "running" && (
						<button
							className="btn btn-danger"
							onClick={handleStop}
							aria-label="Stop agent session"
							title="Stop Agent">
							<Square size={12} fill="currentColor" /> Stop
						</button>
					)}
					<button
						className="btn btn-secondary"
						onClick={handleNewAgent}
						aria-label="Start new agent session"
						title="New Agent">
						<Plus size={14} /> New
					</button>
				</div>
			</div>

			{isError && selectedSession.error && (
				<div className="session-error-banner" role="alert">
					<AlertCircle size={16} />
					<span>{selectedSession.error}</span>
				</div>
			)}

			{selectedSession.status === "running" && (
				<div className="full-auto-banner">
					<Zap size={14} />
					<span>Running in full-auto mode - agent will execute actions without confirmation</span>
				</div>
			)}

			<MessageList sessionId={selectedSession.id} />

			<ChatInput sessionId={selectedSession.id} disabled={selectedSession.status !== "running"} />
		</div>
	)
}

function NewAgentForm() {
	const [promptText, setPromptText] = useState("")
	const [isStarting, setIsStarting] = useState(false)

	const trimmedPrompt = promptText.trim()
	const isEmpty = trimmedPrompt.length === 0

	const handleStart = () => {
		if (isEmpty || isStarting) return

		setIsStarting(true)
		vscode.postMessage({ type: "agentManager.startSession", prompt: trimmedPrompt })
	}

	return (
		<div className="center-form">
			<h2 id="new-agent-heading">Start a new agent</h2>
			<p id="new-agent-description">Describe the task you want the agent to perform.</p>
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
					aria-labelledby="new-agent-heading"
					aria-describedby="new-agent-description"
					disabled={isStarting}
				/>
				<div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
					<button
						className="btn btn-primary"
						onClick={handleStart}
						disabled={isStarting || isEmpty}
						aria-label={isStarting ? "Starting agent..." : "Start agent with provided prompt"}
						style={{ padding: "8px 24px", fontSize: "13px" }}>
						{isStarting ? (
							<>
								<Loader2 size={14} className="spinning" style={{ marginRight: 6 }} /> Starting...
							</>
						) : (
							<>
								<Play size={14} style={{ marginRight: 6 }} /> Start Agent
							</>
						)}
					</button>
				</div>
				<p
					className="keyboard-hint"
					style={{ textAlign: "center", marginTop: 8, opacity: 0.6, fontSize: "12px" }}>
					Press <kbd>Cmd</kbd>+<kbd>Enter</kbd> or <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to start
				</p>
			</div>
		</div>
	)
}
