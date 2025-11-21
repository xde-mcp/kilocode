import type { AuthProvider, AuthResult } from "../../types.js"
import openConfigFile from "../../../config/openConfig.js"
import wait from "../../../utils/wait.js"

/**
 * Manual configuration provider
 * Opens the config file for manual editing
 */
async function authenticateManually(): Promise<AuthResult> {
	console.log("\nPlease manually add your provider settings to the config file.")
	console.log(
		"Check out https://github.com/Kilo-Org/kilocode/blob/main/cli/docs/PROVIDER_CONFIGURATION.md to see potential configuration options",
	)
	await wait(1500)
	await openConfigFile()

	// This will never return a config since the user needs to manually edit
	// The process will exit after opening the config file
	throw new Error("Manual configuration - please restart after editing config file")
}

/**
 * Other provider for manual configuration
 */
export const otherProvider: AuthProvider = {
	name: "Other (Manual configuration)",
	value: "other",
	authenticate: authenticateManually,
}
