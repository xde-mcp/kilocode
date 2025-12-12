import { readFileSync } from "fs"
import type { IPathProvider } from "../types/IPathProvider.js"
import type { ILogger } from "../types/ILogger.js"
import type { IExtensionMessenger } from "../types/IExtensionMessenger.js"
import type { ITaskDataProvider } from "../types/ITaskDataProvider.js"
import { SessionClient } from "./SessionClient.js"
import type { ClineMessage } from "@roo-code/types"
import { TrpcClient, TrpcClientDependencies } from "./TrpcClient.js"
import { SessionPersistenceManager } from "../utils/SessionPersistenceManager.js"
import { GitStateService } from "./GitStateService.js"
import { SessionStateManager } from "./SessionStateManager.js"
import { SyncQueue } from "./SyncQueue.js"
import { TokenValidationService } from "./TokenValidationService.js"
import { SessionTitleService } from "./SessionTitleService.js"
import { SessionLifecycleService } from "./SessionLifecycleService.js"

interface SessionCreatedMessage {
	sessionId: string
	timestamp: number
	event: "session_created"
}

/**
 * Message emitted when a session has been synced to the cloud.
 * Contains timing information for tracking sync state and detecting stale data.
 */
interface SessionSyncedMessage {
	sessionId: string
	/** The server-side updated_at timestamp (as Unix milliseconds) from the most recent sync operation */
	updatedAt: number
	/** The local timestamp (Unix milliseconds) when this sync event was emitted */
	timestamp: number
	event: "session_synced"
}

export interface SessionManagerDependencies extends TrpcClientDependencies {
	platform: string
	pathProvider: IPathProvider
	logger: ILogger
	extensionMessenger: IExtensionMessenger
	onSessionCreated?: (message: SessionCreatedMessage) => void
	onSessionRestored?: () => void
	onSessionSynced?: (message: SessionSyncedMessage) => void
	getOrganizationId: (taskId: string) => Promise<string | undefined>
	getMode: (taskId: string) => Promise<string | undefined>
	getModel: (taskId: string) => Promise<string | undefined>
}

export class SessionManager {
	static readonly SYNC_INTERVAL = 3000
	static readonly VERSION = 1

	private static instance: SessionManager | null = null

	static init(dependencies?: SessionManagerDependencies) {
		if (dependencies) {
			SessionManager.instance = new SessionManager(dependencies)
		}

		return SessionManager.instance
	}

	private workspaceDir: string | null = null

	public get sessionId() {
		return this.stateManager.getActiveSessionId() || this.sessionPersistenceManager?.getLastSession()?.sessionId
	}

	private logger: ILogger
	public sessionPersistenceManager: SessionPersistenceManager
	public sessionClient: SessionClient
	public stateManager: SessionStateManager
	public syncQueue: SyncQueue
	public tokenValidationService: TokenValidationService
	public titleService: SessionTitleService
	public lifecycleService: SessionLifecycleService
	private gitStateService: GitStateService
	private onSessionCreated: (message: SessionCreatedMessage) => void
	private onSessionSynced: (message: SessionSyncedMessage) => void
	private platform: string
	private getOrganizationId: (taskId: string) => Promise<string | undefined>
	private getMode: (taskId: string) => Promise<string | undefined>
	private getModel: (taskId: string) => Promise<string | undefined>

	private constructor(dependencies: SessionManagerDependencies) {
		this.logger = dependencies.logger
		this.onSessionCreated = dependencies.onSessionCreated ?? (() => {})
		this.onSessionSynced = dependencies.onSessionSynced ?? (() => {})
		this.platform = dependencies.platform
		this.getOrganizationId = dependencies.getOrganizationId
		this.getMode = dependencies.getMode
		this.getModel = dependencies.getModel

		const trpcClient = new TrpcClient({
			getToken: dependencies.getToken,
		})

		this.sessionClient = new SessionClient(trpcClient)
		this.sessionPersistenceManager = new SessionPersistenceManager(dependencies.pathProvider)
		this.stateManager = new SessionStateManager()
		this.syncQueue = new SyncQueue(() => this.doSync())
		this.tokenValidationService = new TokenValidationService({
			sessionClient: this.sessionClient,
			stateManager: this.stateManager,
			getToken: dependencies.getToken,
			logger: this.logger,
		})
		this.titleService = new SessionTitleService({
			sessionClient: this.sessionClient,
			stateManager: this.stateManager,
			extensionMessenger: dependencies.extensionMessenger,
			logger: this.logger,
		})
		this.gitStateService = new GitStateService({
			logger: this.logger,
			getWorkspaceDir: () => this.workspaceDir,
		})
		this.lifecycleService = new SessionLifecycleService({
			sessionClient: this.sessionClient,
			persistenceManager: this.sessionPersistenceManager,
			stateManager: this.stateManager,
			titleService: this.titleService,
			gitStateService: this.gitStateService,
			pathProvider: dependencies.pathProvider,
			extensionMessenger: dependencies.extensionMessenger,
			logger: this.logger,
			platform: this.platform,
			version: SessionManager.VERSION,
			getOrganizationId: this.getOrganizationId,
			getMode: this.getMode,
			getModel: this.getModel,
			onSessionRestored: dependencies.onSessionRestored,
		})

		this.logger.debug("Initialized SessionManager", "SessionManager")
	}

