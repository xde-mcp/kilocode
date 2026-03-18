import { Component, Show, For } from "solid-js"
import type { EnrichedModel } from "../../context/provider"

interface Props {
  model: EnrichedModel | null
}

function fmtPrice(n: number): string {
  if (n === 0) return "Free"
  if (n < 0.01) return `$${(n * 1000).toFixed(3)}/1B`
  return `$${n.toFixed(2)}/1M`
}

function fmtContext(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`
  return String(n)
}

function fmtDate(s: string): string {
  const d = new Date(s)
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short" })
}

const MODALITY_LABELS: Record<string, string> = {
  text: "Text",
  image: "Images",
  audio: "Audio",
  video: "Video",
  pdf: "PDF",
}

export const ModelPreview: Component<Props> = (props) => {
  const m = () => props.model

  return (
    <div class="model-preview">
      <Show when={m()} fallback={<div class="model-preview-empty">No model selected</div>}>
        {(model) => {
          const cost = () => model().cost
          const ctx = () => model().limit?.context ?? model().contextLength
          const caps = () => model().capabilities
          const inputs = () => caps()?.input
          const activeModalities = () =>
            inputs()
              ? (Object.entries(inputs()!) as [string, boolean][])
                  .filter(([, v]) => v)
                  .map(([k]) => MODALITY_LABELS[k] ?? k)
              : []

          return (
            <>
              {/* Header — name + provider + free badge */}
              <div class="model-preview-header">
                <div class="model-preview-name-row">
                  <span class="model-preview-name">{model().name}</span>
                  <Show when={model().isFree}>
                    <span class="model-preview-badge model-preview-badge--free">Free</span>
                  </Show>
                </div>
                <span class="model-preview-provider">{model().providerName}</span>
              </div>

              {/* Properties grid */}
              <div class="model-preview-grid">
                {/* Release date */}
                <Show when={model().releaseDate}>
                  <span class="model-preview-label">Released</span>
                  <span class="model-preview-value">{fmtDate(model().releaseDate!)}</span>
                </Show>

                {/* Pricing — hidden for free models */}
                <Show when={cost() && !model().isFree}>
                  <span class="model-preview-label">Input</span>
                  <span class="model-preview-value">{fmtPrice(cost()!.input)}</span>
                  <span class="model-preview-label">Output</span>
                  <span class="model-preview-value">{fmtPrice(cost()!.output)}</span>
                </Show>

                {/* Context window */}
                <Show when={ctx()}>
                  <span class="model-preview-label">Context</span>
                  <span class="model-preview-value">{fmtContext(ctx()!)}</span>
                </Show>
              </div>

              {/* Capabilities — free badge moved to header */}
              <Show when={caps()?.reasoning || activeModalities().length > 0}>
                <div class="model-preview-caps">
                  <Show when={caps()?.reasoning}>
                    <span class="model-preview-badge model-preview-badge--reasoning">Reasoning</span>
                  </Show>
                  <For each={activeModalities()}>{(label) => <span class="model-preview-badge">{label}</span>}</For>
                </div>
              </Show>

              {/* Description */}
              <Show when={model().options?.description}>
                <p class="model-preview-description">{model().options!.description}</p>
              </Show>
            </>
          )
        }}
      </Show>
    </div>
  )
}
