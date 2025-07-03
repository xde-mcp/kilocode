import os from "os"
import * as path from "path"
import fs from "fs/promises"
import EventEmitter from "events"

import { Anthropic } from "@anthropic-ai/sdk"
import delay from "delay"
import axios from "axios"
import pWaitFor from "p-wait-for"
import * as vscode from "vscode"

import {
	type GlobalState,
	type ProviderName,
	type ProviderSettings,
	type RooCodeSettings,
	type ProviderSettingsEntry,
	type TelemetryProperties,
	type TelemetryPropertiesProvider,
	type CodeActionId,
	type CodeActionName,
	type TerminalActionId,
	type TerminalActionPromptType,
	type HistoryItem,
	type CloudUserInfo,
	type MarketplaceItem,
	requestyDefaultModelId,
	openRouterDefaultModelId,
	glamaDefaultModelId,
	ORGANIZATION_ALLOW_ALL,
} from "@roo-code/types"
import { TelemetryService } from "@roo-code/telemetry"
import { CloudService, getRooCodeApiUrl } from "@roo-code/cloud"

import { t } from "../../i18n"
import { setPanel } from "../../activate/registerCommands"
import { Package } from "../../shared/package"
import { findLast } from "../../shared/array"
import { supportPrompt } from "../../shared/support-prompt"
import { GlobalFileNames } from "../../shared/globalFileNames"
import { ExtensionMessage, MarketplaceInstalledMetadata } from "../../shared/ExtensionMessage"
import { Mode, defaultModeSlug } from "../../shared/modes"
import { experimentDefault, experiments, EXPERIMENT_IDS } from "../../shared/experiments"
import { formatLanguage } from "../../shared/language"
import { Terminal } from "../../integrations/terminal/Terminal"
import { downloadTask } from "../../integrations/misc/export-markdown"
import { getTheme } from "../../integrations/theme/getTheme"
import WorkspaceTracker from "../../integrations/workspace/WorkspaceTracker"
import { McpHub } from "../../services/mcp/McpHub"
import { McpServerManager } from "../../services/mcp/McpServerManager"
import { MarketplaceManager } from "../../services/marketplace"
import { ShadowCheckpointService } from "../../services/checkpoints/ShadowCheckpointService"
import { CodeIndexManager } from "../../services/code-index/manager"
import type { IndexProgressUpdate } from "../../services/code-index/interfaces/manager"
import { MdmService } from "../../services/mdm/MdmService"
import { fileExistsAtPath } from "../../utils/fs"
import { setTtsEnabled, setTtsSpeed } from "../../utils/tts"
import { ContextProxy } from "../config/ContextProxy"
import { getEnabledRules } from "./kilorules"
import { ProviderSettingsManager } from "../config/ProviderSettingsManager"
import { CustomModesManager } from "../config/CustomModesManager"
import { buildApiHandler } from "../../api"
import { Task, TaskOptions } from "../task/Task"
import { getNonce } from "./getNonce"
import { getUri } from "./getUri"
import { getSystemPromptFilePath } from "../prompts/sections/custom-system-prompt"
import { getWorkspacePath } from "../../utils/path"
import { webviewMessageHandler } from "./webviewMessageHandler"
import { WebviewMessage } from "../../shared/WebviewMessage"
import { EMBEDDING_MODEL_PROFILES } from "../../shared/embeddingModels"
import { ProfileValidator } from "../../shared/ProfileValidator"
import { getWorkspaceGitInfo } from "../../utils/git"

import { McpDownloadResponse, McpMarketplaceCatalog } from "../../shared/kilocode/mcp" //kilocode_change
import { McpServer } from "../../shared/mcp" // kilocode_change

/**
 * https://github.com/microsoft/vscode-webview-ui-toolkit-samples/blob/main/default/weather-webview/src/providers/WeatherViewProvider.ts
 * https://github.com/KumarVariable/vscode-extension-sidebar-html/blob/master/src/customSidebarViewProvider.ts
 */

export type ClineProviderEvents = {
	clineCreated: [cline: Task]
}

class OrganizationAllowListViolationError extends Error {
	constructor(message: string) {
		super(message)
	}
}

export class ClineProvider extends EventEmitter<ClineProviderEvents> implements vscode.WebviewViewProvider {
	// Used in package.json as the view's id. This value cannot be changed due
	// to how VSCode caches views based on their id, and updating the id would
	// break existing instances of the extension.
	public static readonly sideBarId = `${Package.name}.SidebarProvider`
	public static readonly tabPanelId = `${Package.name}.TabPanelProvider`
	private static activeInstances: Set<ClineProvider> = new Set()
	private disposables: vscode.Disposable[] = []
	private webviewDisposables: vscode.Disposable[] = []
	private view?: vscode.WebviewView | vscode.WebviewPanel
	private clineStack: Task[] = []
	private codeIndexStatusSubscription?: vscode.Disposable
	private _workspaceTracker?: WorkspaceTracker // workSpaceTracker read-only for access outside this class
	public get workspaceTracker(): WorkspaceTracker | undefined {
		return this._workspaceTracker
	}
	protected mcpHub?: McpHub // Change from private to protected
	private marketplaceManager: MarketplaceManager
	private mdmService?: MdmService

	public isViewLaunched = false
	public settingsImportedAt?: number
	public readonly latestAnnouncementId = "jun-17-2025-3-21" // Update for v3.21.0 announcement
	public readonly providerSettingsManager: ProviderSettingsManager
	public readonly customModesManager: CustomModesManager

	constructor(
		readonly context: vscode.ExtensionContext,
		private readonly outputChannel: vscode.OutputChannel,
		private readonly renderContext: "sidebar" | "editor" = "sidebar",
		public readonly contextProxy: ContextProxy,
		public readonly codeIndexManager?: CodeIndexManager,
		mdmService?: MdmService,
	) {
		super()

		this.log("ClineProvider instantiated")
		ClineProvider.activeInstances.add(this)

		this.codeIndexManager = codeIndexManager
		this.mdmService = mdmService
		this.updateGlobalState("codebaseIndexModels", EMBEDDING_MODEL_PROFILES)

		// Start configuration loading (which might trigger indexing) in the background.
		// Don't await, allowing activation to continue immediately.

		this._workspaceTracker = new WorkspaceTracker(this)

		this.providerSettingsManager = new ProviderSettingsManager(this.context)

		this.customModesManager = new CustomModesManager(this.context, async () => {
			await this.postStateToWebview()
		})

		// Initialize MCP Hub through the singleton manager
		McpServerManager.getInstance(this.context, this)
			.then((hub) => {
				this.mcpHub = hub
				this.mcpHub.registerClient()
			})
			.catch((error) => {
				this.log(`Failed to initialize MCP Hub: ${error}`)
			})

		this.marketplaceManager = new MarketplaceManager(this.context)
	}

	// Adds a new Cline instance to clineStack, marking the start of a new task.
	// The instance is pushed to the top of the stack (LIFO order).
	// When the task is completed, the top instance is removed, reactivating the previous task.
	async addClineToStack(cline: Task) {
		console.log(`[subtasks] adding task ${cline.taskId}.${cline.instanceId} to stack`)

		// Add this cline instance into the stack that represents the order of all the called tasks.
		this.clineStack.push(cline)

		// Ensure getState() resolves correctly.
		const state = await this.getState()

		if (!state || typeof state.mode !== "string") {
			throw new Error(t("common:errors.retrieve_current_mode"))
		}
	}

	// Removes and destroys the top Cline instance (the current finished task),
	// activating the previous one (resuming the parent task).
	async removeClineFromStack() {
		if (this.clineStack.length === 0) {
			return
		}

		// Pop the top Cline instance from the stack.
		let cline = this.clineStack.pop()

		if (cline) {
			console.log(`[subtasks] removing task ${cline.taskId}.${cline.instanceId} from stack`)

			try {
				// Abort the running task and set isAbandoned to true so
				// all running promises will exit as well.
				await cline.abortTask(true)
			} catch (e) {
				this.log(
					`[subtasks] encountered error while aborting task ${cline.taskId}.${cline.instanceId}: ${e.message}`,
				)
			}

			// Make sure no reference kept, once promises end it will be
			// garbage collected.
			cline = undefined
		}
	}

	// returns the current cline object in the stack (the top one)
	// if the stack is empty, returns undefined
	getCurrentCline(): Task | undefined {
		if (this.clineStack.length === 0) {
			return undefined
		}
		return this.clineStack[this.clineStack.length - 1]
	}

	// returns the current clineStack length (how many cline objects are in the stack)
	getClineStackSize(): number {
		return this.clineStack.length
	}

	public getCurrentTaskStack(): string[] {
		return this.clineStack.map((cline) => cline.taskId)
	}

	// remove the current task/cline instance (at the top of the stack), so this task is finished
	// and resume the previous task/cline instance (if it exists)
	// this is used when a sub task is finished and the parent task needs to be resumed
	async finishSubTask(lastMessage: string) {
		console.log(`[subtasks] finishing subtask ${lastMessage}`)
		// remove the last cline instance from the stack (this is the finished sub task)
		await this.removeClineFromStack()
		// resume the last cline instance in the stack (if it exists - this is the 'parent' calling task)
		await this.getCurrentCline()?.resumePausedTask(lastMessage)
	}

	// Clear the current task without treating it as a subtask
	// This is used when the user cancels a task that is not a subtask
	async clearTask() {
		await this.removeClineFromStack()
	}

