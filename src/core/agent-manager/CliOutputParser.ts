/**
 * CLI Output Parser
 *
 * Parses nd-json output from the kilocode CLI, handling ANSI escape codes
 * and buffering partial lines.
 *
 * Uses the same approach as the cloud agent for handling VT control characters.
 */

import { stripVTControlCharacters } from "node:util"

/**
 * JSON event from CLI stdout (nd-json format)
 */
export interface CliJsonEvent {
	timestamp: number
	source: "cli" | "extension"
	type: string
	say?: string
	ask?: string
	content?: string
	metadata?: Record<string, unknown>
	partial?: boolean
	isAnswered?: boolean
}

/**
 * Result of parsing a chunk of CLI output
 */
export interface ParseResult {
	events: CliJsonEvent[]
	plainText: string[]
	remainingBuffer: string
}

/**
 * Try to parse a line as JSON, attempting both raw and ANSI-stripped versions.
 * This matches the cloud agent's approach in streaming-helpers.ts.
 */
export function tryParseJson(line: string): CliJsonEvent | null {
	// Try both original and VT-stripped versions
	for (const candidate of [line, stripVTControlCharacters(line)]) {
		try {
			const parsed = JSON.parse(candidate)
			if (typeof parsed === "object" && parsed !== null) {
				return parsed as CliJsonEvent
			}
		} catch {
			// Continue to next candidate
		}
	}
	return null
}

/**
 * Parse a chunk of CLI output, handling buffering of partial lines
 *
 * @param chunk - The new chunk of data received
 * @param buffer - Any leftover data from the previous chunk
 * @returns Parsed events, plain text lines, and remaining buffer
 */
export function parseCliChunk(chunk: string, buffer: string = ""): ParseResult {
	const events: CliJsonEvent[] = []
	const plainText: string[] = []

	// Combine buffer with new chunk and split by newlines
	const combined = buffer + chunk
	const lines = combined.split("\n")

	// Last element is either empty (if chunk ended with \n) or partial line
	const remainingBuffer = lines.pop() || ""

	for (const line of lines) {
		const trimmedLine = line.trim()
		if (!trimmedLine) continue

		// Try to parse as JSON (tries both raw and VT-stripped versions)
		const event = tryParseJson(trimmedLine)
		if (event !== null) {
			events.push(event)
		} else {
			// Not JSON - strip VT characters before treating as plain text
			const cleanLine = stripVTControlCharacters(trimmedLine)
			if (cleanLine) {
				plainText.push(cleanLine)
			}
		}
	}

	return { events, plainText, remainingBuffer }
}

/**
 * Stateful parser class for parsing CLI output streams
 */
export class CliOutputParser {
	private buffer: string = ""

	/**
	 * Parse a chunk of data, returning any complete events/lines
	 */
	parse(chunk: string): ParseResult {
		const result = parseCliChunk(chunk, this.buffer)
		this.buffer = result.remainingBuffer
		return result
	}

	/**
	 * Flush any remaining buffered data
	 */
	flush(): ParseResult {
		if (!this.buffer) {
			return { events: [], plainText: [], remainingBuffer: "" }
		}

		const trimmedBuffer = this.buffer.trim()
		this.buffer = ""

		if (!trimmedBuffer) {
			return { events: [], plainText: [], remainingBuffer: "" }
		}

		// Try to parse as JSON (tries both raw and VT-stripped versions)
		const event = tryParseJson(trimmedBuffer)
		if (event !== null) {
			return { events: [event], plainText: [], remainingBuffer: "" }
		}

		// Not JSON - strip VT characters before treating as plain text
		const cleanLine = stripVTControlCharacters(trimmedBuffer)
		if (cleanLine) {
			return { events: [], plainText: [cleanLine], remainingBuffer: "" }
		}

		return { events: [], plainText: [], remainingBuffer: "" }
	}

	/**
	 * Reset the parser state
	 */
	reset(): void {
		this.buffer = ""
	}
}
