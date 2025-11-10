import { ApiStreamNativeToolCallsChunk } from "./kilocode/api-stream-native-tool-calls-chunk"
import { ReasoningDetail } from "./kilocode/reasoning-details"

export type ApiStream = AsyncGenerator<ApiStreamChunk>

export type ApiStreamChunk =
	// kilocode_change start
	| ApiStreamNativeToolCallsChunk
	| ApiStreamReasoningDetailsChunk
	// kilocode_change end
	| ApiStreamTextChunk
	| ApiStreamUsageChunk
	| ApiStreamReasoningChunk
	| ApiStreamGroundingChunk
	| ApiStreamError

export interface ApiStreamError {
	type: "error"
	error: string
	message: string
}

export interface ApiStreamTextChunk {
	type: "text"
	text: string
}

export interface ApiStreamReasoningChunk {
	type: "reasoning"
	text: string
}

export interface ApiStreamReasoningDetailsChunk {
	type: "reasoning_details"
	reasoning_details: ReasoningDetail
}
// kilocode_change start

export interface ApiStreamUsageChunk {
	type: "usage"
	inputTokens: number
	outputTokens: number
	cacheWriteTokens?: number
	cacheReadTokens?: number
	reasoningTokens?: number
	totalCost?: number
	inferenceProvider?: string // kilocode_change
}

export interface ApiStreamGroundingChunk {
	type: "grounding"
	sources: GroundingSource[]
}

export interface GroundingSource {
	title: string
	url: string
	snippet?: string
}
