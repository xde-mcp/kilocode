import * as vscode from "vscode"
import { CommitMessageProvider } from "../CommitMessageProvider"
import { GitExtensionService, GitChange } from "../GitExtensionService"
import { ContextProxy } from "../../../core/config/ContextProxy"
import { singleCompletionHandler } from "../../../utils/single-completion-handler"
import type { Mock } from "vitest"

// Mock dependencies
vi.mock("../../../core/config/ContextProxy", () => {
	const mockContextProxy = {
		getProviderSettings: vi.fn().mockReturnValue({
			kilocodeToken: "mock-token",
		}),
		getValue: vi.fn().mockImplementation((key: string) => {
			switch (key) {
				case "commitMessageApiConfigId":
					return undefined
				case "listApiConfigMeta":
					return []
				case "customSupportPrompts":
					return {}
				default:
					return undefined
			}
		}),
	}

	return {
		ContextProxy: {
			get instance() {
				return mockContextProxy
			},
		},
	}
})
vi.mock("../../../utils/single-completion-handler")
vi.mock("../GitExtensionService")
vi.mock("child_process")
vi.mock("vscode", () => ({
	window: {
		showInformationMessage: vi.fn(),
		showErrorMessage: vi.fn(),
		withProgress: vi.fn().mockImplementation((_, callback) => callback({ report: vi.fn() })),
	},
	workspace: {
		workspaceFolders: [{ uri: { fsPath: "/mock/workspace" } }],
	},
	commands: {
		registerCommand: vi.fn(),
	},
	ExtensionContext: vi.fn(),
	OutputChannel: vi.fn(),
	ProgressLocation: {
		SourceControl: 1,
		Window: 2,
		Notification: 3,
	},
}))

