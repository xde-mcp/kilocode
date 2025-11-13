import type { ThemeId, Theme } from "../types/theme.js"

/**
 * Auto approval configuration for read operations
 */
export interface AutoApprovalReadConfig {
	enabled?: boolean
	outside?: boolean
}

/**
 * Auto approval configuration for write operations
 */
export interface AutoApprovalWriteConfig {
	enabled?: boolean
	outside?: boolean
	protected?: boolean
}

/**
 * Auto approval configuration for browser operations
 */
export interface AutoApprovalBrowserConfig {
	enabled?: boolean
}

/**
 * Auto approval configuration for retry operations
 */
export interface AutoApprovalRetryConfig {
	enabled?: boolean
	delay?: number
}

/**
 * Auto approval configuration for MCP operations
 */
export interface AutoApprovalMcpConfig {
	enabled?: boolean
}

/**
 * Auto approval configuration for mode switching
 */
export interface AutoApprovalModeConfig {
	enabled?: boolean
}

/**
 * Auto approval configuration for subtasks
 */
export interface AutoApprovalSubtasksConfig {
	enabled?: boolean
}

/**
 * Auto approval configuration for command execution
 */
export interface AutoApprovalExecuteConfig {
	enabled?: boolean
	allowed?: string[]
	denied?: string[]
}

/**
 * Auto approval configuration for followup questions
 */
export interface AutoApprovalQuestionConfig {
	enabled?: boolean
	timeout?: number
}

/**
 * Auto approval configuration for todo list updates
 */
export interface AutoApprovalTodoConfig {
	enabled?: boolean
}

/**
 * Complete auto approval configuration
 */
export interface AutoApprovalConfig {
	enabled?: boolean
	read?: AutoApprovalReadConfig
	write?: AutoApprovalWriteConfig
	browser?: AutoApprovalBrowserConfig
	retry?: AutoApprovalRetryConfig
	mcp?: AutoApprovalMcpConfig
	mode?: AutoApprovalModeConfig
	subtasks?: AutoApprovalSubtasksConfig
	execute?: AutoApprovalExecuteConfig
	question?: AutoApprovalQuestionConfig
	todo?: AutoApprovalTodoConfig
}

export interface CLIConfig {
	version: "1.0.0"
	mode: string
	telemetry: boolean
	provider: string
	providers: ProviderConfig[]
	autoApproval?: AutoApprovalConfig
	theme?: ThemeId
	customThemes?: Record<string, Theme>
}

// Base provider config with common fields
interface BaseProviderConfig {
	id: string
	[key: string]: unknown // Allow additional fields for flexibility
}

// Provider-specific configurations with discriminated unions
type KilocodeProviderConfig = BaseProviderConfig & {
	provider: "kilocode"
	kilocodeModel?: string
	kilocodeToken?: string
	kilocodeOrganizationId?: string
}

type AnthropicProviderConfig = BaseProviderConfig & {
	provider: "anthropic"
	apiModelId?: string
}

type OpenAINativeProviderConfig = BaseProviderConfig & {
	provider: "openai-native"
	apiModelId?: string
}

type OpenAIProviderConfig = BaseProviderConfig & {
	provider: "openai"
	apiModelId?: string
}

type OpenRouterProviderConfig = BaseProviderConfig & {
	provider: "openrouter"
	openRouterModelId?: string
}

type OllamaProviderConfig = BaseProviderConfig & {
	provider: "ollama"
	ollamaModelId?: string
}

type LMStudioProviderConfig = BaseProviderConfig & {
	provider: "lmstudio"
	lmStudioModelId?: string
}

type GlamaProviderConfig = BaseProviderConfig & {
	provider: "glama"
	glamaModelId?: string
}

type LiteLLMProviderConfig = BaseProviderConfig & {
	provider: "litellm"
	litellmModelId?: string
}

type DeepInfraProviderConfig = BaseProviderConfig & {
	provider: "deepinfra"
	deepInfraModelId?: string
}

type UnboundProviderConfig = BaseProviderConfig & {
	provider: "unbound"
	unboundModelId?: string
}

type RequestyProviderConfig = BaseProviderConfig & {
	provider: "requesty"
	requestyModelId?: string
}

type VercelAiGatewayProviderConfig = BaseProviderConfig & {
	provider: "vercel-ai-gateway"
	vercelAiGatewayModelId?: string
}

type IOIntelligenceProviderConfig = BaseProviderConfig & {
	provider: "io-intelligence"
	ioIntelligenceModelId?: string
}

type OVHCloudProviderConfig = BaseProviderConfig & {
	provider: "ovhcloud"
	ovhCloudAiEndpointsModelId?: string
}

type InceptionProviderConfig = BaseProviderConfig & {
	provider: "inception"
	inceptionLabsModelId?: string
}

type BedrockProviderConfig = BaseProviderConfig & {
	provider: "bedrock"
	apiModelId?: string
}

type VertexProviderConfig = BaseProviderConfig & {
	provider: "vertex"
	apiModelId?: string
}

