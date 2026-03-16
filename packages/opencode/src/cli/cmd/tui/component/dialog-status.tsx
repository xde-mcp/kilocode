import { TextAttributes } from "@opentui/core"
import { fileURLToPath } from "bun"
import { useTheme } from "../context/theme"
import { useDialog } from "@tui/ui/dialog"
import { useSync } from "@tui/context/sync"
import { useSDK } from "@tui/context/sdk" // kilocode_change
import { For, Match, Switch, Show, createMemo, onMount, onCleanup } from "solid-js"
import { Installation } from "../../../../installation"
import type { ProcessInfo } from "@kilocode/sdk/v2" // kilocode_change

export type DialogStatusProps = {}

// kilocode_change start - format bytes for process memory display
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB"
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB"
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + " KB"
  return bytes + " B"
}

function shortCommand(info: ProcessInfo): string {
  const cmd = info.command.split("/").pop() ?? info.command
  const args = info.args
  if (!args || args === info.command) return cmd
  // Show first meaningful arg (e.g. "typescript-language-server" from "bun x typescript-language-server --stdio")
  const parts = args.split(/\s+/)
  const interesting = parts.find(
    (p) => !p.startsWith("-") && !p.startsWith("/") && p !== cmd && p !== "x" && p !== "run",
  )
  return interesting ? `${cmd} → ${interesting}` : cmd
}
// kilocode_change end

