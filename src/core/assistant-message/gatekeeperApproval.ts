import { buildApiHandler } from "../../api"
import { Task } from "../task/Task"

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
		const prompt = buildGatekeeperPrompt(toolName, toolParams)

		console.log({ prompt })

		// Create API handler for gatekeeper
		const gatekeeperApi = buildApiHandler(profile)

		// Check if the handler supports single completion (some handlers may not)
		if (!("completePrompt" in gatekeeperApi) || typeof gatekeeperApi.completePrompt !== "function") {
			console.warn("[Gatekeeper] Handler does not support completePrompt, defaulting to approve")
			return true
		}

		// Make the request to the gatekeeper model
		const response = await gatekeeperApi.completePrompt(prompt)

		// Parse the response - look for "yes", "approve", "allowed" vs "no", "deny", "block"
		const normalizedResponse = response.toLowerCase().trim()
		const approved =
			normalizedResponse.includes("yes") ||
			normalizedResponse.includes("approve") ||
			normalizedResponse.includes("allow") ||
			normalizedResponse.startsWith("y")

		console.log(`[Gatekeeper] Tool: ${toolName}, Decision: ${approved ? "APPROVED" : "DENIED"}`)
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
 * @returns string - The prompt for the gatekeeper model
 */
function buildGatekeeperPrompt(toolName: string, toolParams: Record<string, any>): string {
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

	return `You are a safety gatekeeper for an AI coding assistant running in YOLO mode. Your job is to quickly evaluate whether the following action should be allowed.

${actionDescription}

Evaluate if this action is safe and should be approved. Consider:
- Is this modifying or deleting important files?
- Is this executing potentially dangerous commands?
- Could this cause data loss or system damage?

Respond with ONLY "yes" to approve or "no" to deny. Be concise.`
}
