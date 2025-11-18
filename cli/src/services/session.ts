import { readFileSync } from "fs"
import { SessionClient } from "./sessionClient"

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
		if (Object.values(this.paths).every((item) => !item) || this.lastSaveEvent === this.lastSyncEvent) {
			return
		}

		const rawPayload = this.readPaths()

		if (Object.values(rawPayload).every((item) => !item)) {
			return
		}

		const currentLastSaveEvent = this.lastSaveEvent

		const sessionClient = SessionClient.getInstance()

		const payload = {
			api_conversation_history: rawPayload.apiConversationHistoryPath,
			ui_messages: rawPayload.uiMessagesPath,
			task_metadata: rawPayload.taskMetadataPath,
		}

		if (this.sessionId) {
			await sessionClient.update({
				sessionId: this.sessionId,
				...payload,
			})
		} else {
			const session = await sessionClient.create(payload)
			this.sessionId = session.id
		}

		this.lastSyncEvent = currentLastSaveEvent
	}

	setPath(key: keyof typeof defaultPaths, value: string) {
		this.paths[key] = value

		this.lastSaveEvent = crypto.randomUUID()
	}

	async destroy() {
		if (this.timer) {
			clearInterval(this.timer)
			this.timer = null
		}

		// flush if possible
		await this.syncSession()

		this.paths = { ...defaultPaths }
		this.sessionId = null
	}
}