export function DialogStatus() {
  const sync = useSync()
  const { theme } = useTheme()
  const dialog = useDialog()
  // kilocode_change start - refresh process data while dialog is open
  const sdk = useSDK()
  const refresh = () => {
    sdk.client.process.status().then((x) => {
      if (x.data) sync.set("processes", x.data)
    })
  }
  onMount(() => {
    refresh()
    const timer = setInterval(refresh, 3000)
    onCleanup(() => clearInterval(timer))
  })
  // kilocode_change end

  const enabledFormatters = createMemo(() => sync.data.formatter.filter((f) => f.enabled))

  const plugins = createMemo(() => {
    const list = sync.data.config.plugin ?? []
    const result = list.map((value) => {
      if (value.startsWith("file://")) {
        const path = fileURLToPath(value)
        const parts = path.split("/")
        const filename = parts.pop() || path
        if (!filename.includes(".")) return { name: filename }
        const basename = filename.split(".")[0]
        if (basename === "index") {
          const dirname = parts.pop()
          const name = dirname || basename
          return { name }
        }
        return { name: basename }
      }
      const index = value.lastIndexOf("@")
      if (index <= 0) return { name: value, version: "latest" }
      const name = value.substring(0, index)
      const version = value.substring(index + 1)
      return { name, version }
    })
    return result.toSorted((a, b) => a.name.localeCompare(b.name))
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Status
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      {/* kilocode_change start */}
      <text fg={theme.textMuted}>Kilo v{Installation.VERSION}</text>
      {/* kilocode_change end */}
      {/* kilocode_change start - process memory diagnostics */}
      <Show when={sync.data.processes}>
        {(procs) => {
          const total = createMemo(() => {
            const all = [procs().self, ...procs().children]
            return all.reduce((sum, p) => sum + p.rss, 0)
          })
          return (
            <box>
              <text fg={theme.text}>
                Processes ({1 + procs().children.length}) — {formatBytes(total())} total RSS
              </text>
              <box flexDirection="row" gap={1}>
                <text flexShrink={0} style={{ fg: theme.success }}>
                  •
                </text>
                <text fg={theme.text} wrapMode="word">
                  <b>self</b>{" "}
                  <span style={{ fg: theme.textMuted }}>
                    PID {procs().self.pid} | {formatBytes(procs().self.rss)} RSS | heap {formatBytes(procs().heap.used)}
                    /{formatBytes(procs().heap.total)}
                  </span>
                </text>
              </box>
              <For each={procs().children}>
                {(child) => (
                  <box flexDirection="row" gap={1}>
                    <text flexShrink={0} style={{ fg: child.rss > 512 * 1024 * 1024 ? theme.warning : theme.success }}>
                      •
                    </text>
                    <text fg={theme.text} wrapMode="word">
                      <b>{shortCommand(child)}</b>{" "}
                      <span style={{ fg: theme.textMuted }}>
                        PID {child.pid} | {formatBytes(child.rss)}
                      </span>
                    </text>
                  </box>
                )}
              </For>
            </box>
          )
        }}
      </Show>
      {/* kilocode_change end */}
      <Show when={Object.keys(sync.data.mcp).length > 0} fallback={<text fg={theme.text}>No MCP Servers</text>}>
        <box>
          <text fg={theme.text}>{Object.keys(sync.data.mcp).length} MCP Servers</text>
          <For each={Object.entries(sync.data.mcp)}>
            {([key, item]) => (
              <box flexDirection="row" gap={1}>
                <text
                  flexShrink={0}
                  style={{
                    fg: (
                      {
                        connected: theme.success,
                        failed: theme.error,
                        disabled: theme.textMuted,
                        needs_auth: theme.warning,
                        needs_client_registration: theme.error,
                      } as Record<string, typeof theme.success>
                    )[item.status],
                  }}
                >
                  •
                </text>
                <text fg={theme.text} wrapMode="word">
                  <b>{key}</b>{" "}
                  <span style={{ fg: theme.textMuted }}>
                    <Switch fallback={item.status}>
                      <Match when={item.status === "connected"}>Connected</Match>
                      <Match when={item.status === "failed" && item}>{(val) => val().error}</Match>
                      <Match when={item.status === "disabled"}>Disabled in configuration</Match>
                      <Match when={(item.status as string) === "needs_auth"}>
                        Needs authentication (run: kilo mcp auth {key}){/* kilocode_change */}
                      </Match>
                      <Match when={(item.status as string) === "needs_client_registration" && item}>
                        {(val) => (val() as { error: string }).error}
                      </Match>
                    </Switch>
                  </span>
                </text>
              </box>
            )}
          </For>
        </box>
      </Show>
      {sync.data.lsp.length > 0 && (
        <box>
          <text fg={theme.text}>{sync.data.lsp.length} LSP Servers</text>
          <For each={sync.data.lsp}>
            {(item) => (
              <box flexDirection="row" gap={1}>
                <text
                  flexShrink={0}
                  style={{
                    fg: {
                      connected: theme.success,
                      error: theme.error,
                    }[item.status],
                  }}
                >
                  •
                </text>
                <text fg={theme.text} wrapMode="word">
                  <b>{item.id}</b> <span style={{ fg: theme.textMuted }}>{item.root}</span>
                </text>
              </box>
            )}
          </For>
        </box>
      )}
      <Show when={enabledFormatters().length > 0} fallback={<text fg={theme.text}>No Formatters</text>}>
        <box>
          <text fg={theme.text}>{enabledFormatters().length} Formatters</text>
          <For each={enabledFormatters()}>
            {(item) => (
              <box flexDirection="row" gap={1}>
                <text
                  flexShrink={0}
                  style={{
                    fg: theme.success,
                  }}
                >
                  •
                </text>
                <text wrapMode="word" fg={theme.text}>
                  <b>{item.name}</b>
                </text>
              </box>
            )}
          </For>
        </box>
      </Show>
      <Show when={plugins().length > 0} fallback={<text fg={theme.text}>No Plugins</text>}>
        <box>
          <text fg={theme.text}>{plugins().length} Plugins</text>
          <For each={plugins()}>
            {(item) => (
              <box flexDirection="row" gap={1}>
                <text
                  flexShrink={0}
                  style={{
                    fg: theme.success,
                  }}
                >
                  •
                </text>
                <text wrapMode="word" fg={theme.text}>
                  <b>{item.name}</b>
                  {item.version && <span style={{ fg: theme.textMuted }}> @{item.version}</span>}
                </text>
              </box>
            )}
          </For>
        </box>
      </Show>
    </box>
  )
}
