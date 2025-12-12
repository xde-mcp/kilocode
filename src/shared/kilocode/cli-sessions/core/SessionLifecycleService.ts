import { readFileSync, writeFileSync, mkdirSync } from "fs"
import path from "path"
import type { ClineMessage, HistoryItem } from "@roo-code/types"
import type { IPathProvider } from "../types/IPathProvider.js"
import type { ILogger } from "../types/ILogger.js"
import type { IExtensionMessenger } from "../types/IExtensionMessenger.js"
import type { ITaskDataProvider } from "../types/ITaskDataProvider.js"
import type { SessionClient, ShareSessionOutput } from "./SessionClient.js"
import { SessionWithSignedUrls, CliSessionSharedState } from "./SessionClient.js"
import type { SessionPersistenceManager } from "../utils/SessionPersistenceManager.js"
import type { SessionStateManager } from "./SessionStateManager.js"
import type { SessionTitleService } from "./SessionTitleService.js"
import type { GitStateService, GitRestoreState } from "./GitStateService.js"
import { fetchSignedBlob } from "../utils/fetchBlobFromSignedUrl.js"

/**
 * Dependencies required by SessionLifecycleService.
 */
export interface SessionLifecycleServiceDependencies {
	sessionClient: SessionClient
	persistenceManager: SessionPersistenceManager
	stateManager: SessionStateManager
	titleService: SessionTitleService
	gitStateService: GitStateService
	pathProvider: IPathProvider
	extensionMessenger: IExtensionMessenger
	logger: ILogger
	platform: string
	version: number
	getOrganizationId: (taskId: string) => Promise<string | undefined>
	getMode: (taskId: string) => Promise<string | undefined>
	getModel: (taskId: string) => Promise<string | undefined>
	onSessionRestored?: () => void
}

/**
 * SessionLifecycleService - Handles session CRUD operations.
 *
 * This service is responsible for:
 * - Restoring sessions from the cloud
 * - Sharing sessions
 * - Renaming sessions
 * - Forking sessions
 * - Getting or creating sessions for tasks
 *
 * Extracted from SessionManager as part of the refactoring effort to improve
 * maintainability and testability through separation of concerns.
 */
export class SessionLifecycleService {
	private static readonly LOG_SOURCE = "SessionLifecycleService"

	private readonly sessionClient: SessionClient
	private readonly persistenceManager: SessionPersistenceManager
	private readonly stateManager: SessionStateManager
	private readonly titleService: SessionTitleService
	private readonly gitStateService: GitStateService
	private readonly pathProvider: IPathProvider
	private readonly extensionMessenger: IExtensionMessenger
	private readonly logger: ILogger
	private readonly platform: string
	private readonly version: number
	private readonly getOrganizationId: (taskId: string) => Promise<string | undefined>
	private readonly getMode: (taskId: string) => Promise<string | undefined>
	private readonly getModel: (taskId: string) => Promise<string | undefined>
	private readonly onSessionRestored: () => void

	constructor(dependencies: SessionLifecycleServiceDependencies) {
		this.sessionClient = dependencies.sessionClient
		this.persistenceManager = dependencies.persistenceManager
		this.stateManager = dependencies.stateManager
		this.titleService = dependencies.titleService
		this.gitStateService = dependencies.gitStateService
		this.pathProvider = dependencies.pathProvider
		this.extensionMessenger = dependencies.extensionMessenger
		this.logger = dependencies.logger
		this.platform = dependencies.platform
		this.version = dependencies.version
		this.getOrganizationId = dependencies.getOrganizationId
		this.getMode = dependencies.getMode
		this.getModel = dependencies.getModel
		this.onSessionRestored = dependencies.onSessionRestored ?? (() => {})
	}

	/**
	 * Restores the last session from persistence.
	 *
	 * @returns true if a session was restored, false otherwise
	 */
	async restoreLastSession(): Promise<boolean> {
		try {
			const lastSession = this.persistenceManager.getLastSession()

			if (!lastSession?.sessionId) {
				this.logger.debug("No persisted session ID found", SessionLifecycleService.LOG_SOURCE)
				return false
			}

			this.logger.info("Found persisted session ID, attempting to restore", SessionLifecycleService.LOG_SOURCE, {
				sessionId: lastSession.sessionId,
			})

			await this.restoreSession(lastSession.sessionId, true)

			this.logger.info("Successfully restored persisted session", SessionLifecycleService.LOG_SOURCE, {
				sessionId: lastSession.sessionId,
			})
			return true
		} catch (error) {
			this.logger.warn("Failed to restore persisted session", SessionLifecycleService.LOG_SOURCE, {
				error: error instanceof Error ? error.message : String(error),
			})

			return false
		}
	}

