import { GitStateService, GitState, GitRestoreState } from "../GitStateService.js"
import type { ILogger } from "../../types/ILogger.js"
import simpleGit from "simple-git"
import { mkdtempSync, writeFileSync, rmSync } from "fs"
import { tmpdir } from "os"

vi.mock("simple-git", () => ({
	default: vi.fn(() => ({
		getRemotes: vi.fn().mockResolvedValue([{ refs: { fetch: "https://github.com/test/repo.git" } }]),
		revparse: vi.fn().mockResolvedValue("abc123def456"),
		raw: vi.fn().mockResolvedValue(""),
		diff: vi.fn().mockResolvedValue("diff content"),
		stash: vi.fn().mockResolvedValue(undefined),
		stashList: vi.fn().mockResolvedValue({ total: 0 }),
		checkout: vi.fn().mockResolvedValue(undefined),
		applyPatch: vi.fn().mockResolvedValue(undefined),
	})),
}))

vi.mock("fs", () => ({
	mkdtempSync: vi.fn().mockReturnValue("/tmp/kilocode-git-patches-123"),
	writeFileSync: vi.fn(),
	rmSync: vi.fn(),
}))

vi.mock("os", () => ({
	tmpdir: vi.fn().mockReturnValue("/tmp"),
}))

/**
 * Creates a mock logger for testing
 */
const createMockLogger = (): ILogger => ({
	debug: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
})

/**
 * Creates a mock git instance with customizable methods
 */
const createMockGit = (overrides: Partial<ReturnType<typeof simpleGit>> = {}) => ({
	getRemotes: vi.fn().mockResolvedValue([{ refs: { fetch: "https://github.com/test/repo.git" } }]),
	revparse: vi.fn().mockResolvedValue("abc123def456"),
	raw: vi.fn().mockResolvedValue(""),
	diff: vi.fn().mockResolvedValue("diff content"),
	stash: vi.fn().mockResolvedValue(undefined),
	stashList: vi.fn().mockResolvedValue({ total: 0 }),
	checkout: vi.fn().mockResolvedValue(undefined),
	applyPatch: vi.fn().mockResolvedValue(undefined),
	...overrides,
})

