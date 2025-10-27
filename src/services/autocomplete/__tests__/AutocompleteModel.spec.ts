import { describe, it, expect, beforeEach, vi } from "vitest"
import { AutocompleteModel } from "../AutocompleteModel"
import { ProviderSettings } from "@roo-code/types"
import Mistral from "../../continuedev/core/llm/llms/Mistral"
import { OpenAI } from "../../continuedev/core/llm/llms/OpenAI"

// Mock the LLM classes
vi.mock("../../continuedev/core/llm/llms/Mistral")
vi.mock("../../continuedev/core/llm/llms/OpenAI")

describe("AutocompleteModel", () => {
	let model: AutocompleteModel

	beforeEach(() => {
		model = new AutocompleteModel()
		vi.clearAllMocks()
	})

	describe("createILLMFromProfile", () => {
		describe("Mistral provider", () => {
			it("should create Mistral instance with valid configuration", () => {
				const profile: ProviderSettings = {
					mistralApiKey: "test-mistral-key",
					mistralCodestralUrl: "https://custom.mistral.ai/v1/",
				}

				const result = model.createILLMFromProfile(profile, "mistral")

				expect(result).toBeDefined()
				expect(Mistral).toHaveBeenCalledWith(
					expect.objectContaining({
						model: "codestral-latest",
						apiKey: "test-mistral-key",
						apiBase: "https://custom.mistral.ai/v1/",
						contextLength: 32000,
					}),
				)
			})

			it("should use default Mistral URL when not provided", () => {
				const profile: ProviderSettings = {
					mistralApiKey: "test-mistral-key",
				}

				model.createILLMFromProfile(profile, "mistral")

				expect(Mistral).toHaveBeenCalledWith(
					expect.objectContaining({
						apiBase: "https://codestral.mistral.ai/v1/",
					}),
				)
			})

			it("should return null when API key is missing", () => {
				const profile: ProviderSettings = {}

				const result = model.createILLMFromProfile(profile, "mistral")

				expect(result).toBeNull()
				expect(Mistral).not.toHaveBeenCalled()
			})
		})

		describe("Kilocode provider", () => {
			it("should create OpenAI instance with valid Kilocode configuration", () => {
				const profile: ProviderSettings = {
					kilocodeToken: "test-kilocode-token",
				}

				const result = model.createILLMFromProfile(profile, "kilocode")

				expect(result).toBeDefined()
				expect(OpenAI).toHaveBeenCalledWith(
					expect.objectContaining({
						model: "mistralai/codestral-2508",
						apiKey: "test-kilocode-token",
					}),
				)
			})

			it("should return null when Kilocode token is missing", () => {
				const profile: ProviderSettings = {}

				const result = model.createILLMFromProfile(profile, "kilocode")

				expect(result).toBeNull()
				expect(OpenAI).not.toHaveBeenCalled()
			})
		})

		describe("OpenRouter provider", () => {
			it("should create OpenAI instance with valid OpenRouter configuration", () => {
				const profile: ProviderSettings = {
					openRouterApiKey: "test-openrouter-key",
					openRouterBaseUrl: "https://custom.openrouter.ai/api/v1",
				}

				const result = model.createILLMFromProfile(profile, "openrouter")

				expect(result).toBeDefined()
				expect(OpenAI).toHaveBeenCalledWith(
					expect.objectContaining({
						model: "mistralai/codestral-2508",
						apiKey: "test-openrouter-key",
						apiBase: "https://custom.openrouter.ai/api/v1",
					}),
				)
			})

			it("should use default OpenRouter URL when not provided", () => {
				const profile: ProviderSettings = {
					openRouterApiKey: "test-openrouter-key",
				}

				model.createILLMFromProfile(profile, "openrouter")

				expect(OpenAI).toHaveBeenCalledWith(
					expect.objectContaining({
						apiBase: "https://openrouter.ai/api/v1",
					}),
				)
			})

			it("should return null when API key is missing", () => {
				const profile: ProviderSettings = {}

				const result = model.createILLMFromProfile(profile, "openrouter")

				expect(result).toBeNull()
				expect(OpenAI).not.toHaveBeenCalled()
			})
		})

		describe("Bedrock provider", () => {
			it("should return null as Bedrock is not yet supported", () => {
				const profile: ProviderSettings = {
					awsAccessKey: "test-access-key",
					awsSecretKey: "test-secret-key",
					awsRegion: "us-east-1",
				}

				const result = model.createILLMFromProfile(profile, "bedrock")

				expect(result).toBeNull()
			})
		})

		describe("LLM options", () => {
			it("should set correct completion options for autocomplete", () => {
				const profile: ProviderSettings = {
					mistralApiKey: "test-key",
				}

				model.createILLMFromProfile(profile, "mistral")

				expect(Mistral).toHaveBeenCalledWith(
					expect.objectContaining({
						completionOptions: expect.objectContaining({
							temperature: 0.2,
							maxTokens: 256,
						}),
					}),
				)
			})

			it("should set autocomplete options with cache disabled", () => {
				const profile: ProviderSettings = {
					mistralApiKey: "test-key",
				}

				model.createILLMFromProfile(profile, "mistral")

				expect(Mistral).toHaveBeenCalledWith(
					expect.objectContaining({
						autocompleteOptions: expect.objectContaining({
							useCache: false,
						}),
					}),
				)
			})

			it("should generate unique ID with correct format", () => {
				const profile: ProviderSettings = {
					mistralApiKey: "test-key",
				}

				model.createILLMFromProfile(profile, "mistral")
				const call = vi.mocked(Mistral).mock.calls[0][0]

				expect(call.uniqueId).toMatch(/^autocomplete-mistral-\d+$/)
				expect(call.uniqueId).toContain("autocomplete-mistral-")
			})
		})

		describe("Error handling", () => {
			it("should return null and log error when LLM instantiation fails", () => {
				const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
				vi.mocked(Mistral).mockImplementationOnce(() => {
					throw new Error("Instantiation failed")
				})

				const profile: ProviderSettings = {
					mistralApiKey: "test-key",
				}

				const result = model.createILLMFromProfile(profile, "mistral")

				expect(result).toBeNull()
				expect(consoleErrorSpy).toHaveBeenCalledWith(
					expect.stringContaining("Error creating ILLM"),
					expect.any(Error),
				)

				consoleErrorSpy.mockRestore()
			})

			it("should handle invalid provider gracefully", () => {
				const profile: ProviderSettings = {
					mistralApiKey: "test-key",
				}

				// @ts-expect-error Testing invalid provider
				const result = model.createILLMFromProfile(profile, "invalid-provider")

				expect(result).toBeNull()
			})
		})
	})
})
