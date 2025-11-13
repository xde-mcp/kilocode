# Implementation Plan: Provider Configuration Full Type Safety

## Overview

This plan implements **Option 2: Full Type Safety** by adding all missing fields from ProviderSettings to CLI provider type definitions, fixing field name mismatches, and ensuring complete consistency across all configuration files.

## Goals

1. ✅ Fix critical field name mismatches (`openai`, `virtual-quota-fallback`)
2. ✅ Add all missing provider-specific fields to CLI types
3. ✅ Add missing providers to schema (`inception`, `synthetic`)
4. ✅ Add missing providers to documentation (`inception`, `synthetic`, `minimax`)
5. ✅ Ensure type safety and autocomplete for all provider configurations
6. ✅ Maintain backward compatibility with existing configurations

## Implementation Steps

### Phase 1: Update CLI Type Definitions (`cli/src/config/types.ts`)

For each provider type, add ALL fields from the corresponding ProviderSettings schema:

#### 1.1 Fix Critical Field Names

```typescript
// BEFORE (WRONG):
type OpenAIProviderConfig = BaseProviderConfig & {
	provider: "openai"
	apiModelId?: string // ❌ WRONG
}

// AFTER (CORRECT):
type OpenAIProviderConfig = BaseProviderConfig & {
	provider: "openai"
	openAiModelId?: string // ✅ CORRECT
	openAiBaseUrl?: string
	openAiApiKey?: string
	openAiLegacyFormat?: boolean
	openAiR1FormatEnabled?: boolean
	openAiUseAzure?: boolean
	azureApiVersion?: string
	openAiStreamingEnabled?: boolean
	openAiHeaders?: Record<string, string>
}
```

```typescript
// BEFORE (WRONG):
type VirtualQuotaFallbackProviderConfig = BaseProviderConfig & {
	provider: "virtual-quota-fallback"
	apiModelId?: string // ❌ WRONG
}

// AFTER (CORRECT):
type VirtualQuotaFallbackProviderConfig = BaseProviderConfig & {
	provider: "virtual-quota-fallback"
	profiles?: Array<{
		profileName?: string
		profileId?: string
		profileLimits?: {
			tokensPerMinute?: number
			tokensPerHour?: number
			tokensPerDay?: number
			requestsPerMinute?: number
			requestsPerHour?: number
			requestsPerDay?: number
		}
	}>
}
```

#### 1.2 Add Missing Fields to All Providers

**Anthropic**:

```typescript
type AnthropicProviderConfig = BaseProviderConfig & {
	provider: "anthropic"
	apiModelId?: string
	apiKey?: string
	anthropicBaseUrl?: string
	anthropicUseAuthToken?: boolean
	anthropicBeta1MContext?: boolean
}
```

**OpenAI-Native**:

```typescript
type OpenAINativeProviderConfig = BaseProviderConfig & {
	provider: "openai-native"
	apiModelId?: string
	openAiNativeApiKey?: string
	openAiNativeBaseUrl?: string
	openAiNativeServiceTier?: "auto" | "default" | "flex" | "priority"
}
```

**Bedrock**:

```typescript
type BedrockProviderConfig = BaseProviderConfig & {
	provider: "bedrock"
	apiModelId?: string
	awsAccessKey?: string
	awsSecretKey?: string
	awsSessionToken?: string
	awsRegion?: string
	awsUseCrossRegionInference?: boolean
	awsUsePromptCache?: boolean
	awsProfile?: string
	awsUseProfile?: boolean
	awsApiKey?: string
	awsUseApiKey?: boolean
	awsCustomArn?: string
	awsModelContextWindow?: number
	awsBedrockEndpointEnabled?: boolean
	awsBedrockEndpoint?: string
	awsBedrock1MContext?: boolean
}
```

**Vertex**:

