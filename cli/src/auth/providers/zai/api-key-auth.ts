import inquirer from "inquirer"
import type { AuthResult } from "../../types.js"

/**
 * Execute the zAI API key authentication flow
 * @returns Authentication result with provider config
 */
export async function authenticateWithZaiApiKey(): Promise<AuthResult> {
	const { zaiApiKey } = await inquirer.prompt<{ zaiApiKey: string }>([
		{
			type: "password",
			name: "zaiApiKey",
			message: "Please enter your zAI token:",
		},
	])

	return {
		providerConfig: {
			id: "default",
			provider: "zai",
			zaiApiKey,
		},
	}
}
