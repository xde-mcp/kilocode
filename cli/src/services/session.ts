import { readFileSync } from "fs"
import { SessionClient } from "./sessionClient"
import { logs } from "./logs.js"

const defaultPaths = {
	apiConversationHistoryPath: null as null | string,
	uiMessagesPath: null as null | string,
	taskMetadataPath: null as null | string,
}

export class SessionService {
	private static instance: SessionService | null = null

	static getInstance() {
		if (!SessionService.instance) {
			SessionService.instance = new SessionService()
		}

		return SessionService.instance!
	}

	private paths = { ...defaultPaths }
	private sessionId: string | null = null
	private timer: NodeJS.Timeout | null = null
	private lastSaveEvent: string = ""
	private lastSyncEvent: string = ""
	private isSyncing: boolean = false

	private constructor() {
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
