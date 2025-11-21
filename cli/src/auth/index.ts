import inquirer from "inquirer"
import { loadConfig, saveConfig, CLIConfig } from "../config/index.js"
import { authProviders } from "./providers/index.js"

/**
 * Main authentication wizard
 * Prompts user to select a provider and executes the authentication flow
 */
export default async function authWizard(): Promise<void> {
	const config = await loadConfig()

	// Build provider choices for inquirer
	const providerChoices = authProviders.map((provider) => ({
		name: provider.name,
		value: provider.value,
	}))

	// Prompt user to select a provider
	const { selectedProvider } = await inquirer.prompt<{ selectedProvider: string }>([
		{
			type: "list",
			name: "selectedProvider",
			message: "Please select which provider you would like to use:",
			choices: providerChoices,
		},
	])

	// Find the selected provider
	const provider = authProviders.find((p) => p.value === selectedProvider)
	if (!provider) {
		throw new Error(`Provider not found: ${selectedProvider}`)
	}

	// Execute the provider's authentication flow
	let authResult
	try {
		authResult = await provider.authenticate()
	} catch (error) {
		console.error(`\n❌ Authentication failed: ${error instanceof Error ? error.message : String(error)}`)
		process.exit(1)
	}

	// Save the configuration
	const newConfig: CLIConfig = {
		...config.config,
		providers: [authResult.providerConfig],
	}

	await saveConfig(newConfig)
	console.log("\n✓ Configuration saved successfully!\n")
}