	private pendingSync: Promise<void> | null = null

	handleFileUpdate(taskId: string, key: string, value: string) {
		const blobName = this.pathKeyToBlobKey(key)

		if (blobName) {
			this.syncQueue.enqueue({
				taskId,
				blobName,
				blobPath: value,
				timestamp: Date.now(),
			})
		}
	}

	setWorkspaceDirectory(dir: string) {
		this.workspaceDir = dir
		this.sessionPersistenceManager.setWorkspaceDir(dir)
	}

	/**
	 * Restores the last session from persistence.
	 * Delegates to SessionLifecycleService.
	 */
	async restoreLastSession(): Promise<boolean> {
		return this.lifecycleService.restoreLastSession()
	}

	/**
	 * Restores a session by ID from the cloud.
	 * Delegates to SessionLifecycleService.
	 */
	async restoreSession(sessionId: string, rethrowError = false): Promise<void> {
		return this.lifecycleService.restoreSession(sessionId, rethrowError)
	}

	/**
	 * Shares a session publicly.
	 * Delegates to SessionLifecycleService.
	 */
	async shareSession(sessionIdInput?: string) {
		const sessionId = sessionIdInput || this.sessionId

		if (!sessionId) {
			throw new Error("No active session")
		}

		return this.lifecycleService.shareSession(sessionId)
	}

	/**
	 * Renames a session.
	 * Delegates to SessionLifecycleService.
	 */
	async renameSession(sessionId: string, newTitle: string): Promise<void> {
		return this.lifecycleService.renameSession(sessionId, newTitle)
	}

	/**
	 * Forks a session by share ID or session ID.
	 * Delegates to SessionLifecycleService.
	 */
	async forkSession(shareOrSessionId: string, rethrowError = false): Promise<void> {
		return this.lifecycleService.forkSession(shareOrSessionId, rethrowError)
	}

	/**
	 * Gets or creates a session for a task.
	 * Delegates to SessionLifecycleService.
	 */
	async getSessionFromTask(taskId: string, provider: ITaskDataProvider): Promise<string> {
		return this.lifecycleService.getOrCreateSessionForTask(taskId, provider)
	}

