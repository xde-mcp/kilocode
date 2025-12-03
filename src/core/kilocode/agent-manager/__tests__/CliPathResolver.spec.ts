import { describe, expect, it, vi, beforeEach } from "vitest"

describe("findKilocodeCli", () => {
	beforeEach(() => {
		vi.resetModules()
	})

	it("finds CLI in PATH using which", async () => {
		const execSyncMock = vi.fn().mockReturnValue("/usr/local/bin/kilocode\n")
		vi.doMock("node:child_process", () => ({ execSync: execSyncMock }))
		vi.doMock("../../../../utils/fs", () => ({ fileExistsAtPath: vi.fn().mockResolvedValue(false) }))

		const { findKilocodeCli } = await import("../CliPathResolver")
		const result = await findKilocodeCli()

		expect(result).toBe("/usr/local/bin/kilocode")
		expect(execSyncMock).toHaveBeenCalledWith("which kilocode", { encoding: "utf-8" })
	})

	it("falls back to npm paths when which fails", async () => {
		const execSyncMock = vi.fn().mockImplementation(() => {
			throw new Error("not found")
		})
		const fileExistsMock = vi.fn().mockImplementation((path: string) => {
			return Promise.resolve(path === "/opt/homebrew/bin/kilocode")
		})
		vi.doMock("node:child_process", () => ({ execSync: execSyncMock }))
		vi.doMock("../../../../utils/fs", () => ({ fileExistsAtPath: fileExistsMock }))

		const { findKilocodeCli } = await import("../CliPathResolver")
		const result = await findKilocodeCli()

		expect(result).toBe("/opt/homebrew/bin/kilocode")
	})

	it("returns null when CLI is not found anywhere", async () => {
		vi.doMock("node:child_process", () => ({
			execSync: vi.fn().mockImplementation(() => {
				throw new Error("not found")
			}),
		}))
		vi.doMock("../../../../utils/fs", () => ({ fileExistsAtPath: vi.fn().mockResolvedValue(false) }))

		const { findKilocodeCli } = await import("../CliPathResolver")
		const logMock = vi.fn()
		const result = await findKilocodeCli(logMock)

		expect(result).toBeNull()
		expect(logMock).toHaveBeenCalledWith("kilocode CLI not found")
	})

	it("logs when kilocode not in PATH", async () => {
		vi.doMock("node:child_process", () => ({
			execSync: vi.fn().mockImplementation(() => {
				throw new Error("not found")
			}),
		}))
		vi.doMock("../../../../utils/fs", () => ({ fileExistsAtPath: vi.fn().mockResolvedValue(false) }))

		const { findKilocodeCli } = await import("../CliPathResolver")
		const logMock = vi.fn()
		await findKilocodeCli(logMock)

		expect(logMock).toHaveBeenCalledWith("kilocode not in PATH")
	})
})
