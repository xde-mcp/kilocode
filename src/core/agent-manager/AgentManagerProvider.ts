import * as vscode from "vscode"
import { spawn, ChildProcess } from "node:child_process"
import { AgentRegistry } from "./AgentRegistry"
import { CliOutputParser, type CliJsonEvent } from "./CliOutputParser"
import { getUri } from "../webview/getUri"
import { getNonce } from "../webview/getNonce"
import type { ClineMessage } from "@roo-code/types"

const SESSION_TIMEOUT_MS = 120_000 // 2 minutes

/**
 * AgentManagerProvider
 *
 * Manages the Agent Manager webview panel and orchestrates kilocode agents.
 * Each agent runs as a CLI process using `kilocode --auto --json`.
 */
export class AgentManagerProvider implements vscode.Disposable {
	public static readonly viewType = "kilo-code.AgentManagerPanel"

	private panel: vscode.WebviewPanel | undefined
	private disposables: vscode.Disposable[] = []
	private registry: AgentRegistry
	private processes: Map<string, ChildProcess> = new Map()
	private timeouts: Map<string, NodeJS.Timeout> = new Map()
	private sessionMessages: Map<string, ClineMessage[]> = new Map()
	private parsers: Map<string, CliOutputParser> = new Map()

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly outputChannel: vscode.OutputChannel,
	) {
		this.registry = new AgentRegistry()
	}

	/**
	 * Open or focus the Agent Manager panel
	 */
	public async openPanel(): Promise<void> {
		if (this.panel) {
			this.panel.reveal(vscode.ViewColumn.One)
			return
		}

		this.panel = vscode.window.createWebviewPanel(
			AgentManagerProvider.viewType,
			"Agent Manager",
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [this.context.extensionUri],
			},
		)

		this.panel.iconPath = {
			light: vscode.Uri.joinPath(this.context.extensionUri, "assets", "icons", "kilo.png"),
			dark: vscode.Uri.joinPath(this.context.extensionUri, "assets", "icons", "kilo-dark.png"),
		}

		this.panel.webview.html = this.getHtmlContent(this.panel.webview)

		this.panel.webview.onDidReceiveMessage((message) => this.handleMessage(message), null, this.disposables)

		this.panel.onDidDispose(
			() => {
				this.panel = undefined
			},
			null,
			this.disposables,
		)

		this.outputChannel.appendLine("Agent Manager panel opened")
	}

	private handleMessage(message: { type: string; [key: string]: unknown }): void {
		this.outputChannel.appendLine(`Agent Manager received message: ${JSON.stringify(message)}`)

		try {
			switch (message.type) {
				case "agentManager.webviewReady":
					this.postStateToWebview()
					break
				case "agentManager.startSession":
					void this.startAgentSession(message.prompt as string)
					break
				case "agentManager.stopSession":
					this.stopAgentSession(message.sessionId as string)
					break
				case "agentManager.removeSession":
					this.removeSession(message.sessionId as string)
					break
				case "agentManager.selectSession":
					this.selectSession(message.sessionId as string | null)
					break
			}
		} catch (error) {
			this.outputChannel.appendLine(`Error handling message: ${error}`)
		}
	}

	/**
	 * Start a new agent session using the kilocode CLI
	 */
	private async startAgentSession(prompt: string): Promise<void> {
		if (!prompt) {
			this.outputChannel.appendLine("ERROR: prompt is empty")
			return
		}

		// Get workspace folder - require a valid workspace
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
		if (!workspaceFolder) {
			this.outputChannel.appendLine("ERROR: No workspace folder open")
			void vscode.window.showErrorMessage("Please open a folder before starting an agent.")
			return
		}
		const workspace = workspaceFolder

		// Create the session
		const session = this.registry.createSession(prompt)
		this.sessionMessages.set(session.id, [])
		this.outputChannel.appendLine(`Session created: ${session.id}`)

		// Build CLI command
		const cliArgs = ["--auto", "--json", `--workspace=${workspace}`, prompt]
		this.outputChannel.appendLine(`[AgentManager] Command: kilocode ${cliArgs.join(" ")}`)
		this.outputChannel.appendLine(`[AgentManager] Working dir: ${workspace}`)

		// Spawn CLI process with shell to ensure PATH resolution
		// Set NO_COLOR and FORCE_COLOR=0 to disable ANSI output
		const proc = spawn("kilocode", cliArgs, {
			cwd: workspace,
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
			shell: true,
		})

		this.processes.set(session.id, proc)
		if (proc.pid) {
			this.registry.setSessionPid(session.id, proc.pid)
			this.outputChannel.appendLine(`[AgentManager] Process PID: ${proc.pid}`)
		} else {
			this.outputChannel.appendLine(`[AgentManager] WARNING: No PID - spawn may have failed`)
		}

		// Debug: Log when stdout/stderr attach
		this.outputChannel.appendLine(`[AgentManager] stdout exists: ${!!proc.stdout}`)
		this.outputChannel.appendLine(`[AgentManager] stderr exists: ${!!proc.stderr}`)

		// Set timeout
		const timeout = setTimeout(() => {
			this.log(session.id, "Timed out. Killing agent.")
			this.registry.updateSessionStatus(session.id, "error", undefined, "Timeout")
			proc.kill("SIGTERM")
			this.postStateToWebview()
		}, SESSION_TIMEOUT_MS)
		this.timeouts.set(session.id, timeout)

		// Create parser for this session
		const parser = new CliOutputParser()
		this.parsers.set(session.id, parser)

		// Parse nd-json output from stdout
		proc.stdout?.on("data", (chunk) => {
			const chunkStr = chunk.toString()
			this.outputChannel.appendLine(
				`[AgentManager] stdout chunk (${chunkStr.length} bytes): ${chunkStr.slice(0, 200)}`,
			)

			const { events, plainText } = parser.parse(chunkStr)

			for (const event of events) {
				this.handleCliEvent(session.id, event)
			}

			for (const line of plainText) {
				this.log(session.id, line)
			}

			this.postStateToWebview()
		})

		// Handle stderr
		proc.stderr?.on("data", (data) => {
			const stderrStr = String(data).trim()
			this.outputChannel.appendLine(`[AgentManager] stderr: ${stderrStr}`)
			this.log(session.id, `stderr: ${stderrStr}`)
			this.postStateToWebview()
		})

		// Handle process exit
		proc.on("exit", (code, signal) => {
			this.outputChannel.appendLine(`[AgentManager] Process exited: code=${code}, signal=${signal}`)

			const t = this.timeouts.get(session.id)
			if (t) clearTimeout(t)
			this.timeouts.delete(session.id)
			this.processes.delete(session.id)

			if (code === 0) {
				this.registry.updateSessionStatus(session.id, "done", code)
				this.log(session.id, "Agent completed")
			} else {
				this.registry.updateSessionStatus(session.id, "error", code ?? undefined)
				this.log(session.id, `Agent exited with code ${code ?? "?"}${signal ? ` signal ${signal}` : ""}`)
			}
			this.postStateToWebview()
		})

		proc.on("error", (error) => {
			this.outputChannel.appendLine(`[AgentManager] Process spawn error: ${error.message}`)
			this.log(session.id, `Process error: ${error.message}`)
			this.registry.updateSessionStatus(session.id, "error", undefined, error.message)
			this.postStateToWebview()
		})

		this.outputChannel.appendLine(`[AgentManager] spawned CLI process ${session.id} pid=${proc.pid}`)
		this.postStateToWebview()
	}

	/**
	 * Handle a JSON event from the CLI stdout
	 */
	private handleCliEvent(sessionId: string, event: CliJsonEvent): void {
		// Log CLI events
		if (event.source === "cli") {
			this.log(sessionId, `[CLI] ${event.type}: ${event.content?.slice(0, 100) || ""}`)
			return
		}

		// Process extension messages for chat display
		if (event.source === "extension") {
			const message: ClineMessage = {
				ts: event.timestamp,
				type: event.type as "say" | "ask",
				say: event.say as ClineMessage["say"],
				ask: event.ask as ClineMessage["ask"],
				text: event.content || (event.metadata ? JSON.stringify(event.metadata) : ""),
				partial: event.partial ?? false,
				isAnswered: event.isAnswered,
			}

			// Update or append message
			const messages = this.sessionMessages.get(sessionId) || []
			const existingIdx = messages.findIndex((m) => m.ts === message.ts)
			if (existingIdx >= 0) {
				messages[existingIdx] = message
			} else {
				messages.push(message)
			}
			this.sessionMessages.set(sessionId, messages)

			// Send to webview
			this.postMessage({
				type: "agentManager.chatMessages",
				sessionId,
				messages,
			})

			// Log summary
			const summary = `${event.type}:${event.say || event.ask || ""}`
			this.log(sessionId, summary)
		}
	}

	/**
	 * Append a log line to a session
	 */
	private log(sessionId: string, line: string): void {
		this.registry.appendLog(sessionId, line)
	}

	/**
	 * Select a session to view its details/logs
	 */
	private selectSession(sessionId: string | null): void {
		this.registry.setSelectedId(sessionId)
		this.postStateToWebview()
	}

	/**
	 * Stop a running agent session
	 */
	private stopAgentSession(sessionId: string): void {
		const proc = this.processes.get(sessionId)
		if (proc) {
			proc.kill("SIGTERM")
			this.processes.delete(sessionId)
		}

		const timeout = this.timeouts.get(sessionId)
		if (timeout) clearTimeout(timeout)
		this.timeouts.delete(sessionId)

		this.parsers.delete(sessionId)

		this.registry.updateSessionStatus(sessionId, "stopped", undefined, "Stopped by user")
		this.log(sessionId, "Stopped by user")
		this.postStateToWebview()
	}

	/**
	 * Remove a session
	 */
	private removeSession(sessionId: string): void {
		// Stop process if running
		const proc = this.processes.get(sessionId)
		if (proc) {
			proc.kill("SIGTERM")
			this.processes.delete(sessionId)
		}

		const timeout = this.timeouts.get(sessionId)
		if (timeout) clearTimeout(timeout)
		this.timeouts.delete(sessionId)

		// Clean up messages and parser
		this.sessionMessages.delete(sessionId)
		this.parsers.delete(sessionId)

		this.registry.removeSession(sessionId)
		this.postStateToWebview()
	}

	private postStateToWebview(): void {
		this.postMessage({
			type: "agentManager.state",
			state: this.registry.getState(),
		})
	}

	private postMessage(message: unknown): void {
		this.panel?.webview.postMessage(message)
	}

	private getHtmlContent(webview: vscode.Webview): string {
		// Get URIs for the React build assets
		const scriptUri = getUri(webview, this.context.extensionUri, [
			"webview-ui",
			"build",
			"assets",
			"agent-manager.js",
		])
		const stylesUri = getUri(webview, this.context.extensionUri, [
			"webview-ui",
			"build",
			"assets",
			"agent-manager.css",
		])

		const nonce = getNonce()

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src ${webview.cspSource} 'nonce-${nonce}';">
	<title>Agent Manager</title>
	<link rel="stylesheet" type="text/css" href="${stylesUri}">
</head>
<body>
	<div id="root"></div>
	<script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`
	}

	public dispose(): void {
		// Kill all processes
		for (const proc of this.processes.values()) {
			proc.kill("SIGTERM")
		}
		this.processes.clear()

		// Clear all timeouts
		for (const timeout of this.timeouts.values()) {
			clearTimeout(timeout)
		}
		this.timeouts.clear()

		// Clear messages and parsers
		this.sessionMessages.clear()
		this.parsers.clear()

		this.panel?.dispose()
		this.disposables.forEach((d) => d.dispose())
	}
}