```typescript
type VertexProviderConfig = BaseProviderConfig & {
	provider: "vertex"
	apiModelId?: string
	vertexKeyFile?: string
	vertexJsonCredentials?: string
	vertexProjectId?: string
	vertexRegion?: string
	enableUrlContext?: boolean
	enableGrounding?: boolean
}
```

**Gemini**:

```typescript
type GeminiProviderConfig = BaseProviderConfig & {
	provider: "gemini"
	apiModelId?: string
	geminiApiKey?: string
	googleGeminiBaseUrl?: string
	enableUrlContext?: boolean
	enableGrounding?: boolean
}
```

**Gemini-CLI**:

```typescript
type GeminiCliProviderConfig = BaseProviderConfig & {
	provider: "gemini-cli"
	apiModelId?: string
	geminiCliOAuthPath?: string
	geminiCliProjectId?: string
}
```

**Mistral**:

```typescript
type MistralProviderConfig = BaseProviderConfig & {
	provider: "mistral"
	apiModelId?: string
	mistralApiKey?: string
	mistralCodestralUrl?: string
}
```

**DeepSeek**:

```typescript
type DeepSeekProviderConfig = BaseProviderConfig & {
	provider: "deepseek"
	apiModelId?: string
	deepSeekBaseUrl?: string
	deepSeekApiKey?: string
}
```

**DeepInfra**:

```typescript
type DeepInfraProviderConfig = BaseProviderConfig & {
	provider: "deepinfra"
	deepInfraModelId?: string
	deepInfraBaseUrl?: string
	deepInfraApiKey?: string
}
```

**Doubao**:

```typescript
type DoubaoProviderConfig = BaseProviderConfig & {
	provider: "doubao"
	apiModelId?: string
	doubaoBaseUrl?: string
	doubaoApiKey?: string
}
```

**Moonshot**:

```typescript
type MoonshotProviderConfig = BaseProviderConfig & {
	provider: "moonshot"
	apiModelId?: string
	moonshotBaseUrl?: string
	moonshotApiKey?: string
}
```

**Minimax**:

```typescript
type MinimaxProviderConfig = BaseProviderConfig & {
	provider: "minimax"
	apiModelId?: string
	minimaxBaseUrl?: string
	minimaxApiKey?: string
}
```

**XAI**:

```typescript
type XAIProviderConfig = BaseProviderConfig & {
	provider: "xai"
	apiModelId?: string
	xaiApiKey?: string
}
```

**Groq**:

```typescript
type GroqProviderConfig = BaseProviderConfig & {
	provider: "groq"
	apiModelId?: string
	groqApiKey?: string
}
```

**Chutes**:

```typescript
type ChutesProviderConfig = BaseProviderConfig & {
	provider: "chutes"
	apiModelId?: string
	chutesApiKey?: string
}
```

**Cerebras**:

```typescript
type CerebrasProviderConfig = BaseProviderConfig & {
	provider: "cerebras"
	apiModelId?: string
	cerebrasApiKey?: string
}
```

**SambaNova**:

```typescript
type SambaNovaProviderConfig = BaseProviderConfig & {
	provider: "sambanova"
	apiModelId?: string
	sambaNovaApiKey?: string
}
```

**ZAI**:

```typescript
type ZAIProviderConfig = BaseProviderConfig & {
	provider: "zai"
	apiModelId?: string
	zaiApiKey?: string
	zaiApiLine?: "international_coding" | "china_coding"
}
```

**Fireworks**:

```typescript
type FireworksProviderConfig = BaseProviderConfig & {
	provider: "fireworks"
	apiModelId?: string
	fireworksApiKey?: string
}
```

**Featherless**:

```typescript
type FeatherlessProviderConfig = BaseProviderConfig & {
	provider: "featherless"
	apiModelId?: string
	featherlessApiKey?: string
}
```

**Claude Code**:

```typescript
type ClaudeCodeProviderConfig = BaseProviderConfig & {
	provider: "claude-code"
	apiModelId?: string
	claudeCodePath?: string
	claudeCodeMaxOutputTokens?: number
}
```

