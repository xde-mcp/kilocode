import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { SessionManager, SessionManagerDependencies } from "../SessionManager.js"
import type { ClineMessage } from "@roo-code/types"

vi.mock("fs")
vi.mock("simple-git")
vi.mock("crypto", async () => {
	const actual = await vi.importActual<typeof import("crypto")>("crypto")
	return {
		...actual,
		randomUUID: vi.fn(() => "test-uuid"),
	}
})

const mockFs = await import("fs")
const mockSimpleGit = await import("simple-git")

describe("SessionManager", () => {
	let mockDependencies: SessionManagerDependencies
	let mockSessionClient: any
	let mockTrpcClient: any
	let mockGit: any

	beforeEach(() => {
		vi.clearAllMocks()
		SessionManager.instance = null

		mockGit = {
			getRemotes: vi.fn().mockResolvedValue([{ refs: { fetch: "https://github.com/test/repo.git" } }]),
			revparse: vi.fn().mockResolvedValue("abc123"),
			raw: vi.fn().mockResolvedValue(""),
			diff: vi.fn().mockResolvedValue(""),
			stashList: vi.fn().mockResolvedValue({ total: 0 }),
			stash: vi.fn().mockResolvedValue(undefined),
			checkout: vi.fn().mockResolvedValue(undefined),
			applyPatch: vi.fn().mockResolvedValue(undefined),
		}

		vi.mocked(mockSimpleGit.default).mockReturnValue(mockGit as any)

		mockSessionClient = {
			get: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			share: vi.fn(),
			fork: vi.fn(),
			uploadBlob: vi.fn().mockResolvedValue(undefined),
		}

		mockTrpcClient = {}

		mockDependencies = {
			pathProvider: {
				getTasksDir: vi.fn().mockReturnValue("/tmp/tasks"),
				getLastSessionPath: vi.fn().mockReturnValue("/tmp/.last-session"),
			},
			logger: {
				debug: vi.fn(),
				info: vi.fn(),
				warn: vi.fn(),
				error: vi.fn(),
			},
			extensionMessenger: {
				sendWebviewMessage: vi.fn().mockResolvedValue(undefined),
				requestSingleCompletion: vi.fn().mockResolvedValue("Generated title"),
			},
			apiConfig: {
				apiProvider: "test",
				getApiUrl: vi.fn().mockReturnValue("https://api.test.com"),
			} as any,
			getToken: vi.fn().mockResolvedValue("test-token"),
			onSessionCreated: vi.fn(),
			onSessionRestored: vi.fn(),
		}

		vi.mocked(mockFs.existsSync).mockReturnValue(true)
		vi.mocked(mockFs.readFileSync).mockReturnValue(JSON.stringify({ test: "data" }))
		vi.mocked(mockFs.writeFileSync).mockImplementation(() => {})
		vi.mocked(mockFs.mkdirSync).mockReturnValue(undefined as any)
		vi.mocked(mockFs.mkdtempSync).mockReturnValue("/tmp/test-dir")
		vi.mocked(mockFs.rmSync).mockImplementation(() => {})
	})

	afterEach(() => {
		SessionManager.instance = null
		vi.clearAllTimers()
	})

	describe("Initialization & Singleton Pattern", () => {
		it("should create instance with dependencies", () => {
			const manager = SessionManager.init(mockDependencies)

			expect(manager).toBeInstanceOf(SessionManager)
			expect(SessionManager.instance).toBe(manager)
		})

		it("should throw error when init() called without dependencies and no instance exists", () => {
			expect(() => SessionManager.init()).toThrow("SessionManager not initialized")
		})

		it("should return existing instance when init() called without dependencies", () => {
			const manager1 = SessionManager.init(mockDependencies)
			const manager2 = SessionManager.init()

			expect(manager2).toBe(manager1)
		})

		it("should return existing instance when init() called with dependencies and instance exists", () => {
			const manager1 = SessionManager.init(mockDependencies)
			const manager2 = SessionManager.init(mockDependencies)

			expect(manager2).toBe(manager1)
		})

		it("should initialize all dependencies correctly", () => {
			const manager = SessionManager.init(mockDependencies)

			expect(manager).toBeDefined()
			expect(manager.sessionClient).toBeDefined()
		})

		it("should call startTimer() during initialization", () => {
			vi.useFakeTimers()
			const manager = SessionManager.init(mockDependencies)

			expect(manager).toBeDefined()

			vi.useRealTimers()
		})
	})

	describe("Path Management", () => {
		it("should update path and trigger blob hash update", () => {
			const manager = SessionManager.init(mockDependencies)
			const initialHash = manager["blobHashes"].apiConversationHistory

			manager.setPath("apiConversationHistoryPath", "/path/to/api.json")

			expect(manager["blobHashes"].apiConversationHistory).not.toBe(initialHash)
			expect(manager["blobHashes"].apiConversationHistory).toBeTruthy()
		})

		it("should set workspace directory", () => {
			const manager = SessionManager.init(mockDependencies)

			manager.setWorkspaceDirectory("/workspace")

			expect(manager).toBeDefined()
		})
	})

	describe("Session Persistence", () => {
		it("should write session ID to file", () => {
			const manager = SessionManager.init(mockDependencies)
			manager.setWorkspaceDirectory("/workspace")

			manager["saveLastSessionId"]("test-session-id")

			expect(mockFs.writeFileSync).toHaveBeenCalledWith(
				"/tmp/.last-session",
				expect.stringContaining("test-session-id"),
			)
		})

		it("should log warning when workspace not set", () => {
			const manager = SessionManager.init(mockDependencies)

			manager["saveLastSessionId"]("test-session-id")

			expect(mockDependencies.logger.warn).toHaveBeenCalledWith(
				"Cannot save last session ID: workspace directory not set",
				"SessionManager",
			)
		})

		it("should handle write errors gracefully", () => {
			const manager = SessionManager.init(mockDependencies)
			manager.setWorkspaceDirectory("/workspace")

			vi.mocked(mockFs.writeFileSync).mockImplementation(() => {
				throw new Error("Write error")
			})

			manager["saveLastSessionId"]("test-session-id")

			expect(mockDependencies.logger.warn).toHaveBeenCalledWith(
				"Failed to save last session ID",
				"SessionManager",
				expect.objectContaining({ error: "Write error" }),
			)
		})

		it("should return null when workspace not set", () => {
			const manager = SessionManager.init(mockDependencies)

			const result = manager["getLastSessionId"]()

			expect(result).toBeNull()
		})

		it("should return null when file doesn't exist", () => {
			const manager = SessionManager.init(mockDependencies)
			manager.setWorkspaceDirectory("/workspace")

			vi.mocked(mockFs.existsSync).mockReturnValue(false)

			const result = manager["getLastSessionId"]()

			expect(result).toBeNull()
		})

		it("should parse valid session data", () => {
			const manager = SessionManager.init(mockDependencies)
			manager.setWorkspaceDirectory("/workspace")

			vi.mocked(mockFs.readFileSync).mockReturnValue(
				JSON.stringify({ sessionId: "test-session-id", timestamp: Date.now() }),
			)

			const result = manager["getLastSessionId"]()

			expect(result).toBe("test-session-id")
		})

		it("should handle read/parse errors", () => {
			const manager = SessionManager.init(mockDependencies)
			manager.setWorkspaceDirectory("/workspace")

			vi.mocked(mockFs.readFileSync).mockImplementation(() => {
				throw new Error("Read error")
			})

			const result = manager["getLastSessionId"]()

			expect(result).toBeNull()
			expect(mockDependencies.logger.warn).toHaveBeenCalledWith(
				"Failed to read last session ID",
				"SessionManager",
				expect.objectContaining({ error: "Read error" }),
			)
		})

		it("should return false when no session ID", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.setWorkspaceDirectory("/workspace")

			vi.mocked(mockFs.existsSync).mockReturnValue(false)

			const result = await manager.restoreLastSession()

			expect(result).toBe(false)
		})

		it("should call restoreSession with ID", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.setWorkspaceDirectory("/workspace")
			manager.sessionClient.get = mockSessionClient.get.mockResolvedValue({
				session_id: "test-session-id",
				title: "Test Session",
				created_at: new Date().toISOString(),
			})

			vi.mocked(mockFs.readFileSync).mockReturnValue(
				JSON.stringify({ sessionId: "test-session-id", timestamp: Date.now() }),
			)

			const result = await manager.restoreLastSession()

			expect(result).toBe(true)
		})

		it("should return true on success", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.setWorkspaceDirectory("/workspace")
			manager.sessionClient.get = mockSessionClient.get.mockResolvedValue({
				session_id: "test-session-id",
				title: "Test Session",
				created_at: new Date().toISOString(),
			})

			vi.mocked(mockFs.readFileSync).mockReturnValue(
				JSON.stringify({ sessionId: "test-session-id", timestamp: Date.now() }),
			)

			const result = await manager.restoreLastSession()

			expect(result).toBe(true)
		})

		it("should return false on failure", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.setWorkspaceDirectory("/workspace")
			manager.sessionClient.get = mockSessionClient.get.mockRejectedValue(new Error("Failed"))

			vi.mocked(mockFs.readFileSync).mockReturnValue(
				JSON.stringify({ sessionId: "test-session-id", timestamp: Date.now() }),
			)

			const result = await manager.restoreLastSession()

			expect(result).toBe(false)
		})
	})

	describe("Session Restoration", () => {
		it("should fetch session data successfully", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.sessionClient.get = mockSessionClient.get.mockResolvedValue({
				session_id: "test-session-id",
				title: "Test Session",
				created_at: new Date().toISOString(),
			})

			await manager.restoreSession("test-session-id")

			expect(mockSessionClient.get).toHaveBeenCalledWith({
				session_id: "test-session-id",
				include_blob_urls: true,
			})
		})

		it("should create session directory", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.sessionClient.get = mockSessionClient.get.mockResolvedValue({
				session_id: "test-session-id",
				title: "Test Session",
				created_at: new Date().toISOString(),
			})

			await manager.restoreSession("test-session-id")

			expect(mockFs.mkdirSync).toHaveBeenCalledWith("/tmp/tasks/test-session-id", { recursive: true })
		})

		it("should fetch and write blob files", async () => {
			const manager = SessionManager.init(mockDependencies)
			const mockBlob = { test: "data" }

			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue(mockBlob),
			})

			manager.sessionClient.get = mockSessionClient.get.mockResolvedValue({
				session_id: "test-session-id",
				title: "Test Session",
				created_at: new Date().toISOString(),
				api_conversation_history_blob_url: "https://example.com/blob",
			})

			await manager.restoreSession("test-session-id")

			expect(global.fetch).toHaveBeenCalledWith("https://example.com/blob")
		})

		it("should handle git_state blob specially", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.setWorkspaceDirectory("/workspace")

			const gitStateBlob = { head: "abc123", patch: "", branch: "main" }

			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue(gitStateBlob),
			})

			manager.sessionClient.get = mockSessionClient.get.mockResolvedValue({
				session_id: "test-session-id",
				title: "Test Session",
				created_at: new Date().toISOString(),
				git_state_blob_url: "https://example.com/git-state",
			})

			await manager.restoreSession("test-session-id")

			expect(mockGit.stash).toHaveBeenCalled()
		})

		it("should filter checkpoint_saved messages from ui_messages", async () => {
			const manager = SessionManager.init(mockDependencies)

			const uiMessagesBlob: ClineMessage[] = [
				{ ts: 1, type: "say", say: "checkpoint_saved" } as any,
				{ ts: 2, type: "say", say: "text", text: "Hello" } as any,
			]

			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue(uiMessagesBlob),
			})

			manager.sessionClient.get = mockSessionClient.get.mockResolvedValue({
				session_id: "test-session-id",
				title: "Test Session",
				created_at: new Date().toISOString(),
				ui_messages_blob_url: "https://example.com/ui-messages",
			})

			await manager.restoreSession("test-session-id")

			const writeCall = vi
				.mocked(mockFs.writeFileSync)
				.mock.calls.find((call) => call[0].toString().includes("ui_messages.json"))
			expect(writeCall).toBeDefined()
			const writtenContent = writeCall![1] as string
			const parsedContent = JSON.parse(writtenContent)
			expect(parsedContent).toHaveLength(1)
			expect(parsedContent[0].text).toBe("Hello")
			expect(parsedContent[0].say).toBe("text")
		})

		it("should send addTaskToHistory message", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.sessionClient.get = mockSessionClient.get.mockResolvedValue({
				session_id: "test-session-id",
				title: "Test Session",
				created_at: new Date().toISOString(),
			})

			await manager.restoreSession("test-session-id")

			expect(mockDependencies.extensionMessenger.sendWebviewMessage).toHaveBeenCalledWith({
				type: "addTaskToHistory",
				historyItem: expect.objectContaining({
					id: "test-session-id",
					task: "Test Session",
				}),
			})
		})

		it("should send showTaskWithId message", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.sessionClient.get = mockSessionClient.get.mockResolvedValue({
				session_id: "test-session-id",
				title: "Test Session",
				created_at: new Date().toISOString(),
			})

			await manager.restoreSession("test-session-id")

			expect(mockDependencies.extensionMessenger.sendWebviewMessage).toHaveBeenCalledWith({
				type: "showTaskWithId",
				text: "test-session-id",
			})
		})

		it("should call onSessionRestored callback", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.sessionClient.get = mockSessionClient.get.mockResolvedValue({
				session_id: "test-session-id",
				title: "Test Session",
				created_at: new Date().toISOString(),
			})

			await manager.restoreSession("test-session-id")

			expect(mockDependencies.onSessionRestored).toHaveBeenCalled()
		})

		it("should handle errors and reset state", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.sessionClient.get = mockSessionClient.get.mockRejectedValue(new Error("Failed"))

			await manager.restoreSession("test-session-id")

			expect(manager.sessionId).toBeNull()
		})

		it("should rethrow error when rethrowError=true", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.sessionClient.get = mockSessionClient.get.mockRejectedValue(new Error("Failed"))

			await expect(manager.restoreSession("test-session-id", true)).rejects.toThrow("Failed")
		})
	})

	describe("Session Operations", () => {
		it("should throw when no active session for shareSession", async () => {
			const manager = SessionManager.init(mockDependencies)

			await expect(manager.shareSession()).rejects.toThrow("No active session")
		})

		it("should call sessionClient.share with correct params", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.sessionId = "test-session-id"
			manager.sessionClient.share = mockSessionClient.share.mockResolvedValue({ share_id: "share-123" })

			await manager.shareSession()

			expect(mockSessionClient.share).toHaveBeenCalledWith({
				session_id: "test-session-id",
				shared_state: "public",
			})
		})

		it("should throw when no active session for renameSession", async () => {
			const manager = SessionManager.init(mockDependencies)

			await expect(manager.renameSession("New Title")).rejects.toThrow("No active session")
		})

		it("should throw when title is empty/whitespace", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.sessionId = "test-session-id"

			await expect(manager.renameSession("   ")).rejects.toThrow("Session title cannot be empty")
		})

		it("should update session title successfully", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.sessionId = "test-session-id"
			manager.sessionClient.update = mockSessionClient.update.mockResolvedValue(undefined)

			await manager.renameSession("New Title")

			expect(mockSessionClient.update).toHaveBeenCalledWith({
				session_id: "test-session-id",
				title: "New Title",
			})
		})

		it("should call sessionClient.fork and restore", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.sessionClient.fork = mockSessionClient.fork.mockResolvedValue({ session_id: "forked-session" })
			manager.sessionClient.get = mockSessionClient.get.mockResolvedValue({
				session_id: "forked-session",
				title: "Forked Session",
				created_at: new Date().toISOString(),
			})

			await manager.forkSession("share-123")

			expect(mockSessionClient.fork).toHaveBeenCalledWith({ share_id: "share-123" })
		})
	})

	describe("Sync Functionality", () => {
		it("should skip when already syncing", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager["isSyncing"] = true

			await manager["syncSession"]()

			expect(mockDependencies.logger.debug).not.toHaveBeenCalledWith("Creating new session", "SessionManager")
		})

		it("should skip when no paths set", async () => {
			const manager = SessionManager.init(mockDependencies)

			await manager["syncSession"]()

			expect(mockDependencies.logger.debug).not.toHaveBeenCalledWith("Creating new session", "SessionManager")
		})

		it("should skip when no blobs changed", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.setPath("apiConversationHistoryPath", "/path/to/api.json")
			manager["lastSyncedBlobHashes"] = { ...manager["blobHashes"] }

			await manager["syncSession"]()

			expect(mockDependencies.logger.debug).not.toHaveBeenCalledWith("Creating new session", "SessionManager")
		})

		it("should create new session when sessionId is null", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.setPath("apiConversationHistoryPath", "/path/to/api.json")
			manager.sessionClient.create = mockSessionClient.create.mockResolvedValue({ session_id: "new-session" })

			await manager["syncSession"](true)

			expect(mockSessionClient.create).toHaveBeenCalled()
			expect(manager.sessionId).toBe("new-session")
		})

		it("should update existing session when git URL changes", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.sessionId = "existing-session"
			manager["sessionGitUrl"] = "https://github.com/old/repo.git"
			manager.setPath("apiConversationHistoryPath", "/path/to/api.json")
			manager.setWorkspaceDirectory("/workspace")
			manager.sessionClient.update = mockSessionClient.update.mockResolvedValue(undefined)

			await manager["syncSession"](true)

			expect(mockSessionClient.update).toHaveBeenCalled()
		})

		it("should upload changed blobs", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.sessionId = "test-session"
			manager.setPath("apiConversationHistoryPath", "/path/to/api.json")
			manager.sessionClient.uploadBlob = mockSessionClient.uploadBlob.mockResolvedValue({
				session_id: "test-session",
				updated_at: new Date().toISOString(),
			})

			await manager["syncSession"](true)

			expect(manager.sessionId).toBe("test-session")
		})

		it("should handle git state blob upload", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.sessionId = "test-session"
			manager.setPath("apiConversationHistoryPath", "/path/to/api.json")
			manager.setWorkspaceDirectory("/workspace")
			manager.sessionClient.uploadBlob = mockSessionClient.uploadBlob.mockResolvedValue(undefined)

			await manager["syncSession"](true)

			expect(mockGit.getRemotes).toHaveBeenCalled()
		})

		it("should generate title when none exists", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.setPath("uiMessagesPath", "/path/to/ui.json")
			manager.sessionClient.create = mockSessionClient.create.mockResolvedValue({ session_id: "new-session" })

			vi.mocked(mockFs.readFileSync).mockReturnValue(
				JSON.stringify([{ type: "say", say: "text", text: "Test message", ts: 1 }]),
			)

			await manager["syncSession"](true)

			expect(mockSessionClient.create).toHaveBeenCalledWith(
				expect.objectContaining({
					title: "Test message",
				}),
			)
		})

		it("should be called by timer interval", async () => {
			vi.useFakeTimers()
			const manager = SessionManager.init(mockDependencies)
			const syncSpy = vi.spyOn(manager as any, "syncSession")

			vi.advanceTimersByTime(SessionManager.SYNC_INTERVAL)

			expect(syncSpy).toHaveBeenCalled()

			vi.useRealTimers()
		})

		it("should handle errors gracefully", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.setPath("apiConversationHistoryPath", "/path/to/api.json")
			manager.sessionClient.create = vi.fn().mockRejectedValue(new Error("API error"))

			vi.mocked(mockFs.readFileSync).mockReturnValue(JSON.stringify({ test: "data" }))

			await manager["syncSession"](true)

			expect(mockDependencies.logger.error).toHaveBeenCalledWith(
				"Failed to sync session",
				"SessionManager",
				expect.objectContaining({
					error: "API error",
				}),
			)
		})
	})

	describe("Blob Hash Management", () => {
		it("should generate new UUID", () => {
			const manager = SessionManager.init(mockDependencies)
			const initialHash = manager["blobHashes"].apiConversationHistory

			manager["updateBlobHash"]("apiConversationHistory")

			expect(manager["blobHashes"].apiConversationHistory).not.toBe(initialHash)
			expect(manager["blobHashes"].apiConversationHistory).toBeTruthy()
		})

		it("should compare current with last synced", () => {
			const manager = SessionManager.init(mockDependencies)
			manager["blobHashes"].apiConversationHistory = "hash1"
			manager["lastSyncedBlobHashes"].apiConversationHistory = "hash2"

			const result = manager["hasBlobChanged"]("apiConversationHistory")

			expect(result).toBe(true)
		})

		it("should check all blob types", () => {
			const manager = SessionManager.init(mockDependencies)
			manager["blobHashes"].apiConversationHistory = "hash1"
			manager["lastSyncedBlobHashes"].apiConversationHistory = "hash2"

			const result = manager["hasAnyBlobChanged"]()

			expect(result).toBe(true)
		})

		it("should update last synced hash", () => {
			const manager = SessionManager.init(mockDependencies)
			manager["blobHashes"].apiConversationHistory = "hash1"

			manager["markBlobSynced"]("apiConversationHistory")

			expect(manager["lastSyncedBlobHashes"].apiConversationHistory).toBe("hash1")
		})

		it("should clear all hashes", () => {
			const manager = SessionManager.init(mockDependencies)
			manager["blobHashes"].apiConversationHistory = "hash1"

			manager["resetBlobHashes"]()

			expect(manager["blobHashes"].apiConversationHistory).toBe("")
		})
	})

	describe("Git Operations", () => {
		it("should return repo URL, head, branch, and patch", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.setWorkspaceDirectory("/workspace")

			mockGit.raw.mockImplementation((args: string[]) => {
				if (args[0] === "symbolic-ref") {
					return Promise.resolve("refs/heads/main\n")
				}
				if (args[0] === "ls-files") {
					return Promise.resolve("")
				}
				return Promise.resolve("")
			})

			const result = await manager["getGitState"]()

			expect(result.repoUrl).toBe("https://github.com/test/repo.git")
			expect(result.head).toBe("abc123")
			expect(result.branch).toBe("main")
		})

		it("should handle untracked files", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.setWorkspaceDirectory("/workspace")

			mockGit.raw.mockImplementation((args: string[]) => {
				if (args[0] === "ls-files") {
					return Promise.resolve("untracked.txt\n")
				}
				if (args[0] === "symbolic-ref") {
					return Promise.resolve("refs/heads/main\n")
				}
				return Promise.resolve("")
			})

			await manager["getGitState"]()

			expect(mockGit.raw).toHaveBeenCalledWith(["add", "--intent-to-add", "--", "untracked.txt"])
		})

		it("should handle first commit", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.setWorkspaceDirectory("/workspace")

			mockGit.diff.mockResolvedValue("")
			mockGit.raw.mockImplementation((args: string[]) => {
				if (args[0] === "rev-list") {
					return Promise.resolve("abc123\n")
				}
				if (args[0] === "hash-object") {
					return Promise.resolve("4b825dc642cb6eb9a060e54bf8d69288fbee4904\n")
				}
				if (args[0] === "symbolic-ref") {
					return Promise.resolve("refs/heads/main\n")
				}
				if (args[0] === "ls-files") {
					return Promise.resolve("")
				}
				return Promise.resolve("")
			})

			const result = await manager["getGitState"]()

			expect(mockGit.raw).toHaveBeenCalledWith(["rev-list", "--parents", "-n", "1", "HEAD"])
		})

		it("should stash current work", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.setWorkspaceDirectory("/workspace")

			mockGit.stashList.mockResolvedValueOnce({ total: 0 }).mockResolvedValueOnce({ total: 1 })

			await manager["executeGitRestore"]({ head: "abc123", patch: "", branch: "main" })

			expect(mockGit.stash).toHaveBeenCalled()
		})

		it("should checkout to branch when available", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.setWorkspaceDirectory("/workspace")

			mockGit.revparse.mockImplementation((args: string[]) => {
				if (args[0] === "main") {
					return Promise.resolve("abc123")
				}
				return Promise.resolve("def456")
			})

			await manager["executeGitRestore"]({ head: "abc123", patch: "", branch: "main" })

			expect(mockGit.checkout).toHaveBeenCalledWith("main")
		})

		it("should checkout to commit (detached HEAD)", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.setWorkspaceDirectory("/workspace")

			mockGit.revparse.mockResolvedValue("different-commit")

			await manager["executeGitRestore"]({ head: "abc123", patch: "", branch: "main" })

			expect(mockGit.checkout).toHaveBeenCalledWith("abc123")
		})

		it("should apply patch", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.setWorkspaceDirectory("/workspace")

			await manager["executeGitRestore"]({ head: "abc123", patch: "diff --git a/file.txt", branch: "main" })

			expect(mockGit.applyPatch).toHaveBeenCalled()
		})

		it("should pop stash after restoration", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.setWorkspaceDirectory("/workspace")

			mockGit.stashList.mockResolvedValueOnce({ total: 0 }).mockResolvedValueOnce({ total: 1 })

			await manager["executeGitRestore"]({ head: "abc123", patch: "", branch: "main" })

			expect(mockGit.stash).toHaveBeenCalledWith(["pop"])
		})

		it("should handle errors gracefully", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.setWorkspaceDirectory("/workspace")

			mockGit.stash.mockRejectedValue(new Error("Stash failed"))

			await manager["executeGitRestore"]({ head: "abc123", patch: "", branch: "main" })

			expect(mockDependencies.logger.warn).toHaveBeenCalled()
		})
	})

	describe("Utility Methods", () => {
		it("should return null for empty array", () => {
			const manager = SessionManager.init(mockDependencies)

			const result = manager.getFirstMessageText([])

			expect(result).toBeNull()
		})

		it("should find first message with text", () => {
			const manager = SessionManager.init(mockDependencies)
			const messages: ClineMessage[] = [
				{ type: "say", say: "text", text: "Hello", ts: 1 } as any,
				{ type: "say", say: "text", text: "World", ts: 2 } as any,
			]

			const result = manager.getFirstMessageText(messages)

			expect(result).toBe("Hello")
		})

		it("should normalize whitespace", () => {
			const manager = SessionManager.init(mockDependencies)
			const messages: ClineMessage[] = [{ type: "say", say: "text", text: "Hello   \n  World", ts: 1 } as any]

			const result = manager.getFirstMessageText(messages)

			expect(result).toBe("Hello World")
		})

		it("should truncate when requested", () => {
			const manager = SessionManager.init(mockDependencies)
			const longText = "a".repeat(150)
			const messages: ClineMessage[] = [{ type: "say", say: "text", text: longText, ts: 1 } as any]

			const result = manager.getFirstMessageText(messages, true)

			expect(result).toHaveLength(140)
			expect(result?.endsWith("...")).toBe(true)
		})

		it("should return text when ≤140 chars", async () => {
			const manager = SessionManager.init(mockDependencies)
			const messages: ClineMessage[] = [{ type: "say", say: "text", text: "Short text", ts: 1 } as any]

			const result = await manager.generateTitle(messages)

			expect(result).toBe("Short text")
		})

		it("should use LLM for longer text", async () => {
			const manager = SessionManager.init(mockDependencies)
			const longText = "a".repeat(150)
			const messages: ClineMessage[] = [{ type: "say", say: "text", text: longText, ts: 1 } as any]

			const result = await manager.generateTitle(messages)

			expect(result).toBe("Generated title")
			expect(mockDependencies.extensionMessenger.requestSingleCompletion).toHaveBeenCalled()
		})

		it("should fall back to truncation on LLM error", async () => {
			const manager = SessionManager.init(mockDependencies)
			const longText = "a".repeat(150)
			const messages: ClineMessage[] = [{ type: "say", say: "text", text: longText, ts: 1 } as any]

			vi.mocked(mockDependencies.extensionMessenger.requestSingleCompletion).mockRejectedValue(
				new Error("LLM error"),
			)

			const result = await manager.generateTitle(messages)

			expect(result).toHaveLength(140)
			expect(result?.endsWith("...")).toBe(true)
		})
	})

	describe("Cleanup", () => {
		it("should clear timer", async () => {
			const manager = SessionManager.init(mockDependencies)

			await manager.destroy()

			expect(manager["timer"]).toBeNull()
		})

		it("should sync when session active and not syncing", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.sessionId = "test-session"
			manager["isSyncing"] = false
			const syncSpy = vi.spyOn(manager as any, "syncSession")

			await manager.destroy()

			expect(syncSpy).toHaveBeenCalledWith(true)
		})

		it("should wait when already syncing", async () => {
			vi.useFakeTimers()
			const manager = SessionManager.init(mockDependencies)
			manager.sessionId = "test-session"
			manager["isSyncing"] = true

			const destroyPromise = manager.destroy()

			vi.advanceTimersByTime(2000)
			await destroyPromise

			expect(manager.sessionId).toBeNull()

			vi.useRealTimers()
		})

		it("should reset all state", async () => {
			const manager = SessionManager.init(mockDependencies)
			manager.sessionId = "test-session"
			manager.setPath("apiConversationHistoryPath", "/path/to/api.json")

			await manager.destroy()

			expect(manager.sessionId).toBeNull()
			expect(manager["paths"].apiConversationHistoryPath).toBeNull()
		})
	})
})