describe("GitStateService", () => {
	let service: GitStateService
	let mockLogger: ILogger

	beforeEach(() => {
		vi.clearAllMocks()
		mockLogger = createMockLogger()
		service = new GitStateService({
			logger: mockLogger,
			getWorkspaceDir: () => "/workspace",
		})
	})

	describe("hashGitState", () => {
		it("should return consistent hash for same input", () => {
			const gitState: Pick<GitState, "head" | "patch" | "branch"> = {
				head: "abc123",
				patch: "diff content",
				branch: "main",
			}

			const hash1 = service.hashGitState(gitState)
			const hash2 = service.hashGitState(gitState)

			expect(hash1).toBe(hash2)
			expect(hash1).toHaveLength(64) // SHA-256 produces 64 hex characters
		})

		it("should return different hash for different head", () => {
			const gitState1: Pick<GitState, "head" | "patch" | "branch"> = {
				head: "abc123",
				patch: "diff content",
				branch: "main",
			}
			const gitState2: Pick<GitState, "head" | "patch" | "branch"> = {
				head: "def456",
				patch: "diff content",
				branch: "main",
			}

			const hash1 = service.hashGitState(gitState1)
			const hash2 = service.hashGitState(gitState2)

			expect(hash1).not.toBe(hash2)
		})

		it("should return different hash for different patch", () => {
			const gitState1: Pick<GitState, "head" | "patch" | "branch"> = {
				head: "abc123",
				patch: "diff content 1",
				branch: "main",
			}
			const gitState2: Pick<GitState, "head" | "patch" | "branch"> = {
				head: "abc123",
				patch: "diff content 2",
				branch: "main",
			}

			const hash1 = service.hashGitState(gitState1)
			const hash2 = service.hashGitState(gitState2)

			expect(hash1).not.toBe(hash2)
		})

		it("should return different hash for different branch", () => {
			const gitState1: Pick<GitState, "head" | "patch" | "branch"> = {
				head: "abc123",
				patch: "diff content",
				branch: "main",
			}
			const gitState2: Pick<GitState, "head" | "patch" | "branch"> = {
				head: "abc123",
				patch: "diff content",
				branch: "develop",
			}

			const hash1 = service.hashGitState(gitState1)
			const hash2 = service.hashGitState(gitState2)

			expect(hash1).not.toBe(hash2)
		})

		it("should handle undefined branch", () => {
			const gitState: Pick<GitState, "head" | "patch" | "branch"> = {
				head: "abc123",
				patch: "diff content",
				branch: undefined,
			}

			const hash = service.hashGitState(gitState)

			expect(hash).toHaveLength(64)
		})

		it("should handle empty patch", () => {
			const gitState: Pick<GitState, "head" | "patch" | "branch"> = {
				head: "abc123",
				patch: "",
				branch: "main",
			}

			const hash = service.hashGitState(gitState)

			expect(hash).toHaveLength(64)
		})

		it("should produce different hashes for empty vs undefined branch", () => {
			const gitState1: Pick<GitState, "head" | "patch" | "branch"> = {
				head: "abc123",
				patch: "diff",
				branch: undefined,
			}
			const gitState2: Pick<GitState, "head" | "patch" | "branch"> = {
				head: "abc123",
				patch: "diff",
				branch: "",
			}

			const hash1 = service.hashGitState(gitState1)
			const hash2 = service.hashGitState(gitState2)

			// undefined and "" serialize differently in JSON
			expect(hash1).not.toBe(hash2)
		})
	})

	describe("getGitState", () => {
		it("should return correct structure with repoUrl, head, branch, patch", async () => {
			const mockGit = createMockGit({
				raw: vi.fn().mockImplementation((args: string[]) => {
					if (args[0] === "symbolic-ref") {
						return Promise.resolve("refs/heads/main")
					}
					if (args[0] === "ls-files") {
						return Promise.resolve("")
					}
					return Promise.resolve("")
				}),
			})
			vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>)

			const result = await service.getGitState()

			expect(result).toEqual({
				repoUrl: "https://github.com/test/repo.git",
				head: "abc123def456",
				branch: "main",
				patch: "diff content",
			})
		})

		it("should handle missing remote (repoUrl undefined)", async () => {
			const mockGit = createMockGit({
				getRemotes: vi.fn().mockResolvedValue([]),
				raw: vi.fn().mockImplementation((args: string[]) => {
					if (args[0] === "symbolic-ref") {
						return Promise.resolve("refs/heads/main")
					}
					if (args[0] === "ls-files") {
						return Promise.resolve("")
					}
					return Promise.resolve("")
				}),
			})
			vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>)

			const result = await service.getGitState()

			expect(result?.repoUrl).toBeUndefined()
		})

		it("should handle detached HEAD (branch undefined)", async () => {
			const mockGit = createMockGit({
				raw: vi.fn().mockImplementation((args: string[]) => {
					if (args[0] === "symbolic-ref") {
						return Promise.reject(new Error("fatal: ref HEAD is not a symbolic ref"))
					}
					if (args[0] === "ls-files") {
						return Promise.resolve("")
					}
					return Promise.resolve("")
				}),
			})
			vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>)

			const result = await service.getGitState()

			expect(result?.branch).toBeUndefined()
		})

		it("should truncate patch when exceeding MAX_PATCH_SIZE_BYTES", async () => {
			const largePatch = "a".repeat(GitStateService.MAX_PATCH_SIZE_BYTES + 1)
			const mockGit = createMockGit({
				diff: vi.fn().mockResolvedValue(largePatch),
				raw: vi.fn().mockImplementation((args: string[]) => {
					if (args[0] === "symbolic-ref") {
						return Promise.resolve("refs/heads/main")
					}
					if (args[0] === "ls-files") {
						return Promise.resolve("")
					}
					return Promise.resolve("")
				}),
			})
			vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>)

			const result = await service.getGitState()

			expect(result?.patch).toBe("")
			expect(mockLogger.warn).toHaveBeenCalledWith("Git patch too large", "GitStateService", {
				patchSize: largePatch.length,
				maxSize: GitStateService.MAX_PATCH_SIZE_BYTES,
			})
		})

		it("should return patch when size is exactly at the limit", async () => {
			const exactLimitPatch = "a".repeat(GitStateService.MAX_PATCH_SIZE_BYTES)
			const mockGit = createMockGit({
				diff: vi.fn().mockResolvedValue(exactLimitPatch),
				raw: vi.fn().mockImplementation((args: string[]) => {
					if (args[0] === "symbolic-ref") {
						return Promise.resolve("refs/heads/main")
					}
					if (args[0] === "ls-files") {
						return Promise.resolve("")
					}
					return Promise.resolve("")
				}),
			})
			vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>)

			const result = await service.getGitState()

			expect(result?.patch).toBe(exactLimitPatch)
		})

		it("should handle untracked files (adds with intent-to-add, then resets)", async () => {
			const mockRaw = vi.fn().mockImplementation((args: string[]) => {
				if (args[0] === "symbolic-ref") {
					return Promise.resolve("refs/heads/main")
				}
				if (args[0] === "ls-files") {
					return Promise.resolve("untracked1.txt\nuntracked2.txt")
				}
				if (args[0] === "add") {
					return Promise.resolve("")
				}
				if (args[0] === "reset") {
					return Promise.resolve("")
				}
				return Promise.resolve("")
			})
			const mockGit = createMockGit({
				raw: mockRaw,
			})
			vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>)

			await service.getGitState()

			// Verify intent-to-add was called
			expect(mockRaw).toHaveBeenCalledWith(["add", "--intent-to-add", "--", "untracked1.txt", "untracked2.txt"])
			// Verify reset was called in finally block
			expect(mockRaw).toHaveBeenCalledWith(["reset", "HEAD", "--", "untracked1.txt", "untracked2.txt"])
		})

		it("should handle first commit scenario (empty tree hash)", async () => {
			const mockRaw = vi.fn().mockImplementation((args: string[]) => {
				if (args[0] === "symbolic-ref") {
					return Promise.resolve("refs/heads/main")
				}
				if (args[0] === "ls-files") {
					return Promise.resolve("")
				}
				if (args[0] === "rev-list") {
					// First commit has no parents - returns only the commit hash
					return Promise.resolve("abc123def456")
				}
				if (args[0] === "hash-object") {
					return Promise.resolve("4b825dc642cb6eb9a060e54bf8d69288fbee4904")
				}
				return Promise.resolve("")
			})
			const mockDiff = vi
				.fn()
				.mockResolvedValueOnce("") // First call returns empty (no diff against HEAD)
				.mockResolvedValueOnce("first commit diff") // Second call with empty tree hash
			const mockGit = createMockGit({
				raw: mockRaw,
				diff: mockDiff,
			})
			vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>)

			const result = await service.getGitState()

			expect(mockRaw).toHaveBeenCalledWith(["rev-list", "--parents", "-n", "1", "HEAD"])
			expect(mockRaw).toHaveBeenCalledWith(["hash-object", "-t", "tree", "/dev/null"])
			expect(result?.patch).toBe("first commit diff")
		})

		it("should use NUL device on Windows for first commit", async () => {
			const originalPlatform = process.platform
			Object.defineProperty(process, "platform", { value: "win32" })

			const mockRaw = vi.fn().mockImplementation((args: string[]) => {
				if (args[0] === "symbolic-ref") {
					return Promise.resolve("refs/heads/main")
				}
				if (args[0] === "ls-files") {
					return Promise.resolve("")
				}
				if (args[0] === "rev-list") {
					return Promise.resolve("abc123def456")
				}
				if (args[0] === "hash-object") {
					return Promise.resolve("4b825dc642cb6eb9a060e54bf8d69288fbee4904")
				}
				return Promise.resolve("")
			})
			const mockGit = createMockGit({
				raw: mockRaw,
				diff: vi.fn().mockResolvedValueOnce("").mockResolvedValueOnce("first commit diff"),
			})
			vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>)

			await service.getGitState()

			expect(mockRaw).toHaveBeenCalledWith(["hash-object", "-t", "tree", "NUL"])

			Object.defineProperty(process, "platform", { value: originalPlatform })
		})

		it("should use process.cwd() when getWorkspaceDir returns null", async () => {
			const serviceWithNullWorkspace = new GitStateService({
				logger: mockLogger,
				getWorkspaceDir: () => null,
			})

			const mockGit = createMockGit({
				raw: vi.fn().mockImplementation((args: string[]) => {
					if (args[0] === "symbolic-ref") {
						return Promise.resolve("refs/heads/main")
					}
					if (args[0] === "ls-files") {
						return Promise.resolve("")
					}
					return Promise.resolve("")
				}),
			})
			vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>)

			await serviceWithNullWorkspace.getGitState()

			expect(simpleGit).toHaveBeenCalledWith(process.cwd())
		})

		it("should use push URL when fetch URL is not available", async () => {
			const mockGit = createMockGit({
				getRemotes: vi.fn().mockResolvedValue([{ refs: { push: "https://github.com/test/repo-push.git" } }]),
				raw: vi.fn().mockImplementation((args: string[]) => {
					if (args[0] === "symbolic-ref") {
						return Promise.resolve("refs/heads/main")
					}
					if (args[0] === "ls-files") {
						return Promise.resolve("")
					}
					return Promise.resolve("")
				}),
			})
			vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>)

			const result = await service.getGitState()

			expect(result?.repoUrl).toBe("https://github.com/test/repo-push.git")
		})
	})

	describe("executeGitRestore", () => {
		const gitRestoreState: GitRestoreState = {
			head: "abc123def456",
			patch: "diff content",
			branch: "main",
		}

		it("should stash current work before checkout", async () => {
			const mockStash = vi.fn().mockResolvedValue(undefined)
			const mockStashList = vi
				.fn()
				.mockResolvedValueOnce({ total: 0 }) // Before stash
				.mockResolvedValueOnce({ total: 1 }) // After stash
			const mockGit = createMockGit({
				stash: mockStash,
				stashList: mockStashList,
				revparse: vi.fn().mockResolvedValue("different123"),
			})
			vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>)

			await service.executeGitRestore(gitRestoreState)

			expect(mockStash).toHaveBeenCalled()
			expect(mockLogger.debug).toHaveBeenCalledWith("Stashed current work", "GitStateService")
		})

		it("should not pop stash when no changes were stashed", async () => {
			const mockStash = vi.fn().mockResolvedValue(undefined)
			const mockStashList = vi.fn().mockResolvedValue({ total: 0 }) // Same count before and after
			const mockGit = createMockGit({
				stash: mockStash,
				stashList: mockStashList,
				revparse: vi.fn().mockResolvedValue("different123"),
			})
			vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>)

			await service.executeGitRestore(gitRestoreState)

			expect(mockLogger.debug).toHaveBeenCalledWith("No changes to stash", "GitStateService")
			// Stash pop should not be called
			expect(mockStash).not.toHaveBeenCalledWith(["pop"])
		})

		it("should checkout to branch when branch matches head", async () => {
			const mockCheckout = vi.fn().mockResolvedValue(undefined)
			const mockRevparse = vi
				.fn()
				.mockResolvedValueOnce("different123") // Current HEAD
				.mockResolvedValueOnce("abc123def456") // Branch commit matches target head
			const mockGit = createMockGit({
				checkout: mockCheckout,
				revparse: mockRevparse,
				stashList: vi.fn().mockResolvedValue({ total: 0 }),
			})
			vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>)

			await service.executeGitRestore(gitRestoreState)

			expect(mockCheckout).toHaveBeenCalledWith("main")
			expect(mockLogger.debug).toHaveBeenCalledWith("Checked out to branch", "GitStateService", {
				branch: "main",
				head: "abc123de",
			})
		})

		it("should checkout to commit (detached HEAD) when branch moved", async () => {
			const mockCheckout = vi.fn().mockResolvedValue(undefined)
			const mockRevparse = vi
				.fn()
				.mockResolvedValueOnce("different123") // Current HEAD
				.mockResolvedValueOnce("moved456789") // Branch commit doesn't match target head
			const mockGit = createMockGit({
				checkout: mockCheckout,
				revparse: mockRevparse,
				stashList: vi.fn().mockResolvedValue({ total: 0 }),
			})
			vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>)

			await service.executeGitRestore(gitRestoreState)

			expect(mockCheckout).toHaveBeenCalledWith("abc123def456")
			expect(mockLogger.debug).toHaveBeenCalledWith(
				"Branch moved, checked out to commit (detached HEAD)",
				"GitStateService",
				{
					branch: "main",
					head: "abc123de",
				},
			)
		})

		it("should checkout to commit when branch not found", async () => {
			const mockCheckout = vi.fn().mockResolvedValue(undefined)
			const mockRevparse = vi
				.fn()
				.mockResolvedValueOnce("different123") // Current HEAD
				.mockRejectedValueOnce(new Error("Branch not found")) // Branch doesn't exist
			const mockGit = createMockGit({
				checkout: mockCheckout,
				revparse: mockRevparse,
				stashList: vi.fn().mockResolvedValue({ total: 0 }),
			})
			vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>)

			await service.executeGitRestore(gitRestoreState)

			expect(mockCheckout).toHaveBeenCalledWith("abc123def456")
			expect(mockLogger.debug).toHaveBeenCalledWith(
				"Branch not found, checked out to commit (detached HEAD)",
				"GitStateService",
				{
					branch: "main",
					head: "abc123de",
				},
			)
		})

		it("should checkout to commit when no branch info provided", async () => {
			const mockCheckout = vi.fn().mockResolvedValue(undefined)
			const mockRevparse = vi.fn().mockResolvedValueOnce("different123") // Current HEAD
			const mockGit = createMockGit({
				checkout: mockCheckout,
				revparse: mockRevparse,
				stashList: vi.fn().mockResolvedValue({ total: 0 }),
			})
			vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>)

			const stateWithoutBranch: GitRestoreState = {
				head: "abc123def456",
				patch: "diff content",
				branch: "",
			}

			await service.executeGitRestore(stateWithoutBranch)

			expect(mockCheckout).toHaveBeenCalledWith("abc123def456")
			expect(mockLogger.debug).toHaveBeenCalledWith(
				"No branch info, checked out to commit (detached HEAD)",
				"GitStateService",
				{
					head: "abc123de",
				},
			)
		})

		it("should skip checkout when already at target commit", async () => {
			const mockCheckout = vi.fn().mockResolvedValue(undefined)
			const mockRevparse = vi.fn().mockResolvedValue("abc123def456") // Already at target
			const mockGit = createMockGit({
				checkout: mockCheckout,
				revparse: mockRevparse,
				stashList: vi.fn().mockResolvedValue({ total: 0 }),
			})
			vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>)

			await service.executeGitRestore(gitRestoreState)

			expect(mockCheckout).not.toHaveBeenCalled()
			expect(mockLogger.debug).toHaveBeenCalledWith(
				"Already at target commit, skipping checkout",
				"GitStateService",
				{
					head: "abc123de",
				},
			)
		})

		it("should apply patch from temp file", async () => {
			const mockApplyPatch = vi.fn().mockResolvedValue(undefined)
			const mockGit = createMockGit({
				applyPatch: mockApplyPatch,
				revparse: vi.fn().mockResolvedValue("abc123def456"),
				stashList: vi.fn().mockResolvedValue({ total: 0 }),
			})
			vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>)

			await service.executeGitRestore(gitRestoreState)

			expect(mkdtempSync).toHaveBeenCalled()
			expect(writeFileSync).toHaveBeenCalledWith(expect.stringContaining(".patch"), "diff content")
			expect(mockApplyPatch).toHaveBeenCalled()
			expect(rmSync).toHaveBeenCalledWith(expect.any(String), { recursive: true, force: true })
		})

		it("should pop stash after restore when stash was created", async () => {
			const mockStash = vi.fn().mockResolvedValue(undefined)
			const mockStashList = vi
				.fn()
				.mockResolvedValueOnce({ total: 0 }) // Before stash
				.mockResolvedValueOnce({ total: 1 }) // After stash
			const mockGit = createMockGit({
				stash: mockStash,
				stashList: mockStashList,
				revparse: vi.fn().mockResolvedValue("abc123def456"),
			})
			vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>)

			await service.executeGitRestore(gitRestoreState)

			expect(mockStash).toHaveBeenCalledWith(["pop"])
			expect(mockLogger.debug).toHaveBeenCalledWith("Popped stash", "GitStateService")
		})

		it("should handle stash error gracefully", async () => {
			const mockStash = vi.fn().mockRejectedValue(new Error("Stash failed"))
			const mockGit = createMockGit({
				stash: mockStash,
				stashList: vi.fn().mockResolvedValue({ total: 0 }),
				revparse: vi.fn().mockResolvedValue("abc123def456"),
			})
			vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>)

			// Should not throw
			await service.executeGitRestore(gitRestoreState)

			expect(mockLogger.warn).toHaveBeenCalledWith("Failed to stash current work", "GitStateService", {
				error: "Stash failed",
			})
		})

		it("should handle checkout error gracefully", async () => {
			const mockCheckout = vi.fn().mockRejectedValue(new Error("Checkout failed"))
			const mockGit = createMockGit({
				checkout: mockCheckout,
				revparse: vi.fn().mockResolvedValue("different123"),
				stashList: vi.fn().mockResolvedValue({ total: 0 }),
			})
			vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>)

			// Should not throw
			await service.executeGitRestore(gitRestoreState)

			expect(mockLogger.warn).toHaveBeenCalledWith("Failed to checkout", "GitStateService", {
				branch: "main",
				head: "abc123de",
				error: "Checkout failed",
			})
		})

		it("should handle apply patch error gracefully", async () => {
			const mockApplyPatch = vi.fn().mockRejectedValue(new Error("Patch failed"))
			const mockGit = createMockGit({
				applyPatch: mockApplyPatch,
				revparse: vi.fn().mockResolvedValue("abc123def456"),
				stashList: vi.fn().mockResolvedValue({ total: 0 }),
			})
			vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>)

			// Should not throw
			await service.executeGitRestore(gitRestoreState)

			expect(mockLogger.warn).toHaveBeenCalledWith("Failed to apply patch", "GitStateService", {
				error: "Patch failed",
			})
		})

		it("should handle stash pop error gracefully", async () => {
			const mockStash = vi
				.fn()
				.mockResolvedValueOnce(undefined) // Initial stash succeeds
				.mockRejectedValueOnce(new Error("Pop failed")) // Pop fails
			const mockStashList = vi.fn().mockResolvedValueOnce({ total: 0 }).mockResolvedValueOnce({ total: 1 })
			const mockGit = createMockGit({
				stash: mockStash,
				stashList: mockStashList,
				revparse: vi.fn().mockResolvedValue("abc123def456"),
			})
			vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>)

			// Should not throw
			await service.executeGitRestore(gitRestoreState)

			expect(mockLogger.warn).toHaveBeenCalledWith("Failed to pop stash", "GitStateService", {
				error: "Pop failed",
			})
		})

		it("should log info when git state restoration finishes", async () => {
			const mockGit = createMockGit({
				revparse: vi.fn().mockResolvedValue("abc123def456"),
				stashList: vi.fn().mockResolvedValue({ total: 0 }),
			})
			vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>)

			await service.executeGitRestore(gitRestoreState)

			expect(mockLogger.info).toHaveBeenCalledWith("Git state restoration finished", "GitStateService", {
				head: "abc123de",
			})
		})

		it("should handle top-level error gracefully", async () => {
			vi.mocked(simpleGit).mockImplementation(() => {
				throw new Error("Git initialization failed")
			})

			// Should not throw
			await service.executeGitRestore(gitRestoreState)

			expect(mockLogger.error).toHaveBeenCalledWith("Failed to restore git state", "GitStateService", {
				error: "Git initialization failed",
			})
		})

		it("should use process.cwd() when getWorkspaceDir returns null", async () => {
			const serviceWithNullWorkspace = new GitStateService({
				logger: mockLogger,
				getWorkspaceDir: () => null,
			})

			const mockGit = createMockGit({
				revparse: vi.fn().mockResolvedValue("abc123def456"),
				stashList: vi.fn().mockResolvedValue({ total: 0 }),
			})
			vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>)

			await serviceWithNullWorkspace.executeGitRestore(gitRestoreState)

			expect(simpleGit).toHaveBeenCalledWith(process.cwd())
		})

		it("should clean up temp directory even when apply patch fails", async () => {
			const mockApplyPatch = vi.fn().mockRejectedValue(new Error("Patch failed"))
			const mockGit = createMockGit({
				applyPatch: mockApplyPatch,
				revparse: vi.fn().mockResolvedValue("abc123def456"),
				stashList: vi.fn().mockResolvedValue({ total: 0 }),
			})
			vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>)

			await service.executeGitRestore(gitRestoreState)

			expect(rmSync).toHaveBeenCalledWith(expect.any(String), { recursive: true, force: true })
		})

		it("should handle rmSync error silently", async () => {
			vi.mocked(rmSync).mockImplementation(() => {
				throw new Error("Cannot remove directory")
			})

			const mockGit = createMockGit({
				revparse: vi.fn().mockResolvedValue("abc123def456"),
				stashList: vi.fn().mockResolvedValue({ total: 0 }),
			})
			vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>)

			// Should not throw
			await service.executeGitRestore(gitRestoreState)

			// Should still complete successfully
			expect(mockLogger.info).toHaveBeenCalledWith("Git state restoration finished", "GitStateService", {
				head: "abc123de",
			})
		})
	})

	describe("MAX_PATCH_SIZE_BYTES constant", () => {
		it("should be 5MB", () => {
			expect(GitStateService.MAX_PATCH_SIZE_BYTES).toBe(5 * 1024 * 1024)
		})
	})
})
