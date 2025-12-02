import React, { useState } from "react"
import { useAtom, useAtomValue } from "jotai"
import { sessionsArrayAtom, selectedSessionIdAtom, type AgentSession } from "../state/atoms/sessions"
import { vscode } from "../utils/vscode"
import { Plus, Trash2, SquareTerminal, Clock } from "lucide-react"

export function SessionSidebar() {
	const sessions = useAtomValue(sessionsArrayAtom)
	const [selectedId, setSelectedId] = useAtom(selectedSessionIdAtom)
	const [promptText, setPromptText] = useState("")

	const handleNewSession = () => {
		setSelectedId(null)
	}

	const handleStartSession = () => {
		if (promptText.trim()) {
			vscode.postMessage({ type: "agentManager.startSession", prompt: promptText.trim() })
			setPromptText("")
		}
	}

	const handleSelectSession = (id: string) => {
		setSelectedId(id)
		vscode.postMessage({ type: "agentManager.selectSession", sessionId: id })
	}

	const handleRemoveSession = (id: string, e: React.MouseEvent) => {
		e.stopPropagation()
		vscode.postMessage({ type: "agentManager.removeSession", sessionId: id })
	}

	return (
		<div className="sidebar">
			<div className="sidebar-header">
				<span>Sessions</span>
				<div className="sidebar-actions">
					<button className="icon-btn" onClick={handleNewSession} title="New Session">
						<Plus size={16} />
					</button>
				</div>
			</div>

			<div className="session-list">
				{sessions.length === 0 ? (
					<div className="no-sessions">
						<p>No active agents.</p>
						<p style={{ marginTop: 8, opacity: 0.7 }}>Click + to start one.</p>
					</div>
				) : (
					sessions.map((session) => (
						<SessionItem
							key={session.id}
							session={session}
							isSelected={selectedId === session.id}
							onSelect={() => handleSelectSession(session.id)}
							onRemove={(e) => handleRemoveSession(session.id, e)}
						/>
					))
				)}
			</div>

			{/* Quick start area at bottom if no session selected */}
			{selectedId === null && (
				<div style={{ padding: "12px", borderTop: "1px solid var(--vscode-sideBarSectionHeader-border)" }}>
					<textarea
						className="prompt-input"
						placeholder="Start a new agent..."
						style={{ minHeight: "60px", marginBottom: "8px", fontSize: "12px" }}
						value={promptText}
						onChange={(e) => setPromptText(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
								handleStartSession()
							}
						}}
					/>
					<button className="new-session-btn" onClick={handleStartSession}>
						Start Agent
					</button>
				</div>
			)}
		</div>
	)
}

function SessionItem({
	session,
	isSelected,
	onSelect,
	onRemove,
}: {
	session: AgentSession
	isSelected: boolean
	onSelect: () => void
	onRemove: (e: React.MouseEvent) => void
}) {
	const formatDuration = (start: number, end?: number) => {
		const duration = (end || Date.now()) - start
		const seconds = Math.floor(duration / 1000)
		const minutes = Math.floor(seconds / 60)
		if (minutes > 0) return `${minutes}m`
		return `${seconds}s`
	}

	return (
		<div className={`session-item ${isSelected ? "selected" : ""}`} onClick={onSelect}>
			<div className={`status-icon ${session.status}`} title={session.status}>
				{session.status === "running" ? (
					<Clock size={14} />
				) : session.status === "done" ? (
					<span className="codicon codicon-pass" />
				) : (
					<SquareTerminal size={14} />
				)}
			</div>
			<div className="session-content">
				<div className="session-label">{session.label}</div>
				<div className="session-meta">{formatDuration(session.startTime, session.endTime)}</div>
			</div>
			<button className="icon-btn" onClick={onRemove} title="Remove">
				<Trash2 size={14} />
			</button>
		</div>
	)
}
