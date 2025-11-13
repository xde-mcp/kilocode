# Provider Configuration Discrepancy Analysis

This document provides a comprehensive comparison of provider configuration discrepancies between CLI types and ProviderSettings.

## Critical Issues Found

### 1. **OpenAI Provider - Wrong Field Name** ⚠️

| Location                                                         | Field Name      | Status     |
| ---------------------------------------------------------------- | --------------- | ---------- |
| CLI Types (`cli/src/config/types.ts:134`)                        | `apiModelId`    | ❌ WRONG   |
| ProviderSettings (`packages/types/src/provider-settings.ts:285`) | `openAiModelId` | ✅ CORRECT |
| Schema (`cli/src/config/schema.json:985`)                        | `apiModelId`    | ❌ WRONG   |
| Documentation (`cli/docs/PROVIDER_CONFIGURATION.md:637`)         | `apiModelId`    | ❌ WRONG   |

**Impact**: Configuration will fail when users try to use the OpenAI provider via CLI

---

## 2. **Missing Fields in CLI Type Definitions**

The CLI types only define the model ID field but are missing ALL other provider-specific configuration fields.

### Complete Provider Field Comparison

| Provider                   | CLI Type Fields                                            | ProviderSettings Fields                                                                                                                                                                                                                                                                                        | Missing in CLI                                                                  |
| -------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **anthropic**              | `apiModelId`                                               | `apiKey`, `apiModelId`, `anthropicBaseUrl`, `anthropicUseAuthToken`, `anthropicBeta1MContext`                                                                                                                                                                                                                  | `apiKey`, `anthropicBaseUrl`, `anthropicUseAuthToken`, `anthropicBeta1MContext` |
| **openai-native**          | `apiModelId`                                               | `apiModelId`, `openAiNativeApiKey`, `openAiNativeBaseUrl`, `openAiNativeServiceTier`                                                                                                                                                                                                                           | `openAiNativeApiKey`, `openAiNativeBaseUrl`, `openAiNativeServiceTier`          |
| **openai**                 | `apiModelId` ❌                                            | `openAiModelId` ✅, `openAiBaseUrl`, `openAiApiKey`, `openAiLegacyFormat`, `openAiR1FormatEnabled`, `openAiCustomModelInfo`, `openAiUseAzure`, `azureApiVersion`, `openAiStreamingEnabled`, `openAiHostHeader`, `openAiHeaders`                                                                                | ALL fields (wrong field name + 10 missing)                                      |
| **bedrock**                | `apiModelId`                                               | `apiModelId`, `awsAccessKey`, `awsSecretKey`, `awsSessionToken`, `awsRegion`, `awsUseCrossRegionInference`, `awsUsePromptCache`, `awsProfile`, `awsUseProfile`, `awsApiKey`, `awsUseApiKey`, `awsCustomArn`, `awsModelContextWindow`, `awsBedrockEndpointEnabled`, `awsBedrockEndpoint`, `awsBedrock1MContext` | 15 AWS-specific fields                                                          |
| **vertex**                 | `apiModelId`                                               | `apiModelId`, `vertexKeyFile`, `vertexJsonCredentials`, `vertexProjectId`, `vertexRegion`, `enableUrlContext`, `enableGrounding`                                                                                                                                                                               | 6 Vertex-specific fields                                                        |
| **gemini**                 | `apiModelId`                                               | `apiModelId`, `geminiApiKey`, `googleGeminiBaseUrl`, `enableUrlContext`, `enableGrounding`                                                                                                                                                                                                                     | 4 Gemini-specific fields                                                        |
| **gemini-cli**             | `apiModelId`                                               | `apiModelId`, `geminiCliOAuthPath`, `geminiCliProjectId`                                                                                                                                                                                                                                                       | 2 OAuth fields                                                                  |
| **mistral**                | `apiModelId`                                               | `apiModelId`, `mistralApiKey`, `mistralCodestralUrl`                                                                                                                                                                                                                                                           | 2 Mistral-specific fields                                                       |
| **deepseek**               | `apiModelId`                                               | `apiModelId`, `deepSeekBaseUrl`, `deepSeekApiKey`                                                                                                                                                                                                                                                              | 2 DeepSeek-specific fields                                                      |
| **deepinfra**              | `deepInfraModelId`                                         | `apiModelId`, `deepInfraBaseUrl`, `deepInfraApiKey`, `deepInfraModelId`                                                                                                                                                                                                                                        | `apiModelId`, `deepInfraBaseUrl`, `deepInfraApiKey`                             |
| **doubao**                 | `apiModelId`                                               | `apiModelId`, `doubaoBaseUrl`, `doubaoApiKey`                                                                                                                                                                                                                                                                  | 2 Doubao-specific fields                                                        |
| **moonshot**               | `apiModelId`                                               | `apiModelId`, `moonshotBaseUrl`, `moonshotApiKey`                                                                                                                                                                                                                                                              | 2 Moonshot-specific fields                                                      |
| **minimax**                | `apiModelId`                                               | `apiModelId`, `minimaxBaseUrl`, `minimaxApiKey`                                                                                                                                                                                                                                                                | 2 MiniMax-specific fields                                                       |
| **xai**                    | `apiModelId`                                               | `apiModelId`, `xaiApiKey`                                                                                                                                                                                                                                                                                      | `xaiApiKey`                                                                     |
| **groq**                   | `apiModelId`                                               | `apiModelId`, `groqApiKey`                                                                                                                                                                                                                                                                                     | `groqApiKey`                                                                    |
| **chutes**                 | `apiModelId`                                               | `apiModelId`, `chutesApiKey`                                                                                                                                                                                                                                                                                   | `chutesApiKey`                                                                  |
| **cerebras**               | `apiModelId`                                               | `apiModelId`, `cerebrasApiKey`                                                                                                                                                                                                                                                                                 | `cerebrasApiKey`                                                                |
| **sambanova**              | `apiModelId`                                               | `apiModelId`, `sambaNovaApiKey`                                                                                                                                                                                                                                                                                | `sambaNovaApiKey`                                                               |
| **zai**                    | `apiModelId`                                               | `apiModelId`, `zaiApiKey`, `zaiApiLine`                                                                                                                                                                                                                                                                        | `zaiApiKey`, `zaiApiLine`                                                       |
| **fireworks**              | `apiModelId`                                               | `apiModelId`, `fireworksApiKey`                                                                                                                                                                                                                                                                                | `fireworksApiKey`                                                               |
| **featherless**            | `apiModelId`                                               | `apiModelId`, `featherlessApiKey`                                                                                                                                                                                                                                                                              | `featherlessApiKey`                                                             |
| **roo**                    | `apiModelId`                                               | `apiModelId`                                                                                                                                                                                                                                                                                                   | None ✅                                                                         |
| **claude-code**            | `apiModelId`                                               | `apiModelId`, `claudeCodePath`, `claudeCodeMaxOutputTokens`                                                                                                                                                                                                                                                    | 2 Claude Code-specific fields                                                   |
| **synthetic**              | `apiModelId`                                               | `apiModelId`, `syntheticApiKey`                                                                                                                                                                                                                                                                                | `syntheticApiKey`                                                               |
| **inception**              | `inceptionLabsModelId`                                     | `apiModelId`, `inceptionLabsBaseUrl`, `inceptionLabsApiKey`, `inceptionLabsModelId`                                                                                                                                                                                                                            | `apiModelId`, `inceptionLabsBaseUrl`, `inceptionLabsApiKey`                     |
| **ollama**                 | `ollamaModelId`                                            | `ollamaModelId`, `ollamaBaseUrl`, `ollamaApiKey`, `ollamaNumCtx`                                                                                                                                                                                                                                               | 3 Ollama-specific fields                                                        |
| **lmstudio**               | `lmStudioModelId`                                          | `lmStudioModelId`, `lmStudioBaseUrl`, `lmStudioDraftModelId`, `lmStudioSpeculativeDecodingEnabled`                                                                                                                                                                                                             | 3 LM Studio-specific fields                                                     |
| **glama**                  | `glamaModelId`                                             | `glamaModelId`, `glamaApiKey`                                                                                                                                                                                                                                                                                  | `glamaApiKey`                                                                   |
| **litellm**                | `litellmModelId`                                           | `litellmModelId`, `litellmBaseUrl`, `litellmApiKey`, `litellmUsePromptCache`                                                                                                                                                                                                                                   | 3 LiteLLM-specific fields                                                       |
| **unbound**                | `unboundModelId`                                           | `unboundModelId`, `unboundApiKey`                                                                                                                                                                                                                                                                              | `unboundApiKey`                                                                 |
| **requesty**               | `requestyModelId`                                          | `requestyModelId`, `requestyBaseUrl`, `requestyApiKey`                                                                                                                                                                                                                                                         | 2 Requesty-specific fields                                                      |
| **vercel-ai-gateway**      | `vercelAiGatewayModelId`                                   | `vercelAiGatewayModelId`, `vercelAiGatewayApiKey`                                                                                                                                                                                                                                                              | `vercelAiGatewayApiKey`                                                         |
| **io-intelligence**        | `ioIntelligenceModelId`                                    | `apiModelId`, `ioIntelligenceModelId`, `ioIntelligenceApiKey`                                                                                                                                                                                                                                                  | `apiModelId`, `ioIntelligenceApiKey`                                            |
| **ovhcloud**               | `ovhCloudAiEndpointsModelId`                               | `ovhCloudAiEndpointsModelId`, `ovhCloudAiEndpointsApiKey`, `ovhCloudAiEndpointsBaseUrl`                                                                                                                                                                                                                        | 2 OVHcloud-specific fields                                                      |
| **openrouter**             | `openRouterModelId`                                        | `openRouterModelId`, `openRouterApiKey`, `openRouterBaseUrl`, `openRouterSpecificProvider`, `openRouterUseMiddleOutTransform`, `openRouterProviderDataCollection`, `openRouterProviderSort`, `openRouterZdr`                                                                                                   | 7 OpenRouter-specific fields                                                    |
| **kilocode**               | `kilocodeModel`, `kilocodeToken`, `kilocodeOrganizationId` | Same + `openRouterSpecificProvider`, `openRouterProviderDataCollection`, `openRouterProviderSort`, `openRouterZdr`, `kilocodeTesterWarningsDisabledUntil`                                                                                                                                                      | 5 OpenRouter passthrough fields                                                 |
| **virtual-quota-fallback** | `apiModelId` ❌                                            | `profiles`                                                                                                                                                                                                                                                                                                     | Wrong field entirely                                                            |
| **vscode-lm**              | `vsCodeLmModelSelector`                                    | `vsCodeLmModelSelector`                                                                                                                                                                                                                                                                                        | None ✅                                                                         |
| **huggingface**            | `huggingFaceModelId`                                       | `huggingFaceModelId`, `huggingFaceApiKey`, `huggingFaceInferenceProvider`                                                                                                                                                                                                                                      | 2 HuggingFace-specific fields                                                   |
| **human-relay**            | None                                                       | None                                                                                                                                                                                                                                                                                                           | None ✅                                                                         |
| **fake-ai**                | None                                                       | `fakeAi` (unknown type)                                                                                                                                                                                                                                                                                        | `fakeAi`                                                                        |

