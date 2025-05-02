import { Anthropic } from "@anthropic-ai/sdk"

/**
 * Utility for calculating truncation ranges for context messages.
 */

export function getNextTruncationRange(
	apiMessages: Anthropic.Messages.MessageParam[],
	currentDeletedRange: [number, number] | undefined,
	keep: "none" | "lastTwo" | "half" | "quarter",
): [number, number] {
	// We always keep the first user-assistant pairing, and truncate an even number of messages from there
	const rangeStartIndex = 2 // index 0 and 1 are kept
	const startOfRest = currentDeletedRange ? currentDeletedRange[1] + 1 : 2 // inclusive starting index

	let messagesToRemove: number
	if (keep === "none") {
		// Removes all messages beyond the first core user/assistant message pair
		messagesToRemove = Math.max(apiMessages.length - startOfRest, 0)
	} else if (keep === "lastTwo") {
		// Keep the last user-assistant pair in addition to the first core user/assistant message pair
		messagesToRemove = Math.max(apiMessages.length - startOfRest - 2, 0)
	} else if (keep === "half") {
		// Remove half of remaining user-assistant pairs
		// We first calculate half of the messages then divide by 2 to get the number of pairs.
		// After flooring, we multiply by 2 to get the number of messages.
		// Note that this will also always be an even number.
		messagesToRemove = Math.floor((apiMessages.length - startOfRest) / 4) * 2 // Keep even number
	} else {
		// Remove 3/4 of remaining user-assistant pairs
		// We calculate 3/4ths of the messages then divide by 2 to get the number of pairs.
		// After flooring, we multiply by 2 to get the number of messages.
		// Note that this will also always be an even number.
		messagesToRemove = Math.floor(((apiMessages.length - startOfRest) * 3) / 4 / 2) * 2
	}

	let rangeEndIndex = startOfRest + messagesToRemove - 1 // inclusive ending index

	// Make sure that the last message being removed is a assistant message, so the next message after the initial user-assistant pair is an assistant message. This preserves the user-assistant-user-assistant structure.
	// NOTE: anthropic format messages are always user-assistant-user-assistant, while openai format messages can have multiple user messages in a row (we use anthropic format throughout cline)
	if (apiMessages[rangeEndIndex]?.role !== "assistant") {
		rangeEndIndex -= 1
	}

	// this is an inclusive range that will be removed from the conversation history
	return [rangeStartIndex, rangeEndIndex]
}