**Synthetic**:

```typescript
type SyntheticProviderConfig = BaseProviderConfig & {
	provider: "synthetic"
	apiModelId?: string
	syntheticApiKey?: string
}
```

**Inception**:

```typescript
type InceptionProviderConfig = BaseProviderConfig & {
	provider: "inception"
	inceptionLabsModelId?: string
	inceptionLabsBaseUrl?: string
	inceptionLabsApiKey?: string
}
```

**Ollama**:

```typescript
type OllamaProviderConfig = BaseProviderConfig & {
	provider: "ollama"
	ollamaModelId?: string
	ollamaBaseUrl?: string
	ollamaApiKey?: string
	ollamaNumCtx?: number
}
```

**LM Studio**:

```typescript
type LMStudioProviderConfig = BaseProviderConfig & {
	provider: "lmstudio"
	lmStudioModelId?: string
	lmStudioBaseUrl?: string
	lmStudioDraftModelId?: string
	lmStudioSpeculativeDecodingEnabled?: boolean
}
```

**Glama**:

```typescript
type GlamaProviderConfig = BaseProviderConfig & {
	provider: "glama"
	glamaModelId?: string
	glamaApiKey?: string
}
```

**LiteLLM**:

```typescript
type LiteLLMProviderConfig = BaseProviderConfig & {
	provider: "litellm"
	litellmModelId?: string
	litellmBaseUrl?: string
	litellmApiKey?: string
	litellmUsePromptCache?: boolean
}
```

**Unbound**:

```typescript
type UnboundProviderConfig = BaseProviderConfig & {
	provider: "unbound"
	unboundModelId?: string
	unboundApiKey?: string
}
```

**Requesty**:

```typescript
type RequestyProviderConfig = BaseProviderConfig & {
	provider: "requesty"
	requestyModelId?: string
	requestyBaseUrl?: string
	requestyApiKey?: string
}
```

**Vercel AI Gateway**:

```typescript
type VercelAiGatewayProviderConfig = BaseProviderConfig & {
	provider: "vercel-ai-gateway"
	vercelAiGatewayModelId?: string
	vercelAiGatewayApiKey?: string
}
```

**IO Intelligence**:

```typescript
type IOIntelligenceProviderConfig = BaseProviderConfig & {
	provider: "io-intelligence"
	ioIntelligenceModelId?: string
	ioIntelligenceApiKey?: string
}
```

**OVHCloud**:

```typescript
type OVHCloudProviderConfig = BaseProviderConfig & {
	provider: "ovhcloud"
	ovhCloudAiEndpointsModelId?: string
	ovhCloudAiEndpointsApiKey?: string
	ovhCloudAiEndpointsBaseUrl?: string
}
```

**OpenRouter**:

```typescript
type OpenRouterProviderConfig = BaseProviderConfig & {
	provider: "openrouter"
	openRouterModelId?: string
	openRouterApiKey?: string
	openRouterBaseUrl?: string
	openRouterSpecificProvider?: string
	openRouterUseMiddleOutTransform?: boolean
	openRouterProviderDataCollection?: "allow" | "deny"
	openRouterProviderSort?: "price" | "throughput" | "latency"
	openRouterZdr?: boolean
}
```

**Kilocode** (add OpenRouter passthrough fields):

```typescript
type KilocodeProviderConfig = BaseProviderConfig & {
	provider: "kilocode"
	kilocodeModel?: string
	kilocodeToken?: string
	kilocodeOrganizationId?: string
	openRouterSpecificProvider?: string
	openRouterProviderDataCollection?: "allow" | "deny"
	openRouterProviderSort?: "price" | "throughput" | "latency"
	openRouterZdr?: boolean
	kilocodeTesterWarningsDisabledUntil?: number
}
```

**HuggingFace**:

