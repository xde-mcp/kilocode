import { ToolProtocol } from "../../../../packages/types/src/tool"

export function markdownFormattingSection(
	toolUseStyle: ToolProtocol, // kilocode_change
): string {
	return `====

MARKDOWN RULES

ALL responses MUST show ANY \`language construct\` OR filename reference as clickable, exactly as [\`filename OR language.declaration()\`](relative/file/path.ext:line); line is required for \`syntax\` and optional for filename links. This applies to ALL markdown responses and ALSO those in ${toolUseStyle === "native" ? "attempt_completion" : "<attempt_completion>" /*kilocode_change*/}`
}
