import * as vscode from "vscode"
import { handleUri } from "../handleUri"
import { ClineProvider } from "../../core/webview/ClineProvider"
import { CloudService } from "@roo-code/cloud"
import { Package } from "../../shared/package"

// Mock vscode
vi.mock("vscode", () => ({
	Uri: {
		parse: (str: string) => {
			const url = new URL(str)
			return {
				path: url.pathname,
				query: url.search.slice(1),
			}
		},
	},
	commands: {
		executeCommand: vi.fn(),
	},
}))

// Mock ClineProvider
vi.mock("../../core/webview/ClineProvider", () => ({
	ClineProvider: {
		getVisibleInstance: vi.fn(),
	},
}))

// Mock CloudService
vi.mock("@roo-code/cloud", () => ({
	CloudService: {
		instance: {
			handleAuthCallback: vi.fn(),
		},
	},
}))

describe("handleUri", () => {
	let mockProvider: {
		handleGlamaCallback: ReturnType<typeof vi.fn>
		handleOpenRouterCallback: ReturnType<typeof vi.fn>
		handleKiloCodeCallback: ReturnType<typeof vi.fn>
		handleRequestyCallback: ReturnType<typeof vi.fn>
		postMessageToWebview: ReturnType<typeof vi.fn>
		removeClineFromStack: ReturnType<typeof vi.fn>
		refreshWorkspace: ReturnType<typeof vi.fn>
	}

	beforeEach(() => {
		vi.clearAllMocks()
		mockProvider = {
			handleGlamaCallback: vi.fn(),
			handleOpenRouterCallback: vi.fn(),
			handleKiloCodeCallback: vi.fn(),
			handleRequestyCallback: vi.fn(),
			postMessageToWebview: vi.fn(),
			removeClineFromStack: vi.fn(),
			refreshWorkspace: vi.fn(),
		}
		vi.mocked(ClineProvider.getVisibleInstance).mockReturnValue(mockProvider as unknown as ClineProvider)
	})

	it("should do nothing if no visible provider", async () => {
		vi.mocked(ClineProvider.getVisibleInstance).mockReturnValue(undefined)

		const uri = { path: "/kilocode/chat", query: "" } as any
		await handleUri(uri)

		expect(mockProvider.postMessageToWebview).not.toHaveBeenCalled()
	})

	describe("/kilocode/chat path", () => {
		it("should focus sidebar and open a fresh chat", async () => {
			const uri = { path: "/kilocode/chat", query: "" } as any
			await handleUri(uri)

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(`${Package.name}.SidebarProvider.focus`)
			expect(mockProvider.removeClineFromStack).toHaveBeenCalled()
			expect(mockProvider.refreshWorkspace).toHaveBeenCalled()
			expect(mockProvider.postMessageToWebview).toHaveBeenCalledWith({
				type: "action",
				action: "chatButtonClicked",
			})
			expect(mockProvider.postMessageToWebview).toHaveBeenCalledWith({
				type: "action",
				action: "focusInput",
			})
		})
	})

	describe("/kilocode/profile path", () => {
		it("should focus sidebar and open profile view", async () => {
			const uri = { path: "/kilocode/profile", query: "" } as any
			await handleUri(uri)

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(`${Package.name}.SidebarProvider.focus`)
			expect(mockProvider.postMessageToWebview).toHaveBeenCalledWith({
				type: "action",
				action: "profileButtonClicked",
			})
			expect(mockProvider.postMessageToWebview).toHaveBeenCalledWith({
				type: "updateProfileData",
			})
		})
	})

	describe("/kilocode/fork path", () => {
		it("should focus sidebar and set fork command in chat box", async () => {
			const uri = { path: "/kilocode/fork", query: "id=test-session-123" } as any
			await handleUri(uri)

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(`${Package.name}.SidebarProvider.focus`)
			expect(mockProvider.postMessageToWebview).toHaveBeenCalledWith({
				type: "invoke",
				invoke: "setChatBoxMessage",
				text: "/session fork test-session-123",
			})
			expect(mockProvider.postMessageToWebview).toHaveBeenCalledWith({
				type: "action",
				action: "focusInput",
			})
		})

		it("should do nothing without id parameter", async () => {
			const uri = { path: "/kilocode/fork", query: "" } as any
			await handleUri(uri)

			expect(vscode.commands.executeCommand).not.toHaveBeenCalled()
			expect(mockProvider.postMessageToWebview).not.toHaveBeenCalled()
		})
	})

	describe("/glama path", () => {
		it("should handle glama callback with code", async () => {
			const uri = { path: "/glama", query: "code=test-code" } as any
			await handleUri(uri)

			expect(mockProvider.handleGlamaCallback).toHaveBeenCalledWith("test-code")
		})

		it("should do nothing without code parameter", async () => {
			const uri = { path: "/glama", query: "" } as any
			await handleUri(uri)

			expect(mockProvider.handleGlamaCallback).not.toHaveBeenCalled()
		})
	})

	describe("/openrouter path", () => {
		it("should handle openrouter callback with code", async () => {
			const uri = { path: "/openrouter", query: "code=test-code" } as any
			await handleUri(uri)

			expect(mockProvider.handleOpenRouterCallback).toHaveBeenCalledWith("test-code")
		})
	})

	describe("/kilocode path", () => {
		it("should handle kilocode callback with token", async () => {
			const uri = { path: "/kilocode", query: "token=test-token" } as any
			await handleUri(uri)

			expect(mockProvider.handleKiloCodeCallback).toHaveBeenCalledWith("test-token")
		})
	})

	describe("/requesty path", () => {
		it("should handle requesty callback with code and baseUrl", async () => {
			const uri = { path: "/requesty", query: "code=test-code&baseUrl=https://example.com" } as any
			await handleUri(uri)

			expect(mockProvider.handleRequestyCallback).toHaveBeenCalledWith("test-code", "https://example.com")
		})
	})

	describe("/auth/clerk/callback path", () => {
		it("should handle clerk auth callback", async () => {
			const uri = {
				path: "/auth/clerk/callback",
				query: "code=test-code&state=test-state&organizationId=org-123&provider_model=gpt-4",
			} as any
			await handleUri(uri)

			expect(CloudService.instance.handleAuthCallback).toHaveBeenCalledWith(
				"test-code",
				"test-state",
				"org-123",
				"gpt-4",
			)
		})

		it("should handle null organizationId", async () => {
			const uri = {
				path: "/auth/clerk/callback",
				query: "code=test-code&state=test-state&organizationId=null",
			} as any
			await handleUri(uri)

			expect(CloudService.instance.handleAuthCallback).toHaveBeenCalledWith("test-code", "test-state", null, null)
		})
	})

	describe("unknown path", () => {
		it("should do nothing for unknown paths", async () => {
			const uri = { path: "/unknown", query: "" } as any
			await handleUri(uri)

			expect(mockProvider.postMessageToWebview).not.toHaveBeenCalled()
			expect(mockProvider.handleGlamaCallback).not.toHaveBeenCalled()
			expect(mockProvider.handleOpenRouterCallback).not.toHaveBeenCalled()
		})
	})
})
