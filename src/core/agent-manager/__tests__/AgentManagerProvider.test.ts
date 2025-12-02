import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { EventEmitter } from "node:events"

// Mock VS Code API used by AgentManagerProvider
const mockWorkspaceFolder = { uri: { fsPath: "/tmp/workspace" } }
const mockWindow = { showErrorMessage: vi.fn(), ViewColumn: { One: 1 } }
vi.mock("vscode", () => ({
	workspace: { workspaceFolders: [mockWorkspaceFolder] },
	window: mockWindow,
	Uri: { joinPath: vi.fn() },
	ViewColumn: { One: 1 },
}))

// Capture spawn calls
class MockProc extends EventEmitter {
	stdout = new EventEmitter()
	stderr = new EventEmitter()
	kill = vi.fn()
	pid = 1234
}

const spawnMock = vi.fn(() => new MockProc())
vi.mock("node:child_process", () => ({ spawn: spawnMock }))

import { AgentManagerProvider } from "../AgentManagerProvider"

describe("AgentManagerProvider - CLI backend", () => {
	let provider: AgentManagerProvider

	const mockContext = { extensionUri: {}, extensionPath: "" } as any
	const mockOutputChannel = { appendLine: vi.fn() } as any

	beforeEach(() => {
		spawnMock.mockClear()
		provider = new AgentManagerProvider(mockContext, mockOutputChannel)
	})

	afterEach(() => {
		provider.dispose()
	})

	it("spawns kilocode without shell interpolation for prompt arguments", async () => {
		await (provider as any).startAgentSession('echo "$(whoami)"')

		expect(spawnMock).toHaveBeenCalledTimes(1)
		const [cmd, args, options] = spawnMock.mock.calls[0]
		expect(cmd).toBe("kilocode")
		expect(args[args.length - 1]).toBe('echo "$(whoami)"')
		expect(options?.shell).not.toBe(true)
	})

	it("flushes buffered CLI output on process exit", async () => {
		await (provider as any).startAgentSession("test flush")
		const proc = spawnMock.mock.results[0].value as MockProc

		// Emit a JSON line without trailing newline to stay buffered
		const partial = '{"timestamp":1,"source":"extension","type":"say","say":"text","content":"hi"}'
		proc.stdout.emit("data", Buffer.from(partial))

		// No messages yet because the line lacked a newline
		const registry = (provider as any).registry
		const sessionId = registry.getSessions()[0].id as string
		expect((provider as any).sessionMessages.get(sessionId)).toEqual([])

		// Exit should flush the buffered line and deliver the message
		proc.emit("exit", 0, null)

		const messages = (provider as any).sessionMessages.get(sessionId)
		expect(messages).toHaveLength(1)
		expect(messages?.[0].text).toBe("hi")
	})
})