	/**
	 * Restores a session by ID from the cloud.
	 *
	 * @param sessionId - The session ID to restore
	 * @param rethrowError - Whether to rethrow errors (default: false)
	 */
	async restoreSession(sessionId: string, rethrowError = false): Promise<void> {
		try {
			this.logger.info("Restoring session", SessionLifecycleService.LOG_SOURCE, { sessionId })

			const session = (await this.sessionClient.get({
				session_id: sessionId,
				include_blob_urls: true,
			})) as SessionWithSignedUrls | undefined

			if (!session) {
				this.logger.error("Failed to obtain session", SessionLifecycleService.LOG_SOURCE, { sessionId })
				throw new Error("Failed to obtain session")
			}

			if (session.version !== this.version) {
				this.logger.warn("Session version mismatch", SessionLifecycleService.LOG_SOURCE, {
					sessionId,
					expectedVersion: this.version,
					actualVersion: session.version,
				})
			}

			this.logger.debug("Obtained session", SessionLifecycleService.LOG_SOURCE, { sessionId, session })

			const sessionDirectoryPath = path.join(this.pathProvider.getTasksDir(), sessionId)

			mkdirSync(sessionDirectoryPath, { recursive: true })

			const blobUrlFields = [
				"api_conversation_history_blob_url",
				"ui_messages_blob_url",
				"task_metadata_blob_url",
				"git_state_blob_url",
			] as const

			const fetchPromises = blobUrlFields
				.filter((blobUrlField) => {
					const signedUrl = session[blobUrlField]
					if (!signedUrl) {
						this.logger.debug(`No signed URL for ${blobUrlField}`, SessionLifecycleService.LOG_SOURCE)
						return false
					}
					return true
				})
				.map(async (blobUrlField) => {
					const signedUrl = session[blobUrlField]!

					return {
						filename: blobUrlField.replace("_blob_url", ""),
						result: await this.fetchBlobFromSignedUrl(signedUrl, blobUrlField)
							.then((content) => ({ success: true as const, content }))
							.catch((error) => ({
								success: false as const,
								error: error instanceof Error ? error.message : String(error),
							})),
					}
				})

			const results = await Promise.allSettled(fetchPromises)

			for (const result of results) {
				if (result.status === "fulfilled") {
					const { filename, result: fetchResult } = result.value

					if (fetchResult.success) {
						let fileContent = fetchResult.content

						if (filename === "git_state") {
							const gitState = fileContent as GitRestoreState

							await this.gitStateService.executeGitRestore(gitState)

							continue
						}

						if (filename === "ui_messages") {
							fileContent = (fileContent as ClineMessage[]).filter(
								(message) => message.say !== "checkpoint_saved",
							)
						}

						const fullPath = path.join(sessionDirectoryPath, `${filename}.json`)

						writeFileSync(fullPath, JSON.stringify(fileContent, null, 2))

						this.logger.debug(`Wrote blob to file`, SessionLifecycleService.LOG_SOURCE, { fullPath })
					} else {
						this.logger.error(`Failed to process blob`, SessionLifecycleService.LOG_SOURCE, {
							filename,
							error: fetchResult.error,
						})
					}
				}
			}

			const historyItem: HistoryItem = {
				id: sessionId,
				number: 1,
				task: session.title,
				ts: new Date(session.created_at).getTime(),
				tokensIn: 0,
				tokensOut: 0,
				totalCost: 0,
			}

			this.persistenceManager.setSessionForTask(historyItem.id, sessionId)
			this.stateManager.setActiveSessionId(sessionId)
			this.stateManager.markSessionVerified(sessionId)

			await this.extensionMessenger.sendWebviewMessage({
				type: "addTaskToHistory",
				historyItem,
			})

			this.logger.info("Task registered with extension", SessionLifecycleService.LOG_SOURCE, {
				sessionId,
				taskId: historyItem.id,
			})

			await this.extensionMessenger.sendWebviewMessage({
				type: "showTaskWithId",
				text: sessionId,
			})

			this.logger.info("Switched to restored task", SessionLifecycleService.LOG_SOURCE, { sessionId })

			this.persistenceManager.setLastSession(sessionId)

			this.onSessionRestored()

			this.logger.debug("Marked task as resumed after session restoration", SessionLifecycleService.LOG_SOURCE, {
				sessionId,
			})
		} catch (error) {
			this.logger.error("Failed to restore session", SessionLifecycleService.LOG_SOURCE, {
				error: error instanceof Error ? error.message : String(error),
				sessionId,
			})

			if (rethrowError) {
				throw error
			}
		}
	}

	/**
	 * Shares a session publicly.
	 *
	 * @param sessionId - The session ID to share
	 * @returns The share output containing the share ID
	 */
	async shareSession(sessionId: string): Promise<ShareSessionOutput> {
		if (!sessionId) {
			throw new Error("No active session")
		}

		return await this.sessionClient.share({
			session_id: sessionId,
			shared_state: CliSessionSharedState.Public,
		})
	}

	/**
	 * Renames a session.
	 *
	 * @param sessionId - The session ID to rename
	 * @param newTitle - The new title for the session
	 */
	async renameSession(sessionId: string, newTitle: string): Promise<void> {
		if (!sessionId) {
			throw new Error("No active session")
		}

		await this.titleService.updateTitle(sessionId, newTitle)

		this.logger.info("Session renamed successfully", SessionLifecycleService.LOG_SOURCE, {
			sessionId,
			newTitle: newTitle.trim(),
		})
	}

