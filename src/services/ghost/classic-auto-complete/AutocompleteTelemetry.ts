import { TelemetryService } from "@roo-code/telemetry"
import { TelemetryEventName } from "@roo-code/types"

function captureAutocompleteTelemetry(event: TelemetryEventName, properties?: Record<string, unknown>): void {
	// also log to console:
	if (TelemetryService.hasInstance()) {
		if (properties !== undefined) {
			TelemetryService.instance.captureEvent(event, properties)
			console.log(`Autocomplete Telemetry event: ${event}`, properties)
		} else {
			TelemetryService.instance.captureEvent(event)
			console.log(`Autocomplete Telemetry event: ${event}`)
		}
	}
}

/**
 * Capture when a suggestion is requested, this is whenever our completion provider is invoked by VS Code
 *
 * Subsets:
 *  - captureLlmRequestCompleted
 *  - captureLlmRequestFailed
 *  - captureCacheHit
 *  - (not captured) request is not answered, for instance because we are debouncing (i.e. user is still typing)
 */
export function captureSuggestionRequested(): void {
	captureAutocompleteTelemetry(TelemetryEventName.AUTOCOMPLETE_SUGGESTION_REQUESTED)
}

/**
 * Capture when a suggestion is filtered out by our software
 *
 * @param reason - The reason the suggestion was filtered out
 */
export function captureSuggestionFiltered(reason: "empty_response" | "filtered_by_postprocessing"): void {
	captureAutocompleteTelemetry(TelemetryEventName.AUTOCOMPLETE_SUGGESTION_FILTERED, { reason })
}

/**
 * Capture when a suggestion is found in cache/history
 */
export function captureCacheHit(): void {
	captureAutocompleteTelemetry(TelemetryEventName.AUTOCOMPLETE_SUGGESTION_CACHE_HIT)
}

/**
 * Capture when a newly requested suggestion is returned to the user (so no cache hit)
 *
 * Summed with the cache hits this is the total number of suggestions shown
 */
export function captureLlmSuggestionReturned(): void {
	captureAutocompleteTelemetry(TelemetryEventName.AUTOCOMPLETE_LLM_SUGGESTION_RETURNED)
}

/**
 * Capture when an LLM request completes successfully
 */
export function captureLlmRequestCompleted(properties: {
	latencyMs: number
	cost: number
	inputTokens: number
	outputTokens: number
}): void {
	captureAutocompleteTelemetry(TelemetryEventName.AUTOCOMPLETE_LLM_REQUEST_COMPLETED, properties)
}

/**
 * Capture when an LLM request fails
 */
export function captureLlmRequestFailed(properties: { latencyMs: number; error: string }): void {
	captureAutocompleteTelemetry(TelemetryEventName.AUTOCOMPLETE_LLM_REQUEST_FAILED, properties)
}

/**
 * Capture when a user accepts a suggestion
 *
 * There are two ways to analyze what percentage was acceptedd,
 * 1. Sum of this event divided by the sum of the suggestion returned event
 * 2. Sum of this event divided by the sum of the suggestion returned + cache hit events
 */
export function captureAcceptSuggestion(): void {
	captureAutocompleteTelemetry(TelemetryEventName.AUTOCOMPLETE_ACCEPT_SUGGESTION)
}
