import { describe, it, expect, vi, beforeEach } from "vitest"
import { replaceVscodeProtocol } from "../webviewMessageHandlerUtils"

// Mock vscode module
vi.mock("vscode", () => ({
	env: {
		uriScheme: "vscode",
	},
}))

describe("replaceVscodeProtocol", () => {
	beforeEach(() => {
		vi.resetModules()
	})

	it("should return the URL unchanged if it does not start with vscode://", async () => {
		const url = "https://example.com/path"
		expect(replaceVscodeProtocol(url)).toBe(url)
	})

	it("should return the URL unchanged for http:// URLs", async () => {
		const url = "http://example.com/path"
		expect(replaceVscodeProtocol(url)).toBe(url)
	})

	it("should replace vscode:// with the current IDE scheme", async () => {
		// Default mock has uriScheme: "vscode"
		const url = "vscode://kilocode.kilo-code/chat"
		expect(replaceVscodeProtocol(url)).toBe("vscode://kilocode.kilo-code/chat")
	})

	it("should replace vscode:// with cursor:// when running in Cursor", async () => {
		// Re-mock vscode with cursor scheme
		vi.doMock("vscode", () => ({
			env: {
				uriScheme: "cursor",
			},
		}))

		// Re-import to get the new mock
		const { replaceVscodeProtocol: replaceWithCursor } = await import("../webviewMessageHandlerUtils")

		const url = "vscode://kilocode.kilo-code/chat"
		expect(replaceWithCursor(url)).toBe("cursor://kilocode.kilo-code/chat")
	})

	it("should replace vscode:// with vscodium:// when running in VSCodium", async () => {
		// Re-mock vscode with vscodium scheme
		vi.doMock("vscode", () => ({
			env: {
				uriScheme: "vscodium",
			},
		}))

		// Re-import to get the new mock
		const { replaceVscodeProtocol: replaceWithVSCodium } = await import("../webviewMessageHandlerUtils")

		const url = "vscode://kilocode.kilo-code/chat"
		expect(replaceWithVSCodium(url)).toBe("vscodium://kilocode.kilo-code/chat")
	})

	it("should replace vscode:// with vscode-insiders:// when running in VS Code Insiders", async () => {
		// Re-mock vscode with insiders scheme
		vi.doMock("vscode", () => ({
			env: {
				uriScheme: "vscode-insiders",
			},
		}))

		// Re-import to get the new mock
		const { replaceVscodeProtocol: replaceWithInsiders } = await import("../webviewMessageHandlerUtils")

		const url = "vscode://kilocode.kilo-code/chat"
		expect(replaceWithInsiders(url)).toBe("vscode-insiders://kilocode.kilo-code/chat")
	})

	it("should preserve the rest of the URL after protocol replacement", async () => {
		vi.doMock("vscode", () => ({
			env: {
				uriScheme: "cursor",
			},
		}))

		const { replaceVscodeProtocol: replaceWithCursor } = await import("../webviewMessageHandlerUtils")

		const url = "vscode://kilocode.kilo-code/some/path?query=value&other=123"
		expect(replaceWithCursor(url)).toBe("cursor://kilocode.kilo-code/some/path?query=value&other=123")
	})

	it("should handle URLs with only the protocol", async () => {
		vi.doMock("vscode", () => ({
			env: {
				uriScheme: "cursor",
			},
		}))

		const { replaceVscodeProtocol: replaceWithCursor } = await import("../webviewMessageHandlerUtils")

		const url = "vscode://"
		expect(replaceWithCursor(url)).toBe("cursor://")
	})
})
