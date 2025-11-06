import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { applyEnvOverrides, PROVIDER_ENV_VAR, PROVIDER_OVERRIDE_PREFIX } from "../env-overrides.js"
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
			process.env[PROVIDER_ENV_VAR] = "anthropic-provider"

			const result = applyEnvOverrides(testConfig)

			expect(result.provider).toBe("anthropic-provider")
		})

		it("should not override provider when KILO_PROVIDER provider does not exist", () => {
			process.env[PROVIDER_ENV_VAR] = "nonexistent-provider"

			const result = applyEnvOverrides(testConfig)

			expect(result.provider).toBe("default")
		})

		it("should not override provider when KILO_PROVIDER is empty", () => {
			process.env[PROVIDER_ENV_VAR] = ""

			const result = applyEnvOverrides(testConfig)

			expect(result.provider).toBe("default")
		})
	})

	describe("KILO_PROVIDER_OVERRIDE_* overrides", () => {
		it("should override any field in current provider", () => {
			process.env[`${PROVIDER_OVERRIDE_PREFIX}kilocodeModel`] = "anthropic/claude-opus-4.0"
			process.env[`${PROVIDER_OVERRIDE_PREFIX}kilocodeOrganizationId`] = "new-org-id"

			const result = applyEnvOverrides(testConfig)

			const provider = result.providers.find((p) => p.id === "default")
			expect(provider?.kilocodeModel).toBe("anthropic/claude-opus-4.0")
			expect(provider?.kilocodeOrganizationId).toBe("new-org-id")
		})
	})

	describe("Combined overrides", () => {
		it("should apply both provider and field overrides together", () => {
			process.env[PROVIDER_ENV_VAR] = "anthropic-provider"
			process.env[`${PROVIDER_OVERRIDE_PREFIX}apiModelId`] = "claude-3-opus-20240229"
			process.env[`${PROVIDER_OVERRIDE_PREFIX}apiKey`] = "new-key"

			const result = applyEnvOverrides(testConfig)

			expect(result.provider).toBe("anthropic-provider")
			const provider = result.providers.find((p) => p.id === "anthropic-provider")
			expect(provider?.apiModelId).toBe("claude-3-opus-20240229")
			expect(provider?.apiKey).toBe("new-key")
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

		it("should handle empty string override values", () => {
			process.env[`${PROVIDER_OVERRIDE_PREFIX}apiModelId`] = ""

			const result = applyEnvOverrides(testConfig)

			// Empty strings should not trigger overrides
			const provider = result.providers.find((p) => p.id === "default")
			expect(provider?.kilocodeModel).toBe("anthropic/claude-sonnet-4.5")
		})

		it("should ignore KILO_PROVIDER_OVERRIDE_ with no field name", () => {
			process.env[PROVIDER_OVERRIDE_PREFIX] = "value"

			const result = applyEnvOverrides(testConfig)

			// Should not modify anything
			expect(result).toEqual(testConfig)
		})
	})
})
