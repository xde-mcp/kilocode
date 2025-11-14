import { ApiMessage } from "../task-persistence"

export function flattenToolResult(message: ApiMessage) {
	if (typeof message.content === "string" || !message.content.some((c) => c.type === "tool_result")) {
		return message
	}
	const result = {
		...message,
		content: message.content.flatMap((content) =>
			content.type === "tool_result"
				? typeof content.content === "string"
					? [{ type: "text", text: content.content }]
					: (content.content ?? [])
				: [content],
		),
	} satisfies ApiMessage
	console.debug("[flattenToolResult]", message, result)
	return result
}
