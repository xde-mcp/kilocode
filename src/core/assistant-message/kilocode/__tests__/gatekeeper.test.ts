import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { evaluateGatekeeperApproval } from "../gatekeeper"
import type { Task } from "../../../task/Task"
import type { ProviderSettings } from "@roo-code/types"
import { execSync } from "child_process"
import { existsSync } from "fs"

// Mock dependencies
vi.mock("child_process")
vi.mock("fs", () => ({
	existsSync: vi.fn(),
}))
vi.mock("../../../../api", () => ({
	buildApiHandler: vi.fn().mockReturnValue({
		getModel: vi.fn().mockReturnValue({
			info: {
				inputPrice: 0.003,
				outputPrice: 0.015,
				cacheWritesPrice: 0.00375,
				cacheReadsPrice: 0.0003,
			},
		}),
	}),
}))

vi.mock("../../../../shared/cost", () => ({
	calculateApiCostAnthropic: vi.fn().mockReturnValue(0.0001),
}))

vi.mock("../../../../utils/single-completion-handler", () => ({
	singleCompletionHandler: vi.fn(),
}))

describe("gatekeeper", () => {
	let mockTask: Partial<Task>
	let mockProviderRef: any
	let mockState: any
	let originalCwd: string

	beforeEach(() => {
		vi.clearAllMocks()
		originalCwd = process.cwd()

		// Mock existsSync to return true by default
		vi.mocked(existsSync).mockReturnValue(true)

		// Setup mock state
		mockState = {
			yoloGatekeeperApiConfigId: "gatekeeper-config-id",
			listApiConfigMeta: [
				{
					id: "gatekeeper-config-id",
					name: "Gatekeeper Config",
				},
			],
		}

		// Setup mock provider ref
		mockProviderRef = {
			deref: vi.fn().mockReturnValue({
				getState: vi.fn().mockResolvedValue(mockState),
				providerSettingsManager: {
					getProfile: vi.fn().mockResolvedValue({
						apiProvider: "anthropic",
						apiModelId: "claude-3-haiku-20240307",
					} as ProviderSettings),
				},
			}),
		}

		// Setup mock task
		mockTask = {
			providerRef: mockProviderRef,
			say: vi.fn().mockResolvedValue(undefined),
		}
	})

	afterEach(() => {
		// Restore original cwd
		process.chdir(originalCwd)
	})

	describe("evaluateGatekeeperApproval", () => {
		it("should return true when no gatekeeper is configured", async () => {
			mockState.yoloGatekeeperApiConfigId = undefined

			const result = await evaluateGatekeeperApproval(mockTask as Task, "read_file", { path: "test.ts" })

			expect(result).toBe(true)
		})

		it("should return true when listApiConfigMeta is not available", async () => {
			mockState.listApiConfigMeta = undefined

			const result = await evaluateGatekeeperApproval(mockTask as Task, "read_file", { path: "test.ts" })

			expect(result).toBe(true)
		})

		it("should return true when listApiConfigMeta is not an array", async () => {
			mockState.listApiConfigMeta = "not-an-array"

			const result = await evaluateGatekeeperApproval(mockTask as Task, "read_file", { path: "test.ts" })

			expect(result).toBe(true)
		})

		it("should return true when gatekeeper config is not found", async () => {
			mockState.listApiConfigMeta = [
				{
					id: "different-config-id",
					name: "Different Config",
				},
			]

			const result = await evaluateGatekeeperApproval(mockTask as Task, "read_file", { path: "test.ts" })

			expect(result).toBe(true)
		})

		it("should return true when profile cannot be loaded", async () => {
			mockProviderRef.deref().providerSettingsManager.getProfile.mockResolvedValue(null)

			const result = await evaluateGatekeeperApproval(mockTask as Task, "read_file", { path: "test.ts" })

			expect(result).toBe(true)
		})

		it("should return true when profile has no apiProvider", async () => {
			mockProviderRef.deref().providerSettingsManager.getProfile.mockResolvedValue({
				apiProvider: undefined,
			})

			const result = await evaluateGatekeeperApproval(mockTask as Task, "read_file", { path: "test.ts" })

			expect(result).toBe(true)
		})

		it("should approve when gatekeeper responds with 'yes'", async () => {
			const { singleCompletionHandler } = await import("../../../../utils/single-completion-handler")
			vi.mocked(singleCompletionHandler).mockResolvedValue({
				text: "yes",
				usage: {
					inputTokens: 100,
					outputTokens: 10,
					cacheWriteTokens: 0,
					cacheReadTokens: 0,
				},
			})

			const result = await evaluateGatekeeperApproval(mockTask as Task, "read_file", { path: "test.ts" })

			expect(result).toBe(true)
			expect(mockTask.say).toHaveBeenCalledWith(
				"text",
				expect.stringContaining("✅ approved"),
				undefined,
				false,
				undefined,
				undefined,
				{ isNonInteractive: true },
			)
		})

		it("should approve when gatekeeper responds with 'approve'", async () => {
			const { singleCompletionHandler } = await import("../../../../utils/single-completion-handler")
			vi.mocked(singleCompletionHandler).mockResolvedValue({
				text: "approve",
				usage: {
					inputTokens: 100,
					outputTokens: 10,
				},
			})

			const result = await evaluateGatekeeperApproval(mockTask as Task, "read_file", { path: "test.ts" })

			expect(result).toBe(true)
		})

		it("should approve when gatekeeper responds with 'allow'", async () => {
			const { singleCompletionHandler } = await import("../../../../utils/single-completion-handler")
			vi.mocked(singleCompletionHandler).mockResolvedValue({
				text: "allow",
				usage: {
					inputTokens: 100,
					outputTokens: 10,
				},
			})

			const result = await evaluateGatekeeperApproval(mockTask as Task, "read_file", { path: "test.ts" })

			expect(result).toBe(true)
		})

		it("should deny when gatekeeper responds with 'no'", async () => {
			const { singleCompletionHandler } = await import("../../../../utils/single-completion-handler")
			vi.mocked(singleCompletionHandler).mockResolvedValue({
				text: "no",
				usage: {
					inputTokens: 100,
					outputTokens: 10,
				},
			})

			const result = await evaluateGatekeeperApproval(mockTask as Task, "execute_command", {
				command: "rm -rf /",
			})

			expect(result).toBe(false)
			expect(mockTask.say).toHaveBeenCalledWith(
				"text",
				expect.stringContaining("❌ denied"),
				undefined,
				false,
				undefined,
				undefined,
				{ isNonInteractive: true },
			)
		})

		it("should handle responses with mixed case", async () => {
			const { singleCompletionHandler } = await import("../../../../utils/single-completion-handler")
			vi.mocked(singleCompletionHandler).mockResolvedValue({
				text: "YES, this is approved",
				usage: {
					inputTokens: 100,
					outputTokens: 10,
				},
			})

			const result = await evaluateGatekeeperApproval(mockTask as Task, "read_file", { path: "test.ts" })

			expect(result).toBe(true)
		})

		it("should display cost when usage information is available", async () => {
			const { singleCompletionHandler } = await import("../../../../utils/single-completion-handler")
			vi.mocked(singleCompletionHandler).mockResolvedValue({
				text: "yes",
				usage: {
					inputTokens: 100,
					outputTokens: 10,
					cacheWriteTokens: 5,
					cacheReadTokens: 20,
				},
			})

			await evaluateGatekeeperApproval(mockTask as Task, "read_file", { path: "test.ts" })

			expect(mockTask.say).toHaveBeenCalledWith(
				"text",
				expect.stringContaining("$0.0001"),
				undefined,
				false,
				undefined,
				undefined,
				{ isNonInteractive: true },
			)
		})

		it("should display '<$0.0001' for very small costs", async () => {
			const { singleCompletionHandler } = await import("../../../../utils/single-completion-handler")
			const { calculateApiCostAnthropic } = await import("../../../../shared/cost")
			vi.mocked(calculateApiCostAnthropic).mockReturnValue(0.00005)
			vi.mocked(singleCompletionHandler).mockResolvedValue({
				text: "yes",
				usage: {
					inputTokens: 10,
					outputTokens: 1,
				},
			})

			await evaluateGatekeeperApproval(mockTask as Task, "read_file", { path: "test.ts" })

			expect(mockTask.say).toHaveBeenCalledWith(
				"text",
				expect.stringContaining("<$0.0001"),
				undefined,
				false,
				undefined,
				undefined,
				{ isNonInteractive: true },
			)
		})

		it("should use totalCost from usage if provided", async () => {
			const { singleCompletionHandler } = await import("../../../../utils/single-completion-handler")
			vi.mocked(singleCompletionHandler).mockResolvedValue({
				text: "yes",
				usage: {
					inputTokens: 100,
					outputTokens: 10,
					totalCost: 0.0025,
				},
			})

			await evaluateGatekeeperApproval(mockTask as Task, "read_file", { path: "test.ts" })

			expect(mockTask.say).toHaveBeenCalledWith(
				"text",
				expect.stringContaining("$0.0025"),
				undefined,
				false,
				undefined,
				undefined,
				{ isNonInteractive: true },
			)
		})

		it("should remove trailing zeroes from cost display", async () => {
			const { singleCompletionHandler } = await import("../../../../utils/single-completion-handler")
			const { calculateApiCostAnthropic } = await import("../../../../shared/cost")
			vi.mocked(calculateApiCostAnthropic).mockReturnValue(0.0012)
			vi.mocked(singleCompletionHandler).mockResolvedValue({
				text: "yes",
				usage: {
					inputTokens: 100,
					outputTokens: 10,
				},
			})

			await evaluateGatekeeperApproval(mockTask as Task, "read_file", { path: "test.ts" })

			expect(mockTask.say).toHaveBeenCalledWith(
				"text",
				expect.stringContaining("$0.0012"),
				undefined,
				false,
				undefined,
				undefined,
				{ isNonInteractive: true },
			)
		})

		it("should remove all trailing zeroes including decimal point", async () => {
			const { singleCompletionHandler } = await import("../../../../utils/single-completion-handler")
			const { calculateApiCostAnthropic } = await import("../../../../shared/cost")
			vi.mocked(calculateApiCostAnthropic).mockReturnValue(0.001)
			vi.mocked(singleCompletionHandler).mockResolvedValue({
				text: "yes",
				usage: {
					inputTokens: 100,
					outputTokens: 10,
				},
			})

			await evaluateGatekeeperApproval(mockTask as Task, "read_file", { path: "test.ts" })

			expect(mockTask.say).toHaveBeenCalledWith(
				"text",
				expect.stringContaining("$0.001"),
				undefined,
				false,
				undefined,
				undefined,
				{ isNonInteractive: true },
			)
		})

		it("should handle whole dollar amounts without decimal", async () => {
			const { singleCompletionHandler } = await import("../../../../utils/single-completion-handler")
			vi.mocked(singleCompletionHandler).mockResolvedValue({
				text: "yes",
				usage: {
					inputTokens: 100,
					outputTokens: 10,
					totalCost: 1.0,
				},
			})

			await evaluateGatekeeperApproval(mockTask as Task, "read_file", { path: "test.ts" })

			expect(mockTask.say).toHaveBeenCalledWith(
				"text",
				expect.stringContaining("$1"),
				undefined,
				false,
				undefined,
				undefined,
				{ isNonInteractive: true },
			)
		})

		it("should return true on error to avoid blocking workflow", async () => {
			const { singleCompletionHandler } = await import("../../../../utils/single-completion-handler")
			vi.mocked(singleCompletionHandler).mockRejectedValue(new Error("API error"))

			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

			const result = await evaluateGatekeeperApproval(mockTask as Task, "read_file", { path: "test.ts" })

			expect(result).toBe(true)
			expect(consoleSpy).toHaveBeenCalledWith(
				"[Gatekeeper] Error evaluating approval, defaulting to approve:",
				expect.any(Error),
			)

			consoleSpy.mockRestore()
		})

		describe("buildGatekeeperPrompt", () => {
			it("should build prompt for write_to_file tool", async () => {
				const { singleCompletionHandler } = await import("../../../../utils/single-completion-handler")
				vi.mocked(singleCompletionHandler).mockResolvedValue({
					text: "yes",
					usage: { inputTokens: 100, outputTokens: 10 },
				})

				await evaluateGatekeeperApproval(mockTask as Task, "write_to_file", {
					path: "test.ts",
					content: "const x = 1;",
				})

				expect(singleCompletionHandler).toHaveBeenCalledWith(
					expect.any(Object),
					expect.stringContaining("Tool: write_to_file"),
					expect.stringContaining("WORKSPACE CONTEXT"),
				)
			})

			it("should build prompt for execute_command tool", async () => {
				const { singleCompletionHandler } = await import("../../../../utils/single-completion-handler")
				vi.mocked(singleCompletionHandler).mockResolvedValue({
					text: "yes",
					usage: { inputTokens: 100, outputTokens: 10 },
				})

				await evaluateGatekeeperApproval(mockTask as Task, "execute_command", {
					command: "npm test",
					cwd: "/test/dir",
				})

				expect(singleCompletionHandler).toHaveBeenCalledWith(
					expect.any(Object),
					expect.stringContaining("Command: npm test"),
					expect.any(String),
				)
			})

			it("should build prompt for read_file tool with single path", async () => {
				const { singleCompletionHandler } = await import("../../../../utils/single-completion-handler")
				vi.mocked(singleCompletionHandler).mockResolvedValue({
					text: "yes",
					usage: { inputTokens: 100, outputTokens: 10 },
				})

				await evaluateGatekeeperApproval(mockTask as Task, "read_file", {
					path: "test.ts",
				})

				expect(singleCompletionHandler).toHaveBeenCalledWith(
					expect.any(Object),
					expect.stringContaining("Files: test.ts"),
					expect.any(String),
				)
			})

			it("should build prompt for read_file tool with multiple paths", async () => {
				const { singleCompletionHandler } = await import("../../../../utils/single-completion-handler")
				vi.mocked(singleCompletionHandler).mockResolvedValue({
					text: "yes",
					usage: { inputTokens: 100, outputTokens: 10 },
				})

				await evaluateGatekeeperApproval(mockTask as Task, "read_file", {
					args: {
						file: [{ path: "test1.ts" }, { path: "test2.ts" }],
					},
				})

				expect(singleCompletionHandler).toHaveBeenCalledWith(
					expect.any(Object),
					expect.stringContaining("Files: test1.ts, test2.ts"),
					expect.any(String),
				)
			})

			it("should build prompt for browser_action tool", async () => {
				const { singleCompletionHandler } = await import("../../../../utils/single-completion-handler")
				vi.mocked(singleCompletionHandler).mockResolvedValue({
					text: "yes",
					usage: { inputTokens: 100, outputTokens: 10 },
				})

				await evaluateGatekeeperApproval(mockTask as Task, "browser_action", {
					action: "launch",
					url: "https://example.com",
				})

				expect(singleCompletionHandler).toHaveBeenCalledWith(
					expect.any(Object),
					expect.stringContaining("Action: launch"),
					expect.any(String),
				)
			})

			it("should build prompt for use_mcp_tool", async () => {
				const { singleCompletionHandler } = await import("../../../../utils/single-completion-handler")
				vi.mocked(singleCompletionHandler).mockResolvedValue({
					text: "yes",
					usage: { inputTokens: 100, outputTokens: 10 },
				})

				await evaluateGatekeeperApproval(mockTask as Task, "use_mcp_tool", {
					server_name: "github",
					tool_name: "search_repos",
				})

				expect(singleCompletionHandler).toHaveBeenCalledWith(
					expect.any(Object),
					expect.stringContaining("Server: github"),
					expect.any(String),
				)
			})

			it("should build prompt for update_todo_list", async () => {
				const { singleCompletionHandler } = await import("../../../../utils/single-completion-handler")
				vi.mocked(singleCompletionHandler).mockResolvedValue({
					text: "yes",
					usage: { inputTokens: 100, outputTokens: 10 },
				})

				await evaluateGatekeeperApproval(mockTask as Task, "update_todo_list", {})

				expect(singleCompletionHandler).toHaveBeenCalledWith(
					expect.any(Object),
					expect.stringContaining("Updating task todo list"),
					expect.any(String),
				)
			})

			it("should truncate long content previews", async () => {
				const { singleCompletionHandler } = await import("../../../../utils/single-completion-handler")
				vi.mocked(singleCompletionHandler).mockResolvedValue({
					text: "yes",
					usage: { inputTokens: 100, outputTokens: 10 },
				})

				const longContent = "x".repeat(300)
				await evaluateGatekeeperApproval(mockTask as Task, "write_to_file", {
					path: "test.ts",
					content: longContent,
				})

				expect(singleCompletionHandler).toHaveBeenCalledWith(
					expect.any(Object),
					expect.stringContaining("..."),
					expect.any(String),
				)
			})

			it("should include git repository status in prompt", async () => {
				const { singleCompletionHandler } = await import("../../../../utils/single-completion-handler")
				vi.mocked(execSync).mockReturnValue(Buffer.from(""))
				vi.mocked(singleCompletionHandler).mockResolvedValue({
					text: "yes",
					usage: { inputTokens: 100, outputTokens: 10 },
				})

				await evaluateGatekeeperApproval(mockTask as Task, "read_file", { path: "test.ts" })

				expect(singleCompletionHandler).toHaveBeenCalledWith(
					expect.any(Object),
					expect.any(String),
					expect.stringContaining("Git repository: YES"),
				)
			})

			it("should handle non-git repository", async () => {
				const { singleCompletionHandler } = await import("../../../../utils/single-completion-handler")
				vi.mocked(execSync).mockImplementation(() => {
					throw new Error("Not a git repository")
				})
				vi.mocked(singleCompletionHandler).mockResolvedValue({
					text: "yes",
					usage: { inputTokens: 100, outputTokens: 10 },
				})

				await evaluateGatekeeperApproval(mockTask as Task, "read_file", { path: "test.ts" })

				expect(singleCompletionHandler).toHaveBeenCalledWith(
					expect.any(Object),
					expect.any(String),
					expect.stringContaining("Git repository: NO"),
				)
			})

			it("should include workspace directory in prompt", async () => {
				const { singleCompletionHandler } = await import("../../../../utils/single-completion-handler")
				vi.mocked(singleCompletionHandler).mockResolvedValue({
					text: "yes",
					usage: { inputTokens: 100, outputTokens: 10 },
				})

				await evaluateGatekeeperApproval(mockTask as Task, "read_file", { path: "test.ts" })

				expect(singleCompletionHandler).toHaveBeenCalledWith(
					expect.any(Object),
					expect.any(String),
					expect.stringContaining("Workspace directory:"),
				)
			})
			it("should include git tracking status for file operations in git repos", async () => {
				const { singleCompletionHandler } = await import("../../../../utils/single-completion-handler")
				vi.mocked(execSync)
					.mockReturnValueOnce(Buffer.from("")) // isGitRepository check
					.mockReturnValueOnce(Buffer.from("test.ts")) // isFileTrackedByGit check
				vi.mocked(singleCompletionHandler).mockResolvedValue({
					text: "yes",
					usage: { inputTokens: 100, outputTokens: 10 },
				})

				await evaluateGatekeeperApproval(mockTask as Task, "write_to_file", {
					path: "test.ts",
					content: "const x = 1;",
				})

				expect(singleCompletionHandler).toHaveBeenCalledWith(
					expect.any(Object),
					expect.stringContaining("Git tracked: YES (recoverable)"),
					expect.any(String),
				)
			})

			it("should indicate untracked files in git repos", async () => {
				const { singleCompletionHandler } = await import("../../../../utils/single-completion-handler")
				vi.mocked(execSync)
					.mockReturnValueOnce(Buffer.from("")) // isGitRepository check
					.mockImplementationOnce(() => {
						// isFileTrackedByGit check - throw error for untracked file
						throw new Error("File not tracked")
					})
				vi.mocked(singleCompletionHandler).mockResolvedValue({
					text: "yes",
					usage: { inputTokens: 100, outputTokens: 10 },
				})

				await evaluateGatekeeperApproval(mockTask as Task, "write_to_file", {
					path: "untracked.ts",
					content: "const x = 1;",
				})

				expect(singleCompletionHandler).toHaveBeenCalledWith(
					expect.any(Object),
					expect.stringContaining("Git tracked: NO (untracked)"),
					expect.any(String),
				)
			})

			it("should include git tracking status for rm commands", async () => {
				const { singleCompletionHandler } = await import("../../../../utils/single-completion-handler")
				vi.mocked(execSync)
					.mockReturnValueOnce(Buffer.from("")) // isGitRepository check
					.mockReturnValueOnce(Buffer.from("test.ts")) // isFileTrackedByGit check
				vi.mocked(existsSync).mockReturnValue(true) // File exists check
				vi.mocked(singleCompletionHandler).mockResolvedValue({
					text: "yes",
					usage: { inputTokens: 100, outputTokens: 10 },
				})

				await evaluateGatekeeperApproval(mockTask as Task, "execute_command", {
					command: "rm test.ts",
				})

				expect(singleCompletionHandler).toHaveBeenCalledWith(
					expect.any(Object),
					expect.stringContaining('Target file "test.ts" git tracked: YES (recoverable)'),
					expect.any(String),
				)
			})

			it("should handle rm commands with flags", async () => {
				const { singleCompletionHandler } = await import("../../../../utils/single-completion-handler")
				vi.mocked(execSync)
					.mockReturnValueOnce(Buffer.from("")) // isGitRepository check
					.mockReturnValueOnce(Buffer.from("test.ts")) // isFileTrackedByGit check
				vi.mocked(existsSync).mockReturnValue(true) // File exists check
				vi.mocked(singleCompletionHandler).mockResolvedValue({
					text: "yes",
					usage: { inputTokens: 100, outputTokens: 10 },
				})

				await evaluateGatekeeperApproval(mockTask as Task, "execute_command", {
					command: "rm -f test.ts",
				})

				expect(singleCompletionHandler).toHaveBeenCalledWith(
					expect.any(Object),
					expect.stringContaining('Target file "test.ts" git tracked: YES (recoverable)'),
					expect.any(String),
				)
			})

			it("should not include git tracking for non-git repos", async () => {
				const { singleCompletionHandler } = await import("../../../../utils/single-completion-handler")
				vi.mocked(execSync).mockImplementation(() => {
					throw new Error("Not a git repository")
				})
				vi.mocked(singleCompletionHandler).mockResolvedValue({
					text: "yes",
					usage: { inputTokens: 100, outputTokens: 10 },
				})

				await evaluateGatekeeperApproval(mockTask as Task, "write_to_file", {
					path: "test.ts",
					content: "const x = 1;",
				})

				expect(singleCompletionHandler).toHaveBeenCalledWith(
					expect.any(Object),
					expect.not.stringContaining("Git tracked:"),
					expect.any(String),
				)
			})
		})
	})
})