	/**
	 * Forks a session by share ID or session ID.
	 *
	 * @param shareOrSessionId - The share ID or session ID to fork
	 * @param rethrowError - Whether to rethrow errors (default: false)
	 */
	async forkSession(shareOrSessionId: string, rethrowError = false): Promise<void> {
		const { session_id } = await this.sessionClient.fork({
			share_or_session_id: shareOrSessionId,
			created_on_platform: this.platform,
		})

		await this.restoreSession(session_id, rethrowError)
	}

	/**
	 * Gets or creates a session for a task.
	 *
	 * This method:
	 * 1. Checks if a session already exists for the task
	 * 2. Verifies the session still exists on the server
	 * 3. Creates a new session if needed
	 *
	 * @param taskId - The task ID to get or create a session for
	 * @param provider - The task data provider
	 * @returns The session ID
	 */
	async getOrCreateSessionForTask(taskId: string, provider: ITaskDataProvider): Promise<string> {
		try {
			let sessionId = this.persistenceManager.getSessionForTask(taskId)

			if (sessionId) {
				if (!this.stateManager.isSessionVerified(sessionId)) {
					this.logger.debug("Verifying session existence", SessionLifecycleService.LOG_SOURCE, {
						taskId,
						sessionId,
					})

					try {
						const session = await this.sessionClient.get({
							session_id: sessionId,
							include_blob_urls: false,
						})

						if (!session) {
							this.logger.info(
								"Session no longer exists, will create new session",
								SessionLifecycleService.LOG_SOURCE,
								{
									taskId,
									sessionId,
								},
							)
							sessionId = undefined
						} else {
							this.stateManager.markSessionVerified(sessionId)
							this.logger.debug("Session verified and cached", SessionLifecycleService.LOG_SOURCE, {
								taskId,
								sessionId,
							})
						}
					} catch (error) {
						this.logger.info(
							"Session verification failed, will create new session",
							SessionLifecycleService.LOG_SOURCE,
							{
								taskId,
								sessionId,
								error: error instanceof Error ? error.message : String(error),
							},
						)
						sessionId = undefined
					}
				} else {
					this.logger.debug("Session already verified (cached)", SessionLifecycleService.LOG_SOURCE, {
						taskId,
						sessionId,
					})
				}
			}

			if (!sessionId) {
				this.logger.debug(
					"No existing session for task, creating new session",
					SessionLifecycleService.LOG_SOURCE,
					{ taskId },
				)

				const { historyItem, apiConversationHistoryFilePath, uiMessagesFilePath } =
					await provider.getTaskWithId(taskId)

				const apiConversationHistory = JSON.parse(readFileSync(apiConversationHistoryFilePath, "utf8"))
				const uiMessages = JSON.parse(readFileSync(uiMessagesFilePath, "utf8"))

				const title = historyItem.task || this.titleService.getFirstMessageText(uiMessages, true) || ""

				const mode = await this.getMode(taskId)
				const model = await this.getModel(taskId)

				const session = await this.sessionClient.create({
					title,
					created_on_platform: this.platform,
					version: this.version,
					organization_id: await this.getOrganizationId(taskId),
					last_mode: mode,
					last_model: model,
				})

				sessionId = session.session_id

				if (mode) {
					this.stateManager.setMode(sessionId, mode)
				}

				if (model) {
					this.stateManager.setModel(sessionId, model)
				}

				this.logger.info("Created new session for task", SessionLifecycleService.LOG_SOURCE, {
					taskId,
					sessionId,
				})

				await this.sessionClient.uploadBlob(sessionId, "api_conversation_history", apiConversationHistory)
				await this.sessionClient.uploadBlob(sessionId, "ui_messages", uiMessages)

				this.logger.debug("Uploaded conversation blobs to session", SessionLifecycleService.LOG_SOURCE, {
					sessionId,
				})

				this.persistenceManager.setSessionForTask(taskId, sessionId)

				this.stateManager.markSessionVerified(sessionId)
			} else {
				this.logger.debug("Found existing session for task", SessionLifecycleService.LOG_SOURCE, {
					taskId,
					sessionId,
				})
			}

			return sessionId
		} catch (error) {
			this.logger.error("Failed to get or create session from task", SessionLifecycleService.LOG_SOURCE, {
				taskId,
				error: error instanceof Error ? error.message : String(error),
			})
			throw error
		}
	}

	/**
	 * Fetches a blob from a signed URL.
	 *
	 * @param url - The signed URL to fetch from
	 * @param urlType - The type of URL (for logging)
	 * @returns The fetched blob content
	 */
	private async fetchBlobFromSignedUrl(url: string, urlType: string) {
		return fetchSignedBlob(url, urlType, this.logger, SessionLifecycleService.LOG_SOURCE)
	}
}