	private async syncSession() {
		if (this.syncQueue.isEmpty) {
			return
		}

		if (process.env.KILO_DISABLE_SESSIONS) {
			this.logger.debug("Sessions disabled via KILO_DISABLE_SESSIONS, clearing queue", "SessionManager")
			this.syncQueue.clear()
			return
		}

		const tokenValid = await this.tokenValidationService.isValid()

		if (tokenValid === null) {
			this.logger.debug("No token available for session sync, skipping", "SessionManager")
			return
		}

		if (!tokenValid) {
			this.logger.debug("Token is invalid, skipping sync", "SessionManager")
			return
		}

		const taskIds = this.syncQueue.getUniqueTaskIds()
		const lastItem = this.syncQueue.getLastItem()

		this.logger.debug("Starting session sync", "SessionManager", {
			queueLength: this.syncQueue.length,
			taskCount: taskIds.size,
		})

		const gitInfo = await this.gitStateService.getGitState()

		for (const taskId of taskIds) {
			try {
				const taskItems = this.syncQueue.getItemsForTask(taskId)

				this.logger.debug("Processing task", "SessionManager", {
					taskId,
					itemCount: taskItems.length,
				})

				const basePayload: Partial<Parameters<NonNullable<typeof this.sessionClient>["create"]>[0]> = {}

				if (gitInfo?.repoUrl) {
					basePayload.git_url = gitInfo.repoUrl
				}

				let sessionId = this.sessionPersistenceManager.getSessionForTask(taskId)

				if (sessionId) {
					this.logger.debug("Found existing session for task", "SessionManager", { taskId, sessionId })

					const gitUrlChanged = !!gitInfo?.repoUrl && gitInfo.repoUrl !== this.stateManager.getGitUrl(taskId)

					const currentMode = await this.getMode(taskId)
					const modeChanged = currentMode && currentMode !== this.stateManager.getMode(sessionId)

					const currentModel = await this.getModel(taskId)
					const modelChanged = currentModel && currentModel !== this.stateManager.getModel(sessionId)

					if (gitUrlChanged || modeChanged || modelChanged) {
						if (gitUrlChanged && gitInfo?.repoUrl) {
							this.logger.debug("Git URL changed, updating session", "SessionManager", {
								sessionId,
								newGitUrl: gitInfo.repoUrl,
							})

							this.stateManager.setGitUrl(taskId, gitInfo.repoUrl)
						}

						if (modeChanged && currentMode) {
							this.logger.debug("Mode changed, updating session", "SessionManager", {
								sessionId,
								newMode: currentMode,
								previousMode: this.stateManager.getMode(sessionId),
							})

							this.stateManager.setMode(sessionId, currentMode)
						}

						if (modelChanged && currentModel) {
							this.logger.debug("Model changed, updating session", "SessionManager", {
								sessionId,
								newModel: currentModel,
								previousModel: this.stateManager.getModel(sessionId),
							})

							this.stateManager.setModel(sessionId, currentModel)
						}

						const updateResult = await this.sessionClient.update({
							session_id: sessionId,
							...basePayload,
							last_mode: currentMode,
							last_model: currentModel,
						})

						this.stateManager.updateTimestamp(sessionId, updateResult.updated_at)
					}
				} else {
					this.logger.debug("Creating new session for task", "SessionManager", { taskId })

					const currentMode = await this.getMode(taskId)
					const currentModel = await this.getModel(taskId)

					const createdSession = await this.sessionClient.create({
						...basePayload,
						created_on_platform: this.platform,
						version: SessionManager.VERSION,
						organization_id: await this.getOrganizationId(taskId),
						last_mode: currentMode,
						last_model: currentModel,
					})

					sessionId = createdSession.session_id

					if (currentMode) {
						this.stateManager.setMode(sessionId, currentMode)
					}

					if (currentModel) {
						this.stateManager.setModel(sessionId, currentModel)
					}

					this.logger.info("Created new session", "SessionManager", { taskId, sessionId })

					this.sessionPersistenceManager.setSessionForTask(taskId, createdSession.session_id)

					this.onSessionCreated({
						timestamp: Date.now(),
						event: "session_created",
						sessionId: createdSession.session_id,
					})
				}

				if (!sessionId) {
					this.logger.warn("No session ID available after create/get, skipping task", "SessionManager", {
						taskId,
					})
					continue
				}

				const blobNames = new Set(taskItems.map((item) => item.blobName))
				const blobUploads: Promise<unknown>[] = []

				this.logger.debug("Uploading blobs for session", "SessionManager", {
					sessionId,
					blobNames: Array.from(blobNames),
				})

				for (const blobName of blobNames) {
					const lastBlobItem = this.syncQueue.getLastItemForBlob(taskId, blobName)

					if (!lastBlobItem) {
						this.logger.warn("Could not find blob item for task", "SessionManager", {
							blobName,
							taskId,
						})
						continue
					}

					const fileContents = JSON.parse(readFileSync(lastBlobItem.blobPath, "utf-8"))

					blobUploads.push(
						this.sessionClient
							.uploadBlob(
								sessionId,
								lastBlobItem.blobName as Parameters<typeof this.sessionClient.uploadBlob>[1],
								fileContents,
							)
							.then((result) => {
								this.logger.debug("Blob uploaded successfully", "SessionManager", {
									sessionId,
									blobName,
								})

								// Track the updated_at timestamp from the upload using high-water mark
								this.stateManager.updateTimestamp(sessionId, result.updated_at)

								// Remove processed items from the queue
								this.syncQueue.removeProcessedItems(taskId, blobName, lastBlobItem.timestamp)
							})
							.catch((error) => {
								this.logger.error("Failed to upload blob", "SessionManager", {
									sessionId,
									blobName,
									error: error instanceof Error ? error.message : String(error),
								})
							}),
					)

					if (blobName !== "ui_messages" || this.stateManager.hasTitle(sessionId)) {
						continue
					}

					this.logger.debug("Triggering session title generation", "SessionManager", { sessionId })

					// Delegate title generation to the title service
					void this.titleService.generateAndUpdateTitle(sessionId, fileContents as ClineMessage[])
				}

				if (gitInfo) {
					const gitStateData = {
						head: gitInfo.head,
						patch: gitInfo.patch,
						branch: gitInfo.branch,
					}

					const gitStateHash = this.gitStateService.hashGitState(gitStateData)

					if (gitStateHash === this.stateManager.getGitHash(taskId)) {
						this.logger.debug("Git state unchanged, skipping upload", "SessionManager", { sessionId })
					} else {
						this.logger.debug("Git state changed, uploading", "SessionManager", {
							sessionId,
							head: gitInfo.head?.substring(0, 8),
						})

						this.stateManager.setGitHash(taskId, gitStateHash)

						blobUploads.push(
							this.sessionClient
								.uploadBlob(sessionId, "git_state", gitStateData)
								.then((result) => {
									// Track the updated_at timestamp from git state upload using high-water mark
									this.stateManager.updateTimestamp(sessionId, result.updated_at)
								})
								.catch((error) => {
									this.logger.error("Failed to upload git state", "SessionManager", {
										sessionId,
										error: error instanceof Error ? error.message : String(error),
									})
								}),
						)
					}
				}

				await Promise.all(blobUploads)

				this.logger.debug("Completed blob uploads for task", "SessionManager", {
					taskId,
					sessionId,
					uploadCount: blobUploads.length,
				})

				// Emit session synced event with the latest updated_at timestamp
				const latestUpdatedAt = this.stateManager.getUpdatedAt(sessionId)
				if (latestUpdatedAt) {
					const updatedAtTimestamp = new Date(latestUpdatedAt).getTime()
					this.onSessionSynced({
						sessionId,
						updatedAt: updatedAtTimestamp,
						timestamp: Date.now(),
						event: "session_synced",
					})

					this.logger.debug("Emitted session_synced event", "SessionManager", {
						sessionId,
						updatedAt: updatedAtTimestamp,
					})
				}
			} catch (error) {
				this.logger.error("Failed to sync session", "SessionManager", {
					taskId,
					error: error instanceof Error ? error.message : String(error),
				})

				await this.tokenValidationService.invalidateCache()
			}
		}

		if (lastItem) {
			const lastActiveSessionId = this.sessionPersistenceManager.getSessionForTask(lastItem.taskId) || null
			this.stateManager.setActiveSessionId(lastActiveSessionId)

			if (lastActiveSessionId) {
				this.sessionPersistenceManager.setLastSession(lastActiveSessionId)
			}
		}

		this.logger.debug("Session sync completed", "SessionManager", {
			lastSessionId: this.stateManager.getActiveSessionId(),
			remainingQueueLength: this.syncQueue.length,
		})
	}

	async doSync(force = false) {
		this.logger.debug("Doing sync", "SessionManager")

		if (this.pendingSync) {
			this.logger.debug("Found pending sync", "SessionManager")

			if (!force) {
				this.logger.debug("Not forced, returning pending sync", "SessionManager")

				return this.pendingSync
			} else {
				this.logger.debug("Forced, syncing despite pending sync", "SessionManager")
			}
		}

		this.logger.debug("Creating new sync", "SessionManager")

		this.pendingSync = this.syncSession()

		let pendingSync = this.pendingSync

		void (async () => {
			try {
				await pendingSync
			} finally {
				if (this.pendingSync === pendingSync) {
					this.pendingSync = null
				}

				this.logger.debug("Nulling pending sync after resolution", "SessionManager")
			}
		})()

		return this.pendingSync
	}

	private pathKeyToBlobKey(pathKey: string) {
		switch (pathKey) {
			case "apiConversationHistoryPath":
				return "api_conversation_history"
			case "uiMessagesPath":
				return "ui_messages"
			case "taskMetadataPath":
				return "task_metadata"
			default:
				return null
		}
	}
}