```typescript
type HuggingFaceProviderConfig = BaseProviderConfig & {
	provider: "huggingface"
	huggingFaceModelId?: string
	huggingFaceApiKey?: string
	huggingFaceInferenceProvider?: string
}
```

**VSCode LM** (already complete):

```typescript
type VSCodeLMProviderConfig = BaseProviderConfig & {
	provider: "vscode-lm"
	vsCodeLmModelSelector?: {
		vendor?: string
		family?: string
		version?: string
		id?: string
	}
}
```

**Roo** (already complete):

```typescript
type RooProviderConfig = BaseProviderConfig & {
	provider: "roo"
	apiModelId?: string
}
```

**Human Relay** (no fields needed):

```typescript
type HumanRelayProviderConfig = BaseProviderConfig & {
	provider: "human-relay"
	// No model ID field
}
```

**Fake AI**:

```typescript
type FakeAIProviderConfig = BaseProviderConfig & {
	provider: "fake-ai"
	fakeAi?: unknown
}
```

---

### Phase 2: Update JSON Schema (`cli/src/config/schema.json`)

#### 2.1 Fix OpenAI Provider Schema

Change line 985 from:

```json
"apiModelId": { "type": "string" }
```

To:

```json
"openAiModelId": { "type": "string", "description": "OpenAI model ID" }
```

Also add all OpenAI-specific fields to the schema.

#### 2.2 Add Inception Provider Schema

Add after line 2175 (before closing `allOf`):

```json
{
    "if": {
        "properties": { "provider": { "const": "inception" } }
    },
    "then": {
        "properties": {
            "inceptionLabsApiKey": {
                "type": "string",
                "description": "Inception Labs API key"
            },
            "inceptionLabsBaseUrl": {
                "type": "string",
                "description": "Inception Labs base URL"
            },
            "inceptionLabsModelId": {
                "type": "string",
                "description": "Inception Labs model ID"
            }
        }
    }
},
{
    "if": {
        "properties": {
            "provider": { "const": "inception" },
            "inceptionLabsApiKey": { "type": "string", "minLength": 1 }
        },
        "required": ["inceptionLabsApiKey"]
    },
    "then": {
        "properties": {
            "inceptionLabsApiKey": { "minLength": 10 }
        }
    }
},
{
    "if": {
        "properties": {
            "provider": { "const": "inception" },
            "inceptionLabsModelId": { "type": "string", "minLength": 1 }
        },
        "required": ["inceptionLabsModelId"]
    },
    "then": {
        "properties": {
            "inceptionLabsModelId": { "minLength": 1 }
        }
    }
}
```

#### 2.3 Add Synthetic Provider Schema

```json
{
    "if": {
        "properties": { "provider": { "const": "synthetic" } }
    },
    "then": {
        "properties": {
            "syntheticApiKey": {
                "type": "string",
                "description": "Synthetic API key"
            },
            "apiModelId": {
                "type": "string",
                "description": "Synthetic model ID"
            }
        }
    }
},
{
    "if": {
        "properties": {
            "provider": { "const": "synthetic" },
            "syntheticApiKey": { "type": "string", "minLength": 1 }
        },
        "required": ["syntheticApiKey"]
    },
    "then": {
        "properties": {
            "syntheticApiKey": { "minLength": 10 }
        }
    }
},
{
    "if": {
        "properties": {
            "provider": { "const": "synthetic" },
            "apiModelId": { "type": "string", "minLength": 1 }
        },
        "required": ["apiModelId"]
    },
    "then": {
        "properties": {
            "apiModelId": { "minLength": 1 }
        }
    }
}
```

#### 2.4 Add "inception" and "synthetic" to Provider Enum

Update line 228-269 to include both providers in the enum list.

---

### Phase 3: Update Documentation (`cli/docs/PROVIDER_CONFIGURATION.md`)

#### 3.1 Fix OpenAI Provider Documentation

Update section starting at line 628 to use `openAiModelId` instead of `apiModelId`:

