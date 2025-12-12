import type { IPathProvider } from "../types/IPathProvider.js"
import type { ILogger } from "../types/ILogger.js"
import type { IExtensionMessenger } from "../types/IExtensionMessenger.js"
import type { ITaskDataProvider } from "../types/ITaskDataProvider.js"
import { SessionClient } from "./SessionClient.js"
import { TrpcClient, TrpcClientDependencies } from "./TrpcClient.js"
import { SessionPersistenceManager } from "../utils/SessionPersistenceManager.js"
import { GitStateService } from "./GitStateService.js"
import { SessionStateManager } from "./SessionStateManager.js"
import { SyncQueue } from "./SyncQueue.js"
import { TokenValidationService } from "./TokenValidationService.js"
import { SessionTitleService } from "./SessionTitleService.js"
import { SessionLifecycleService } from "./SessionLifecycleService.js"
import { SessionSyncService, SessionCreatedMessage, SessionSyncedMessage } from "./SessionSyncService.js"

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
	public syncService: SessionSyncService
	private gitStateService: GitStateService

	private constructor(dependencies: SessionManagerDependencies) {
		this.logger = dependencies.logger

		const trpcClient = new TrpcClient({
			getToken: dependencies.getToken,
		})

		this.sessionClient = new SessionClient(trpcClient)
		this.sessionPersistenceManager = new SessionPersistenceManager(dependencies.pathProvider)
		this.stateManager = new SessionStateManager()
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

		// Create SyncQueue with a flush callback that delegates to syncService
		// Note: We need to create syncService first, but it needs syncQueue
		// So we create syncQueue with a temporary callback and update it after
		this.syncQueue = new SyncQueue(() => this.doSync())

		this.syncService = new SessionSyncService({
			sessionClient: this.sessionClient,
			persistenceManager: this.sessionPersistenceManager,
			stateManager: this.stateManager,
			titleService: this.titleService,
			gitStateService: this.gitStateService,
			tokenValidationService: this.tokenValidationService,
			syncQueue: this.syncQueue,
			logger: this.logger,
			platform: dependencies.platform,
			version: SessionManager.VERSION,
			getOrganizationId: dependencies.getOrganizationId,
			getMode: dependencies.getMode,
			getModel: dependencies.getModel,
			onSessionCreated: dependencies.onSessionCreated,
			onSessionSynced: dependencies.onSessionSynced,
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
			platform: dependencies.platform,
			version: SessionManager.VERSION,
			getOrganizationId: dependencies.getOrganizationId,
			getMode: dependencies.getMode,
			getModel: dependencies.getModel,
			onSessionRestored: dependencies.onSessionRestored,
		})

		this.logger.debug("Initialized SessionManager", "SessionManager")
	}

	/**
	 * Handles a file update by delegating to SessionSyncService.
	 */
	handleFileUpdate(taskId: string, key: string, value: string) {
		this.syncService.handleFileUpdate(taskId, key, value)
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

	/**
	 * Performs a sync operation.
	 * Delegates to SessionSyncService.
	 */
	async doSync(force = false): Promise<void> {
		return this.syncService.doSync(force)
	}
}