describe("CommitMessageProvider", () => {
	let commitMessageProvider: CommitMessageProvider
	let mockContext: vscode.ExtensionContext
	let mockOutputChannel: vscode.OutputChannel
	let mockGitService: GitExtensionService
	let mockExecSync: Mock<any>

	beforeEach(async () => {
		mockContext = {} as vscode.ExtensionContext
		mockOutputChannel = {
			appendLine: vi.fn(),
		} as unknown as vscode.OutputChannel

		// Mock child_process.execSync
		mockExecSync = vi.fn()
		const childProcessMock = await vi.importMock("child_process")
		;(childProcessMock as any).execSync = mockExecSync

		// Setup GitExtensionService mock
		mockGitService = new GitExtensionService()
		mockGitService.initialize = vi.fn().mockResolvedValue(true)
		mockGitService.gatherStagedChanges = vi.fn()
		mockGitService.setCommitMessage = vi.fn()
		mockGitService.spawnGitWithArgs = vi.fn().mockReturnValue("")
		mockGitService.getCommitContext = vi.fn().mockReturnValue("Modified file1.ts, Added file2.ts")

		// Setup singleCompletionHandler mock
		vi.mocked(singleCompletionHandler).mockResolvedValue(
			"feat(commit): implement conventional commit message generator",
		)

		// Create CommitMessageProvider instance
		commitMessageProvider = new CommitMessageProvider(mockContext, mockOutputChannel)
		;(commitMessageProvider as any).gitService = mockGitService
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("generateCommitMessage", () => {
		it("should generate a commit message based on staged changes", async () => {
			const mockChanges: GitChange[] = [
				{ filePath: "file1.ts", status: "Modified" },
				{ filePath: "file2.ts", status: "Added" },
			]
			vi.mocked(mockGitService.gatherStagedChanges).mockResolvedValue(mockChanges)

			// Call the method
			await commitMessageProvider.generateCommitMessage()

			// Verify basic flow
			expect(vi.mocked(mockGitService.getCommitContext)).toHaveBeenCalledWith(mockChanges)
			expect(singleCompletionHandler).toHaveBeenCalled()
			expect(vi.mocked(mockGitService.setCommitMessage)).toHaveBeenCalled()
		})

		it("should handle code blocks and formatting in AI responses", async () => {
			vi.mocked(mockGitService.gatherStagedChanges).mockResolvedValue([
				{ filePath: "file.ts", status: "Modified" },
			])

			// Mock AI response with code blocks
			vi.mocked(singleCompletionHandler).mockResolvedValue("```\nfeat(core): add feature\n```")

			// Call the method
			await commitMessageProvider.generateCommitMessage()

			// Verify code blocks are removed
			expect(vi.mocked(mockGitService.setCommitMessage)).toHaveBeenCalledWith("feat(core): add feature")
		})

		it("should show error message when generation fails", async () => {
			vi.mocked(mockGitService.gatherStagedChanges).mockResolvedValue([
				{ filePath: "file.ts", status: "Modified" },
			])
			vi.mocked(singleCompletionHandler).mockRejectedValue(new Error("API error"))

			// Call the method
			await commitMessageProvider.generateCommitMessage()

			// Verify error handling
			expect(vscode.window.showErrorMessage).toHaveBeenCalled()
		})

		it("should show information message when there are no staged changes", async () => {
			// Mock no staged changes
			vi.mocked(mockGitService.gatherStagedChanges).mockResolvedValue(null)

			// Call the method
			await commitMessageProvider.generateCommitMessage()

			// Verify that it shows the appropriate message and doesn't proceed
			expect(vscode.window.showInformationMessage).toHaveBeenCalled()
			expect(vi.mocked(mockGitService.getCommitContext)).not.toHaveBeenCalled()
			expect(singleCompletionHandler).not.toHaveBeenCalled()
			expect(vi.mocked(mockGitService.setCommitMessage)).not.toHaveBeenCalled()
		})

		it("should show information message when staged changes array is empty", async () => {
			// Mock empty staged changes array
			vi.mocked(mockGitService.gatherStagedChanges).mockResolvedValue([])

			// Call the method
			await commitMessageProvider.generateCommitMessage()

			// Verify that it shows the appropriate message and doesn't proceed
			expect(vscode.window.showInformationMessage).toHaveBeenCalled()
			expect(vi.mocked(mockGitService.getCommitContext)).not.toHaveBeenCalled()
			expect(singleCompletionHandler).not.toHaveBeenCalled()
			expect(vi.mocked(mockGitService.setCommitMessage)).not.toHaveBeenCalled()
		})

		it("should use custom API config when commitMessageApiConfigId is set", async () => {
			const mockChanges: GitChange[] = [{ filePath: "file.ts", status: "Modified" }]
			vi.mocked(mockGitService.gatherStagedChanges).mockResolvedValue(mockChanges)

			// Mock custom API config
			const customApiConfig = { apiProvider: "openai", apiKey: "custom-key" }
			const mockProviderSettingsManager = {
				getProfile: vi.fn().mockResolvedValue({ name: "Custom Config", ...customApiConfig }),
			}
			;(commitMessageProvider as any).providerSettingsManager = mockProviderSettingsManager

			// Update the ContextProxy mock to return custom config ID
			const { ContextProxy: MockedContextProxy } = (await vi.importMock(
				"../../../core/config/ContextProxy",
			)) as any
			const mockInstance = MockedContextProxy.instance
			mockInstance.getValue.mockImplementation((key: string) => {
				switch (key) {
					case "commitMessageApiConfigId":
						return "custom-config-id"
					case "listApiConfigMeta":
						return [{ id: "custom-config-id", name: "Custom Config" }]
					case "customSupportPrompts":
						return {}
					default:
						return undefined
				}
			})

			await commitMessageProvider.generateCommitMessage()

			// Verify custom config was used
			expect(mockProviderSettingsManager.getProfile).toHaveBeenCalledWith({ id: "custom-config-id" })
			expect(singleCompletionHandler).toHaveBeenCalledWith(customApiConfig, expect.any(String))
		})

		it("should fall back to default config when custom API config fails to load", async () => {
			const mockChanges: GitChange[] = [{ filePath: "file.ts", status: "Modified" }]
			vi.mocked(mockGitService.gatherStagedChanges).mockResolvedValue(mockChanges)

			// Mock provider settings manager to throw error
			const mockProviderSettingsManager = {
				getProfile: vi.fn().mockRejectedValue(new Error("Config not found")),
			}
			;(commitMessageProvider as any).providerSettingsManager = mockProviderSettingsManager

			// Update the ContextProxy mock to return invalid config ID
			const { ContextProxy: MockedContextProxy } = (await vi.importMock(
				"../../../core/config/ContextProxy",
			)) as any
			const mockInstance = MockedContextProxy.instance
			mockInstance.getValue.mockImplementation((key: string) => {
				switch (key) {
					case "commitMessageApiConfigId":
						return "invalid-config-id"
					case "listApiConfigMeta":
						return [{ id: "custom-config-id", name: "Custom Config" }]
					case "customSupportPrompts":
						return {}
					default:
						return undefined
				}
			})

			const defaultConfig = { kilocodeToken: "mock-token" }
			mockInstance.getProviderSettings.mockReturnValue(defaultConfig)

			await commitMessageProvider.generateCommitMessage()

			// Verify fallback to default config
			expect(singleCompletionHandler).toHaveBeenCalledWith(defaultConfig, expect.any(String))
		})
	})
})
