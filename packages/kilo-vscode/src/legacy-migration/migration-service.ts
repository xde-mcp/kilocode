/**
 * legacy-migration - Core migration service.
 *
 * Reads legacy Kilo Code v5.x data from VS Code SecretStorage and the extension's
 * global storage directory, then writes it to the new CLI backend via the SDK.
 */

import * as vscode from "vscode"
import type { KiloClient } from "@kilocode/sdk/v2/client"
import type { McpLocalConfig, McpRemoteConfig, AgentConfig } from "@kilocode/sdk/v2/client"
import { PROVIDER_MAP, UNSUPPORTED_PROVIDERS, DEFAULT_MODE_SLUGS } from "./provider-mapping"
import type {
  LegacyProviderProfiles,
  LegacyProviderSettings,
  LegacyMcpSettings,
  LegacyCustomMode,
  LegacyMcpServer,
  LegacyMigrationData,
  MigrationSelections,
  MigrationProviderInfo,
  MigrationMcpServerInfo,
  MigrationCustomModeInfo,
  MigrationResultItem,
} from "./legacy-types"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SECRET_KEY = "roo_cline_config_api_config"
const MIGRATION_STATUS_KEY = "kilo.legacyMigrationStatus"

type MigrationStatus = "completed" | "skipped"

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

export function getMigrationStatus(context: vscode.ExtensionContext): MigrationStatus | undefined {
  return context.globalState.get<MigrationStatus>(MIGRATION_STATUS_KEY)
}

