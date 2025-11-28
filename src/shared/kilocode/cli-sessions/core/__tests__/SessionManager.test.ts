import { SessionManager, SessionManagerDependencies } from "../SessionManager"
import { SessionClient, CliSessionSharedState, SessionWithSignedUrls } from "../SessionClient"
import { TrpcClient } from "../TrpcClient"
import { SessionPersistenceManager } from "../../utils/SessionPersistenceManager"
import type { IPathProvider } from "../../types/IPathProvider"
import type { ILogger } from "../../types/ILogger"
import type { IExtensionMessenger } from "../../types/IExtensionMessenger"
import type { ClineMessage } from "@roo-code/types"
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from "fs"
import simpleGit from "simple-git"

vi.mock("fs", () => ({
	readFileSync: vi.fn(),
	writeFileSync: vi.fn(),
	mkdirSync: vi.fn(),
	mkdtempSync: vi.fn(),
	rmSync: vi.fn(),
	existsSync: vi.fn(),
}))

vi.mock("simple-git", () => ({
	default: vi.fn(),
}))

vi.mock("../SessionClient", () => ({
	SessionClient: vi.fn().mockImplementation(() => ({
		get: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
		share: vi.fn(),
		fork: vi.fn(),
		uploadBlob: vi.fn(),
	})),
	CliSessionSharedState: {
		Public: "public",
	},
}))

vi.mock("../TrpcClient", () => ({
	TrpcClient: vi.fn().mockImplementation(() => ({
		request: vi.fn(),
		endpoint: "https://api.example.com",
		getToken: vi.fn().mockResolvedValue("test-token"),
	})),
}))

