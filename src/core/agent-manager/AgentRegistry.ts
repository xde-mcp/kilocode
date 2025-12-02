import { AgentSession, AgentStatus, AgentManagerState } from "./types"

/**
 * In-memory registry for agent sessions.
 * Manages session lifecycle and provides state for the webview.
 */
export class AgentRegistry {
	private sessions: Map<string, AgentSession> = new Map()
	private selectedId: string | null = null
	private readonly maxSessions = 10
	private readonly maxLogs = 100

	/**
	 * Create a new session
	 */
	public createSession(prompt: string): AgentSession {
		const id = this.generateId()
		const label = this.truncatePrompt(prompt)

		const session: AgentSession = {
			id,
			label,
			prompt,
			status: "running",
			startTime: Date.now(),
			logs: ["Starting agent..."],
		}

		this.sessions.set(id, session)
		this.selectedId = id // Auto-select new session
		this.pruneOldSessions()

		return session
	}

	/**
	 * Update session status
	 */
	public updateSessionStatus(
		id: string,
		status: AgentStatus,
		exitCode?: number,
		error?: string,
	): AgentSession | undefined {
		const session = this.sessions.get(id)
		if (!session) return undefined

		session.status = status
		if (status === "done" || status === "error") {
			session.endTime = Date.now()
		}
		if (exitCode !== undefined) {
			session.exitCode = exitCode
		}
		if (error) {
			session.error = error
		}

		return session
	}

	/**
	 * Remove a session
	 */
	public removeSession(id: string): boolean {
		const deleted = this.sessions.delete(id)
		// If we removed the selected session, select the first remaining one
		if (deleted && this.selectedId === id) {
			const sessions = this.getSessions()
			this.selectedId = sessions.length > 0 ? sessions[0].id : null
		}
		return deleted
	}

	/**
	 * Get a session by ID
	 */
	public getSession(id: string): AgentSession | undefined {
		return this.sessions.get(id)
	}

	/**
	 * Get all sessions sorted by start time (most recent first)
	 */
	public getSessions(): AgentSession[] {
		return Array.from(this.sessions.values()).sort((a, b) => b.startTime - a.startTime)
	}

	/**
	 * Append a log line to a session
	 */
	public appendLog(id: string, line: string): void {
		const session = this.sessions.get(id)
		if (!session) return

		session.logs.push(line)
		// Keep only the last N logs
		if (session.logs.length > this.maxLogs) {
			session.logs = session.logs.slice(-this.maxLogs)
		}
	}

	/**
	 * Set the selected session ID
	 */
	public setSelectedId(id: string | null): void {
		this.selectedId = id
	}

	/**
	 * Get the selected session ID
	 */
	public getSelectedId(): string | null {
		return this.selectedId
	}

	/**
	 * Set session PID
	 */
	public setSessionPid(id: string, pid: number): void {
		const session = this.sessions.get(id)
		if (session) {
			session.pid = pid
		}
	}

	/**
	 * Get current state for webview
	 */
	public getState(): AgentManagerState {
		return {
			sessions: this.getSessions(),
			selectedId: this.selectedId,
		}
	}

	/**
	 * Remove oldest sessions if exceeding max
	 */
	private pruneOldSessions(): void {
		const sessions = this.getSessions()
		if (sessions.length > this.maxSessions) {
			// Remove oldest non-running sessions first
			const toRemove = sessions.filter((s) => s.status !== "running").slice(this.maxSessions - 1)

			for (const session of toRemove) {
				this.sessions.delete(session.id)
			}
		}
	}

	/**
	 * Generate unique session ID
	 */
	private generateId(): string {
		return `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
	}

	/**
	 * Truncate prompt for display label
	 */
	private truncatePrompt(prompt: string, maxLength = 40): string {
		const cleaned = prompt.replace(/\s+/g, " ").trim()
		if (cleaned.length <= maxLength) {
			return cleaned
		}
		return cleaned.substring(0, maxLength - 3) + "..."
	}
}