---

## 3. **Missing Provider Configurations in Schema & Documentation**

### Schema (`cli/src/config/schema.json`)

| Provider  | Status     | Notes                            |
| --------- | ---------- | -------------------------------- |
| inception | ❌ Missing | Needs complete schema definition |
| synthetic | ❌ Missing | Needs complete schema definition |
| minimax   | ✅ Present | Already in schema                |

### Documentation (`cli/docs/PROVIDER_CONFIGURATION.md`)

| Provider  | Status     | Notes                       |
| --------- | ---------- | --------------------------- |
| inception | ❌ Missing | Needs documentation section |
| synthetic | ❌ Missing | Needs documentation section |
| minimax   | ❌ Missing | Needs documentation section |

---

## Root Cause Analysis

The CLI type definitions in `cli/src/config/types.ts` use a **minimal approach** where each provider type only declares:

1. The `provider` discriminator field
2. The model ID field (with provider-specific naming)

However, the actual runtime configuration needs ALL fields from ProviderSettings to function properly. The current implementation relies on:

- `BaseProviderConfig` with `[key: string]: unknown` to allow additional fields
- Dynamic field copying in `mapProviderToApiConfig()` function

**This creates a type safety gap** where:

- TypeScript doesn't validate the actual fields being used
- Documentation and schema can drift from actual implementation
- Users get no autocomplete or type checking for provider-specific fields

