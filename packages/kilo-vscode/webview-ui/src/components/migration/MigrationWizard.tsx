/**
 * legacy-migration - Multi-step migration wizard UI component.
 *
 * Steps:
 *   1. Welcome — informs the user about what can / cannot be migrated
 *   2. Select  — checkboxes for providers, MCP servers, custom modes, default model
 *   3. Progress — live progress indicators during migration
 *   4. Complete — summary + optional cleanup checkbox
 */

import { Component, For, Show, createSignal, onMount, onCleanup, JSX } from "solid-js"
import { useVSCode } from "../../context/vscode"
import { useLanguage } from "../../context/language"
import type {
  MigrationProviderInfo,
  MigrationMcpServerInfo,
  MigrationCustomModeInfo,
  MigrationResultItem,
  LegacyMigrationDataMessage,
  LegacyMigrationProgressMessage,
  LegacyMigrationCompleteMessage,
} from "../../types/messages"
import "./migration.css"

// ---------------------------------------------------------------------------
// KiloLogo — replicates the pattern from MessageList.tsx
// ---------------------------------------------------------------------------

const KiloLogo = (): JSX.Element => {
  const iconsBaseUri = (window as { ICONS_BASE_URI?: string }).ICONS_BASE_URI || ""
  const isLight =
    document.body.classList.contains("vscode-light") || document.body.classList.contains("vscode-high-contrast-light")
  const icon = isLight ? "kilo-light.svg" : "kilo-dark.svg"
  return (
    <div class="kilo-logo migration-wizard__logo">
      <img src={`${iconsBaseUri}/${icon}`} alt="Kilo Code" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = "welcome" | "select" | "progress" | "complete"

interface ProgressEntry {
  item: string
  status: "pending" | "migrating" | "success" | "warning" | "error"
  message?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface MigrationWizardProps {
  onBack: () => void
  onComplete: () => void
}

const MigrationWizard: Component<MigrationWizardProps> = (props) => {
  const vscode = useVSCode()
  const language = useLanguage()

  const [step, setStep] = createSignal<Step>("welcome")
  const [providers, setProviders] = createSignal<MigrationProviderInfo[]>([])
  const [mcpServers, setMcpServers] = createSignal<MigrationMcpServerInfo[]>([])
  const [customModes, setCustomModes] = createSignal<MigrationCustomModeInfo[]>([])
  const [defaultModel, setDefaultModel] = createSignal<{ provider: string; model: string } | undefined>(undefined)

  // Selections (profile names / server names / mode slugs)
  const [selectedProviders, setSelectedProviders] = createSignal<Set<string>>(new Set())
  const [selectedMcpServers, setSelectedMcpServers] = createSignal<Set<string>>(new Set())
  const [selectedModes, setSelectedModes] = createSignal<Set<string>>(new Set())
  const [migrateDefaultModel, setMigrateDefaultModel] = createSignal(true)

  // Progress tracking
  const [progressEntries, setProgressEntries] = createSignal<ProgressEntry[]>([])
  const [results, setResults] = createSignal<MigrationResultItem[]>([])
  const [migrationDone, setMigrationDone] = createSignal(false)

  // Cleanup preference on the completion screen
  const [clearLegacyData, setClearLegacyData] = createSignal(false)

  // ---------------------------------------------------------------------------
  // Message handling
  // ---------------------------------------------------------------------------

  onMount(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data
      if (msg?.type === "legacyMigrationData") {
        const data = (msg as LegacyMigrationDataMessage).data
        setProviders(data.providers)
        setMcpServers(data.mcpServers)
        setCustomModes(data.customModes)
        setDefaultModel(data.defaultModel)

        // Pre-select everything that is supported and has a key
        setSelectedProviders(
          new Set(data.providers.filter((p) => p.supported && p.hasApiKey).map((p) => p.profileName)),
        )
        setSelectedMcpServers(new Set(data.mcpServers.map((s) => s.name)))
        setSelectedModes(new Set(data.customModes.map((m) => m.slug)))
        setMigrateDefaultModel(Boolean(data.defaultModel))
      }

      if (msg?.type === "legacyMigrationProgress") {
        const update = msg as LegacyMigrationProgressMessage
        setProgressEntries((prev) => {
          const existing = prev.findIndex((e) => e.item === update.item)
          const entry: ProgressEntry = { item: update.item, status: update.status, message: update.message }
          return existing >= 0 ? prev.map((e, i) => (i === existing ? entry : e)) : [...prev, entry]
        })
      }

      if (msg?.type === "legacyMigrationComplete") {
        const complete = msg as LegacyMigrationCompleteMessage
        setResults(complete.results)
        setMigrationDone(true)
        setStep("complete")
      }
    }

    window.addEventListener("message", handler)
    // Request data immediately when the wizard mounts
    vscode.postMessage({ type: "requestLegacyMigrationData" })
    onCleanup(() => window.removeEventListener("message", handler))
  })

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleSkip = () => {
    vscode.postMessage({ type: "skipLegacyMigration" })
    props.onBack()
  }

  const handleStartMigration = () => {
    const allItems: ProgressEntry[] = [
      ...Array.from(selectedProviders()).map((name) => ({ item: name, status: "pending" as const })),
      ...Array.from(selectedMcpServers()).map((name) => ({ item: name, status: "pending" as const })),
      ...Array.from(selectedModes()).map((slug) => {
        const mode = customModes().find((m) => m.slug === slug)
        return { item: mode?.name ?? slug, status: "pending" as const }
      }),
      ...(migrateDefaultModel() && defaultModel() ? [{ item: "Default model", status: "pending" as const }] : []),
    ]
    setProgressEntries(allItems)
    setStep("progress")
    vscode.postMessage({
      type: "startLegacyMigration",
      selections: {
        providers: Array.from(selectedProviders()),
        mcpServers: Array.from(selectedMcpServers()),
        customModes: Array.from(selectedModes()),
        defaultModel: migrateDefaultModel(),
      },
    })
  }

  const handleDone = () => {
    if (clearLegacyData()) {
      vscode.postMessage({ type: "clearLegacyData" })
    }
    props.onComplete()
  }

  // ---------------------------------------------------------------------------
  // Selection helpers
  // ---------------------------------------------------------------------------

  const toggleProvider = (name: string) => {
    setSelectedProviders((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const toggleMcpServer = (name: string) => {
    setSelectedMcpServers((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const toggleMode = (slug: string) => {
    setSelectedModes((prev) => {
      const next = new Set(prev)
      next.has(slug) ? next.delete(slug) : next.add(slug)
      return next
    })
  }

  const hasAnySelection = () =>
    selectedProviders().size > 0 ||
    selectedMcpServers().size > 0 ||
    selectedModes().size > 0 ||
    (migrateDefaultModel() && Boolean(defaultModel()))

  // ---------------------------------------------------------------------------
  // Result summary helpers
  // ---------------------------------------------------------------------------

  const successCount = () => results().filter((r) => r.status === "success").length
  const totalCount = () => results().length
  const hasWarnings = () => results().some((r) => r.status === "warning" || r.status === "error")

  // ---------------------------------------------------------------------------
  // Step indicator helper
  // ---------------------------------------------------------------------------

  const STEPS: Step[] = ["welcome", "select", "progress", "complete"]

  const stepClass = (s: Step) => {
    const current = STEPS.indexOf(step())
    const idx = STEPS.indexOf(s)
    return (
      "migration-wizard__step" +
      (step() === s ? " migration-wizard__step--active" : "") +
      (current > idx ? " migration-wizard__step--done" : "")
    )
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const statusIcon = (status: ProgressEntry["status"]) => {
    switch (status) {
      case "pending":
        return "○"
      case "migrating":
        return "◌"
      case "success":
        return "✓"
      case "warning":
        return "⚠"
      case "error":
        return "✗"
    }
  }

  const statusColor = (status: ProgressEntry["status"]) => {
    switch (status) {
      case "success":
        return "var(--vscode-testing-iconPassed, #89d185)"
      case "warning":
        return "var(--vscode-testing-iconQueued, #cca700)"
      case "error":
        return "var(--vscode-testing-iconFailed, #f14c4c)"
      default:
        return "var(--vscode-descriptionForeground)"
    }
  }

  // ---------------------------------------------------------------------------
  // JSX
  // ---------------------------------------------------------------------------

  return (
    <div class="migration-wizard">
      {/* Header — only shown on steps 2-4 */}
      <Show when={step() !== "welcome"}>
        <div class="migration-wizard__header">
          <h2 class="migration-wizard__title">{language.t("migration.welcome.title")}</h2>
        </div>
      </Show>

      <div class="migration-wizard__body">
        {/* Step indicator — only shown on steps 2-4 */}
        <Show when={step() !== "welcome"}>
          <div class="migration-wizard__steps">
            <div class={stepClass("welcome")}>1</div>
            <span class="migration-wizard__step-connector" />
            <div class={stepClass("select")}>2</div>
            <span class="migration-wizard__step-connector" />
            <div class={stepClass("progress")}>3</div>
            <span class="migration-wizard__step-connector" />
            <div class={stepClass("complete")}>4</div>
          </div>
        </Show>

        {/* ---- Step 1: Welcome ---- */}
        <Show when={step() === "welcome"}>
          <div class="migration-wizard__welcome">
            <KiloLogo />
            <h2 class="migration-wizard__welcome-title">{language.t("migration.welcome.title")}</h2>
            <p class="kilo-about-text migration-wizard__welcome-subtitle">{language.t("migration.welcome.detected")}</p>

            <div class="migration-wizard__welcome-cards">
              <div class="migration-wizard__info-card migration-wizard__info-card--warning">
                <strong>{language.t("migration.welcome.sessionsInfo")}</strong>
              </div>

              <div class="migration-wizard__info-card">
                <p style={{ margin: 0 }}>{language.t("migration.welcome.canMigrate")}</p>
                <ul class="migration-wizard__list">
                  <Show when={providers().length > 0}>
                    <li>
                      {language.t("migration.select.providers")} ({providers().filter((p) => p.supported).length})
                    </li>
                  </Show>
                  <Show when={mcpServers().length > 0}>
                    <li>
                      {language.t("migration.select.mcpServers")} ({mcpServers().length})
                    </li>
                  </Show>
                  <Show when={customModes().length > 0}>
                    <li>
                      {language.t("migration.select.customModes")} ({customModes().length})
                    </li>
                  </Show>
                  <Show when={Boolean(defaultModel())}>
                    <li>{language.t("migration.select.defaultModel")}</li>
                  </Show>
                </ul>
              </div>
            </div>
          </div>

          <div class="migration-wizard__footer">
            <button type="button" class="migration-wizard__btn migration-wizard__btn--ghost" onClick={handleSkip}>
              {language.t("migration.welcome.skip")}
            </button>
            <button
              type="button"
              class="migration-wizard__btn migration-wizard__btn--primary"
              onClick={() => setStep("select")}
            >
              {language.t("migration.welcome.continue")}
            </button>
          </div>
        </Show>

        {/* ---- Step 2: Select ---- */}
        <Show when={step() === "select"}>
          <div class="migration-wizard__content">
            {/* Provider API Keys */}
            <Show when={providers().length > 0}>
              <div class="migration-wizard__section">
                <h4 class="migration-wizard__section-title">{language.t("migration.select.providers")}</h4>
                <For each={providers()}>
                  {(provider) => (
                    <label
                      class={`migration-wizard__item${!provider.supported || !provider.hasApiKey ? " migration-wizard__item--disabled" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedProviders().has(provider.profileName)}
                        disabled={!provider.supported || !provider.hasApiKey}
                        onChange={() => toggleProvider(provider.profileName)}
                      />
                      <div class="migration-wizard__item-info">
                        <span class="migration-wizard__item-name">{provider.profileName}</span>
                        <span class="migration-wizard__item-meta">
                          {provider.newProviderName ?? provider.provider}
                          {provider.model ? ` · ${provider.model}` : ""}
                        </span>
                        <Show when={!provider.supported}>
                          <span class="migration-wizard__item-tag migration-wizard__item-tag--warn">
                            {language.t("migration.select.unsupported")}
                          </span>
                        </Show>
                        <Show when={provider.supported && !provider.hasApiKey}>
                          <span class="migration-wizard__item-tag migration-wizard__item-tag--warn">No API key</span>
                        </Show>
                      </div>
                    </label>
                  )}
                </For>
              </div>
            </Show>

            {/* MCP Servers */}
            <Show when={mcpServers().length > 0}>
              <div class="migration-wizard__section">
                <h4 class="migration-wizard__section-title">{language.t("migration.select.mcpServers")}</h4>
                <For each={mcpServers()}>
                  {(server) => (
                    <label class="migration-wizard__item">
                      <input
                        type="checkbox"
                        checked={selectedMcpServers().has(server.name)}
                        onChange={() => toggleMcpServer(server.name)}
                      />
                      <div class="migration-wizard__item-info">
                        <span class="migration-wizard__item-name">{server.name}</span>
                        <span class="migration-wizard__item-meta">{server.type}</span>
                      </div>
                    </label>
                  )}
                </For>
              </div>
            </Show>

            {/* Custom Modes */}
            <Show when={customModes().length > 0}>
              <div class="migration-wizard__section">
                <h4 class="migration-wizard__section-title">{language.t("migration.select.customModes")}</h4>
                <For each={customModes()}>
                  {(mode) => (
                    <label class="migration-wizard__item">
                      <input
                        type="checkbox"
                        checked={selectedModes().has(mode.slug)}
                        onChange={() => toggleMode(mode.slug)}
                      />
                      <div class="migration-wizard__item-info">
                        <span class="migration-wizard__item-name">{mode.name}</span>
                        <span class="migration-wizard__item-meta">{mode.slug}</span>
                      </div>
                    </label>
                  )}
                </For>
              </div>
            </Show>

            {/* Default Model */}
            <Show when={Boolean(defaultModel())}>
              <div class="migration-wizard__section">
                <h4 class="migration-wizard__section-title">{language.t("migration.select.defaultModel")}</h4>
                <label class="migration-wizard__item">
                  <input
                    type="checkbox"
                    checked={migrateDefaultModel()}
                    onChange={(e) => setMigrateDefaultModel(e.currentTarget.checked)}
                  />
                  <div class="migration-wizard__item-info">
                    <span class="migration-wizard__item-name">{defaultModel()?.provider}</span>
                    <span class="migration-wizard__item-meta">{defaultModel()?.model}</span>
                  </div>
                </label>
              </div>
            </Show>

            <Show when={providers().length === 0 && mcpServers().length === 0 && customModes().length === 0}>
              <p class="migration-wizard__empty">{language.t("migration.select.nothingToMigrate")}</p>
            </Show>
          </div>

          <div class="migration-wizard__footer">
            <button
              type="button"
              class="migration-wizard__btn migration-wizard__btn--ghost"
              onClick={() => setStep("welcome")}
            >
              {language.t("migration.select.back")}
            </button>
            <button
              type="button"
              class="migration-wizard__btn migration-wizard__btn--primary"
              disabled={!hasAnySelection()}
              onClick={handleStartMigration}
            >
              {language.t("migration.select.migrate")}
            </button>
          </div>
        </Show>

        {/* ---- Step 3: Progress ---- */}
        <Show when={step() === "progress"}>
          <div class="migration-wizard__content">
            <p class="migration-wizard__lead">{language.t("migration.progress.title")}</p>
            <div class="migration-wizard__progress-list">
              <For each={progressEntries()}>
                {(entry) => (
                  <div class="migration-wizard__progress-item">
                    <span class="migration-wizard__progress-icon" style={{ color: statusColor(entry.status) }}>
                      {statusIcon(entry.status)}
                    </span>
                    <span class="migration-wizard__progress-name">{entry.item}</span>
                    <Show when={entry.message}>
                      <span class="migration-wizard__progress-msg">{entry.message}</span>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </div>

          <div class="migration-wizard__footer">
            <button
              type="button"
              class="migration-wizard__btn migration-wizard__btn--primary"
              disabled={!migrationDone()}
              onClick={() => setStep("complete")}
            >
              {language.t("migration.progress.done")}
            </button>
          </div>
        </Show>

        {/* ---- Step 4: Complete ---- */}
        <Show when={step() === "complete"}>
          <div class="migration-wizard__content">
            <div class="migration-wizard__info-card migration-wizard__info-card--success">
              <strong>
                {language.t("migration.complete.summary", {
                  success: String(successCount()),
                  total: String(totalCount()),
                })}
              </strong>
            </div>

            <Show when={hasWarnings()}>
              <div class="migration-wizard__progress-list" style={{ "margin-top": "12px" }}>
                <For each={results().filter((r) => r.status !== "success")}>
                  {(result) => (
                    <div class="migration-wizard__progress-item">
                      <span class="migration-wizard__progress-icon" style={{ color: statusColor(result.status) }}>
                        {statusIcon(result.status)}
                      </span>
                      <span class="migration-wizard__progress-name">{result.item}</span>
                      <Show when={result.message}>
                        <span class="migration-wizard__progress-msg">{result.message}</span>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </Show>

            <label class="migration-wizard__cleanup">
              <input
                type="checkbox"
                checked={clearLegacyData()}
                onChange={(e) => setClearLegacyData(e.currentTarget.checked)}
              />
              <div>
                <span class="migration-wizard__cleanup-label">{language.t("migration.complete.cleanup")}</span>
                <span class="migration-wizard__cleanup-desc">
                  {language.t("migration.complete.cleanupDescription")}
                </span>
              </div>
            </label>
          </div>

          <div class="migration-wizard__footer">
            <button type="button" class="migration-wizard__btn migration-wizard__btn--primary" onClick={handleDone}>
              {language.t("migration.complete.done")}
            </button>
          </div>
        </Show>
      </div>
    </div>
  )
}

export default MigrationWizard