type GeminiProviderConfig = BaseProviderConfig & {
	provider: "gemini"
	apiModelId?: string
}

type GeminiCliProviderConfig = BaseProviderConfig & {
	provider: "gemini-cli"
	apiModelId?: string
}

type MistralProviderConfig = BaseProviderConfig & {
	provider: "mistral"
	apiModelId?: string
}

type MoonshotProviderConfig = BaseProviderConfig & {
	provider: "moonshot"
	apiModelId?: string
}

type MinimaxProviderConfig = BaseProviderConfig & {
	provider: "minimax"
	apiModelId?: string
}

type DeepSeekProviderConfig = BaseProviderConfig & {
	provider: "deepseek"
	apiModelId?: string
}

type DoubaoProviderConfig = BaseProviderConfig & {
	provider: "doubao"
	apiModelId?: string
}

type QwenCodeProviderConfig = BaseProviderConfig & {
	provider: "qwen-code"
	apiModelId?: string
}

type XAIProviderConfig = BaseProviderConfig & {
	provider: "xai"
	apiModelId?: string
}

type GroqProviderConfig = BaseProviderConfig & {
	provider: "groq"
	apiModelId?: string
}

type ChutesProviderConfig = BaseProviderConfig & {
	provider: "chutes"
	apiModelId?: string
}

type CerebrasProviderConfig = BaseProviderConfig & {
	provider: "cerebras"
	apiModelId?: string
}

type SambaNovaProviderConfig = BaseProviderConfig & {
	provider: "sambanova"
	apiModelId?: string
}

type ZAIProviderConfig = BaseProviderConfig & {
	provider: "zai"
	apiModelId?: string
}

type FireworksProviderConfig = BaseProviderConfig & {
	provider: "fireworks"
	apiModelId?: string
}

type FeatherlessProviderConfig = BaseProviderConfig & {
	provider: "featherless"
	apiModelId?: string
}

type RooProviderConfig = BaseProviderConfig & {
	provider: "roo"
	apiModelId?: string
}

type ClaudeCodeProviderConfig = BaseProviderConfig & {
	provider: "claude-code"
	apiModelId?: string
}

type VSCodeLMProviderConfig = BaseProviderConfig & {
	provider: "vscode-lm"
	vsCodeLmModelSelector?: {
		vendor?: string
		family?: string
		version?: string
		id?: string
	}
}

type HuggingFaceProviderConfig = BaseProviderConfig & {
	provider: "huggingface"
	huggingFaceModelId?: string
}

type SyntheticProviderConfig = BaseProviderConfig & {
	provider: "synthetic"
	apiModelId?: string
}

type VirtualQuotaFallbackProviderConfig = BaseProviderConfig & {
	provider: "virtual-quota-fallback"
	apiModelId?: string
}

type HumanRelayProviderConfig = BaseProviderConfig & {
	provider: "human-relay"
	// No model ID field
}

type FakeAIProviderConfig = BaseProviderConfig & {
	provider: "fake-ai"
	// No model ID field
}

// Discriminated union of all provider configs
export type ProviderConfig =
	| KilocodeProviderConfig
	| AnthropicProviderConfig
	| OpenAINativeProviderConfig
	| OpenAIProviderConfig
	| OpenRouterProviderConfig
	| OllamaProviderConfig
	| LMStudioProviderConfig
	| GlamaProviderConfig
	| LiteLLMProviderConfig
	| DeepInfraProviderConfig
	| UnboundProviderConfig
	| RequestyProviderConfig
	| VercelAiGatewayProviderConfig
	| IOIntelligenceProviderConfig
	| OVHCloudProviderConfig
	| InceptionProviderConfig
	| BedrockProviderConfig
	| VertexProviderConfig
	| GeminiProviderConfig
	| GeminiCliProviderConfig
	| MistralProviderConfig
	| MoonshotProviderConfig
	| MinimaxProviderConfig
	| DeepSeekProviderConfig
	| DoubaoProviderConfig
	| QwenCodeProviderConfig
	| XAIProviderConfig
	| GroqProviderConfig
	| ChutesProviderConfig
	| CerebrasProviderConfig
	| SambaNovaProviderConfig
	| ZAIProviderConfig
	| FireworksProviderConfig
	| FeatherlessProviderConfig
	| RooProviderConfig
	| ClaudeCodeProviderConfig
	| VSCodeLMProviderConfig
	| HuggingFaceProviderConfig
	| SyntheticProviderConfig
	| VirtualQuotaFallbackProviderConfig
	| HumanRelayProviderConfig
	| FakeAIProviderConfig

// Type guards
export function isValidConfig(config: unknown): config is CLIConfig {
	return (
		typeof config === "object" &&
		config !== null &&
		"version" in config &&
		"provider" in config &&
		"providers" in config
	)
}

export function isProviderConfig(provider: unknown): provider is ProviderConfig {
	return typeof provider === "object" && provider !== null && "id" in provider && "provider" in provider
}
