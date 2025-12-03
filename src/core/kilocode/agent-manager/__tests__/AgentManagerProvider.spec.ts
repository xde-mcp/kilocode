import { describe, expect, it, vi, beforeEach, afterEach, type Mock } from "vitest"
import { EventEmitter } from "node:events"

let AgentManagerProvider: typeof import("../AgentManagerProvider").AgentManagerProvider

describe("AgentManagerProvider CLI spawning", () => {
	let provider: InstanceType<typeof AgentManagerProvider>
	const mockContext = { extensionUri: {}, extensionPath: "" } as any
	const mockOutputChannel = { appendLine: vi.fn() } as any

	beforeEach(async () => {
		vi.resetModules()

		const mockWorkspaceFolder = { uri: { fsPath: "/tmp/workspace" } }
		const mockWindow = { showErrorMessage: () => undefined, ViewColumn: { One: 1 } }

		vi.doMock("vscode", () => ({
			workspace: { workspaceFolders: [mockWorkspaceFolder] },
			window: mockWindow,
			env: { openExternal: vi.fn() },
			Uri: { parse: vi.fn(), joinPath: vi.fn() },
			ViewColumn: { One: 1 },
		}))

		vi.doMock("../../../../utils/fs", () => ({
			fileExistsAtPath: vi.fn().mockResolvedValue(false),
		}))

		class TestProc extends EventEmitter {
			stdout = new EventEmitter()
			stderr = new EventEmitter()
			kill = vi.fn()
			pid = 1234
		}

		const spawnMock = vi.fn(() => new TestProc())
		const execSyncMock = vi.fn(() => "/usr/bin/kilocode")

		vi.doMock("node:child_process", () => ({
			spawn: spawnMock,
			execSync: execSyncMock,
		}))

		const module = await import("../AgentManagerProvider")
		AgentManagerProvider = module.AgentManagerProvider
		provider = new AgentManagerProvider(mockContext, mockOutputChannel)
	})

	afterEach(() => {
		provider.dispose()
	})

	it("spawns kilocode without shell interpolation for prompt arguments", async () => {
		await (provider as any).startAgentSession('echo "$(whoami)"')

		const spawnMock = (await import("node:child_process")).spawn as unknown as Mock
		expect(spawnMock).toHaveBeenCalledTimes(1)
		const [cmd, args, options] = spawnMock.mock.calls[0] as unknown as [string, string[], Record<string, unknown>]
		expect(cmd).toBe("/usr/bin/kilocode")
		expect(args[args.length - 1]).toBe('echo "$(whoami)"')
		expect(options?.shell).not.toBe(true)
	})

	it("flushes buffered CLI output on process exit", async () => {
		await (provider as any).startAgentSession("test flush")
		const spawnMock = (await import("node:child_process")).spawn as unknown as Mock
		const proc = spawnMock.mock.results[0].value as EventEmitter & { stdout: EventEmitter }

		// Enable text handling
		const sessionId = (provider as any).registry.getSessions()[0].id as string
		;(provider as any).handleKilocodeEvent(sessionId, {
			streamEventType: "kilocode",
			payload: { type: "say", say: "api_req_started" },
		})

		// Emit a JSON line without trailing newline to stay buffered
		const partial = '{"timestamp":1,"source":"extension","type":"say","say":"text","content":"hi"}'
		proc.stdout.emit("data", Buffer.from(partial))

		// No messages yet because the line lacked a newline
		expect((provider as any).sessionMessages.get(sessionId)).toEqual([])

		// Exit should flush the buffered line and deliver the message
		proc.emit("exit", 0, null)

		const messages = (provider as any).sessionMessages.get(sessionId)
		expect(messages).toHaveLength(1)
		expect(messages?.[0].text).toBe("hi")
	})
})
