import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "fs"
import { KiloCodePaths } from "../utils/paths"
import { SessionClient, SessionWithSignedUrls, ShareSessionOutput, CliSessionSharedState } from "./sessionClient"
import { logs } from "./logs.js"
import path from "path"
import { ensureDirSync } from "fs-extra"
import type { ExtensionService } from "./extension.js"
import type { ClineMessage, HistoryItem } from "@roo-code/types"
import simpleGit from "simple-git"
import { tmpdir } from "os"

const defaultPaths = {
	apiConversationHistoryPath: null as null | string,
	uiMessagesPath: null as null | string,
	taskMetadataPath: null as null | string,
}

export class SessionService {
	private static instance: SessionService | null = null

	static init(extensionService?: ExtensionService, json?: boolean) {
		if (!extensionService && !SessionService.instance) {
			throw new Error("extensionService and store required to init SessionService")
		}

		if (extensionService && !SessionService.instance) {
			SessionService.instance = new SessionService(extensionService, json || false)

			logs.debug("Initiated SessionService", "SessionService")
		}

		const instance = SessionService.instance

		instance!.startTimer()

		return SessionService.instance!
	}

	private paths = { ...defaultPaths }
	private _sessionId: string | null = null
	private workspaceDir: string | null = null
	private sessionTitle: string | null = null

	get sessionId() {
		return this._sessionId
	}

	private set sessionId(sessionId: string | null) {
		this._sessionId = sessionId
	}

	private timer: NodeJS.Timeout | null = null
	private lastSaveEvent: string = ""
	private lastSyncEvent: string = ""
	private isSyncing: boolean = false

	private constructor(
		private extensionService: ExtensionService,
		private jsonMode: boolean,
	) {
		this.startTimer()
	}