	/*
	VSCode extensions use the disposable pattern to clean up resources when the sidebar/editor tab is closed by the user or system. This applies to event listening, commands, interacting with the UI, etc.
	- https://vscode-docs.readthedocs.io/en/stable/extensions/patterns-and-principles/
	- https://github.com/microsoft/vscode-extension-samples/blob/main/webview-sample/src/extension.ts
	*/
	private clearWebviewResources() {
		while (this.webviewDisposables.length) {
			const x = this.webviewDisposables.pop()
			if (x) {
				x.dispose()
			}
		}
	}

	async dispose() {
		this.log("Disposing ClineProvider...")
		await this.removeClineFromStack()
		this.log("Cleared task")

		if (this.view && "dispose" in this.view) {
			this.view.dispose()
			this.log("Disposed webview")
		}

		this.clearWebviewResources()

		while (this.disposables.length) {
			const x = this.disposables.pop()

			if (x) {
				x.dispose()
			}
		}

		this._workspaceTracker?.dispose()
		this._workspaceTracker = undefined
		await this.mcpHub?.unregisterClient()
		this.mcpHub = undefined
		this.marketplaceManager?.cleanup()
		this.customModesManager?.dispose()
		this.log("Disposed all disposables")
		ClineProvider.activeInstances.delete(this)

		McpServerManager.unregisterProvider(this)
	}

	public static getVisibleInstance(): ClineProvider | undefined {
		return findLast(Array.from(this.activeInstances), (instance) => instance.view?.visible === true)
	}

	public static async getInstance(): Promise<ClineProvider | undefined> {
		let visibleProvider = ClineProvider.getVisibleInstance()

		// If no visible provider, try to show the sidebar view
		if (!visibleProvider) {
			await vscode.commands.executeCommand(`${Package.name}.SidebarProvider.focus`)
			// Wait briefly for the view to become visible
			await delay(100)
			visibleProvider = ClineProvider.getVisibleInstance()
		}

		// If still no visible provider, return
		if (!visibleProvider) {
			return
		}

		return visibleProvider
	}

	public static async isActiveTask(): Promise<boolean> {
		const visibleProvider = await ClineProvider.getInstance()
		if (!visibleProvider) {
			return false
		}

		// Check if there is a cline instance in the stack (if this provider has an active task)
		if (visibleProvider.getCurrentCline()) {
			return true
		}

		return false
	}

	public static async handleCodeAction(
		command: CodeActionId,
		promptType: CodeActionName,
		params: Record<string, string | any[]>,
	): Promise<void> {
		const visibleProvider = await ClineProvider.getInstance()

		if (!visibleProvider) {
			return
		}

		const { customSupportPrompts } = await visibleProvider.getState()

		// TODO: Improve type safety for promptType.
		const prompt = supportPrompt.create(promptType, params, customSupportPrompts)

		if (command === "addToContext") {
			await visibleProvider.postMessageToWebview({ type: "invoke", invoke: "setChatBoxMessage", text: prompt })
			return
		}

		await visibleProvider.initClineWithTask(prompt)
	}

	public static async handleTerminalAction(
		command: TerminalActionId,
		promptType: TerminalActionPromptType,
		params: Record<string, string | any[]>,
	): Promise<void> {
		const visibleProvider = await ClineProvider.getInstance()

		if (!visibleProvider) {
			return
		}

		const { customSupportPrompts } = await visibleProvider.getState()
		const prompt = supportPrompt.create(promptType, params, customSupportPrompts)

		if (command === "terminalAddToContext") {
			await visibleProvider.postMessageToWebview({ type: "invoke", invoke: "setChatBoxMessage", text: prompt })
			return
		}

		try {
			await visibleProvider.initClineWithTask(prompt)
		} catch (error) {
			if (error instanceof OrganizationAllowListViolationError) {
				// Errors from terminal commands seem to get swallowed / ignored.
				vscode.window.showErrorMessage(error.message)
			}
			throw error
		}
	}

	async resolveWebviewView(webviewView: vscode.WebviewView | vscode.WebviewPanel) {
		this.log("Resolving webview view")

		this.view = webviewView

		// kilocode_change start: extract constant inTabMode
		// Set panel reference according to webview type
		const inTabMode = "onDidChangeViewState" in webviewView
		if (inTabMode) {
			// Tag page type
			setPanel(webviewView, "tab")
		} else if ("onDidChangeVisibility" in webviewView) {
			// Sidebar Type
			setPanel(webviewView, "sidebar")
		}
		// kilocode_change end

		// Initialize out-of-scope variables that need to receive persistent global state values
		this.getState().then(
			({
				terminalShellIntegrationTimeout = Terminal.defaultShellIntegrationTimeout,
				terminalShellIntegrationDisabled = false,
				terminalCommandDelay = 0,
				terminalZshClearEolMark = true,
				terminalZshOhMy = false,
				terminalZshP10k = false,
				terminalPowershellCounter = false,
				terminalZdotdir = false,
			}) => {
				Terminal.setShellIntegrationTimeout(terminalShellIntegrationTimeout)
				Terminal.setShellIntegrationDisabled(terminalShellIntegrationDisabled)
				Terminal.setCommandDelay(terminalCommandDelay)
				Terminal.setTerminalZshClearEolMark(terminalZshClearEolMark)
				Terminal.setTerminalZshOhMy(terminalZshOhMy)
				Terminal.setTerminalZshP10k(terminalZshP10k)
				Terminal.setPowershellCounter(terminalPowershellCounter)
				Terminal.setTerminalZdotdir(terminalZdotdir)
			},
		)

		// Initialize tts enabled state
		this.getState().then(({ ttsEnabled }) => {
			setTtsEnabled(ttsEnabled ?? false)
		})

		// Initialize tts speed state
		this.getState().then(({ ttsSpeed }) => {
			setTtsSpeed(ttsSpeed ?? 1)
		})

		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,
			localResourceRoots: [this.contextProxy.extensionUri],
		}

		webviewView.webview.html =
			this.contextProxy.extensionMode === vscode.ExtensionMode.Development
				? await this.getHMRHtmlContent(webviewView.webview)
				: this.getHtmlContent(webviewView.webview)

		// Sets up an event listener to listen for messages passed from the webview view context
		// and executes code based on the message that is received
		this.setWebviewMessageListener(webviewView.webview)

		// Subscribe to code index status updates if the manager exists
		if (this.codeIndexManager) {
			this.codeIndexStatusSubscription = this.codeIndexManager.onProgressUpdate((update: IndexProgressUpdate) => {
				this.postMessageToWebview({
					type: "indexingStatusUpdate",
					values: update,
				})
			})
			this.webviewDisposables.push(this.codeIndexStatusSubscription)
		}

		// Logs show up in bottom panel > Debug Console
		//console.log("registering listener")

		// Listen for when the panel becomes visible
		// https://github.com/microsoft/vscode-discussions/discussions/840
		if ("onDidChangeViewState" in webviewView) {
			// WebviewView and WebviewPanel have all the same properties except for this visibility listener
			// panel
			const viewStateDisposable = webviewView.onDidChangeViewState(() => {
				if (this.view?.visible) {
					this.postMessageToWebview({ type: "action", action: "didBecomeVisible" })
				}
			})
			this.webviewDisposables.push(viewStateDisposable)
		} else if ("onDidChangeVisibility" in webviewView) {
			// sidebar
			const visibilityDisposable = webviewView.onDidChangeVisibility(() => {
				if (this.view?.visible) {
					this.postMessageToWebview({ type: "action", action: "didBecomeVisible" })
				}
			})
			this.webviewDisposables.push(visibilityDisposable)
		}

		// Listen for when the view is disposed
		// This happens when the user closes the view or when the view is closed programmatically
		webviewView.onDidDispose(
			async () => {
				if (inTabMode) {
					this.log("Disposing ClineProvider instance for tab view")
					await this.dispose()
				} else {
					this.log("Clearing webview resources for sidebar view")
					this.clearWebviewResources()
					this.codeIndexStatusSubscription?.dispose()
					this.codeIndexStatusSubscription = undefined
				}
			},
			null,
			this.disposables,
		)

		// Listen for when color changes
		const configDisposable = vscode.workspace.onDidChangeConfiguration(async (e) => {
			if (e && e.affectsConfiguration("workbench.colorTheme")) {
				// Sends latest theme name to webview
				await this.postMessageToWebview({ type: "theme", text: JSON.stringify(await getTheme()) })
			}
		})
		this.webviewDisposables.push(configDisposable)

		// If the extension is starting a new session, clear previous task state.
		await this.removeClineFromStack()