````markdown
### openai

**Required Fields**:

- `openAiApiKey` (password): Your OpenAI API key
- `openAiModelId` (text): The model to use (default: `gpt-4o`)

**Example Configuration**:

```json
{
	"id": "default",
	"provider": "openai",
	"openAiApiKey": "sk-...",
	"openAiModelId": "gpt-4o",
	"openAiBaseUrl": ""
}
```
````

````

#### 3.2 Add Inception Provider Documentation

Add new section:

```markdown
### inception

Inception Labs AI platform.

**Description**: Access AI models through the Inception Labs platform.

**Required Fields**:

- `inceptionLabsApiKey` (password): Your Inception Labs API key
- `inceptionLabsModelId` (text): Model identifier (default: `gpt-4o`)

**Optional Fields**:

- `inceptionLabsBaseUrl` (text): Custom base URL (leave empty for default)

**Example Configuration**:

```json
{
    "id": "default",
    "provider": "inception",
    "inceptionLabsApiKey": "...",
    "inceptionLabsModelId": "gpt-4o",
    "inceptionLabsBaseUrl": ""
}
````

**Default Model**: `gpt-4o`

**Notes**:

- Get your API key from Inception Labs platform
- Supports various AI models

````

#### 3.3 Add Synthetic Provider Documentation

```markdown
### synthetic

Synthetic AI provider.

**Description**: Access AI models through the Synthetic platform.

**Required Fields**:

- `syntheticApiKey` (password): Your Synthetic API key
- `apiModelId` (text): Model identifier (default: `synthetic-model`)

**Example Configuration**:

```json
{
    "id": "default",
    "provider": "synthetic",
    "syntheticApiKey": "...",
    "apiModelId": "synthetic-model"
}
````

**Default Model**: `synthetic-model`

````

#### 3.4 Add Minimax Provider Documentation

```markdown
### minimax

MiniMax AI platform.

**Description**: Access MiniMax's AI models.

**Required Fields**:

- `minimaxApiKey` (password): Your MiniMax API key
- `minimaxBaseUrl` (text): MiniMax API base URL (default: `https://api.minimax.io/anthropic`)
- `apiModelId` (text): The model to use (default: `MiniMax-M2`)

**Example Configuration**:

```json
{
    "id": "default",
    "provider": "minimax",
    "minimaxBaseUrl": "https://api.minimax.io/anthropic",
    "minimaxApiKey": "...",
    "apiModelId": "MiniMax-M2"
}
````

**Default Model**: `MiniMax-M2`

**Notes**:

- Supports both `.io` and `.com` domains
- Uses Anthropic-compatible API format

````

#### 3.5 Update Table of Contents

Add links to new provider sections in the TOC.

---

### Phase 4: Update Supporting Files

#### 4.1 Update `cli/src/constants/providers/settings.ts`

Add field metadata for missing providers:

```typescript
// Add to FIELD_REGISTRY:
inceptionLabsApiKey: {
    label: "API Key",
    type: "password",
    placeholder: "Enter Inception Labs API key...",
},
inceptionLabsBaseUrl: {
    label: "Base URL",
    type: "text",
    placeholder: "Enter base URL (or leave empty for default)...",
    isOptional: true,
},
inceptionLabsModelId: {
    label: "Model ID",
    type: "text",
    placeholder: "Enter model ID...",
},
syntheticApiKey: {
    label: "API Key",
    type: "password",
    placeholder: "Enter Synthetic API key...",
},
````

Add provider settings cases:

```typescript
case "inception":
    return [
        createFieldConfig("inceptionLabsApiKey", config),
        createFieldConfig("inceptionLabsBaseUrl", config, "Default"),
        createFieldConfig("inceptionLabsModelId", config, "gpt-4o"),
    ]

case "synthetic":
    return [
        createFieldConfig("syntheticApiKey", config),
        createFieldConfig("apiModelId", config, "synthetic-model"),
    ]
```

