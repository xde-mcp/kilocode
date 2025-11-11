import { buildApiHandler } from "../../../api"
import { Task } from "../../task/Task"
import { calculateApiCostAnthropic } from "../../../shared/cost"

/**
 * Evaluates whether an action should be approved using an AI gatekeeper model.
 * This is used in YOLO mode to provide a safety layer instead of blindly approving everything.
 *
 * @param cline - The task instance
 * @param toolName - The name of the tool being used
 * @param toolParams - The parameters for the tool
 * @returns Promise<boolean> - true if approved, false if denied, defaults to true on error
 */
export async function evaluateGatekeeperApproval(
	cline: Task,
	toolName: string,
	toolParams: Record<string, any>,
): Promise<boolean> {
	try {
		const state = await cline.providerRef.deref()?.getState()
		const gatekeeperConfigId = state?.yoloGatekeeperApiConfigId

		// If no gatekeeper is configured, default to approve (original YOLO behavior)
		if (!gatekeeperConfigId) {
			return true
		}

		// Get the gatekeeper API configuration
		const listApiConfigMeta = state?.listApiConfigMeta
		if (!listApiConfigMeta || !Array.isArray(listApiConfigMeta)) {
			console.warn("[Gatekeeper] No API configs available, defaulting to approve")
			return true
		}

		const gatekeeperConfig = listApiConfigMeta.find((config) => config.id === gatekeeperConfigId)
		if (!gatekeeperConfig) {
			console.warn("[Gatekeeper] Configured gatekeeper not found, defaulting to approve")
			return true
		}

		// Load the full profile settings
		const profile = await cline.providerRef.deref()?.providerSettingsManager.getProfile({
			id: gatekeeperConfigId,
		})

		if (!profile || !profile.apiProvider) {
			console.warn("[Gatekeeper] Could not load gatekeeper profile, defaulting to approve")
			return true
		}

		// Build the approval prompt
		const { systemPrompt, userPrompt } = buildGatekeeperPrompt(toolName, toolParams)

		// Create API handler for gatekeeper
		const gatekeeperApi = buildApiHandler(profile)

		// Check if the handler supports single completion (some handlers may not)
		if (!("completePrompt" in gatekeeperApi) || typeof gatekeeperApi.completePrompt !== "function") {
			console.warn("[Gatekeeper] Handler does not support completePrompt, defaulting to approve")
			return true
		}

		// Make the request to the gatekeeper model with system prompt
		const result = await gatekeeperApi.completePrompt(userPrompt, systemPrompt)

		// Extract response text and usage information
		const response = typeof result === "string" ? result : result.text
		const usage = typeof result === "object" && result.usage ? result.usage : undefined

		// Parse the response - look for "yes", "approve", "allowed" vs "no", "deny", "block"
		const normalizedResponse = response.toLowerCase().trim()
		const approved =
			normalizedResponse.includes("yes") ||
			normalizedResponse.includes("approve") ||
			normalizedResponse.includes("allow")

		console.log(`[Gatekeeper] Tool: ${toolName}, Decision: ${approved ? "APPROVED" : "DENIED"}`)

		// Display cost if usage information is available
		if (usage) {
			// Use totalCost if provided (e.g., from OpenRouter), otherwise calculate it
			const cost =
				"totalCost" in usage && typeof usage.totalCost === "number"
					? usage.totalCost
					: calculateApiCostAnthropic(
							gatekeeperApi.getModel().info,
							usage.inputTokens,
							usage.outputTokens,
							"cacheWriteTokens" in usage ? usage.cacheWriteTokens : undefined,
							"cacheReadTokens" in usage ? usage.cacheReadTokens : undefined,
						)

			if (cost > 0) {
				await cline.say(
					"text",
					`🛡️ Gatekeeper ${approved ? "approved" : "denied"} **${toolName}** ($${cost.toFixed(4)})`,
					undefined,
					false,
					undefined,
					undefined,
					{ isNonInteractive: true },
				)
			}
		}

		return approved
	} catch (error) {
		// On any error, default to approve to avoid blocking the workflow
		console.error("[Gatekeeper] Error evaluating approval, defaulting to approve:", error)
		return true
	}
}

/**
 * Builds a concise prompt for the gatekeeper model to evaluate an action.
 *
 * @param toolName - The name of the tool being used
 * @param toolParams - The parameters for the tool
 * @returns Object with systemPrompt and userPrompt
 */
function buildGatekeeperPrompt(
	toolName: string,
	toolParams: Record<string, any>,
): { systemPrompt: string; userPrompt: string } {
	// Build a concise description of the action
	let actionDescription = `Tool: ${toolName}\n`

	// Add key parameters based on tool type
	switch (toolName) {
		case "write_to_file":
		case "apply_diff":
		case "insert_content":
		case "search_and_replace":
		case "edit_file":
			actionDescription += `File: ${toolParams.path || toolParams.target_file || "unknown"}\n`
			if (toolParams.content) {
				const contentPreview = toolParams.content.substring(0, 200)
				actionDescription += `Content preview: ${contentPreview}${toolParams.content.length > 200 ? "..." : ""}\n`
			}
			break
		case "execute_command":
			actionDescription += `Command: ${toolParams.command || "unknown"}\n`
			break
		case "read_file": {
			const paths = toolParams.path ? [toolParams.path] : (toolParams.args?.file || []).map((f: any) => f.path)
			actionDescription += `Files: ${paths.join(", ")}\n`
			break
		}
		case "browser_action":
			actionDescription += `Action: ${toolParams.action}\n`
			if (toolParams.url) actionDescription += `URL: ${toolParams.url}\n`
			break
		case "use_mcp_tool":
			actionDescription += `Server: ${toolParams.server_name}\n`
			actionDescription += `Tool: ${toolParams.tool_name}\n`
			break
		default: {
			// For other tools, include all params (truncated)
			const paramsStr = JSON.stringify(toolParams, null, 2).substring(0, 300)
			actionDescription += `Parameters: ${paramsStr}${JSON.stringify(toolParams).length > 300 ? "..." : ""}\n`
		}
	}

	const systemPrompt = `You are a safety gatekeeper for an independent AI coding assistant. Your job is to evaluate whether actions should be allowed.

Evaluate if actions are safe and should be approved. Consider:
- Is this modifying or deleting important files?
- Is this executing potentially dangerous commands?
- Could this cause data loss or system damage?

Respond with ONLY "yes" to approve or "no" to deny. Be concise.`

	const userPrompt = `Evaluate this action:

${actionDescription}`

	return { systemPrompt, userPrompt }
}
