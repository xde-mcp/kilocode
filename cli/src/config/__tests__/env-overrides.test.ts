import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { applyEnvOverrides, ENV_OVERRIDES } from "../env-overrides.js"
import type { CLIConfig } from "../types.js"

describe("env-overrides", () => {
	const originalEnv = process.env
	let testConfig: CLIConfig

	beforeEach(() => {
		// Reset environment variables before each test
		process.env = { ...originalEnv }

		// Create a test config
		testConfig = {
			version: "1.0.0",
			mode: "code",
			telemetry: true,
			provider: "default",
			providers: [
				{
					id: "default",
					provider: "kilocode",
					kilocodeToken: "test-token",
					kilocodeModel: "anthropic/claude-sonnet-4.5",
					kilocodeOrganizationId: "original-org-id",
				},
				{
					id: "anthropic-provider",
					provider: "anthropic",
					apiKey: "test-key",
					apiModelId: "claude-3-5-sonnet-20241022",
				},
			],
			autoApproval: {
				enabled: true,
			},
			theme: "dark",
			customThemes: {},
		}
	})

	afterEach(() => {
		// Restore original environment
		process.env = originalEnv
	})

	describe("KILO_PROVIDER override", () => {
		it("should override provider when KILO_PROVIDER is set and provider exists", () => {
			process.env[ENV_OVERRIDES.PROVIDER] = "anthropic-provider"

			const result = applyEnvOverrides(testConfig)

			expect(result.provider).toBe("anthropic-provider")
		})

		it("should not override provider when KILO_PROVIDER provider does not exist", () => {
			process.env[ENV_OVERRIDES.PROVIDER] = "nonexistent-provider"

			const result = applyEnvOverrides(testConfig)

			expect(result.provider).toBe("default")
		})

		it("should not override provider when KILO_PROVIDER is not set", () => {
			const result = applyEnvOverrides(testConfig)

			expect(result.provider).toBe("default")
		})
	})

	describe("KILO_MODEL override", () => {
		it("should override kilocodeModel for kilocode provider", () => {
			process.env[ENV_OVERRIDES.MODEL] = "anthropic/claude-opus-4.0"

			const result = applyEnvOverrides(testConfig)

			const provider = result.providers.find((p) => p.id === "default")
			expect(provider?.kilocodeModel).toBe("anthropic/claude-opus-4.0")
		})

		it("should override apiModelId for anthropic provider", () => {
			testConfig.provider = "anthropic-provider"
			process.env[ENV_OVERRIDES.MODEL] = "claude-3-opus-20240229"

			const result = applyEnvOverrides(testConfig)

			const provider = result.providers.find((p) => p.id === "anthropic-provider")
			expect(provider?.apiModelId).toBe("claude-3-opus-20240229")
		})

		it("should not modify original config object", () => {
			process.env[ENV_OVERRIDES.MODEL] = "new-model"

			const result = applyEnvOverrides(testConfig)

			const originalProvider = testConfig.providers.find((p) => p.id === "default")
			const resultProvider = result.providers.find((p) => p.id === "default")

			expect(originalProvider?.kilocodeModel).toBe("anthropic/claude-sonnet-4.5")
			expect(resultProvider?.kilocodeModel).toBe("new-model")
		})
	})

	describe("KILO_ORG_ID override", () => {
		it("should override kilocodeOrganizationId for kilocode provider", () => {
			process.env[ENV_OVERRIDES.ORG_ID] = "new-org-id"

			const result = applyEnvOverrides(testConfig)

			const provider = result.providers.find((p) => p.id === "default")
			expect(provider?.kilocodeOrganizationId).toBe("new-org-id")
		})

		it("should not override organizationId for non-kilocode provider", () => {
			testConfig.provider = "anthropic-provider"
			process.env[ENV_OVERRIDES.ORG_ID] = "new-org-id"

			const result = applyEnvOverrides(testConfig)

			const provider = result.providers.find((p) => p.id === "anthropic-provider")
			expect(provider?.kilocodeOrganizationId).toBeUndefined()
		})

		it("should add kilocodeOrganizationId if not present in config", () => {
			// Remove organizationId from config
			const providerIndex = testConfig.providers.findIndex((p) => p.id === "default")
			delete (testConfig.providers[providerIndex] as any).kilocodeOrganizationId

			process.env[ENV_OVERRIDES.ORG_ID] = "new-org-id"

			const result = applyEnvOverrides(testConfig)

			const provider = result.providers.find((p) => p.id === "default")
			expect(provider?.kilocodeOrganizationId).toBe("new-org-id")
		})
	})

	describe("Multiple overrides", () => {
		it("should apply all overrides when multiple env vars are set", () => {
			process.env[ENV_OVERRIDES.PROVIDER] = "default"
			process.env[ENV_OVERRIDES.MODEL] = "anthropic/claude-opus-4.0"
			process.env[ENV_OVERRIDES.ORG_ID] = "new-org-id"

			const result = applyEnvOverrides(testConfig)

			expect(result.provider).toBe("default")
			const provider = result.providers.find((p) => p.id === "default")
			expect(provider?.kilocodeModel).toBe("anthropic/claude-opus-4.0")
			expect(provider?.kilocodeOrganizationId).toBe("new-org-id")
		})

		it("should handle provider switch with model override", () => {
			process.env[ENV_OVERRIDES.PROVIDER] = "anthropic-provider"
			process.env[ENV_OVERRIDES.MODEL] = "claude-3-opus-20240229"

			const result = applyEnvOverrides(testConfig)

			expect(result.provider).toBe("anthropic-provider")
			const provider = result.providers.find((p) => p.id === "anthropic-provider")
			expect(provider?.apiModelId).toBe("claude-3-opus-20240229")
		})
	})

	describe("Edge cases", () => {
		it("should handle empty config providers array", () => {
			testConfig.providers = []

			const result = applyEnvOverrides(testConfig)

			expect(result.providers).toEqual([])
		})

		it("should handle config with no current provider", () => {
			testConfig.provider = "nonexistent"

			const result = applyEnvOverrides(testConfig)

			expect(result).toEqual(testConfig)
		})

		it("should handle empty string env variables", () => {
			process.env[ENV_OVERRIDES.PROVIDER] = ""
			process.env[ENV_OVERRIDES.MODEL] = ""
			process.env[ENV_OVERRIDES.ORG_ID] = ""

			const result = applyEnvOverrides(testConfig)

			// Empty strings should not trigger overrides
			expect(result.provider).toBe("default")
		})
	})

	describe("Provider-specific model fields", () => {
		it("should use correct model field for different providers", () => {
			const providers = [
				{ id: "ollama-test", provider: "ollama" as const, ollamaModelId: "llama2" },
				{ id: "openrouter-test", provider: "openrouter" as const, openRouterModelId: "anthropic/claude" },
				{ id: "lmstudio-test", provider: "lmstudio" as const, lmStudioModelId: "local-model" },
			]

			testConfig.providers = [...testConfig.providers, ...providers]

			// Test ollama
			testConfig.provider = "ollama-test"
			process.env[ENV_OVERRIDES.MODEL] = "llama3"
			let result = applyEnvOverrides(testConfig)
			let provider = result.providers.find((p) => p.id === "ollama-test")
			expect(provider?.ollamaModelId).toBe("llama3")

			// Test openrouter
			testConfig.provider = "openrouter-test"
			process.env[ENV_OVERRIDES.MODEL] = "openai/gpt-4"
			result = applyEnvOverrides(testConfig)
			provider = result.providers.find((p) => p.id === "openrouter-test")
			expect(provider?.openRouterModelId).toBe("openai/gpt-4")

			// Test lmstudio
			testConfig.provider = "lmstudio-test"
			process.env[ENV_OVERRIDES.MODEL] = "codellama"
			result = applyEnvOverrides(testConfig)
			provider = result.providers.find((p) => p.id === "lmstudio-test")
			expect(provider?.lmStudioModelId).toBe("codellama")
		})
	})
})