vi.mock("../../utils/SessionPersistenceManager", () => ({
	SessionPersistenceManager: vi.fn().mockImplementation(() => ({
		setWorkspaceDir: vi.fn(),
		getLastSession: vi.fn(),
		setLastSession: vi.fn(),
		getSessionForTask: vi.fn(),
		setSessionForTask: vi.fn(),
	})),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

function resetSessionManagerInstance(): void {
	;(SessionManager as unknown as { instance: SessionManager | null }).instance = null
}

describe("SessionManager", () => {
	let mockPathProvider: IPathProvider
	let mockLogger: ILogger
	let mockExtensionMessenger: IExtensionMessenger
	let mockDependencies: SessionManagerDependencies
	let mockSessionClient: {
		get: ReturnType<typeof vi.fn>
		create: ReturnType<typeof vi.fn>
		update: ReturnType<typeof vi.fn>
		share: ReturnType<typeof vi.fn>
		fork: ReturnType<typeof vi.fn>
		uploadBlob: ReturnType<typeof vi.fn>
	}
	let mockSessionPersistenceManager: {
		setWorkspaceDir: ReturnType<typeof vi.fn>
		getLastSession: ReturnType<typeof vi.fn>
		setLastSession: ReturnType<typeof vi.fn>
		getSessionForTask: ReturnType<typeof vi.fn>
		setSessionForTask: ReturnType<typeof vi.fn>
	}

	beforeEach(() => {
		vi.clearAllMocks()
		vi.useFakeTimers()

		resetSessionManagerInstance()

		mockPathProvider = {
			getTasksDir: vi.fn().mockReturnValue("/home/user/.kilocode/tasks"),
			getSessionFilePath: vi
				.fn()
				.mockImplementation((workspaceDir: string) => `${workspaceDir}/.kilocode/session.json`),
		}

		mockLogger = {
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		}

		mockExtensionMessenger = {
			sendWebviewMessage: vi.fn().mockResolvedValue(undefined),
			requestSingleCompletion: vi.fn().mockResolvedValue("Generated Title"),
		}

		mockDependencies = {
			platform: "vscode",
			pathProvider: mockPathProvider,
			logger: mockLogger,
			extensionMessenger: mockExtensionMessenger,
			getToken: vi.fn().mockResolvedValue("test-token"),
			onSessionCreated: vi.fn(),
			onSessionRestored: vi.fn(),
		}

		mockSessionClient = {
			get: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			share: vi.fn(),
			fork: vi.fn(),
			uploadBlob: vi.fn(),
		}

		mockSessionPersistenceManager = {
			setWorkspaceDir: vi.fn(),
			getLastSession: vi.fn(),
			setLastSession: vi.fn(),
			getSessionForTask: vi.fn(),
			setSessionForTask: vi.fn(),
		}

		vi.mocked(SessionClient).mockImplementation(() => mockSessionClient as unknown as SessionClient)
		vi.mocked(SessionPersistenceManager).mockImplementation(
			() => mockSessionPersistenceManager as unknown as SessionPersistenceManager,
		)
	})

	afterEach(() => {
		vi.useRealTimers()
		resetSessionManagerInstance()
	})

	describe("init", () => {
		it("should throw error when initialized without dependencies and no instance exists", () => {
			expect(() => SessionManager.init()).toThrow("SessionManager not initialized")
		})

		it("should create instance with dependencies", () => {
			const manager = SessionManager.init(mockDependencies)

			expect(manager).toBeInstanceOf(SessionManager)
			expect(mockLogger.debug).toHaveBeenCalledWith("Initialized SessionManager", "SessionManager")
		})

		it("should return existing instance when already initialized", () => {
			const manager1 = SessionManager.init(mockDependencies)
			const manager2 = SessionManager.init()

			expect(manager1).toBe(manager2)
		})

		it("should start timer on init", () => {
			SessionManager.init(mockDependencies)

			expect(vi.getTimerCount()).toBe(1)
		})
	})

	describe("setPath", () => {
		it("should set path for task", () => {
			const manager = SessionManager.init(mockDependencies)

			manager.setPath("task-123", "apiConversationHistoryPath", "/path/to/history.json")

			expect(manager["currentTaskId"]).toBe("task-123")
			expect(manager["paths"].apiConversationHistoryPath).toBe("/path/to/history.json")
		})

		it("should update blob hash when setting path", () => {
			const manager = SessionManager.init(mockDependencies)
			const initialHash = manager["blobHashes"].apiConversationHistory

			manager.setPath("task-123", "apiConversationHistoryPath", "/path/to/history.json")

			expect(manager["blobHashes"].apiConversationHistory).not.toBe(initialHash)
		})
	})

	describe("setWorkspaceDirectory", () => {
		it("should set workspace directory", () => {
			const manager = SessionManager.init(mockDependencies)

			manager.setWorkspaceDirectory("/workspace")

			expect(manager["workspaceDir"]).toBe("/workspace")
			expect(mockSessionPersistenceManager.setWorkspaceDir).toHaveBeenCalledWith("/workspace")
		})
	})

	describe("restoreLastSession", () => {
		it("should return false when no persisted session exists", async () => {
			mockSessionPersistenceManager.getLastSession.mockReturnValue(undefined)
			const manager = SessionManager.init(mockDependencies)

			const result = await manager.restoreLastSession()

			expect(result).toBe(false)
			expect(mockLogger.debug).toHaveBeenCalledWith("No persisted session ID found", "SessionManager")
		})

		it("should return false when getLastSession returns null sessionId", async () => {
			mockSessionPersistenceManager.getLastSession.mockReturnValue({ sessionId: null, timestamp: 123 })
			const manager = SessionManager.init(mockDependencies)

			const result = await manager.restoreLastSession()

			expect(result).toBe(false)
		})

		it("should restore session when persisted session exists", async () => {
			mockSessionPersistenceManager.getLastSession.mockReturnValue({
				sessionId: "session-123",
				timestamp: 123456,
			})
			mockSessionClient.get.mockResolvedValue({
				session_id: "session-123",
				title: "Test Session",
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-01T00:00:00Z",
				api_conversation_history_blob_url: null,
				task_metadata_blob_url: null,
				ui_messages_blob_url: null,
				git_state_blob_url: null,
			})
			const manager = SessionManager.init(mockDependencies)

			const result = await manager.restoreLastSession()

			expect(result).toBe(true)
			expect(mockLogger.info).toHaveBeenCalledWith(
				"Found persisted session ID, attempting to restore",
				"SessionManager",
				{ sessionId: "session-123" },
			)
		})

		it("should return false and log warning when restore fails", async () => {
			mockSessionPersistenceManager.getLastSession.mockReturnValue({
				sessionId: "session-123",
				timestamp: 123456,
			})
			mockSessionClient.get.mockRejectedValue(new Error("Network error"))
			const manager = SessionManager.init(mockDependencies)

			const result = await manager.restoreLastSession()

			expect(result).toBe(false)
			expect(mockLogger.warn).toHaveBeenCalledWith(
				"Failed to restore persisted session",
				"SessionManager",
				expect.objectContaining({ error: "Network error" }),
			)
		})
	})

	describe("restoreSession", () => {
		it("should restore session successfully", async () => {
			const sessionData: SessionWithSignedUrls = {
				session_id: "session-123",
				title: "Test Session",
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-01T00:00:00Z",
				api_conversation_history_blob_url: null,
				task_metadata_blob_url: null,
				ui_messages_blob_url: null,
				git_state_blob_url: null,
			}
			mockSessionClient.get.mockResolvedValue(sessionData)
			const manager = SessionManager.init(mockDependencies)

			await manager.restoreSession("session-123")

			expect(manager.sessionId).toBe("session-123")
			expect(mockLogger.info).toHaveBeenCalledWith("Restoring session", "SessionManager", {
				sessionId: "session-123",
			})
		})

		it("should throw error when session is not found", async () => {
			mockSessionClient.get.mockResolvedValue(null)
			const manager = SessionManager.init(mockDependencies)

			await expect(manager.restoreSession("session-123", true)).rejects.toThrow("Failed to obtain session")
		})

		it("should fetch blobs from signed URLs", async () => {
			const sessionData: SessionWithSignedUrls = {
				session_id: "session-123",
				title: "Test Session",
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-01T00:00:00Z",
				api_conversation_history_blob_url: "https://storage.example.com/api-history",
				task_metadata_blob_url: null,
				ui_messages_blob_url: null,
				git_state_blob_url: null,
			}
			mockSessionClient.get.mockResolvedValue(sessionData)
			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve([{ role: "user", text: "Hello" }]),
			})
			const manager = SessionManager.init(mockDependencies)

			await manager.restoreSession("session-123")

			expect(mockFetch).toHaveBeenCalledWith("https://storage.example.com/api-history")
		})

		it("should filter checkpoint_saved messages from ui_messages", async () => {
			const sessionData: SessionWithSignedUrls = {
				session_id: "session-123",
				title: "Test Session",
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-01T00:00:00Z",
				api_conversation_history_blob_url: null,
				task_metadata_blob_url: null,
				ui_messages_blob_url: "https://storage.example.com/ui-messages",
				git_state_blob_url: null,
			}
			mockSessionClient.get.mockResolvedValue(sessionData)
			mockFetch.mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve([
						{ say: "text", text: "Hello" },
						{ say: "checkpoint_saved", text: "Checkpoint" },
						{ say: "text", text: "World" },
					]),
			})
			const manager = SessionManager.init(mockDependencies)

			await manager.restoreSession("session-123")

			expect(writeFileSync).toHaveBeenCalledWith(
				expect.stringContaining("ui_messages.json"),
				expect.not.stringContaining("checkpoint_saved"),
			)
		})

		it("should call onSessionRestored callback", async () => {
			const sessionData: SessionWithSignedUrls = {
				session_id: "session-123",
				title: "Test Session",
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-01T00:00:00Z",
				api_conversation_history_blob_url: null,
				task_metadata_blob_url: null,
				ui_messages_blob_url: null,
				git_state_blob_url: null,
			}
			mockSessionClient.get.mockResolvedValue(sessionData)
			const manager = SessionManager.init(mockDependencies)

			await manager.restoreSession("session-123")

			expect(mockDependencies.onSessionRestored).toHaveBeenCalled()
		})

		it("should reset state on failure when rethrowError is false", async () => {
			mockSessionClient.get.mockRejectedValue(new Error("Network error"))
			const manager = SessionManager.init(mockDependencies)
			manager.sessionId = "old-session"

			await manager.restoreSession("session-123", false)

			expect(manager.sessionId).toBeNull()
			expect(mockLogger.error).toHaveBeenCalled()
		})
	})

	describe("shareSession", () => {
		it("should throw error when no active session", async () => {
			const manager = SessionManager.init(mockDependencies)

			await expect(manager.shareSession()).rejects.toThrow("No active session")
		})

		it("should share session successfully", async () => {
			mockSessionClient.share.mockResolvedValue({ share_id: "share-123", session_id: "session-123" })
			const manager = SessionManager.init(mockDependencies)
			manager.sessionId = "session-123"

			const result = await manager.shareSession()

			expect(result).toEqual({ share_id: "share-123", session_id: "session-123" })
			expect(mockSessionClient.share).toHaveBeenCalledWith({
				session_id: "session-123",
				shared_state: CliSessionSharedState.Public,
			})
		})
	})

	describe("renameSession", () => {
		it("should throw error when no active session", async () => {
			const manager = SessionManager.init(mockDependencies)

			await expect(manager.renameSession("New Title")).rejects.toThrow("No active session")
		})

		it("should throw error when title is empty", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.sessionId = "session-123"

			await expect(manager.renameSession("   ")).rejects.toThrow("Session title cannot be empty")
		})

		it("should rename session successfully", async () => {
			mockSessionClient.update.mockResolvedValue({
				session_id: "session-123",
				title: "New Title",
				updated_at: "2024-01-01T00:00:00Z",
			})
			const manager = SessionManager.init(mockDependencies)
			manager.sessionId = "session-123"

			await manager.renameSession("  New Title  ")

			expect(mockSessionClient.update).toHaveBeenCalledWith({
				session_id: "session-123",
				title: "New Title",
			})
			expect(manager["sessionTitle"]).toBe("New Title")
		})
	})

	describe("forkSession", () => {
		it("should fork and restore session", async () => {
			mockSessionClient.fork.mockResolvedValue({ session_id: "forked-session-123" })
			mockSessionClient.get.mockResolvedValue({
				session_id: "forked-session-123",
				title: "Forked Session",
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-01T00:00:00Z",
				api_conversation_history_blob_url: null,
				task_metadata_blob_url: null,
				ui_messages_blob_url: null,
				git_state_blob_url: null,
			})
			const manager = SessionManager.init(mockDependencies)

			await manager.forkSession("share-123")

			expect(mockSessionClient.fork).toHaveBeenCalledWith({
				share_or_session_id: "share-123",
				created_on_platform: "vscode",
			})
			expect(manager.sessionId).toBe("forked-session-123")
		})
	})

	describe("destroy", () => {
		it("should clear timer and reset state", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.sessionId = "session-123"
			manager["sessionTitle"] = "Test Title"

			await manager.destroy()

			expect(vi.getTimerCount()).toBe(0)
			expect(manager.sessionId).toBeNull()
			expect(manager["sessionTitle"]).toBeNull()
		})

		it("should wait for syncing to complete", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.sessionId = "session-123"
			manager["isSyncing"] = true

			const destroyPromise = manager.destroy()
			vi.advanceTimersByTime(2000)
			await destroyPromise

			expect(mockLogger.debug).toHaveBeenCalledWith("SessionManager flushed", "SessionManager")
		})
	})

	describe("getFirstMessageText", () => {
		it("should return null for empty messages array", () => {
			const manager = SessionManager.init(mockDependencies)

			const result = manager.getFirstMessageText([])

			expect(result).toBeNull()
		})

		it("should return null when no message has text", () => {
			const manager = SessionManager.init(mockDependencies)
			const messages: ClineMessage[] = [
				{ ts: 123, type: "say", say: "text" },
				{ ts: 124, type: "say", say: "text" },
			]

			const result = manager.getFirstMessageText(messages)

			expect(result).toBeNull()
		})

		it("should return first message with text", () => {
			const manager = SessionManager.init(mockDependencies)
			const messages: ClineMessage[] = [
				{ ts: 123, type: "say", say: "text" },
				{ ts: 124, type: "say", say: "text", text: "Hello World" },
				{ ts: 125, type: "say", say: "text", text: "Goodbye" },
			]

			const result = manager.getFirstMessageText(messages)

			expect(result).toBe("Hello World")
		})

		it("should normalize whitespace", () => {
			const manager = SessionManager.init(mockDependencies)
			const messages: ClineMessage[] = [{ ts: 123, type: "say", say: "text", text: "  Hello   \n  World  " }]

			const result = manager.getFirstMessageText(messages)

			expect(result).toBe("Hello World")
		})

		it("should truncate long text when truncate is true", () => {
			const manager = SessionManager.init(mockDependencies)
			const longText = "A".repeat(200)
			const messages: ClineMessage[] = [{ ts: 123, type: "say", say: "text", text: longText }]

			const result = manager.getFirstMessageText(messages, true)

			expect(result).toHaveLength(140)
			expect(result?.endsWith("...")).toBe(true)
		})

		it("should not truncate text at 140 characters or less", () => {
			const manager = SessionManager.init(mockDependencies)
			const messages: ClineMessage[] = [{ ts: 123, type: "say", say: "text", text: "A".repeat(140) }]

			const result = manager.getFirstMessageText(messages, true)

			expect(result).toHaveLength(140)
			expect(result?.endsWith("...")).toBe(false)
		})
	})

	describe("generateTitle", () => {
		it("should return null for empty messages", async () => {
			const manager = SessionManager.init(mockDependencies)

			const result = await manager.generateTitle([])

			expect(result).toBeNull()
		})

		it("should return raw text when it is 140 characters or less", async () => {
			const manager = SessionManager.init(mockDependencies)
			const messages: ClineMessage[] = [{ ts: 123, type: "say", say: "text", text: "Short title" }]

			const result = await manager.generateTitle(messages)

			expect(result).toBe("Short title")
			expect(mockExtensionMessenger.requestSingleCompletion).not.toHaveBeenCalled()
		})

		it("should generate summary for long text", async () => {
			mockExtensionMessenger.requestSingleCompletion = vi.fn().mockResolvedValue("Summarized title")
			const manager = SessionManager.init(mockDependencies)
			const longText = "A".repeat(200)
			const messages: ClineMessage[] = [{ ts: 123, type: "say", say: "text", text: longText }]

			const result = await manager.generateTitle(messages)

			expect(result).toBe("Summarized title")
			expect(mockExtensionMessenger.requestSingleCompletion).toHaveBeenCalled()
		})

		it("should strip quotes from generated summary", async () => {
			mockExtensionMessenger.requestSingleCompletion = vi.fn().mockResolvedValue('"Quoted title"')
			const manager = SessionManager.init(mockDependencies)
			const longText = "A".repeat(200)
			const messages: ClineMessage[] = [{ ts: 123, type: "say", say: "text", text: longText }]

			const result = await manager.generateTitle(messages)

			expect(result).toBe("Quoted title")
		})

		it("should truncate long generated summary to 140 characters", async () => {
			mockExtensionMessenger.requestSingleCompletion = vi.fn().mockResolvedValue("B".repeat(200))
			const manager = SessionManager.init(mockDependencies)
			const longText = "A".repeat(200)
			const messages: ClineMessage[] = [{ ts: 123, type: "say", say: "text", text: longText }]

			const result = await manager.generateTitle(messages)

			expect(result).toHaveLength(140)
			expect(result?.endsWith("...")).toBe(true)
		})

		it("should fallback to truncation when LLM fails", async () => {
			mockExtensionMessenger.requestSingleCompletion = vi.fn().mockRejectedValue(new Error("LLM error"))
			const manager = SessionManager.init(mockDependencies)
			const longText = "A".repeat(200)
			const messages: ClineMessage[] = [{ ts: 123, type: "say", say: "text", text: longText }]

			const result = await manager.generateTitle(messages)

			expect(result).toHaveLength(140)
			expect(result?.endsWith("...")).toBe(true)
			expect(mockLogger.warn).toHaveBeenCalledWith(
				"Failed to generate title using LLM, falling back to truncation",
				"SessionManager",
				expect.any(Object),
			)
		})
	})

	describe("SYNC_INTERVAL constant", () => {
		it("should be 1000ms", () => {
			expect(SessionManager.SYNC_INTERVAL).toBe(1000)
		})
	})
})
