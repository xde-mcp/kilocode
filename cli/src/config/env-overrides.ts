import type { CLIConfig } from "./types.js"
import { logs } from "../services/logs.js"

/**
 * Environment variable prefix for provider field overrides
 */
export const PROVIDER_OVERRIDE_PREFIX = "KILO_PROVIDER_OVERRIDE_"

/**
 * Environment variable name for provider selection
 */
export const PROVIDER_ENV_VAR = "KILO_PROVIDER"

/**
 * Apply environment variable overrides to the config
 * Overrides the current provider's settings based on environment variables
 *
 * Environment variables:
 * - KILO_PROVIDER: Override the active provider ID
 * - KILO_PROVIDER_OVERRIDE_<fieldName>: Override any field in the current provider
 *   Examples:
 *   - KILO_PROVIDER_OVERRIDE_apiModelId
 *   - KILO_PROVIDER_OVERRIDE_kilocodeModel
 *   - KILO_PROVIDER_OVERRIDE_kilocodeOrganizationId
 *   - KILO_PROVIDER_OVERRIDE_apiKey
 *
 * @param config The config to apply overrides to
 * @returns The config with environment variable overrides applied
 */
export function applyEnvOverrides(config: CLIConfig): CLIConfig {
	const overriddenConfig = { ...config }

	// Override provider if KILO_PROVIDER is set
	const envProvider = process.env[PROVIDER_ENV_VAR]

	if (envProvider) {
		// Check if the provider exists in the config
		const providerExists = config.providers.some((p) => p.id === envProvider)

		if (providerExists) {
			overriddenConfig.provider = envProvider

			logs.info(`Config override: provider set to "${envProvider}" from ${PROVIDER_ENV_VAR}`, "EnvOverrides")
		} else {
			logs.warn(
				`Config override ignored: provider "${envProvider}" from ${PROVIDER_ENV_VAR} not found in config`,
				"EnvOverrides",
			)
		}
	}

	// Get the current provider (after potential provider override)
	const currentProvider = overriddenConfig.providers.find((p) => p.id === overriddenConfig.provider)

	if (!currentProvider) {
		// No valid provider, return config as-is
		return overriddenConfig
	}

	// Find all KILO_PROVIDER_OVERRIDE_* environment variables
	const overrideFields = getProviderOverrideFields()

	if (overrideFields.length > 0) {
		// Create a new providers array with the updated provider
		overriddenConfig.providers = overriddenConfig.providers.map((p) => {
			if (p.id === currentProvider.id) {
				const updatedProvider = { ...p }

				// Apply each override
				for (const { fieldName, value } of overrideFields) {
					updatedProvider[fieldName] = value

					logs.info(
						`Config override: ${fieldName} set to "${value}" from ${PROVIDER_OVERRIDE_PREFIX}${fieldName} for provider "${currentProvider.id}"`,
						"EnvOverrides",
					)
				}

				return updatedProvider
			}

			return p
		})
	}

	return overriddenConfig
}

/**
 * Get all KILO_PROVIDER_OVERRIDE_* environment variables
 * Returns an array of { fieldName, value } objects
 */
function getProviderOverrideFields(): Array<{ fieldName: string; value: string }> {
	const overrides: Array<{ fieldName: string; value: string }> = []

	for (const [key, value] of Object.entries(process.env)) {
		if (key.startsWith(PROVIDER_OVERRIDE_PREFIX) && value) {
			const fieldName = key.substring(PROVIDER_OVERRIDE_PREFIX.length)

			if (fieldName) {
				overrides.push({ fieldName, value })
			}
		}
	}

	return overrides
}