		this.log("Webview view resolved")
	}

	public async initClineWithSubTask(parent: Task, task?: string, images?: string[]) {
		return this.initClineWithTask(task, images, parent)
	}

	// When initializing a new task, (not from history but from a tool command
	// new_task) there is no need to remove the previous task since the new
	// task is a subtask of the previous one, and when it finishes it is removed
	// from the stack and the caller is resumed in this way we can have a chain
	// of tasks, each one being a sub task of the previous one until the main
	// task is finished.
	public async initClineWithTask(
		task?: string,
		images?: string[],
		parentTask?: Task,
		options: Partial<
			Pick<
				TaskOptions,
				"enableDiff" | "enableCheckpoints" | "fuzzyMatchThreshold" | "consecutiveMistakeLimit" | "experiments"
			>
		> = {},
	) {
		const {
			apiConfiguration,
			organizationAllowList,
			diffEnabled: enableDiff,
			enableCheckpoints,
			fuzzyMatchThreshold,
			experiments,
		} = await this.getState()

		if (!ProfileValidator.isProfileAllowed(apiConfiguration, organizationAllowList)) {
			throw new OrganizationAllowListViolationError(t("common:errors.violated_organization_allowlist"))
		}

		const cline = new Task({
			context: this.context, // kilocode_change
			provider: this,
			apiConfiguration,
			enableDiff,
			enableCheckpoints,
			fuzzyMatchThreshold,
			task,
			images,
			experiments,
			rootTask: this.clineStack.length > 0 ? this.clineStack[0] : undefined,
			parentTask,
			taskNumber: this.clineStack.length + 1,
			onCreated: (cline) => this.emit("clineCreated", cline),
			...options,
		})

		await this.addClineToStack(cline)

		this.log(
			`[subtasks] ${cline.parentTask ? "child" : "parent"} task ${cline.taskId}.${cline.instanceId} instantiated`,
		)

		return cline
	}

	public async initClineWithHistoryItem(historyItem: HistoryItem & { rootTask?: Task; parentTask?: Task }) {
		await this.removeClineFromStack()

		const {
			apiConfiguration,
			diffEnabled: enableDiff,
			enableCheckpoints,
			fuzzyMatchThreshold,
			experiments,
		} = await this.getState()

		const cline = new Task({
			context: this.context, // kilocode_change
			provider: this,
			apiConfiguration,
			enableDiff,
			enableCheckpoints,
			fuzzyMatchThreshold,
			historyItem,
			experiments,
			rootTask: historyItem.rootTask,
			parentTask: historyItem.parentTask,
			taskNumber: historyItem.number,
			onCreated: (cline) => this.emit("clineCreated", cline),
		})

		await this.addClineToStack(cline)
		this.log(
			`[subtasks] ${cline.parentTask ? "child" : "parent"} task ${cline.taskId}.${cline.instanceId} instantiated`,
		)
		return cline
	}

	public async postMessageToWebview(message: ExtensionMessage) {
		await this.view?.webview.postMessage(message)
	}

	private async getHMRHtmlContent(webview: vscode.Webview): Promise<string> {
		// Try to read the port from the file
		let localPort = "5173" // Default fallback
		try {
			const fs = require("fs")
			const path = require("path")
			const portFilePath = path.resolve(__dirname, "../../.vite-port")

			if (fs.existsSync(portFilePath)) {
				localPort = fs.readFileSync(portFilePath, "utf8").trim()
				console.log(`[ClineProvider:Vite] Using Vite server port from ${portFilePath}: ${localPort}`)
			} else {
				console.log(
					`[ClineProvider:Vite] Port file not found at ${portFilePath}, using default port: ${localPort}`,
				)
			}
		} catch (err) {
			console.error("[ClineProvider:Vite] Failed to read Vite port file:", err)
			// Continue with default port if file reading fails
		}

		const localServerUrl = `localhost:${localPort}`

		// Check if local dev server is running.
		try {
			await axios.get(`http://${localServerUrl}`)
		} catch (error) {
			vscode.window.showErrorMessage(t("common:errors.hmr_not_running"))

			return this.getHtmlContent(webview)
		}

		const nonce = getNonce()

		const stylesUri = getUri(webview, this.contextProxy.extensionUri, [
			"webview-ui",
			"build",
			"assets",
			"index.css",
		])

		const codiconsUri = getUri(webview, this.contextProxy.extensionUri, ["assets", "codicons", "codicon.css"])
		const materialIconsUri = getUri(webview, this.contextProxy.extensionUri, [
			"assets",
			"vscode-material-icons",
			"icons",
		])
		const imagesUri = getUri(webview, this.contextProxy.extensionUri, ["assets", "images"])
		const audioUri = getUri(webview, this.contextProxy.extensionUri, ["webview-ui", "audio"])

		const file = "src/index.tsx"
		const scriptUri = `http://${localServerUrl}/${file}`

		const reactRefresh = /*html*/ `
			<script nonce="${nonce}" type="module">
				import RefreshRuntime from "http://localhost:${localPort}/@react-refresh"
				RefreshRuntime.injectIntoGlobalHook(window)
				window.$RefreshReg$ = () => {}
				window.$RefreshSig$ = () => (type) => type
				window.__vite_plugin_react_preamble_installed__ = true
			</script>
		`

		const csp = [
			"default-src 'none'",
			`font-src ${webview.cspSource} data:`,
			`style-src ${webview.cspSource} 'unsafe-inline' https://* http://${localServerUrl} http://0.0.0.0:${localPort}`,
			`img-src ${webview.cspSource} https://storage.googleapis.com https://img.clerk.com data: https://*.googleusercontent.com https://*.googleapis.com`, // kilocode_change: add https://*.googleusercontent.com and https://*.googleapis.com
			`media-src ${webview.cspSource}`,
			`script-src 'unsafe-eval' ${webview.cspSource} https://* https://*.posthog.com http://${localServerUrl} http://0.0.0.0:${localPort} 'nonce-${nonce}'`,
			`connect-src https://* https://*.posthog.com ws://${localServerUrl} ws://0.0.0.0:${localPort} http://${localServerUrl} http://0.0.0.0:${localPort}`,
		]

		return /*html*/ `
			<!DOCTYPE html>
			<html lang="en">
				<head>
					<meta charset="utf-8">
					<meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
					<meta http-equiv="Content-Security-Policy" content="${csp.join("; ")}">
					<link rel="stylesheet" type="text/css" href="${stylesUri}">
					<link href="${codiconsUri}" rel="stylesheet" />
					<script nonce="${nonce}">
						window.IMAGES_BASE_URI = "${imagesUri}"
						window.AUDIO_BASE_URI = "${audioUri}"
						window.MATERIAL_ICONS_BASE_URI = "${materialIconsUri}"
					</script>
					<title>Kilo Code</title>
				</head>
				<body>
					<div id="root"></div>
					${reactRefresh}
					<script type="module" src="${scriptUri}"></script>
				</body>
			</html>
		`
	}

	/**
	 * Defines and returns the HTML that should be rendered within the webview panel.
	 *
	 * @remarks This is also the place where references to the React webview build files
	 * are created and inserted into the webview HTML.
	 *
	 * @param webview A reference to the extension webview
	 * @param extensionUri The URI of the directory containing the extension
	 * @returns A template string literal containing the HTML that should be
	 * rendered within the webview panel
	 */
	private getHtmlContent(webview: vscode.Webview): string {
		// Get the local path to main script run in the webview,
		// then convert it to a uri we can use in the webview.

		// The CSS file from the React build output
		const stylesUri = getUri(webview, this.contextProxy.extensionUri, [
			"webview-ui",
			"build",
			"assets",
			"index.css",
		])

		const scriptUri = getUri(webview, this.contextProxy.extensionUri, ["webview-ui", "build", "assets", "index.js"])
		const codiconsUri = getUri(webview, this.contextProxy.extensionUri, ["assets", "codicons", "codicon.css"])
		const materialIconsUri = getUri(webview, this.contextProxy.extensionUri, [
			"assets",
			"vscode-material-icons",
			"icons",
		])
		const imagesUri = getUri(webview, this.contextProxy.extensionUri, ["assets", "images"])
		const audioUri = getUri(webview, this.contextProxy.extensionUri, ["webview-ui", "audio"])

		// Use a nonce to only allow a specific script to be run.
		/*
		content security policy of your webview to only allow scripts that have a specific nonce
		create a content security policy meta tag so that only loading scripts with a nonce is allowed
		As your extension grows you will likely want to add custom styles, fonts, and/or images to your webview. If you do, you will need to update the content security policy meta tag to explicitly allow for these resources. E.g.
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">
		- 'unsafe-inline' is required for styles due to vscode-webview-toolkit's dynamic style injection
		- since we pass base64 images to the webview, we need to specify img-src ${webview.cspSource} data:;

		in meta tag we add nonce attribute: A cryptographic nonce (only used once) to allow scripts. The server must generate a unique nonce value each time it transmits a policy. It is critical to provide a nonce that cannot be guessed as bypassing a resource's policy is otherwise trivial.
		*/
		const nonce = getNonce()

		// Tip: Install the es6-string-html VS Code extension to enable code highlighting below
		return /*html*/ `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
            <meta name="theme-color" content="#000000">
			<!-- kilocode_change: add https://*.googleusercontent.com https://*.googleapis.com to img-src, https://* to connect-src -->
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https://*.googleusercontent.com https://storage.googleapis.com https://img.clerk.com data: https://*.googleapis.com; media-src ${webview.cspSource}; script-src ${webview.cspSource} 'wasm-unsafe-eval' 'nonce-${nonce}' https://us-assets.i.posthog.com 'strict-dynamic'; connect-src https://* https://openrouter.ai https://api.requesty.ai https://us.i.posthog.com https://us-assets.i.posthog.com;">
            <link rel="stylesheet" type="text/css" href="${stylesUri}">
			<link href="${codiconsUri}" rel="stylesheet" />
			<script nonce="${nonce}">
				window.IMAGES_BASE_URI = "${imagesUri}"
				window.AUDIO_BASE_URI = "${audioUri}"
				window.MATERIAL_ICONS_BASE_URI = "${materialIconsUri}"
			</script>
            <title>Kilo Code</title>
          </head>
          <body>
            <noscript>You need to enable JavaScript to run this app.</noscript>
            <div id="root"></div>
            <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
          </body>
        </html>
      `
	}

	/**
	 * Sets up an event listener to listen for messages passed from the webview context and
	 * executes code based on the message that is received.
	 *
	 * @param webview A reference to the extension webview
	 */
	private setWebviewMessageListener(webview: vscode.Webview) {
		const onReceiveMessage = async (message: WebviewMessage) =>
			webviewMessageHandler(this, message, this.marketplaceManager)

		const messageDisposable = webview.onDidReceiveMessage(onReceiveMessage)
		this.webviewDisposables.push(messageDisposable)
	}

	/**
	 * Handle switching to a new mode, including updating the associated API configuration
	 * @param newMode The mode to switch to
	 */
	public async handleModeSwitch(newMode: Mode) {
		const cline = this.getCurrentCline()

		if (cline) {
			cline.emit("taskModeSwitched", cline.taskId, newMode)
		}

		await this.updateGlobalState("mode", newMode)

		// Load the saved API config for the new mode if it exists
		const savedConfigId = await this.providerSettingsManager.getModeConfigId(newMode)
		const listApiConfig = await this.providerSettingsManager.listConfig()

		// Update listApiConfigMeta first to ensure UI has latest data
		await this.updateGlobalState("listApiConfigMeta", listApiConfig)

		// If this mode has a saved config, use it.
		if (savedConfigId) {
			const profile = listApiConfig.find(({ id }) => id === savedConfigId)

			if (profile?.name) {
				await this.activateProviderProfile({ name: profile.name })
			}
		} else {
			// If no saved config for this mode, save current config as default.
			const currentApiConfigName = this.getGlobalState("currentApiConfigName")

			if (currentApiConfigName) {
				const config = listApiConfig.find((c) => c.name === currentApiConfigName)

				if (config?.id) {
					await this.providerSettingsManager.setModeConfig(newMode, config.id)
				}
			}
		}

		await this.postStateToWebview()
	}

	// Provider Profile Management

	getProviderProfileEntries(): ProviderSettingsEntry[] {
		return this.contextProxy.getValues().listApiConfigMeta || []
	}

	getProviderProfileEntry(name: string): ProviderSettingsEntry | undefined {
		return this.getProviderProfileEntries().find((profile) => profile.name === name)
	}

	public hasProviderProfileEntry(name: string): boolean {
		return !!this.getProviderProfileEntry(name)
	}

	async upsertProviderProfile(
		name: string,
		providerSettings: ProviderSettings,
		activate: boolean = true,
	): Promise<string | undefined> {
		try {
			// TODO: Do we need to be calling `activateProfile`? It's not
			// clear to me what the source of truth should be; in some cases
			// we rely on the `ContextProxy`'s data store and in other cases
			// we rely on the `ProviderSettingsManager`'s data store. It might
			// be simpler to unify these two.
			const id = await this.providerSettingsManager.saveConfig(name, providerSettings)

			if (activate) {
				const { mode } = await this.getState()

				// These promises do the following:
				// 1. Adds or updates the list of provider profiles.
				// 2. Sets the current provider profile.
				// 3. Sets the current mode's provider profile.
				// 4. Copies the provider settings to the context.
				//
				// Note: 1, 2, and 4 can be done in one `ContextProxy` call:
				// this.contextProxy.setValues({ ...providerSettings, listApiConfigMeta: ..., currentApiConfigName: ... })
				// We should probably switch to that and verify that it works.
				// I left the original implementation in just to be safe.
				await Promise.all([
					this.updateGlobalState("listApiConfigMeta", await this.providerSettingsManager.listConfig()),
					this.updateGlobalState("currentApiConfigName", name),
					this.providerSettingsManager.setModeConfig(mode, id),
					this.contextProxy.setProviderSettings(providerSettings),
				])

				// Notify CodeIndexManager about the settings change
				if (this.codeIndexManager) {
					await this.codeIndexManager.handleExternalSettingsChange()
				}

				// Change the provider for the current task.
				// TODO: We should rename `buildApiHandler` for clarity (e.g. `getProviderClient`).
				const task = this.getCurrentCline()

				if (task) {
					task.api = buildApiHandler(providerSettings)
				}
			} else {
				await this.updateGlobalState("listApiConfigMeta", await this.providerSettingsManager.listConfig())
			}

			await this.postStateToWebview()
			return id
		} catch (error) {
			this.log(
				`Error create new api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)

			vscode.window.showErrorMessage(t("common:errors.create_api_config"))
			return undefined
		}
	}

	async deleteProviderProfile(profileToDelete: ProviderSettingsEntry) {
		const globalSettings = this.contextProxy.getValues()
		let profileToActivate: string | undefined = globalSettings.currentApiConfigName

		if (profileToDelete.name === profileToActivate) {
			profileToActivate = this.getProviderProfileEntries().find(({ name }) => name !== profileToDelete.name)?.name
		}

		if (!profileToActivate) {
			throw new Error("You cannot delete the last profile")
		}

		const entries = this.getProviderProfileEntries().filter(({ name }) => name !== profileToDelete.name)

		await this.contextProxy.setValues({
			...globalSettings,
			currentApiConfigName: profileToActivate,
			listApiConfigMeta: entries,
		})

		await this.postStateToWebview()
	}

	async activateProviderProfile(args: { name: string } | { id: string }) {
		const { name, id, ...providerSettings } = await this.providerSettingsManager.activateProfile(args)

		// See `upsertProviderProfile` for a description of what this is doing.
		await Promise.all([
			this.contextProxy.setValue("listApiConfigMeta", await this.providerSettingsManager.listConfig()),
			this.contextProxy.setValue("currentApiConfigName", name),
			this.contextProxy.setProviderSettings(providerSettings),
		])

		const { mode } = await this.getState()

		if (id) {
			await this.providerSettingsManager.setModeConfig(mode, id)
		}

		// Change the provider for the current task.
		const task = this.getCurrentCline()

		if (task) {
			task.api = buildApiHandler(providerSettings)
		}

		await this.postStateToWebview()
	}

	// Task Management

	async cancelTask() {
		const cline = this.getCurrentCline()

		if (!cline) {
			return
		}

		console.log(`[subtasks] cancelling task ${cline.taskId}.${cline.instanceId}`)

		const { historyItem } = await this.getTaskWithId(cline.taskId)
		// Preserve parent and root task information for history item.
		const rootTask = cline.rootTask
		const parentTask = cline.parentTask

		cline.abortTask()

		await pWaitFor(
			() =>
				this.getCurrentCline()! === undefined ||
				this.getCurrentCline()!.isStreaming === false ||
				this.getCurrentCline()!.didFinishAbortingStream ||
				// If only the first chunk is processed, then there's no
				// need to wait for graceful abort (closes edits, browser,
				// etc).
				this.getCurrentCline()!.isWaitingForFirstChunk,
			{
				timeout: 3_000,
			},
		).catch(() => {
			console.error("Failed to abort task")
		})

		if (this.getCurrentCline()) {
			// 'abandoned' will prevent this Cline instance from affecting
			// future Cline instances. This may happen if its hanging on a
			// streaming request.
			this.getCurrentCline()!.abandoned = true
		}

		// Clears task again, so we need to abortTask manually above.
		await this.initClineWithHistoryItem({ ...historyItem, rootTask, parentTask })
	}

	async updateCustomInstructions(instructions?: string) {
		// User may be clearing the field.
		await this.updateGlobalState("customInstructions", instructions || undefined)
		await this.postStateToWebview()
	}

	// MCP

	async ensureMcpServersDirectoryExists(): Promise<string> {
		// Get platform-specific application data directory
		let mcpServersDir: string
		if (process.platform === "win32") {
			// Windows: %APPDATA%\Kilo-Code\MCP
			mcpServersDir = path.join(os.homedir(), "AppData", "Roaming", "Kilo-Code", "MCP")
		} else if (process.platform === "darwin") {
			// macOS: ~/Documents/Kilo-Code/MCP
			mcpServersDir = path.join(os.homedir(), "Documents", "Kilo-Code", "MCP")
		} else {
			// Linux: ~/.local/share/Kilo-Code/MCP
			mcpServersDir = path.join(os.homedir(), ".local", "share", "Kilo-Code", "MCP")
		}

		try {
			await fs.mkdir(mcpServersDir, { recursive: true })
		} catch (error) {
			// Fallback to a relative path if directory creation fails
			return path.join(os.homedir(), ".kilocode", "mcp")
		}
		return mcpServersDir
	}

	async ensureSettingsDirectoryExists(): Promise<string> {
		const { getSettingsDirectoryPath } = await import("../../utils/storage")
		const globalStoragePath = this.contextProxy.globalStorageUri.fsPath
		return getSettingsDirectoryPath(globalStoragePath)
	}

	// OpenRouter

	async handleOpenRouterCallback(code: string) {
		let { apiConfiguration, currentApiConfigName } = await this.getState()

		let apiKey: string
		try {
			const baseUrl = apiConfiguration.openRouterBaseUrl || "https://openrouter.ai/api/v1"
			// Extract the base domain for the auth endpoint
			const baseUrlDomain = baseUrl.match(/^(https?:\/\/[^\/]+)/)?.[1] || "https://openrouter.ai"
			const response = await axios.post(`${baseUrlDomain}/api/v1/auth/keys`, { code })
			if (response.data && response.data.key) {
				apiKey = response.data.key
			} else {
				throw new Error("Invalid response from OpenRouter API")
			}
		} catch (error) {
			this.log(
				`Error exchanging code for API key: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)
			throw error
		}

		const newConfiguration: ProviderSettings = {
			...apiConfiguration,
			apiProvider: "openrouter",
			openRouterApiKey: apiKey,
			openRouterModelId: apiConfiguration?.openRouterModelId || openRouterDefaultModelId,
		}

		await this.upsertProviderProfile(currentApiConfigName, newConfiguration)
	}

	// Glama

	async handleGlamaCallback(code: string) {
		let apiKey: string
		try {
			const response = await axios.post("https://glama.ai/api/gateway/v1/auth/exchange-code", { code })
			if (response.data && response.data.apiKey) {
				apiKey = response.data.apiKey
			} else {
				throw new Error("Invalid response from Glama API")
			}
		} catch (error) {
			this.log(
				`Error exchanging code for API key: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)
			throw error
		}

		const { apiConfiguration, currentApiConfigName } = await this.getState()

		const newConfiguration: ProviderSettings = {
			...apiConfiguration,
			apiProvider: "glama",
			glamaApiKey: apiKey,
			glamaModelId: apiConfiguration?.glamaModelId || glamaDefaultModelId,
		}

		await this.upsertProviderProfile(currentApiConfigName, newConfiguration)
	}

	// Requesty

	async handleRequestyCallback(code: string) {
		let { apiConfiguration, currentApiConfigName } = await this.getState()

		const newConfiguration: ProviderSettings = {
			...apiConfiguration,
			apiProvider: "requesty",
			requestyApiKey: code,
			requestyModelId: apiConfiguration?.requestyModelId || requestyDefaultModelId,
		}

		await this.upsertProviderProfile(currentApiConfigName, newConfiguration)
	}

	// kilocode_change:
	async handleKiloCodeCallback(token: string) {
		const kilocode: ProviderName = "kilocode"
		let { apiConfiguration, currentApiConfigName } = await this.getState()

		await this.upsertProviderProfile(currentApiConfigName, {
			...apiConfiguration,
			apiProvider: "kilocode",
			kilocodeToken: token,
		})

		vscode.window.showInformationMessage("Kilo Code successfully configured!")

		if (this.getCurrentCline()) {
			this.getCurrentCline()!.api = buildApiHandler({
				apiProvider: kilocode,
				kilocodeToken: token,
			})
		}
	}

	// Task history

	async getTaskWithId(id: string): Promise<{
		historyItem: HistoryItem
		taskDirPath: string
		apiConversationHistoryFilePath: string
		uiMessagesFilePath: string
		apiConversationHistory: Anthropic.MessageParam[]
	}> {
		const history = this.getGlobalState("taskHistory") ?? []
		const historyItem = history.find((item) => item.id === id)

		if (historyItem) {
			const { getTaskDirectoryPath } = await import("../../utils/storage")
			const globalStoragePath = this.contextProxy.globalStorageUri.fsPath
			const taskDirPath = await getTaskDirectoryPath(globalStoragePath, id)
			const apiConversationHistoryFilePath = path.join(taskDirPath, GlobalFileNames.apiConversationHistory)
			const uiMessagesFilePath = path.join(taskDirPath, GlobalFileNames.uiMessages)
			const fileExists = await fileExistsAtPath(apiConversationHistoryFilePath)

			if (fileExists) {
				const apiConversationHistory = JSON.parse(await fs.readFile(apiConversationHistoryFilePath, "utf8"))

				return {
					historyItem,
					taskDirPath,
					apiConversationHistoryFilePath,
					uiMessagesFilePath,
					apiConversationHistory,
				}
			} else {
				vscode.window.showErrorMessage(
					`Task file not found for task ID: ${id} (file ${apiConversationHistoryFilePath})`,
				) //kilocode_change show extra debugging information to debug task not found issues
			}
		} else {
			vscode.window.showErrorMessage(`Task with ID: ${id} not found in history.`) // kilocode_change show extra debugging information to debug task not found issues
		}

		// if we tried to get a task that doesn't exist, remove it from state
		// FIXME: this seems to happen sometimes when the json file doesnt save to disk for some reason
		// await this.deleteTaskFromState(id) // kilocode_change disable confusing behaviour
		await this.setTaskFileNotFound(id) // kilocode_change
		throw new Error("Task not found")
	}

	async showTaskWithId(id: string) {
		if (id !== this.getCurrentCline()?.taskId) {
			// Non-current task.
			const { historyItem } = await this.getTaskWithId(id)
			await this.initClineWithHistoryItem(historyItem) // Clears existing task.
		}

		await this.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
	}

	async exportTaskWithId(id: string) {
		const { historyItem, apiConversationHistory } = await this.getTaskWithId(id)
		await downloadTask(historyItem.ts, apiConversationHistory)
	}

	/* Condenses a task's message history to use fewer tokens. */
	async condenseTaskContext(taskId: string) {
		let task: Task | undefined
		for (let i = this.clineStack.length - 1; i >= 0; i--) {
			if (this.clineStack[i].taskId === taskId) {
				task = this.clineStack[i]
				break
			}
		}
		if (!task) {
			throw new Error(`Task with id ${taskId} not found in stack`)
		}
		await task.condenseContext()
		await this.postMessageToWebview({ type: "condenseTaskContextResponse", text: taskId })
	}

	// this function deletes a task from task hidtory, and deletes it's checkpoints and delete the task folder
	async deleteTaskWithId(id: string) {
		try {
			// get the task directory full path
			const { taskDirPath } = await this.getTaskWithId(id)

			// kilocode_change start
			// Check if task is favorited
			const history = this.getGlobalState("taskHistory") ?? []
			const task = history.find((item) => item.id === id)
			if (task?.isFavorited) {
				throw new Error("Cannot delete a favorited task. Please unfavorite it first.")
			}
			// kilocode_change end

			// remove task from stack if it's the current task
			if (id === this.getCurrentCline()?.taskId) {
				// if we found the taskid to delete - call finish to abort this task and allow a new task to be started,
				// if we are deleting a subtask and parent task is still waiting for subtask to finish - it allows the parent to resume (this case should neve exist)
				await this.finishSubTask(t("common:tasks.deleted"))
			}

			// delete task from the task history state
			await this.deleteTaskFromState(id)

			// Delete associated shadow repository or branch.
			// TODO: Store `workspaceDir` in the `HistoryItem` object.
			const globalStorageDir = this.contextProxy.globalStorageUri.fsPath
			const workspaceDir = this.cwd

			try {
				await ShadowCheckpointService.deleteTask({ taskId: id, globalStorageDir, workspaceDir })
			} catch (error) {
				console.error(
					`[deleteTaskWithId${id}] failed to delete associated shadow repository or branch: ${error instanceof Error ? error.message : String(error)}`,
				)
			}

			// delete the entire task directory including checkpoints and all content
			try {
				await fs.rm(taskDirPath, { recursive: true, force: true })
				console.log(`[deleteTaskWithId${id}] removed task directory`)
			} catch (error) {
				console.error(
					`[deleteTaskWithId${id}] failed to remove task directory: ${error instanceof Error ? error.message : String(error)}`,
				)
			}
		} catch (error) {
			// If task is not found, just remove it from state
			if (error instanceof Error && error.message === "Task not found") {
				await this.deleteTaskFromState(id)
				return
			}
			throw error
		}
	}

	async deleteTaskFromState(id: string) {
		const taskHistory = this.getGlobalState("taskHistory") ?? []
		const updatedTaskHistory = taskHistory.filter((task) => task.id !== id)
		await this.updateGlobalState("taskHistory", updatedTaskHistory)
		await this.postStateToWebview()
	}

	async postStateToWebview() {
		const state = await this.getStateToPostToWebview()
		this.postMessageToWebview({ type: "state", state })

		// Check MDM compliance and send user to account tab if not compliant
		if (!this.checkMdmCompliance()) {
			await this.postMessageToWebview({ type: "action", action: "accountButtonClicked" })
		}
	}

	// kilocode_change start
	async postRulesDataToWebview() {
		const workspacePath = this.cwd
		if (workspacePath) {
			this.postMessageToWebview({
				type: "rulesData",
				...(await getEnabledRules(workspacePath, this.contextProxy, this.context)),
			})
		}
	}
	// kilocode_change end

	/**
	 * Fetches marketplace dataon demand to avoid blocking main state updates
	 */
	async fetchMarketplaceData() {
		try {
			const [marketplaceItems, marketplaceInstalledMetadata] = await Promise.all([
				this.marketplaceManager.getCurrentItems().catch((error) => {
					console.error("Failed to fetch marketplace items:", error)
					return [] as MarketplaceItem[]
				}),
				this.marketplaceManager.getInstallationMetadata().catch((error) => {
					console.error("Failed to fetch installation metadata:", error)
					return { project: {}, global: {} } as MarketplaceInstalledMetadata
				}),
			])

			// Send marketplace data separately
			this.postMessageToWebview({
				type: "marketplaceData",
				marketplaceItems: marketplaceItems || [],
				marketplaceInstalledMetadata: marketplaceInstalledMetadata || { project: {}, global: {} },
			})
		} catch (error) {
			console.error("Failed to fetch marketplace data:", error)
			// Send empty data on error to prevent UI from hanging
			this.postMessageToWebview({
				type: "marketplaceData",
				marketplaceItems: [],
				marketplaceInstalledMetadata: { project: {}, global: {} },
			})

			// Show user-friendly error notification for network issues
			if (error instanceof Error && error.message.includes("timeout")) {
				vscode.window.showWarningMessage(
					"Marketplace data could not be loaded due to network restrictions. Core functionality remains available.",
				)
			}
		}
	}

	/**
	 * Checks if there is a file-based system prompt override for the given mode
	 */
	async hasFileBasedSystemPromptOverride(mode: Mode): Promise<boolean> {
		const promptFilePath = getSystemPromptFilePath(this.cwd, mode)
		return await fileExistsAtPath(promptFilePath)
	}

	/**
	 * Merges allowed commands from global state and workspace configuration
	 * with proper validation and deduplication
	 */
	private mergeAllowedCommands(globalStateCommands?: string[]): string[] {
		try {
			// Validate and sanitize global state commands
			const validGlobalCommands = Array.isArray(globalStateCommands)
				? globalStateCommands.filter((cmd) => typeof cmd === "string" && cmd.trim().length > 0)
				: []

			// Get workspace configuration commands
			const workspaceCommands =
				vscode.workspace.getConfiguration(Package.name).get<string[]>("allowedCommands") || []

			// Validate and sanitize workspace commands
			const validWorkspaceCommands = Array.isArray(workspaceCommands)
				? workspaceCommands.filter((cmd) => typeof cmd === "string" && cmd.trim().length > 0)
				: []

			// Combine and deduplicate commands
			// Global state takes precedence over workspace configuration
			const mergedCommands = [...new Set([...validGlobalCommands, ...validWorkspaceCommands])]

			return mergedCommands
		} catch (error) {
			console.error("Error merging allowed commands:", error)
			// Return empty array as fallback to prevent crashes
			return []
		}
	}

	async getStateToPostToWebview() {
		const {
			apiConfiguration,
			customInstructions,
			alwaysAllowReadOnly,
			alwaysAllowReadOnlyOutsideWorkspace,
			alwaysAllowWrite,
			alwaysAllowWriteOutsideWorkspace,
			alwaysAllowWriteProtected,
			alwaysAllowExecute,
			allowedCommands,
			alwaysAllowBrowser,
			alwaysAllowMcp,
			alwaysAllowModeSwitch,
			alwaysAllowSubtasks,
			allowedMaxRequests,
			autoCondenseContext,
			autoCondenseContextPercent,
			soundEnabled,
			ttsEnabled,
			ttsSpeed,
			diffEnabled,
			enableCheckpoints,
			taskHistory,
			soundVolume,
			browserViewportSize,
			screenshotQuality,
			remoteBrowserHost,
			remoteBrowserEnabled,
			cachedChromeHostUrl,
			writeDelayMs,
			terminalOutputLineLimit,
			terminalShellIntegrationTimeout,
			terminalShellIntegrationDisabled,
			terminalCommandDelay,
			terminalPowershellCounter,
			terminalZshClearEolMark,
			terminalZshOhMy,
			terminalZshP10k,
			terminalZdotdir,
			fuzzyMatchThreshold,
			// mcpEnabled,  // kilocode_change: always true
			enableMcpServerCreation,
			alwaysApproveResubmit,
			requestDelaySeconds,
			currentApiConfigName,
			listApiConfigMeta,
			pinnedApiConfigs,
			mode,
			customModePrompts,
			customSupportPrompts,
			enhancementApiConfigId,
			commitMessageApiConfigId, // kilocode_change
			autoApprovalEnabled,
			customModes,
			experiments,
			maxOpenTabsContext,
			maxWorkspaceFiles,
			browserToolEnabled,
			showRooIgnoredFiles,
			language,
			showAutoApproveMenu, // kilocode_change
			showTaskTimeline, // kilocode_change
			maxReadFileLine,
			terminalCompressProgressBar,
			historyPreviewCollapsed,
			cloudUserInfo,
			cloudIsAuthenticated,
			sharingEnabled,
			organizationAllowList,
			maxConcurrentFileReads,
			allowVeryLargeReads, // kilocode_change
			condensingApiConfigId,
			customCondensingPrompt,
			codebaseIndexConfig,
			codebaseIndexModels,
			profileThresholds,
		} = await this.getState()

		const machineId = vscode.env.machineId

		const mergedAllowedCommands = this.mergeAllowedCommands(allowedCommands)
		const cwd = this.cwd

		// Check if there's a system prompt override for the current mode
		const currentMode = mode ?? defaultModeSlug
		const hasSystemPromptOverride = await this.hasFileBasedSystemPromptOverride(currentMode)

		return {
			version: this.context.extension?.packageJSON?.version ?? "",
			apiConfiguration,
			customInstructions,
			alwaysAllowReadOnly: alwaysAllowReadOnly ?? true,
			alwaysAllowReadOnlyOutsideWorkspace: alwaysAllowReadOnlyOutsideWorkspace ?? true,
			alwaysAllowWrite: alwaysAllowWrite ?? true,
			alwaysAllowWriteOutsideWorkspace: alwaysAllowWriteOutsideWorkspace ?? true,
			alwaysAllowWriteProtected: alwaysAllowWriteProtected ?? false,
			alwaysAllowExecute: alwaysAllowExecute ?? true,
			alwaysAllowBrowser: alwaysAllowBrowser ?? true,
			alwaysAllowMcp: alwaysAllowMcp ?? true,
			alwaysAllowModeSwitch: alwaysAllowModeSwitch ?? true,
			alwaysAllowSubtasks: alwaysAllowSubtasks ?? true,
			allowedMaxRequests,
			autoCondenseContext: autoCondenseContext ?? true,
			autoCondenseContextPercent: autoCondenseContextPercent ?? 100,
			uriScheme: vscode.env.uriScheme,
			uiKind: vscode.UIKind[vscode.env.uiKind], // kilocode_change
			currentTaskItem: this.getCurrentCline()?.taskId
				? (taskHistory || []).find((item: HistoryItem) => item.id === this.getCurrentCline()?.taskId)
				: undefined,
			clineMessages: this.getCurrentCline()?.clineMessages || [],
			taskHistory: (taskHistory || [])
				.filter((item: HistoryItem) => item.ts && item.task)
				.sort((a: HistoryItem, b: HistoryItem) => b.ts - a.ts),
			soundEnabled: soundEnabled ?? false,
			ttsEnabled: ttsEnabled ?? false,
			ttsSpeed: ttsSpeed ?? 1.0,
			diffEnabled: diffEnabled ?? true,
			enableCheckpoints: enableCheckpoints ?? true,
			shouldShowAnnouncement: false, // kilocode_change
			allowedCommands: mergedAllowedCommands,
			soundVolume: soundVolume ?? 0.5,
			browserViewportSize: browserViewportSize ?? "900x600",
			screenshotQuality: screenshotQuality ?? 75,
			remoteBrowserHost,
			remoteBrowserEnabled: remoteBrowserEnabled ?? false,
			cachedChromeHostUrl: cachedChromeHostUrl,
			writeDelayMs: writeDelayMs ?? 1000,
			terminalOutputLineLimit: terminalOutputLineLimit ?? 500,
			terminalShellIntegrationTimeout: terminalShellIntegrationTimeout ?? Terminal.defaultShellIntegrationTimeout,
			terminalShellIntegrationDisabled: terminalShellIntegrationDisabled ?? false,
			terminalCommandDelay: terminalCommandDelay ?? 0,
			terminalPowershellCounter: terminalPowershellCounter ?? false,
			terminalZshClearEolMark: terminalZshClearEolMark ?? true,
			terminalZshOhMy: terminalZshOhMy ?? false,
			terminalZshP10k: terminalZshP10k ?? false,
			terminalZdotdir: terminalZdotdir ?? false,
			fuzzyMatchThreshold: fuzzyMatchThreshold ?? 1.0,
			mcpEnabled: true, // kilocode_change: always true
			enableMcpServerCreation: enableMcpServerCreation ?? true,
			alwaysApproveResubmit: alwaysApproveResubmit ?? false,
			requestDelaySeconds: requestDelaySeconds ?? 10,
			currentApiConfigName: currentApiConfigName ?? "default",
			listApiConfigMeta: listApiConfigMeta ?? [],
			pinnedApiConfigs: pinnedApiConfigs ?? {},
			mode: mode ?? defaultModeSlug,
			customModePrompts: customModePrompts ?? {},
			customSupportPrompts: customSupportPrompts ?? {},
			enhancementApiConfigId,
			commitMessageApiConfigId, // kilocode_change
			autoApprovalEnabled: autoApprovalEnabled ?? true,
			customModes,
			experiments: experiments ?? experimentDefault,
			mcpServers: this.mcpHub?.getAllServers() ?? [],
			maxOpenTabsContext: maxOpenTabsContext ?? 20,
			maxWorkspaceFiles: maxWorkspaceFiles ?? 200,
			cwd,
			browserToolEnabled: browserToolEnabled ?? true,
			machineId,
			showRooIgnoredFiles: showRooIgnoredFiles ?? true,
			showAutoApproveMenu: showAutoApproveMenu ?? false, // kilocode_change
			showTaskTimeline: showTaskTimeline ?? true, // kilocode_change
			language, // kilocode_change
			renderContext: this.renderContext,
			maxReadFileLine: maxReadFileLine ?? -1,
			maxConcurrentFileReads: maxConcurrentFileReads ?? 5,
			allowVeryLargeReads: allowVeryLargeReads ?? false, // kilocode_change
			settingsImportedAt: this.settingsImportedAt,
			terminalCompressProgressBar: terminalCompressProgressBar ?? true,
			hasSystemPromptOverride,
			historyPreviewCollapsed: historyPreviewCollapsed ?? false,
			cloudUserInfo,
			cloudIsAuthenticated: cloudIsAuthenticated ?? false,
			sharingEnabled: sharingEnabled ?? false,
			organizationAllowList,
			condensingApiConfigId,
			customCondensingPrompt,
			codebaseIndexModels: codebaseIndexModels ?? EMBEDDING_MODEL_PROFILES,
			codebaseIndexConfig: codebaseIndexConfig ?? {
				codebaseIndexEnabled: false,
				codebaseIndexQdrantUrl: "http://localhost:6333",
				codebaseIndexEmbedderProvider: "openai",
				codebaseIndexEmbedderBaseUrl: "",
				codebaseIndexEmbedderModelId: "",
			},
			mdmCompliant: this.checkMdmCompliance(),
			profileThresholds: profileThresholds ?? {},
			cloudApiUrl: getRooCodeApiUrl(),
			hasOpenedModeSelector: this.getGlobalState("hasOpenedModeSelector") ?? false,
		}
	}

	/**
	 * Storage
	 * https://dev.to/kompotkot/how-to-use-secretstorage-in-your-vscode-extensions-2hco
	 * https://www.eliostruyf.com/devhack-code-extension-storage-options/
	 */

	async getState() {
		const stateValues = this.contextProxy.getValues()
		const customModes = await this.customModesManager.getCustomModes()

		// Determine apiProvider with the same logic as before.
		const apiProvider: ProviderName = stateValues.apiProvider ? stateValues.apiProvider : "kilocode" // kilocode_change: fall back to kilocode

		// Build the apiConfiguration object combining state values and secrets.
		const providerSettings = this.contextProxy.getProviderSettings()

		// Ensure apiProvider is set properly if not already in state
		if (!providerSettings.apiProvider) {
			providerSettings.apiProvider = apiProvider
		}

		let organizationAllowList = ORGANIZATION_ALLOW_ALL

		try {
			organizationAllowList = await CloudService.instance.getAllowList()
		} catch (error) {
			console.error(
				`[getState] failed to get organization allow list: ${error instanceof Error ? error.message : String(error)}`,
			)
		}

		let cloudUserInfo: CloudUserInfo | null = null

		try {
			cloudUserInfo = CloudService.instance.getUserInfo()
		} catch (error) {
			console.error(
				`[getState] failed to get cloud user info: ${error instanceof Error ? error.message : String(error)}`,
			)
		}

		let cloudIsAuthenticated: boolean = false

		try {
			cloudIsAuthenticated = CloudService.instance.isAuthenticated()
		} catch (error) {
			console.error(
				`[getState] failed to get cloud authentication state: ${error instanceof Error ? error.message : String(error)}`,
			)
		}

		let sharingEnabled: boolean = false

		try {
			sharingEnabled = await CloudService.instance.canShareTask()
		} catch (error) {
			console.error(
				`[getState] failed to get sharing enabled state: ${error instanceof Error ? error.message : String(error)}`,
			)
		}

		// Return the same structure as before
		return {
			apiConfiguration: providerSettings,
			lastShownAnnouncementId: stateValues.lastShownAnnouncementId,
			customInstructions: stateValues.customInstructions,
			apiModelId: stateValues.apiModelId,
			alwaysAllowReadOnly: stateValues.alwaysAllowReadOnly ?? true,
			alwaysAllowReadOnlyOutsideWorkspace: stateValues.alwaysAllowReadOnlyOutsideWorkspace ?? true,
			alwaysAllowWrite: stateValues.alwaysAllowWrite ?? true,
			alwaysAllowWriteOutsideWorkspace: stateValues.alwaysAllowWriteOutsideWorkspace ?? true,
			alwaysAllowWriteProtected: stateValues.alwaysAllowWriteProtected ?? false,
			alwaysAllowExecute: stateValues.alwaysAllowExecute ?? true,
			alwaysAllowBrowser: stateValues.alwaysAllowBrowser ?? true,
			alwaysAllowMcp: stateValues.alwaysAllowMcp ?? true,
			alwaysAllowModeSwitch: stateValues.alwaysAllowModeSwitch ?? true,
			alwaysAllowSubtasks: stateValues.alwaysAllowSubtasks ?? true,
			allowedMaxRequests: stateValues.allowedMaxRequests,
			autoCondenseContext: stateValues.autoCondenseContext ?? true,
			autoCondenseContextPercent: stateValues.autoCondenseContextPercent ?? 100,
			taskHistory: stateValues.taskHistory,
			allowedCommands: stateValues.allowedCommands,
			soundEnabled: stateValues.soundEnabled ?? false,
			ttsEnabled: stateValues.ttsEnabled ?? false,
			ttsSpeed: stateValues.ttsSpeed ?? 1.0,
			diffEnabled: stateValues.diffEnabled ?? true,
			enableCheckpoints: stateValues.enableCheckpoints ?? true,
			soundVolume: stateValues.soundVolume,
			browserViewportSize: stateValues.browserViewportSize ?? "900x600",
			screenshotQuality: stateValues.screenshotQuality ?? 75,
			remoteBrowserHost: stateValues.remoteBrowserHost,
			remoteBrowserEnabled: stateValues.remoteBrowserEnabled ?? true,
			cachedChromeHostUrl: stateValues.cachedChromeHostUrl as string | undefined,
			fuzzyMatchThreshold: stateValues.fuzzyMatchThreshold ?? 1.0,
			writeDelayMs: stateValues.writeDelayMs ?? 1000,
			terminalOutputLineLimit: stateValues.terminalOutputLineLimit ?? 500,
			terminalShellIntegrationTimeout:
				stateValues.terminalShellIntegrationTimeout ?? Terminal.defaultShellIntegrationTimeout,
			terminalShellIntegrationDisabled: stateValues.terminalShellIntegrationDisabled ?? false,
			terminalCommandDelay: stateValues.terminalCommandDelay ?? 0,
			terminalPowershellCounter: stateValues.terminalPowershellCounter ?? false,
			terminalZshClearEolMark: stateValues.terminalZshClearEolMark ?? true,
			terminalZshOhMy: stateValues.terminalZshOhMy ?? false,
			terminalZshP10k: stateValues.terminalZshP10k ?? false,
			terminalZdotdir: stateValues.terminalZdotdir ?? false,
			terminalCompressProgressBar: stateValues.terminalCompressProgressBar ?? true,
			mode: stateValues.mode ?? defaultModeSlug,
			language: stateValues.language ?? formatLanguage(vscode.env.language),
			mcpEnabled: true, // kilocode_change: always true
			enableMcpServerCreation: stateValues.enableMcpServerCreation ?? true,
			alwaysApproveResubmit: stateValues.alwaysApproveResubmit ?? false,
			requestDelaySeconds: Math.max(5, stateValues.requestDelaySeconds ?? 10),
			currentApiConfigName: stateValues.currentApiConfigName ?? "default",
			listApiConfigMeta: stateValues.listApiConfigMeta ?? [],
			pinnedApiConfigs: stateValues.pinnedApiConfigs ?? {},
			modeApiConfigs: stateValues.modeApiConfigs ?? ({} as Record<Mode, string>),
			customModePrompts: stateValues.customModePrompts ?? {},
			customSupportPrompts: stateValues.customSupportPrompts ?? {},
			enhancementApiConfigId: stateValues.enhancementApiConfigId,
			commitMessageApiConfigId: stateValues.commitMessageApiConfigId, // kilocode_change
			experiments: stateValues.experiments ?? experimentDefault,
			autoApprovalEnabled: stateValues.autoApprovalEnabled ?? true,
			customModes,
			maxOpenTabsContext: stateValues.maxOpenTabsContext ?? 20,
			maxWorkspaceFiles: stateValues.maxWorkspaceFiles ?? 200,
			openRouterUseMiddleOutTransform: stateValues.openRouterUseMiddleOutTransform ?? true,
			browserToolEnabled: stateValues.browserToolEnabled ?? true,
			showRooIgnoredFiles: stateValues.showRooIgnoredFiles ?? true,
			showAutoApproveMenu: stateValues.showAutoApproveMenu ?? false, // kilocode_change
			showTaskTimeline: stateValues.showTaskTimeline ?? true, // kilocode_change
			maxReadFileLine: stateValues.maxReadFileLine ?? -1,
			maxConcurrentFileReads: stateValues.maxConcurrentFileReads ?? 5,
			allowVeryLargeReads: stateValues.allowVeryLargeReads ?? false, // kilocode_change
			historyPreviewCollapsed: stateValues.historyPreviewCollapsed ?? false,
			cloudUserInfo,
			cloudIsAuthenticated,
			sharingEnabled,
			organizationAllowList,
			// Explicitly add condensing settings
			condensingApiConfigId: stateValues.condensingApiConfigId,
			customCondensingPrompt: stateValues.customCondensingPrompt,
			codebaseIndexModels: stateValues.codebaseIndexModels ?? EMBEDDING_MODEL_PROFILES,
			codebaseIndexConfig: stateValues.codebaseIndexConfig ?? {
				codebaseIndexEnabled: false,
				codebaseIndexQdrantUrl: "http://localhost:6333",
				codebaseIndexEmbedderProvider: "openai",
				codebaseIndexEmbedderBaseUrl: "",
				codebaseIndexEmbedderModelId: "",
			},
			profileThresholds: stateValues.profileThresholds ?? {},
		}
	}

	async updateTaskHistory(item: HistoryItem): Promise<HistoryItem[]> {
		const history = (this.getGlobalState("taskHistory") as HistoryItem[] | undefined) || []
		const existingItemIndex = history.findIndex((h) => h.id === item.id)

		if (existingItemIndex !== -1) {
			history[existingItemIndex] = item
		} else {
			history.push(item)
		}

		await this.updateGlobalState("taskHistory", history)
		return history
	}

	// ContextProxy

	// @deprecated - Use `ContextProxy#setValue` instead.
	private async updateGlobalState<K extends keyof GlobalState>(key: K, value: GlobalState[K]) {
		await this.contextProxy.setValue(key, value)
	}

	// @deprecated - Use `ContextProxy#getValue` instead.
	private getGlobalState<K extends keyof GlobalState>(key: K) {
		return this.contextProxy.getValue(key)
	}

	public async setValue<K extends keyof RooCodeSettings>(key: K, value: RooCodeSettings[K]) {
		await this.contextProxy.setValue(key, value)
	}

	public getValue<K extends keyof RooCodeSettings>(key: K) {
		return this.contextProxy.getValue(key)
	}

	public getValues() {
		return this.contextProxy.getValues()
	}

	public async setValues(values: RooCodeSettings) {
		await this.contextProxy.setValues(values)
	}

	// cwd

	get cwd() {
		return getWorkspacePath()
	}

	// dev

	async resetState() {
		const answer = await vscode.window.showInformationMessage(
			t("common:confirmation.reset_state"),
			{ modal: true },
			t("common:answers.yes"),
		)

		if (answer !== t("common:answers.yes")) {
			return
		}

		await this.contextProxy.resetAllState()
		await this.providerSettingsManager.resetAllConfigs()
		await this.customModesManager.resetCustomModes()
		await this.removeClineFromStack()
		await this.postStateToWebview()
		await this.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
	}

	// logging

	public log(message: string) {
		this.outputChannel.appendLine(message)
		console.log(message)
	}

	// integration tests

	get viewLaunched() {
		return this.isViewLaunched
	}

	get messages() {
		return this.getCurrentCline()?.clineMessages || []
	}

	// Add public getter
	public getMcpHub(): McpHub | undefined {
		return this.mcpHub
	}

	/**
	 * Check if the current state is compliant with MDM policy
	 * @returns true if compliant, false if blocked
	 */
	public checkMdmCompliance(): boolean {
		if (!this.mdmService) {
			return true // No MDM service, allow operation
		}

		const compliance = this.mdmService.isCompliant()

		if (!compliance.compliant) {
			return false
		}

		return true
	}

	/**
	 * Returns properties to be included in every telemetry event
	 * This method is called by the telemetry service to get context information
	 * like the current mode, API provider, git repository information, etc.
	 */
	public async getTelemetryProperties(): Promise<TelemetryProperties> {
		const { mode, apiConfiguration, language } = await this.getState()
		const task = this.getCurrentCline()

		const packageJSON = this.context.extension?.packageJSON

		// Get Roo Code Cloud authentication state
		let cloudIsAuthenticated: boolean | undefined

		try {
			if (CloudService.hasInstance()) {
				cloudIsAuthenticated = CloudService.instance.isAuthenticated()
			}
		} catch (error) {
			// Silently handle errors to avoid breaking telemetry collection
			this.log(`[getTelemetryProperties] Failed to get cloud auth state: ${error}`)
		}

		// Get git repository information
		const gitInfo = await getWorkspaceGitInfo()

		// Return all properties including git info - clients will filter as needed
		return {
			appName: packageJSON?.name ?? Package.name,
			appVersion: packageJSON?.version ?? Package.version,
			vscodeVersion: vscode.version,
			platform: process.platform,
			editorName: vscode.env.appName,
			language,
			mode,
			apiProvider: apiConfiguration?.apiProvider,
			modelId: task?.api?.getModel().id,
			diffStrategy: task?.diffStrategy?.getName(),
			isSubtask: task ? !!task.parentTask : undefined,
			cloudIsAuthenticated,
			...gitInfo,
		}
	}

	// kilocode_change:
	// MCP Marketplace
	private async fetchMcpMarketplaceFromApi(silent: boolean = false): Promise<McpMarketplaceCatalog | undefined> {
		try {
			const response = await axios.get("https://api.cline.bot/v1/mcp/marketplace", {
				headers: {
					"Content-Type": "application/json",
				},
			})

			if (!response.data) {
				throw new Error("Invalid response from MCP marketplace API")
			}

			const catalog: McpMarketplaceCatalog = {
				items: (response.data || []).map((item: any) => ({
					...item,
					githubStars: item.githubStars ?? 0,
					downloadCount: item.downloadCount ?? 0,
					tags: item.tags ?? [],
				})),
			}

			await this.updateGlobalState("mcpMarketplaceCatalog", catalog)
			return catalog
		} catch (error) {
			console.error("Failed to fetch MCP marketplace:", error)
			if (!silent) {
				const errorMessage = error instanceof Error ? error.message : "Failed to fetch MCP marketplace"
				await this.postMessageToWebview({
					type: "mcpMarketplaceCatalog",
					error: errorMessage,
				})
				vscode.window.showErrorMessage(errorMessage)
			}
			return undefined
		}
	}

	async silentlyRefreshMcpMarketplace() {
		try {
			const catalog = await this.fetchMcpMarketplaceFromApi(true)
			if (catalog) {
				await this.postMessageToWebview({
					type: "mcpMarketplaceCatalog",
					mcpMarketplaceCatalog: catalog,
				})
			}
		} catch (error) {
			console.error("Failed to silently refresh MCP marketplace:", error)
		}
	}

	async fetchMcpMarketplace(forceRefresh: boolean = false) {
		try {
			// Check if we have cached data
			const cachedCatalog = (await this.getGlobalState("mcpMarketplaceCatalog")) as
				| McpMarketplaceCatalog
				| undefined
			if (!forceRefresh && cachedCatalog?.items) {
				await this.postMessageToWebview({
					type: "mcpMarketplaceCatalog",
					mcpMarketplaceCatalog: cachedCatalog,
				})
				return
			}

			const catalog = await this.fetchMcpMarketplaceFromApi(false)
			if (catalog) {
				await this.postMessageToWebview({
					type: "mcpMarketplaceCatalog",
					mcpMarketplaceCatalog: catalog,
				})
			}
		} catch (error) {
			console.error("Failed to handle cached MCP marketplace:", error)
			const errorMessage = error instanceof Error ? error.message : "Failed to handle cached MCP marketplace"
			await this.postMessageToWebview({
				type: "mcpMarketplaceCatalog",
				error: errorMessage,
			})
			vscode.window.showErrorMessage(errorMessage)
		}
	}

	async downloadMcp(mcpId: string) {
		try {
			// First check if we already have this MCP server installed
			const servers = this.mcpHub?.getServers() || []
			const isInstalled = servers.some((server: McpServer) => server.name === mcpId)

			if (isInstalled) {
				throw new Error("This MCP server is already installed")
			}

			// Fetch server details from marketplace
			const response = await axios.post<McpDownloadResponse>(
				"https://api.cline.bot/v1/mcp/download",
				{ mcpId },
				{
					headers: { "Content-Type": "application/json" },
					timeout: 10000,
				},
			)

			if (!response.data) {
				throw new Error("Invalid response from MCP marketplace API")
			}

			console.log("[downloadMcp] Response from download API", { response })

			const mcpDetails = response.data

			// Validate required fields
			if (!mcpDetails.githubUrl) {
				throw new Error("Missing GitHub URL in MCP download response")
			}
			if (!mcpDetails.readmeContent) {
				throw new Error("Missing README content in MCP download response")
			}

			// Send details to webview
			await this.postMessageToWebview({
				type: "mcpDownloadDetails",
				mcpDownloadDetails: mcpDetails,
			})

			// Create task with context from README and added guidelines for MCP server installation
			const task = `Set up the MCP server from ${mcpDetails.githubUrl} while adhering to these MCP server installation rules:
- Use "${mcpDetails.mcpId}" as the server name in ${GlobalFileNames.mcpSettings}.
- Create the directory for the new MCP server before starting installation.
- Use commands aligned with the user's shell and operating system best practices.
- The following README may contain instructions that conflict with the user's OS, in which case proceed thoughtfully.
- Once installed, demonstrate the server's capabilities by using one of its tools.
Here is the project's README to help you get started:\n\n${mcpDetails.readmeContent}\n${mcpDetails.llmsInstallationContent}`

			// Initialize task and show chat view
			await this.initClineWithTask(task)
			await this.postMessageToWebview({
				type: "action",
				action: "chatButtonClicked",
			})
		} catch (error) {
			console.error("Failed to download MCP:", error)
			let errorMessage = "Failed to download MCP"

			if (axios.isAxiosError(error)) {
				if (error.code === "ECONNABORTED") {
					errorMessage = "Request timed out. Please try again."
				} else if (error.response?.status === 404) {
					errorMessage = "MCP server not found in marketplace."
				} else if (error.response?.status === 500) {
					errorMessage = "Internal server error. Please try again later."
				} else if (!error.response && error.request) {
					errorMessage = "Network error. Please check your internet connection."
				}
			} else if (error instanceof Error) {
				errorMessage = error.message
			}

			// Show error in both notification and marketplace UI
			vscode.window.showErrorMessage(errorMessage)
			await this.postMessageToWebview({
				type: "mcpDownloadDetails",
				error: errorMessage,
			})
		}
	}
	// end kilocode_change

	// kilocode_change start
	// Add new methods for favorite functionality
	async toggleTaskFavorite(id: string) {
		const history = this.getGlobalState("taskHistory") ?? []
		const updatedHistory = history.map((item) => {
			if (item.id === id) {
				return { ...item, isFavorited: !item.isFavorited }
			}
			return item
		})
		await this.updateGlobalState("taskHistory", updatedHistory)
		await this.postStateToWebview()
	}

	async getFavoriteTasks(): Promise<HistoryItem[]> {
		const history = this.getGlobalState("taskHistory") ?? []
		return history.filter((item) => item.isFavorited)
	}

	// Modify batch delete to respect favorites
	async deleteMultipleTasks(taskIds: string[]) {
		const history = this.getGlobalState("taskHistory") ?? []
		const favoritedTaskIds = taskIds.filter((id) => history.find((item) => item.id === id)?.isFavorited)

		if (favoritedTaskIds.length > 0) {
			throw new Error("Cannot delete favorited tasks. Please unfavorite them first.")
		}

		for (const id of taskIds) {
			await this.deleteTaskWithId(id)
		}
	}

	async setTaskFileNotFound(id: string) {
		const history = this.getGlobalState("taskHistory") ?? []
		const updatedHistory = history.map((item) => {
			if (item.id === id) {
				return { ...item, fileNotfound: true }
			}
			return item
		})
		await this.updateGlobalState("taskHistory", updatedHistory)
		await this.postStateToWebview()
	}

	// kilocode_change end
}