---

## Recommended Fix Strategy

### Option 1: Full Type Definitions (Recommended)

Add all fields from ProviderSettings to each CLI provider type definition. This provides:

- ✅ Full type safety
- ✅ Better IDE autocomplete
- ✅ Compile-time validation
- ❌ More verbose type definitions
- ❌ Requires keeping two type systems in sync

### Option 2: Shared Type Definitions

Import and reuse ProviderSettings types directly in CLI. This provides:

- ✅ Single source of truth
- ✅ No duplication
- ✅ Automatic sync
- ❌ May create circular dependencies
- ❌ CLI becomes tightly coupled to extension types

### Option 3: Current Approach + Documentation

Keep minimal types but improve documentation and validation. This provides:

- ✅ Flexible, allows any fields
- ✅ Less code to maintain
- ❌ No type safety
- ❌ Easy to make mistakes

---

## Immediate Actions Required

1. **Fix `openai` provider field name**: `apiModelId` → `openAiModelId`
2. **Fix `virtual-quota-fallback` provider**: Remove `apiModelId`, ensure `profiles` is defined
3. **Add `inception` provider to schema and documentation**
4. **Add `synthetic` provider to schema and documentation**
5. **Add `minimax` provider to documentation**
6. **Decide on long-term strategy** for type definitions