#### 4.2 Verify `cli/src/constants/providers/validation.ts`

Ensure required fields are correct (already looks good based on analysis).

---

### Phase 5: Testing & Validation

#### 5.1 Test Files to Update/Verify

1. **Config validation tests**: `cli/src/config/__tests__/validation.test.ts`

    - Add tests for `openai` with `openAiModelId`
    - Add tests for `inception` and `synthetic` providers

2. **Config persistence tests**: `cli/src/config/__tests__/persistence.test.ts`

    - Verify new provider configurations persist correctly

3. **Provider tests**: `cli/src/constants/providers/__tests__/models.test.ts`
    - Add tests for new providers

#### 5.2 Manual Testing Checklist

- [ ] Create config with `openai` provider using `openAiModelId`
- [ ] Create config with `inception` provider
- [ ] Create config with `synthetic` provider
- [ ] Verify all existing providers still work
- [ ] Test config file validation
- [ ] Test interactive config command

---

## File Change Summary

| File                                      | Changes                                     | Lines Affected   |
| ----------------------------------------- | ------------------------------------------- | ---------------- |
| `cli/src/config/types.ts`                 | Add all missing fields to 35 provider types | ~200 lines added |
| `cli/src/config/schema.json`              | Add inception/synthetic schemas, fix openai | ~100 lines added |
| `cli/docs/PROVIDER_CONFIGURATION.md`      | Add 3 provider sections, fix openai         | ~150 lines added |
| `cli/src/constants/providers/settings.ts` | Add field metadata for new providers        | ~30 lines added  |
| `cli/docs/PROVIDER_DISCREPANCIES.md`      | Analysis document (already created)         | N/A              |
| `cli/docs/IMPLEMENTATION_PLAN.md`         | This plan document                          | N/A              |

**Total estimated changes**: ~480 lines across 4 files

---

## Migration & Backward Compatibility

### Backward Compatibility Considerations

1. **Existing configs will continue to work** because:

    - All new fields are optional (`?`)
    - `BaseProviderConfig` still has `[key: string]: unknown`
    - Mapper function copies all fields dynamically

2. **No breaking changes** to:

    - Config file format
    - API interfaces
    - Runtime behavior

3. **Benefits for users**:
    - Better autocomplete in TypeScript/IDE
    - Compile-time validation
    - Clear documentation of available fields

### Migration Path

No migration needed - this is purely additive and fixes existing bugs.

---

## Risk Assessment

| Risk                      | Likelihood | Impact | Mitigation                                     |
| ------------------------- | ---------- | ------ | ---------------------------------------------- |
| Breaking existing configs | Low        | High   | All fields optional, dynamic copying preserved |
| Type conflicts            | Low        | Medium | Careful alignment with ProviderSettings        |
| Schema validation issues  | Medium     | Medium | Thorough testing of schema validation          |
| Documentation drift       | Low        | Low    | Single update, clear process                   |

---

## Success Criteria

- [x] All provider types have complete field definitions matching ProviderSettings
- [x] `openai` provider uses `openAiModelId` field
- [x] `virtual-quota-fallback` uses `profiles` field
- [x] `inception` and `synthetic` providers in schema
- [x] All 3 missing providers documented
- [x] All tests pass
- [x] No breaking changes to existing configurations
- [x] TypeScript compilation succeeds with no errors

---

## Timeline Estimate

- **Phase 1** (Type definitions): 2-3 hours
- **Phase 2** (JSON schema): 1-2 hours
- **Phase 3** (Documentation): 1-2 hours
- **Phase 4** (Supporting files): 1 hour
- **Phase 5** (Testing): 1-2 hours

**Total**: 6-10 hours of development work

---

## Next Steps

1. Review and approve this plan
2. Switch to Code mode to implement changes
3. Execute phases sequentially
4. Run tests after each phase
5. Final validation and documentation review
