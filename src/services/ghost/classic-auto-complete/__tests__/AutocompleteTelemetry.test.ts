// kilocode_change - new file
import { AutocompleteTelemetry, MIN_VISIBILITY_DURATION_MS } from "../AutocompleteTelemetry"
import type { AutocompleteContext } from "../../types"

describe("AutocompleteTelemetry", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	test("caps fired unique telemetry keys to the 50 most recent", () => {
		const telemetry = new AutocompleteTelemetry()

		// Keep it minimal; the implementation only spreads this object.
		const context = {
			languageId: "typescript",
			modelId: "test-model",
			provider: "test-provider",
		} as unknown as AutocompleteContext

		for (let i = 0; i < 60; i++) {
			telemetry.startVisibilityTracking(`key-${i}`, "llm", context, 1)
			vi.advanceTimersByTime(MIN_VISIBILITY_DURATION_MS)
		}

		const firedMap = (telemetry as any).firedUniqueTelemetryKeys as Map<string, true>

		expect(firedMap.size).toBe(50)
		expect(firedMap.has("key-0")).toBe(false)
		expect(firedMap.has("key-9")).toBe(false)
		expect(firedMap.has("key-10")).toBe(true)
		expect(firedMap.has("key-59")).toBe(true)
	})

	test("evicted keys can be tracked again later", () => {
		const telemetry = new AutocompleteTelemetry()

		const context = {} as AutocompleteContext

		// Fill and overflow the map so key-0 is evicted
		for (let i = 0; i < 60; i++) {
			telemetry.startVisibilityTracking(`key-${i}`, "llm", context, 1)
			vi.advanceTimersByTime(MIN_VISIBILITY_DURATION_MS)
		}

		let firedMap = (telemetry as any).firedUniqueTelemetryKeys as Map<string, true>
		expect(firedMap.has("key-0")).toBe(false)

		// Now key-0 should be eligible again
		telemetry.startVisibilityTracking("key-0", "llm", context, 1)
		vi.advanceTimersByTime(MIN_VISIBILITY_DURATION_MS)

		firedMap = (telemetry as any).firedUniqueTelemetryKeys as Map<string, true>
		expect(firedMap.has("key-0")).toBe(true)
		expect(firedMap.size).toBe(50)
	})
})
