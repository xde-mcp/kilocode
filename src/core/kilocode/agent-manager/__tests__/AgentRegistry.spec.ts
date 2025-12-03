import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { AgentRegistry } from "../AgentRegistry"

describe("AgentRegistry", () => {
	let registry: AgentRegistry

	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date("2020-01-01T00:00:00.000Z"))
		registry = new AgentRegistry()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("uses the selectedId accessor and validates unknown ids", () => {
		const first = registry.createSession("first prompt")
		expect(registry.selectedId).toBe(first.id)

		registry.selectedId = "missing"
		expect(registry.selectedId).toBeNull()

		const second = registry.createSession("second prompt")
		registry.selectedId = first.id
		expect(registry.selectedId).toBe(first.id)

		// Setting a known id should stick; unknown should clear
		registry.selectedId = second.id
		expect(registry.selectedId).toBe(second.id)
	})

	it("re-selects the next session when the selected one is removed", () => {
		const first = registry.createSession("first")
		const second = registry.createSession("second")
		expect(registry.selectedId).toBe(second.id) // latest auto-selected

		registry.removeSession(second.id)
		expect(registry.selectedId).toBe(first.id)

		registry.removeSession(first.id)
		expect(registry.selectedId).toBeNull()
	})

	it("sorts sessions by most recent start time", () => {
		const first = registry.createSession("first")
		vi.advanceTimersByTime(1)
		const second = registry.createSession("second")
		const sessions = registry.getSessions()

		expect(sessions.map((s) => s.id)).toEqual([second.id, first.id])
	})

	it("caps logs to the max log count", () => {
		const { id } = registry.createSession("loggy")
		for (let i = 0; i < 105; i++) {
			registry.appendLog(id, `log-${i}`)
		}

		const session = registry.getSession(id)
		expect(session?.logs.length).toBe(100)
		expect(session?.logs[0]).toBe("log-5") // first five should be trimmed
		expect(session?.logs.at(-1)).toBe("log-104")
	})

	it("prunes oldest non-running sessions when over capacity", () => {
		// Fill up to the limit
		const created: string[] = []
		for (let i = 0; i < 10; i++) {
			vi.advanceTimersByTime(1)
			const session = registry.createSession(`session-${i}`)
			created.push(session.id)
		}

		// Mark the earliest three as non-running so they are eligible for pruning
		registry.updateSessionStatus(created[0], "done")
		registry.updateSessionStatus(created[1], "done")
		registry.updateSessionStatus(created[2], "done")

		// Create one more to trigger pruning; should drop the oldest done session (created[0])
		const extra = registry.createSession("overflow")

		const ids = registry.getSessions().map((s) => s.id)
		expect(ids).toHaveLength(10)
		expect(ids).not.toContain(created[0])
		expect(ids).toContain(created[1])
		expect(ids).toContain(extra.id)
	})

	it("getState returns the current sessions and selection", () => {
		const session = registry.createSession("stateful")
		const state = registry.getState()

		expect(state.selectedId).toBe(session.id)
		expect(state.sessions[0].id).toBe(session.id)
	})
})
