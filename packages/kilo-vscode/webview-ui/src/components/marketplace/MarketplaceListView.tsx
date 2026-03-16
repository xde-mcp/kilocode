import { createSignal, createMemo, For, Show } from "solid-js"
import { TextField } from "@kilocode/kilo-ui/text-field"
import { Select } from "@kilocode/kilo-ui/select"
import { Tag } from "@kilocode/kilo-ui/tag"
import { Spinner } from "@kilocode/kilo-ui/spinner"
import type {
  MarketplaceItem,
  McpMarketplaceItem,
  ModeMarketplaceItem,
  MarketplaceInstalledMetadata,
} from "../../types/marketplace"
import { useLanguage } from "../../context/language"
import { isInstalled } from "./utils"
import { ItemCard } from "./ItemCard"

interface StatusOption {
  value: string
  label: string
}

interface Props {
  items: (McpMarketplaceItem | ModeMarketplaceItem)[]
  metadata: MarketplaceInstalledMetadata
  fetching: boolean
  type: "mcp" | "mode"
  searchPlaceholder: string
  emptyMessage: string
  onInstall: (item: MarketplaceItem) => void
  onRemove: (item: MarketplaceItem, scope: "project" | "global") => void
}

export const MarketplaceListView = (props: Props) => {
  const { t } = useLanguage()
  const [search, setSearch] = createSignal("")
  const [status, setStatus] = createSignal<StatusOption>({ value: "all", label: t("marketplace.filter.all") })
  const [tags, setTags] = createSignal<string[]>([])

  const options = (): StatusOption[] => [
    { value: "all", label: t("marketplace.filter.all") },
    { value: "installed", label: t("marketplace.filter.installed") },
    { value: "notInstalled", label: t("marketplace.filter.notInstalled") },
  ]

  const allTags = createMemo(() => {
    const set = new Set<string>()
    for (const item of props.items) {
      for (const tag of item.tags ?? []) set.add(tag)
    }
    return Array.from(set).sort()
  })

  const toggleTag = (tag: string) => {
    const current = tags()
    if (current.includes(tag)) {
      setTags(current.filter((t) => t !== tag))
    } else {
      setTags([...current, tag])
    }
  }

  const filtered = createMemo(() => {
    const q = search().toLowerCase()
    const s = status().value
    const active = tags()
    return props.items.filter((item) => {
      if (s === "installed" && !isInstalled(item.id, item.type, props.metadata)) return false
      if (s === "notInstalled" && isInstalled(item.id, item.type, props.metadata)) return false
      if (active.length > 0 && !active.some((tag) => item.tags?.includes(tag))) return false
      if (!q) return true
      return (
        item.id.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        (item.author?.toLowerCase().includes(q) ?? false)
      )
    })
  })

  return (
    <div class="marketplace-list">
      <div class="marketplace-filters">
        <div class="marketplace-search-field">
          <TextField placeholder={props.searchPlaceholder} value={search()} onChange={setSearch} />
        </div>
        <Select
          options={options()}
          current={status()}
          value={(o: StatusOption) => o.value}
          label={(o: StatusOption) => o.label}
          onSelect={(v: StatusOption | undefined) => v && setStatus(v)}
        />
      </div>
      <Show when={allTags().length > 0}>
        <div class="marketplace-active-tags">
          <For each={allTags()}>
            {(tag) => (
              <button
                class="marketplace-tag-filter"
                classList={{ active: tags().includes(tag) }}
                onClick={() => toggleTag(tag)}
              >
                <Tag>{tag}</Tag>
              </button>
            )}
          </For>
        </div>
      </Show>
      <Show
        when={!props.fetching}
        fallback={
          <div class="marketplace-loading">
            <Spinner />
          </div>
        }
      >
        <Show when={filtered().length > 0} fallback={<p class="marketplace-empty">{props.emptyMessage}</p>}>
          <div class="marketplace-grid">
            <For each={filtered()}>
              {(item) => (
                <ItemCard
                  item={item}
                  metadata={props.metadata}
                  linkUrl={item.type === "mcp" ? (item as McpMarketplaceItem).url : undefined}
                  typeBadge={item.type === "mcp" ? t("marketplace.badge.mcpServer") : t("marketplace.badge.mode")}
                  onInstall={props.onInstall}
                  onRemove={props.onRemove}
                  footer={<For each={item.tags ?? []}>{(tag) => <Tag>{tag}</Tag>}</For>}
                />
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  )
}