	startTimer() {
		if (!this.timer) {
			this.timer = setInterval(() => {
				this.syncSession()
			}, 5000)
		}
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

	private async fetchBlobFromSignedUrl(url: string, urlType: string): Promise<unknown> {
		try {
			const logUrl = new URL(url)
			logUrl.searchParams.forEach((_, key) => logUrl.searchParams.delete(key))

			logs.debug(`Fetching blob from signed URL`, "SessionService", { logUrl, urlType })

			const response = await fetch(url)

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`)
			}

			const data = await response.json()

			logs.debug(`Successfully fetched blob`, "SessionService", { logUrl, urlType })

			return data
		} catch (error) {
			logs.error(`Failed to fetch blob from signed URL`, "SessionService", {
				url,
				urlType,
				error: error instanceof Error ? error.message : String(error),
			})
			throw error
		}
	}

	async restoreSession(sessionId: string, rethrowError = false) {
		try {
			logs.info("Restoring session", "SessionService", { sessionId })

			// Set sessionId immediately to prevent race condition with syncSession timer
			// If restoration fails, we'll reset it in the catch block
			this.sessionId = sessionId
			this.lastSaveEvent = crypto.randomUUID()
			this.lastSyncEvent = this.lastSaveEvent

			const sessionClient = SessionClient.getInstance()
			const session = (await sessionClient.get({
				session_id: sessionId,
				include_blob_urls: true,
			})) as SessionWithSignedUrls

			if (!session) {
				logs.error("Failed to obtain session", "SessionService", { sessionId })
				return
			}

			this.sessionTitle = session.title

			const sessionDirectoryPath = path.join(KiloCodePaths.getTasksDir(), sessionId)

			ensureDirSync(sessionDirectoryPath)

			// Fetch and write each blob type from signed URLs
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
						logs.debug(`No signed URL for ${blobUrlField}`, "SessionService")
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
							const gitState = fileContent as Parameters<typeof this.executeGitRestore>[0]

							await this.executeGitRestore(gitState)

							continue
						}

						if (filename === "ui_messages") {
							// eliminate checkpoints for now
							fileContent = (fileContent as ClineMessage[]).filter(
								(message) => message.say !== "checkpoint_saved",
							)
						}

						const fullPath = path.join(sessionDirectoryPath, `${filename}.json`)

						writeFileSync(fullPath, JSON.stringify(fileContent, null, 2))

						logs.debug(`Wrote blob to file`, "SessionService", { fullPath })
					} else {
						logs.error(`Failed to process blob`, "SessionService", {
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

			if (rethrowError) {
				throw error
			}
		}
	}

	private async syncSession(force = false) {
		if (!force) {
			if (this.isSyncing) {
				return
			}

			if (Object.values(this.paths).every((item) => !item) || this.lastSaveEvent === this.lastSyncEvent) {
				return
			}
		}

		this.isSyncing = true

		try {
			const rawPayload = this.readPaths()

			if (Object.values(rawPayload).every((item) => !item)) {
				return
			}

			const currentLastSaveEvent = this.lastSaveEvent
			const sessionClient = SessionClient.getInstance()

			const basePayload: Parameters<typeof sessionClient.create>[0] = {
				api_conversation_history: rawPayload.apiConversationHistoryPath,
				task_metadata: rawPayload.taskMetadataPath,
				ui_messages: rawPayload.uiMessagesPath,
			}

			try {
				const gitInfo = await this.getGitState()

				if (gitInfo) {
					basePayload.git_state = {
						head: gitInfo.head,
						patch: gitInfo.patch,
					}

					if (gitInfo.branch) {
						basePayload.git_state.branch = gitInfo.branch
					}

					if (gitInfo.repoUrl) {
						basePayload.git_url = gitInfo.repoUrl
					}
				}
			} catch (error) {
				logs.debug("Could not get git state", "SessionService", {
					error: error instanceof Error ? error.message : String(error),
				})
			}

			if (this.sessionId) {
				logs.debug("Updating existing session", "SessionService", { sessionId: this.sessionId })

				await sessionClient.update({
					session_id: this.sessionId,
					...basePayload,
				})

				logs.debug("Session updated successfully", "SessionService", { sessionId: this.sessionId })
			} else {
				logs.debug("Creating new session", "SessionService")

				if (rawPayload.uiMessagesPath) {
					const title = this.getFirstMessageText(rawPayload.uiMessagesPath as ClineMessage[], true)

					if (title) {
						basePayload.title = title
					}
				}

				const session = await sessionClient.create(basePayload)

				this.sessionId = session.session_id

				logs.info("Session created successfully", "SessionService", { sessionId: this.sessionId })

				if (this.jsonMode) {
					console.log(
						JSON.stringify({
							timestamp: Date.now(),
							event: "session_created",
							sessionId: this.sessionId,
						}),
					)
				}
			}

			this.lastSyncEvent = currentLastSaveEvent

			if (!this.sessionTitle && rawPayload.uiMessagesPath) {
				// intentionally not awaiting as we don't want this to block
				this.generateTitle(rawPayload.uiMessagesPath as ClineMessage[])
					.then((generatedTitle) => {
						if (generatedTitle) {
							return this.renameSession(generatedTitle)
						}

						return null
					})
					.catch((error) => {
						logs.warn("Failed to generate session title", "SessionService", {
							error: error instanceof Error ? error.message : String(error),
						})
					})
			}
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

	setWorkspaceDirectory(dir: string): void {
		this.workspaceDir = dir
	}

	getFirstMessageText(uiMessages: ClineMessage[], truncate = false): string | null {
		if (uiMessages.length === 0) {
			return null
		}

		const firstMessageWithText = uiMessages.find((msg) => msg.text)

		if (!firstMessageWithText?.text) {
			return null
		}

		let rawText = firstMessageWithText.text.trim()
		rawText = rawText.replace(/\s+/g, " ")

		if (!rawText) {
			return null
		}

		if (truncate && rawText.length > 140) {
			return rawText.substring(0, 137) + "..."
		}

		return rawText
	}

	async generateTitle(uiMessages: ClineMessage[]): Promise<string | null> {
		const rawText = this.getFirstMessageText(uiMessages)

		if (!rawText) {
			return null
		}

		if (rawText.length <= 140) {
			return rawText
		}

		try {
			const prompt = `Summarize the following user request in 140 characters or less. Be concise and capture the main intent. Do not use quotes or add any prefix like "Summary:" - just provide the summary text directly. Your result will be used as the conversation title.

User request:
${rawText}

Summary:`

			const summary = await this.extensionService.requestSingleCompletion(prompt, 30000)

			// Clean up the response and ensure it's within 140 characters
			let cleanedSummary = summary.trim()

			// Remove any quotes that might have been added
			cleanedSummary = cleanedSummary.replace(/^["']|["']$/g, "")

			// Truncate if still too long
			if (cleanedSummary.length > 140) {
				cleanedSummary = cleanedSummary.substring(0, 137) + "..."
			}

			return cleanedSummary || rawText.substring(0, 137) + "..."
		} catch (error) {
			logs.warn("Failed to generate title using LLM, falling back to truncation", "SessionService", {
				error: error instanceof Error ? error.message : String(error),
			})

			// Fallback to simple truncation
			return rawText.substring(0, 137) + "..."
		}
	}

	private async executeGitRestore(gitState: { head: string; patch: string; branch: string }): Promise<void> {
		try {
			const cwd = this.workspaceDir || process.cwd()
			const git = simpleGit(cwd)

			let shouldPop = false

			// Step 1: Stash current work
			try {
				// Get stash count before stashing to detect if something was actually stashed
				const stashListBefore = await git.stashList()
				const stashCountBefore = stashListBefore.total

				await git.stash()

				const stashListAfter = await git.stashList()
				const stashCountAfter = stashListAfter.total

				// Only set shouldPop if a new stash entry was actually created
				if (stashCountAfter > stashCountBefore) {
					shouldPop = true
					logs.debug(`Stashed current work`, "SessionService")
				} else {
					logs.debug(`No changes to stash`, "SessionService")
				}
			} catch (error) {
				logs.warn(`Failed to stash current work`, "SessionService", {
					error: error instanceof Error ? error.message : String(error),
				})
			}

			// Step 2: Checkout to the saved commit/branch
			try {
				// Check if we're already at the correct commit
				const currentHead = await git.revparse(["HEAD"])

				if (currentHead.trim() === gitState.head.trim()) {
					logs.debug(`Already at target commit, skipping checkout`, "SessionService", {
						head: gitState.head.substring(0, 8),
					})
				} else {
					// Not at the correct commit, need to checkout
					// Try to checkout branch if available to avoid detached HEAD
					if (gitState.branch) {
						try {
							// Check if branch exists and points to the same commit
							const branchCommit = await git.revparse([gitState.branch])

							if (branchCommit.trim() === gitState.head.trim()) {
								// Branch exists and points to correct commit, checkout branch
								await git.checkout(gitState.branch)

								logs.debug(`Checked out to branch`, "SessionService", {
									branch: gitState.branch,
									head: gitState.head.substring(0, 8),
								})
							} else {
								// Branch exists but points to different commit, checkout SHA (detached HEAD)
								await git.checkout(gitState.head)

								logs.debug(`Branch moved, checked out to commit (detached HEAD)`, "SessionService", {
									branch: gitState.branch,
									head: gitState.head.substring(0, 8),
								})
							}
						} catch {
							// Branch doesn't exist or revparse failed, checkout SHA (detached HEAD)
							await git.checkout(gitState.head)

							logs.debug(`Branch not found, checked out to commit (detached HEAD)`, "SessionService", {
								branch: gitState.branch,
								head: gitState.head.substring(0, 8),
							})
						}
					} else {
						// No branch info saved, checkout SHA (detached HEAD)
						await git.checkout(gitState.head)

						logs.debug(`No branch info, checked out to commit (detached HEAD)`, "SessionService", {
							head: gitState.head.substring(0, 8),
						})
					}
				}
			} catch (error) {
				logs.warn(`Failed to checkout`, "SessionService", {
					branch: gitState.branch,
					head: gitState.head.substring(0, 8),
					error: error instanceof Error ? error.message : String(error),
				})
			}

			// Step 3: Apply the patch with uncommitted changes
			try {
				// Write patch to a temporary file and apply it
				const tempDir = mkdtempSync(path.join(tmpdir(), "kilocode-git-patches"))
				const patchFile = path.join(tempDir, `${Date.now()}.patch`)

				try {
					writeFileSync(patchFile, gitState.patch)

					await git.applyPatch(patchFile)

					logs.debug(`Applied patch`, "SessionService", {
						patchSize: gitState.patch.length,
					})
				} finally {
					try {
						rmSync(patchFile, { recursive: true, force: true })
					} catch {
						// Ignore cleanup errors
					}
				}
			} catch (error) {
				logs.warn(`Failed to apply patch`, "SessionService", {
					error: error instanceof Error ? error.message : String(error),
				})
			}

			// Step 4: Pop the stash to restore original work
			try {
				if (shouldPop) {
					await git.stash(["pop"])

					logs.debug(`Popped stash`, "SessionService")
				}
			} catch (error) {
				logs.warn(`Failed to pop stash`, "SessionService", {
					error: error instanceof Error ? error.message : String(error),
				})
			}

			logs.info(`Git state restored successfully`, "SessionService", {
				head: gitState.head.substring(0, 8),
			})
		} catch (error) {
			logs.error(`Failed to restore git state`, "SessionService", {
				error: error instanceof Error ? error.message : String(error),
			})
		}
	}

	private async getGitState() {
		const cwd = this.workspaceDir || process.cwd()
		const git = simpleGit(cwd)

		const remotes = await git.getRemotes(true)
		const repoUrl = remotes[0]?.refs?.fetch || remotes[0]?.refs?.push

		const head = await git.revparse(["HEAD"])

		// Capture current branch name to avoid detached HEAD on restore
		let branch: string | undefined
		try {
			const symbolicRef = await git.raw(["symbolic-ref", "-q", "HEAD"])
			// symbolic-ref returns refs/heads/branch-name, extract just the branch name
			branch = symbolicRef.trim().replace(/^refs\/heads\//, "")
		} catch {
			// Not on a branch (already detached HEAD or no symbolic ref)
			branch = undefined
		}

		// Get list of untracked files (excluding ignored files)
		const untrackedOutput = await git.raw(["ls-files", "--others", "--exclude-standard"])
		const untrackedFiles = untrackedOutput.trim().split("\n").filter(Boolean)

		// Mark untracked files with intent-to-add so they appear in diff
		if (untrackedFiles.length > 0) {
			await git.raw(["add", "--intent-to-add", "--", ...untrackedFiles])
		}

		try {
			// Try standard diff first to capture uncommitted changes (now includes untracked files)
			let patch = await git.diff(["HEAD"])

			// If patch is empty, check if this is the first commit
			if (!patch || patch.trim().length === 0) {
				// Check if HEAD is the first commit (has no parent)
				const parents = await git.raw(["rev-list", "--parents", "-n", "1", "HEAD"])
				const isFirstCommit = parents.trim().split(" ").length === 1

				if (isFirstCommit) {
					// For first commit, generate Git's universal empty tree hash to diff against
					// This represents an empty repository state and allows capturing the entire initial commit
					const nullDevice = process.platform === "win32" ? "NUL" : "/dev/null"
					const emptyTreeHash = (await git.raw(["hash-object", "-t", "tree", nullDevice])).trim()
					patch = await git.diff([emptyTreeHash, "HEAD"])
				}
			}

			return {
				repoUrl,
				head,
				branch,
				patch,
			}
		} finally {
			// Reset the intent-to-add to restore original state
			if (untrackedFiles.length > 0) {
				await git.raw(["reset", "HEAD", "--", ...untrackedFiles])
			}
		}
	}

	async shareSession(): Promise<ShareSessionOutput> {
		const sessionId = this.sessionId
		if (!sessionId) {
			throw new Error("No active session")
		}

		const sessionClient = SessionClient.getInstance()

		return await sessionClient.share({
			session_id: sessionId,
			shared_state: CliSessionSharedState.Public,
		})
	}

	async renameSession(newTitle: string): Promise<void> {
		const sessionId = this.sessionId
		if (!sessionId) {
			throw new Error("No active session")
		}

		const trimmedTitle = newTitle.trim()
		if (!trimmedTitle) {
			throw new Error("Session title cannot be empty")
		}

		const sessionClient = SessionClient.getInstance()

		// Update the session title on the backend
		await sessionClient.update({
			session_id: sessionId,
			title: trimmedTitle,
		})

		// Update the local session title
		this.sessionTitle = trimmedTitle

		logs.info("Session renamed successfully", "SessionService", {
			sessionId,
			newTitle: trimmedTitle,
		})
	}

	async forkSession(shareId: string, rethrowError = false) {
		const sessionClient = SessionClient.getInstance()
		const { session_id } = await sessionClient.fork({ share_id: shareId })

		await this.restoreSession(session_id, rethrowError)
	}

	async destroy() {
		logs.debug("Destroying SessionService", "SessionService", {
			sessionId: this.sessionId,
			isSyncing: this.isSyncing,
		})

		if (this.timer) {
			clearInterval(this.timer)
			this.timer = null
		}

		if (this.sessionId) {
			if (this.isSyncing) {
				await new Promise((r) => setTimeout(r, 2000))
			} else {
				await this.syncSession(true)
			}
		}

		this.paths = { ...defaultPaths }
		this.sessionId = null
		this.sessionTitle = null
		this.isSyncing = false

		logs.debug("SessionService flushed", "SessionService")
	}
}