export async function setMigrationStatus(context: vscode.ExtensionContext, status: MigrationStatus): Promise<void> {
  await context.globalState.update(MIGRATION_STATUS_KEY, status)
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Reads legacy data from SecretStorage and global storage files.
 * Returns a structured summary for display in the migration wizard.
 */
export async function detectLegacyData(context: vscode.ExtensionContext): Promise<LegacyMigrationData> {
  const profiles = await readLegacyProviderProfiles(context)
  const mcpSettings = await readLegacyMcpSettings(context)
  const customModes = await readLegacyCustomModes(context)

  const providers = buildProviderList(profiles)
  const mcpServers = buildMcpServerList(mcpSettings)
  const modes = buildCustomModeList(customModes)
  const defaultModel = resolveDefaultModel(profiles)

  const hasData = providers.length > 0 || mcpServers.length > 0 || modes.length > 0

  return { providers, mcpServers, customModes: modes, defaultModel, hasData }
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

export type ProgressCallback = (
  item: string,
  status: "migrating" | "success" | "warning" | "error",
  message?: string,
) => void

/**
 * Executes migration for the selected items.
 * Calls onProgress for each item with real-time status updates.
 */
export async function migrate(
  context: vscode.ExtensionContext,
  client: KiloClient,
  selections: MigrationSelections,
  onProgress: ProgressCallback,
): Promise<MigrationResultItem[]> {
  const profiles = await readLegacyProviderProfiles(context)
  const mcpSettings = await readLegacyMcpSettings(context)
  const customModes = await readLegacyCustomModes(context)

  const results: MigrationResultItem[] = []

  // Migrate provider API keys
  for (const profileName of selections.providers) {
    const settings = profiles?.apiConfigs[profileName]
    if (!settings) {
      results.push({ item: profileName, category: "provider", status: "error", message: "Profile not found" })
      continue
    }
    onProgress(profileName, "migrating")
    const result = await migrateProvider(profileName, settings, client)
    results.push(result)
    onProgress(profileName, result.status, result.message)
  }

  // Migrate MCP servers
  if (selections.mcpServers.length > 0 && mcpSettings) {
    const mcpConfig: Record<string, McpLocalConfig | McpRemoteConfig> = {}
    for (const name of selections.mcpServers) {
      const server = mcpSettings.mcpServers[name]
      if (!server) {
        results.push({ item: name, category: "mcpServer", status: "error", message: "Server not found" })
        continue
      }
      onProgress(name, "migrating")
      const converted = convertMcpServer(server)
      if (converted) {
        mcpConfig[name] = converted
        results.push({ item: name, category: "mcpServer", status: "success" })
        onProgress(name, "success")
      } else {
        results.push({
          item: name,
          category: "mcpServer",
          status: "warning",
          message: "Could not convert server config",
        })
        onProgress(name, "warning", "Could not convert server config")
      }
    }
    if (Object.keys(mcpConfig).length > 0) {
      await client.global.config.update({ config: { mcp: mcpConfig } })
    }
  }

  // Migrate custom modes as agents
  if (selections.customModes.length > 0 && customModes) {
    const agentConfig: Record<string, AgentConfig> = {}
    for (const slug of selections.customModes) {
      const mode = customModes.find((m) => m.slug === slug)
      if (!mode) {
        results.push({ item: slug, category: "customMode", status: "error", message: "Mode not found" })
        continue
      }
      onProgress(mode.name, "migrating")
      agentConfig[slug] = convertCustomMode(mode)
      results.push({ item: mode.name, category: "customMode", status: "success" })
      onProgress(mode.name, "success")
    }
    if (Object.keys(agentConfig).length > 0) {
      await client.global.config.update({ config: { agent: agentConfig } })
    }
  }

  // Migrate default model
  if (selections.defaultModel && profiles) {
    const activeName = profiles.currentApiConfigName
    const active = profiles.apiConfigs[activeName]
    if (active) {
      onProgress("Default model", "migrating")
      const result = await migrateDefaultModel(active, client)
      results.push(result)
      onProgress("Default model", result.status, result.message)
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Removes legacy data from SecretStorage and relevant globalState keys.
 */
export async function clearLegacyData(context: vscode.ExtensionContext): Promise<void> {
  await context.secrets.delete(SECRET_KEY)

  const legacyStateKeys = [
    "kilo-code.allowedCommands",
    "kilo-code.deniedCommands",
    "kilo-code.autoApprovalEnabled",
    "kilo-code.fuzzyMatchThreshold",
    "kilo-code.diffEnabled",
    "kilo-code.language",
    "kilo-code.customModes",
    "kilo-code.firstInstallCompleted",
    "kilo-code.telemetrySetting",
  ]
  for (const key of legacyStateKeys) {
    await context.globalState.update(key, undefined)
  }
}

// ---------------------------------------------------------------------------
// Internal — provider migration
// ---------------------------------------------------------------------------

async function migrateProvider(
  profileName: string,
  settings: LegacyProviderSettings,
  client: KiloClient,
): Promise<MigrationResultItem> {
  const provider = settings.apiProvider
  if (!provider) {
    return { item: profileName, category: "provider", status: "error", message: "No provider type found" }
  }

  if (UNSUPPORTED_PROVIDERS.has(provider)) {
    return {
      item: profileName,
      category: "provider",
      status: "warning",
      message: `Provider "${provider}" is not supported in the new version`,
    }
  }

  const mapping = PROVIDER_MAP[provider]
  if (!mapping) {
    return {
      item: profileName,
      category: "provider",
      status: "warning",
      message: `Unknown provider "${provider}"`,
    }
  }

  const apiKey = settings[mapping.key] as string | undefined
  if (!apiKey) {
    return { item: profileName, category: "provider", status: "warning", message: "No API key found in profile" }
  }

  await client.auth.set({ providerID: mapping.id, auth: { type: "api", key: apiKey } })

  // If a custom base URL is configured, also persist it to the backend config
  if (mapping.urlField) {
    const url = settings[mapping.urlField] as string | undefined
    if (url) {
      await client.global.config.update({
        config: { provider: { [mapping.id]: { options: { apiKey, baseURL: url } } } },
      })
    }
  }

  return { item: profileName, category: "provider", status: "success" }
}

async function migrateDefaultModel(settings: LegacyProviderSettings, client: KiloClient): Promise<MigrationResultItem> {
  const provider = settings.apiProvider
  if (!provider) {
    return { item: "Default model", category: "defaultModel", status: "error", message: "No provider type found" }
  }

  const mapping = PROVIDER_MAP[provider]
  if (!mapping) {
    return {
      item: "Default model",
      category: "defaultModel",
      status: "warning",
      message: `Provider "${provider}" is not supported in the new version`,
    }
  }

  const modelField = mapping.modelField ?? "apiModelId"
  const modelId = settings[modelField] as string | undefined
  if (!modelId) {
    return { item: "Default model", category: "defaultModel", status: "warning", message: "No model ID found" }
  }

  await client.global.config.update({ config: { model: `${mapping.id}/${modelId}` } })
  return { item: "Default model", category: "defaultModel", status: "success" }
}

// ---------------------------------------------------------------------------
// Internal — MCP conversion (legacy → McpServerConfig)
// ---------------------------------------------------------------------------

function convertMcpServer(server: LegacyMcpServer): McpLocalConfig | McpRemoteConfig | null {
  if (server.type === "sse" || server.type === "streamable-http") {
    if (!server.url) return null
    return { type: "remote", url: server.url, headers: server.headers }
  }
  // Default: stdio
  if (!server.command) return null
  const command = server.args ? [server.command, ...server.args] : [server.command]
  return {
    type: "local",
    command,
    environment: server.env,
  }
}

// ---------------------------------------------------------------------------
// Internal — custom mode conversion (legacy → AgentConfig)
// ---------------------------------------------------------------------------

function convertCustomMode(mode: LegacyCustomMode): AgentConfig {
  const prompt = [mode.roleDefinition, mode.customInstructions].filter(Boolean).join("\n\n")
  return { prompt }
}

// ---------------------------------------------------------------------------
// Internal — reading legacy data from storage
// ---------------------------------------------------------------------------

async function readLegacyProviderProfiles(context: vscode.ExtensionContext): Promise<LegacyProviderProfiles | null> {
  const raw = await context.secrets.get(SECRET_KEY)
  if (!raw) return null
  const parsed = JSON.parse(raw) as Record<string, unknown>
  if (!parsed.apiConfigs || typeof parsed.apiConfigs !== "object") return null
  return parsed as unknown as LegacyProviderProfiles
}

async function readLegacyMcpSettings(context: vscode.ExtensionContext): Promise<LegacyMcpSettings | null> {
  const filePath = vscode.Uri.joinPath(context.globalStorageUri, "settings", "mcp_settings.json")
  const bytes = await vscode.workspace.fs.readFile(filePath).then(
    (b) => b,
    () => null,
  )
  if (!bytes) return null
  const parsed = JSON.parse(Buffer.from(bytes).toString("utf8")) as Record<string, unknown>
  if (!parsed.mcpServers || typeof parsed.mcpServers !== "object") return null
  return parsed as unknown as LegacyMcpSettings
}

async function readLegacyCustomModes(context: vscode.ExtensionContext): Promise<LegacyCustomMode[] | null> {
  const filePath = vscode.Uri.joinPath(context.globalStorageUri, "settings", "custom_modes.yaml")
  const bytes = await vscode.workspace.fs.readFile(filePath).then(
    (b) => b,
    () => null,
  )
  if (!bytes) return null
  const text = Buffer.from(bytes).toString("utf8")
  return parseCustomModesYaml(text)
}

/**
 * Minimal YAML parser for the custom_modes.yaml format.
 * Tries JSON first (some legacy versions stored JSON), then parses the simple
 * YAML structure manually to avoid a runtime dependency on a YAML library.
 */
function parseCustomModesYaml(text: string): LegacyCustomMode[] | null {
  // Try JSON first
  const jsonResult = (() => {
    try {
      const parsed = JSON.parse(text) as { customModes?: LegacyCustomMode[] }
      return parsed.customModes ?? null
    } catch {
      return null
    }
  })()
  if (jsonResult) return jsonResult

  // Parse the simple YAML shape:
  //   customModes:
  //     - slug: xxx
  //       name: xxx
  //       roleDefinition: |
  //         ...
  //       groups:
  //         - read
  const modes: LegacyCustomMode[] = []
  const lines = text.split("\n")
  let inModes = false
  let current: Partial<LegacyCustomMode> | null = null
  let inRoleDefinition = false
  let inGroups = false
  let roleLines: string[] = []

  const flush = () => {
    if (current?.slug && current?.name) {
      if (!current.roleDefinition && roleLines.length > 0) {
        current.roleDefinition = roleLines.join("\n").trim()
      }
      modes.push({ groups: [], ...current } as LegacyCustomMode)
    }
    current = null
    inRoleDefinition = false
    inGroups = false
    roleLines = []
  }

  for (const rawLine of lines) {
    if (!inModes) {
      if (rawLine.trim() === "customModes:") inModes = true
      continue
    }

    if (/^  - slug: /.test(rawLine)) {
      flush()
      current = { slug: rawLine.replace(/^  - slug: /, "").trim(), groups: [] }
      continue
    }

    if (!current) continue

    if (/^    name: /.test(rawLine)) {
      current.name = rawLine.replace(/^    name: /, "").trim()
      continue
    }

    if (/^    roleDefinition: [|>]/.test(rawLine)) {
      inRoleDefinition = true
      inGroups = false
      roleLines = []
      continue
    }

    if (/^    roleDefinition: /.test(rawLine) && !inRoleDefinition) {
      current.roleDefinition = rawLine.replace(/^    roleDefinition: /, "").trim()
      continue
    }

    if (inRoleDefinition) {
      if (/^      /.test(rawLine)) {
        roleLines.push(rawLine.replace(/^      /, ""))
        continue
      }
      current.roleDefinition = roleLines.join("\n").trim()
      inRoleDefinition = false
      roleLines = []
    }

    if (/^    customInstructions: /.test(rawLine)) {
      current.customInstructions = rawLine.replace(/^    customInstructions: /, "").trim()
      continue
    }

    if (/^    groups:/.test(rawLine)) {
      inGroups = true
      current.groups = []
      continue
    }

    if (inGroups && /^      - /.test(rawLine)) {
      const group = rawLine.replace(/^      - /, "").trim()
      current.groups = [...(current.groups ?? []), group]
      continue
    }

    if (inGroups && !/^      /.test(rawLine)) {
      inGroups = false
    }
  }

  flush()
  return modes.length > 0 ? modes : null
}

// ---------------------------------------------------------------------------
// Internal — building display lists for the wizard
// ---------------------------------------------------------------------------

function buildProviderList(profiles: LegacyProviderProfiles | null): MigrationProviderInfo[] {
  if (!profiles?.apiConfigs) return []

  return Object.entries(profiles.apiConfigs).map(([profileName, settings]) => {
    const provider = settings.apiProvider ?? "unknown"
    const mapping = PROVIDER_MAP[provider]
    const unsupported = UNSUPPORTED_PROVIDERS.has(provider)

    const modelField = mapping?.modelField ?? "apiModelId"
    const model = settings[modelField] as string | undefined

    const hasApiKey = mapping ? Boolean(settings[mapping.key]) : false

    return {
      profileName,
      provider,
      model,
      hasApiKey,
      supported: Boolean(mapping) && !unsupported,
      newProviderName: mapping?.name,
    }
  })
}

function buildMcpServerList(settings: LegacyMcpSettings | null): MigrationMcpServerInfo[] {
  if (!settings?.mcpServers) return []
  return Object.entries(settings.mcpServers)
    .filter(([, server]) => !server.disabled)
    .map(([name, server]) => ({ name, type: server.type ?? "stdio" }))
}

function buildCustomModeList(modes: LegacyCustomMode[] | null): MigrationCustomModeInfo[] {
  if (!modes) return []
  return modes.filter((m) => !DEFAULT_MODE_SLUGS.has(m.slug)).map((m) => ({ name: m.name, slug: m.slug }))
}

function resolveDefaultModel(profiles: LegacyProviderProfiles | null): { provider: string; model: string } | undefined {
  if (!profiles?.currentApiConfigName) return undefined
  const active = profiles.apiConfigs[profiles.currentApiConfigName]
  if (!active?.apiProvider) return undefined
  const mapping = PROVIDER_MAP[active.apiProvider]
  if (!mapping) return undefined
  const modelField = mapping.modelField ?? "apiModelId"
  const model = active[modelField] as string | undefined
  if (!model) return undefined
  return { provider: mapping.name, model }
}
