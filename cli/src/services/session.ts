import { readFileSync, writeFileSync } from "fs"
import { KiloCodePaths } from "../utils/paths"
import { SessionClient, SessionWithBlobs } from "./sessionClient"
import { logs } from "./logs.js"
import path from "path"
import { ensureDirSync } from "fs-extra"
import type { ExtensionService } from "./extension.js"
import type { ClineMessage, HistoryItem } from "@roo-code/types"
import { createStore } from "jotai"
import { sessionIdAtom } from "../state/atoms/session.js"

const defaultPaths = {
	apiConversationHistoryPath: null as null | string,
	uiMessagesPath: null as null | string,
	taskMetadataPath: null as null | string,
}

export class SessionService {
	private static instance: SessionService | null = null

	static init(extensionService?: ExtensionService, store?: ReturnType<typeof createStore>) {
		if ((!extensionService || !store) && !SessionService.instance) {
			throw new Error("extensionService and store required to init SessionService")
		}

		if (extensionService && store && !SessionService.instance) {
			SessionService.instance = new SessionService(extensionService, store)

			logs.debug("Initiated SessionService", "SessionService")
		}

		return SessionService.instance!
	}

	private paths = { ...defaultPaths }
	private _sessionId: string | null = null

	get sessionId() {
		return this._sessionId
	}

	set sessionId(sessionId: string | null) {
		this._sessionId = sessionId

		// Set the session ID in the atom for UI display
		this.store.set(sessionIdAtom, sessionId)
	}

	private timer: NodeJS.Timeout | null = null
	private lastSaveEvent: string = ""
	private lastSyncEvent: string = ""
	private isSyncing: boolean = false

	private constructor(
		private extensionService: ExtensionService,
		private store: ReturnType<typeof createStore>,
	) {
		this.startTimer()
	}

	private startTimer() {
		this.timer = setInterval(() => {
			this.syncSession()
		}, 1000)
	}

	private readPath(path: string) {
		try {
			const content = readFileSync(path, "utf-8")
			try {
				return JSON.parse(content)
			} catch {
				return undefined
			}
		} catch {
			return undefined
		}
	}

	private readPaths() {
		const contents: Partial<Record<keyof typeof this.paths, unknown>> = {}

		for (const [key, value] of Object.entries(this.paths)) {
			if (!value) {
				continue
			}

			const content = this.readPath(value)
			if (content !== undefined) {
				contents[key as keyof typeof this.paths] = content
			}
		}

		return contents
	}

	async restoreSession(sessionId: string) {
		try {
			logs.info("Restoring session", "SessionService", { sessionId })

			const sessionClient = SessionClient.getInstance()
			const session = (await sessionClient.get({
				sessionId,
				includeBlobs: true,
			})) as SessionWithBlobs

			if (!session) {
				logs.error("Failed to obtain session", "SessionService", { sessionId })
				return
			}

			const sessionDirectoryPath = path.join(KiloCodePaths.getTasksDir(), sessionId)

			ensureDirSync(sessionDirectoryPath)
			;["api_conversation_history", "ui_messages", "task_metadata"].forEach((fileName) => {
				let fileContent = session[fileName as keyof typeof session]

				if (!fileContent) {
					return
				}

				if (fileName === "ui_messages") {
					// eliminate checkpoints for now
					fileContent = (fileContent as ClineMessage[]).filter(
						(message) => message.say !== "checkpoint_saved",
					)
				}

				writeFileSync(path.join(sessionDirectoryPath, `${fileName}.json`), JSON.stringify(fileContent, null, 2))
			})

			this.sessionId = session.id
			this.lastSaveEvent = crypto.randomUUID()
			this.lastSyncEvent = this.lastSaveEvent

			const historyItem: HistoryItem = {
				id: sessionId,
				number: 1,
				task: session.title,
				ts: new Date(session.created_at).getTime(),
				tokensIn: 0,
				tokensOut: 0,
				totalCost: 0,
			}

			// Send message to register the task in extension history
			await this.extensionService.sendWebviewMessage({
				type: "addTaskToHistory",
				historyItem,
			})

			logs.info("Task registered with extension", "SessionService", {
				sessionId,
				taskId: historyItem.id,
			})

			// Automatically switch to the restored task
			await this.extensionService.sendWebviewMessage({
				type: "showTaskWithId",
				text: sessionId,
			})

			logs.info("Switched to restored task", "SessionService", { sessionId })
		} catch (error) {
			logs.error("Failed to restore session", "SessionService", {
				error: error instanceof Error ? error.message : String(error),
				sessionId,
			})

			this.sessionId = null
		}
	}

	private async syncSession() {
		if (this.isSyncing) {
			return
		}

		if (Object.values(this.paths).every((item) => !item) || this.lastSaveEvent === this.lastSyncEvent) {
			return
		}

		this.isSyncing = true

		try {
			const rawPayload = this.readPaths()

			if (Object.values(rawPayload).every((item) => !item)) {
				return
			}

			const currentLastSaveEvent = this.lastSaveEvent
			const sessionClient = SessionClient.getInstance()

			const payload: Partial<Parameters<typeof sessionClient.update>[0]> = {
				api_conversation_history: rawPayload.apiConversationHistoryPath,
				ui_messages: rawPayload.uiMessagesPath,
				task_metadata: rawPayload.taskMetadataPath,
			}

			if (this.sessionId) {
				logs.debug("Updating existing session", "SessionService", { sessionId: this.sessionId })

				await sessionClient.update({
					sessionId: this.sessionId,
					...payload,
				})

				logs.debug("Session updated successfully", "SessionService", { sessionId: this.sessionId })
			} else {
				logs.debug("Creating new session", "SessionService")

				const session = await sessionClient.create(payload)

				this.sessionId = session.id

				logs.info("Session created successfully", "SessionService", { sessionId: this.sessionId })
			}

			this.lastSyncEvent = currentLastSaveEvent
		} catch (error) {
			logs.error("Failed to sync session", "SessionService", {
				error: error instanceof Error ? error.message : String(error),
				sessionId: this.sessionId,
				hasApiHistory: !!this.paths.apiConversationHistoryPath,
				hasUiMessages: !!this.paths.uiMessagesPath,
				hasTaskMetadata: !!this.paths.taskMetadataPath,
			})
		} finally {
			this.isSyncing = false
		}
	}

	setPath(key: keyof typeof defaultPaths, value: string) {
		this.paths[key] = value

		this.lastSaveEvent = crypto.randomUUID()
	}

	async destroy() {
		logs.debug("Destroying SessionService", "SessionService", { sessionId: this.sessionId })

		if (this.timer) {
			clearInterval(this.timer)
			this.timer = null
		}

		await this.syncSession()

		this.paths = { ...defaultPaths }
		this.sessionId = null
		this.isSyncing = false

		logs.debug("SessionService destroyed", "SessionService")
	}
}