---

## Files Requiring Updates

1. **Type Definitions**: `cli/src/config/types.ts`

    - Fix `OpenAIProviderConfig` field name
    - Fix `VirtualQuotaFallbackProviderConfig` field
    - Optionally: Add all missing fields to all provider types

2. **JSON Schema**: `cli/src/config/schema.json`

    - Add `inception` provider schema
    - Add `synthetic` provider schema
    - Fix `openai` provider to use `openAiModelId`

3. **Documentation**: `cli/docs/PROVIDER_CONFIGURATION.md`

    - Add `inception` provider section
    - Add `synthetic` provider section
    - Add `minimax` provider section
    - Fix `openai` provider examples to use `openAiModelId`

4. **Validation**: `cli/src/constants/providers/validation.ts`

    - Verify required fields match ProviderSettings

5. **Settings**: `cli/src/constants/providers/settings.ts`
    - Add missing field metadata for new providers
    - Verify field configurations

---

## Summary Statistics

- **Total Providers**: 40
- **Providers with wrong field names**: 2 (`openai`, `virtual-quota-fallback`)
- **Providers with missing fields in CLI types**: 35 (if we want full type safety)
- **Total missing fields**: ~100+ (if we want full type definitions)
- **Providers missing from schema**: 2 (`inception`, `synthetic`)
- **Providers missing from docs**: 3 (`inception`, `synthetic`, `minimax`)

---

## Next Steps

Please review this analysis and decide:

1. Should we fix only the critical issues (wrong field names, missing providers)?
2. Should we add all missing fields to CLI types for full type safety?
3. Should we refactor to share types between CLI and extension?
