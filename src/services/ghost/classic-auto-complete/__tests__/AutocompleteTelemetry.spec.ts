import { TelemetryEventName } from "@roo-code/types"
import { TelemetryService } from "@roo-code/telemetry"
import { AutocompleteTelemetry } from "../AutocompleteTelemetry"
import type { AutocompleteContext } from "../../types"

// Mock TelemetryService
vi.mock("@roo-code/telemetry", () => ({
	TelemetryService: {
		hasInstance: vi.fn(),
		instance: {
			captureEvent: vi.fn(),
		},
	},
}))

describe("AutocompleteTelemetry", () => {
	let telemetry: AutocompleteTelemetry
	let mockCaptureEvent: ReturnType<typeof vi.fn>

	const mockContext: AutocompleteContext = {
		languageId: "typescript",
		modelId: "codestral",
		provider: "mistral",
	}

	beforeEach(() => {
		telemetry = new AutocompleteTelemetry()
		mockCaptureEvent = vi.fn()
		vi.mocked(TelemetryService.hasInstance).mockReturnValue(true)
		vi.mocked(TelemetryService.instance.captureEvent).mockImplementation(mockCaptureEvent)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("captureUniqueSuggestionShown", () => {
		it("should capture event for first-time suggestion", () => {
			const result = telemetry.captureUniqueSuggestionShown(
				"console.log('hello')",
				"const x = ",
				";",
				mockContext,
				"llm",
			)

			expect(result).toBe(true)
			expect(mockCaptureEvent).toHaveBeenCalledWith(
				TelemetryEventName.AUTOCOMPLETE_UNIQUE_SUGGESTION_SHOWN,
				expect.objectContaining({
					languageId: "typescript",
					modelId: "codestral",
					provider: "mistral",
					suggestionLength: 20,
					source: "llm",
				}),
			)
		})

		it("should not capture event for duplicate suggestion", () => {
			// First call - should capture
			telemetry.captureUniqueSuggestionShown("console.log('hello')", "const x = ", ";", mockContext, "llm")

			mockCaptureEvent.mockClear()

			// Second call with same suggestion - should not capture
			const result = telemetry.captureUniqueSuggestionShown(
				"console.log('hello')",
				"const x = ",
				";",
				mockContext,
				"cache",
			)

			expect(result).toBe(false)
			expect(mockCaptureEvent).not.toHaveBeenCalled()
		})

		it("should capture event for different suggestions", () => {
			// First suggestion
			telemetry.captureUniqueSuggestionShown("console.log('hello')", "const x = ", ";", mockContext, "llm")

			mockCaptureEvent.mockClear()

			// Different suggestion text
			const result = telemetry.captureUniqueSuggestionShown(
				"console.log('world')",
				"const x = ",
				";",
				mockContext,
				"llm",
			)

			expect(result).toBe(true)
			expect(mockCaptureEvent).toHaveBeenCalledTimes(1)
		})

		it("should treat same text with different prefix as different suggestion", () => {
			// First suggestion
			telemetry.captureUniqueSuggestionShown("console.log('hello')", "const x = ", ";", mockContext, "llm")

			mockCaptureEvent.mockClear()

			// Same text but different prefix
			const result = telemetry.captureUniqueSuggestionShown(
				"console.log('hello')",
				"const y = ",
				";",
				mockContext,
				"llm",
			)

			expect(result).toBe(true)
			expect(mockCaptureEvent).toHaveBeenCalledTimes(1)
		})

		it("should treat same text with different suffix as different suggestion", () => {
			// First suggestion
			telemetry.captureUniqueSuggestionShown("console.log('hello')", "const x = ", ";", mockContext, "llm")

			mockCaptureEvent.mockClear()

			// Same text but different suffix
			const result = telemetry.captureUniqueSuggestionShown(
				"console.log('hello')",
				"const x = ",
				"",
				mockContext,
				"llm",
			)

			expect(result).toBe(true)
			expect(mockCaptureEvent).toHaveBeenCalledTimes(1)
		})

		it("should not capture event for empty suggestion text", () => {
			const result = telemetry.captureUniqueSuggestionShown("", "const x = ", ";", mockContext, "llm")

			expect(result).toBe(false)
			expect(mockCaptureEvent).not.toHaveBeenCalled()
		})

		it("should track source correctly for cache hits", () => {
			const result = telemetry.captureUniqueSuggestionShown(
				"console.log('hello')",
				"const x = ",
				";",
				mockContext,
				"cache",
			)

			expect(result).toBe(true)
			expect(mockCaptureEvent).toHaveBeenCalledWith(
				TelemetryEventName.AUTOCOMPLETE_UNIQUE_SUGGESTION_SHOWN,
				expect.objectContaining({
					source: "cache",
				}),
			)
		})
	})

	describe("clearShownSuggestions", () => {
		it("should allow same suggestion to be captured again after clearing", () => {
			// First call
			telemetry.captureUniqueSuggestionShown("console.log('hello')", "const x = ", ";", mockContext, "llm")

			mockCaptureEvent.mockClear()

			// Clear the shown suggestions
			telemetry.clearShownSuggestions()

			// Same suggestion should now be captured again
			const result = telemetry.captureUniqueSuggestionShown(
				"console.log('hello')",
				"const x = ",
				";",
				mockContext,
				"llm",
			)

			expect(result).toBe(true)
			expect(mockCaptureEvent).toHaveBeenCalledTimes(1)
		})
	})
})
