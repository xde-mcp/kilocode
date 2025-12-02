import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { EventEmitter } from "node:events"

import { AgentManagerProvider, getKilocodeCliCandidatePaths } from "../AgentManagerProvider"

// Mock VS Code API used by AgentManagerProvider
const mockWorkspaceFolder = { uri: { fsPath: "/tmp/workspace" } }
const mockWindow = { showErrorMessage: vi.fn(), ViewColumn: { One: 1 } }
vi.mock("vscode", () => ({
	workspace: { workspaceFolders: [mockWorkspaceFolder] },
	window: mockWindow,
	env: { openExternal: vi.fn() },
	Uri: { parse: vi.fn(), joinPath: vi.fn() },
	ViewColumn: { One: 1 },
}))

// Stub file system helper
vi.mock("../../utils/fs", () => ({
	fileExistsAtPath: vi.fn().mockResolvedValue(false),
}))

// Capture spawn calls
class MockProc extends EventEmitter {
	stdout = new EventEmitter()
	stderr = new EventEmitter()
	kill = vi.fn()
	pid = 1234
}

const spawnMock = vi.fn(() => new MockProc())
const execSyncMock = vi.fn(() => "/usr/bin/kilocode")

vi.mock("node:child_process", async () => {
	const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process")
	return {
		...actual,
		spawn: spawnMock,
		execSync: execSyncMock,
	}
})

describe("getKilocodeCliCandidatePaths", () => {
	it("returns expected POSIX paths", () => {
		const env = { HOME: "/Users/test" } as NodeJS.ProcessEnv
		const paths = getKilocodeCliCandidatePaths(env, "darwin")

		expect(paths).toContain("/opt/homebrew/bin/kilocode")
		expect(paths).toContain("/usr/local/bin/kilocode")
		expect(paths).toContain("/usr/bin/kilocode")
		expect(paths).toContain("/Users/test/.npm-global/bin/kilocode")
		expect(paths).toContain("/Users/test/.local/bin/kilocode")
		expect(paths.some((p) => p.includes("\\kilocode"))).toBe(false)
	})

	it("returns expected Windows paths", () => {
		const env = {
			USERPROFILE: "C:\\Users\\Tester",
			APPDATA: "C:\\Users\\Tester\\AppData\\Roaming",
			LOCALAPPDATA: "C:\\Users\\Tester\\AppData\\Local",
			ProgramFiles: "C:\\Program Files",
			"ProgramFiles(x86)": "C:\\Program Files (x86)",
		} as NodeJS.ProcessEnv

		const paths = getKilocodeCliCandidatePaths(env, "win32")

		expect(paths).toContain("C:\\Users\\Tester\\AppData\\Roaming\\npm\\kilocode.cmd")
		expect(paths).toContain("C:\\Users\\Tester\\AppData\\Local\\Programs\\kilocode\\kilocode.exe")
		expect(paths).toContain("C:\\Program Files\\Kilocode\\kilocode.exe")
		expect(paths).toContain("C:\\Program Files (x86)\\Kilocode\\kilocode.exe")
		expect(paths.some((p) => p.startsWith("/opt/homebrew"))).toBe(false)
	})
})

describe("AgentManagerProvider CLI spawning", () => {
	let provider: AgentManagerProvider
	const mockContext = { extensionUri: {}, extensionPath: "" } as any
	const mockOutputChannel = { appendLine: vi.fn() } as any

	beforeEach(() => {
		spawnMock.mockClear()
		execSyncMock.mockClear()
		provider = new AgentManagerProvider(mockContext, mockOutputChannel)
	})

	afterEach(() => {
		provider.dispose()
	})

	it("spawns kilocode without shell interpolation for prompt arguments", async () => {
		await (provider as any).startAgentSession('echo "$(whoami)"')

		expect(spawnMock).toHaveBeenCalledTimes(1)
		const [cmd, args, options] = spawnMock.mock.calls[0] as unknown as [string, string[], Record<string, unknown>]
		expect(cmd).toBe("/usr/bin/kilocode")
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
