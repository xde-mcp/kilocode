import type { CLIConfig } from "./types.js"
import { logs } from "../services/logs.js"

/**
 * Environment variable names for config overrides
 */
export const ENV_OVERRIDES = {
	PROVIDER: "KILO_PROVIDER",
	MODEL: "KILO_MODEL",
	ORG_ID: "KILO_ORG_ID",
} as const

/**
 * Apply environment variable overrides to the config
 * Overrides the current provider's settings based on environment variables
 *
 * Environment variables:
 * - KILO_PROVIDER: Override the active provider ID
 * - KILO_MODEL: Override the model for the current provider
 * - KILO_ORG_ID: Override the organization ID (for kilocode provider)
 *
 * @param config The config to apply overrides to
 * @returns The config with environment variable overrides applied
 */
export function applyEnvOverrides(config: CLIConfig): CLIConfig {
	const overriddenConfig = { ...config }

	// Override provider if KILO_PROVIDER is set
	const envProvider = process.env[ENV_OVERRIDES.PROVIDER]

	if (envProvider) {
		// Check if the provider exists in the config
		const providerExists = config.providers.some((p) => p.id === envProvider)

		if (providerExists) {
			overriddenConfig.provider = envProvider

			logs.info(
				`Config override: provider set to "${envProvider}" from ${ENV_OVERRIDES.PROVIDER}`,
				"EnvOverrides",
			)
		} else {
			logs.warn(
				`Config override ignored: provider "${envProvider}" from ${ENV_OVERRIDES.PROVIDER} not found in config`,
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

	// Override model if KILO_MODEL is set
	const envModel = process.env[ENV_OVERRIDES.MODEL]

	if (envModel) {
		// Apply model override based on provider type
		const modelField = getModelFieldForProvider(currentProvider.provider)

		if (modelField) {
			// Create a new providers array with the updated provider
			overriddenConfig.providers = overriddenConfig.providers.map((p) => {
				if (p.id === currentProvider.id) {
					return {
						...p,
						[modelField]: envModel,
					}
				}

				return p
			})

			logs.info(
				`Config override: ${modelField} set to "${envModel}" from ${ENV_OVERRIDES.MODEL} for provider "${currentProvider.id}"`,
				"EnvOverrides",
			)
		}
	}

	// Override organization ID if KILO_ORG_ID is set (only for kilocode provider)
	const envOrgId = process.env[ENV_OVERRIDES.ORG_ID]

	if (envOrgId && currentProvider.provider === "kilocode") {
		// Create a new providers array with the updated provider
		overriddenConfig.providers = overriddenConfig.providers.map((p) => {
			if (p.id === currentProvider.id) {
				return {
					...p,
					kilocodeOrganizationId: envOrgId,
				}
			}

			return p
		})

		logs.info(
			`Config override: kilocodeOrganizationId set to "${envOrgId}" from ${ENV_OVERRIDES.ORG_ID} for provider "${currentProvider.id}"`,
			"EnvOverrides",
		)
	} else if (envOrgId && currentProvider.provider !== "kilocode") {
		logs.warn(
			`Config override ignored: ${ENV_OVERRIDES.ORG_ID} is only applicable for kilocode provider, current provider is "${currentProvider.provider}"`,
			"EnvOverrides",
		)
	}

	return overriddenConfig
}

/**
 * Get the model field name for a given provider
 * Different providers use different field names for their model ID
 */
function getModelFieldForProvider(provider: string): string | null {
	switch (provider) {
		case "kilocode":
			return "kilocodeModel"

		case "anthropic":
			return "apiModelId"

		case "openai-native":
			return "apiModelId"

		case "openrouter":
			return "openRouterModelId"

		case "ollama":
			return "ollamaModelId"

		case "lmstudio":
			return "lmStudioModelId"

		case "openai":
			return "apiModelId"

		case "glama":
			return "glamaModelId"

		case "litellm":
			return "litellmModelId"

		case "deepinfra":
			return "deepInfraModelId"

		case "unbound":
			return "unboundModelId"

		case "requesty":
			return "requestyModelId"

		case "vercel-ai-gateway":
			return "vercelAiGatewayModelId"

		case "io-intelligence":
			return "ioIntelligenceModelId"

		case "huggingface":
			return "huggingFaceModelId"

		default:
			// For most other providers, use apiModelId as fallback
			return "apiModelId"
	}
}
