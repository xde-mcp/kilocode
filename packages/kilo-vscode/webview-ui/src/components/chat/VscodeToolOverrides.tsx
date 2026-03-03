/**
 * VS Code-specific tool registry overrides.
 * Wraps upstream tool renderers to inject VS Code sidebar preferences
 * (e.g. expanded by default) without duplicating render logic.
 *
 * Also registers renderers for context-group tools (glob, grep, read, list)
 * that show input details in the collapsed trigger — the upstream app groups
 * these into a "Gathered context" section, but the VS Code sidebar renders
 * them individually.
 *
 * Call registerVscodeToolOverrides() once at app startup, after the
 * upstream tool registrations have run (i.e. after importing message-part).
 */

import { Dynamic } from "solid-js/web"
import { ToolRegistry, getToolInfo } from "@kilocode/kilo-ui/message-part"
import { BasicTool } from "@kilocode/kilo-ui/basic-tool"
import type { ToolProps } from "@kilocode/kilo-ui/message-part"

/** Tools that should be open by default in the VS Code sidebar. */
const DEFAULT_OPEN_TOOLS = ["bash"]

/**
 * Build a trigger with title/subtitle/args for context-group tools
 * that are rendered individually in the VS Code sidebar.
 */
function contextToolTrigger(tool: string, input: Record<string, unknown>) {
  const info = getToolInfo(tool, input)
  const path = typeof input.path === "string" ? input.path : undefined
  const filePath = typeof input.filePath === "string" ? input.filePath : undefined
  const pattern = typeof input.pattern === "string" ? input.pattern : undefined
  const include = typeof input.include === "string" ? input.include : undefined
  const offset = typeof input.offset === "number" ? input.offset : undefined
  const limit = typeof input.limit === "number" ? input.limit : undefined

  switch (tool) {
    case "read": {
      const args: string[] = []
      if (offset !== undefined) args.push("offset=" + offset)
      if (limit !== undefined) args.push("limit=" + limit)
      return { title: info.title, subtitle: filePath ?? "", args }
    }
    case "list":
      return { title: info.title, subtitle: path ?? "/" }
    case "glob":
      return { title: info.title, subtitle: path ?? "/", args: pattern ? ["pattern=" + pattern] : [] }
    case "grep": {
      const args: string[] = []
      if (pattern) args.push("pattern=" + pattern)
      if (include) args.push("include=" + include)
      return { title: info.title, subtitle: path ?? "/", args }
    }
    default:
      return { title: info.title, subtitle: info.subtitle }
  }
}

/** Renderer for context-group tools (glob, grep, read, list) shown individually. */
function ContextToolRenderer(props: ToolProps) {
  const trigger = () => contextToolTrigger(props.tool, props.input)
  return (
    <BasicTool
      icon={getToolInfo(props.tool, props.input).icon}
      status={props.status}
      trigger={trigger()}
    />
  )
}

const CONTEXT_TOOLS = ["glob", "grep", "read", "list"]

export function registerVscodeToolOverrides() {
  for (const name of DEFAULT_OPEN_TOOLS) {
    const upstream = ToolRegistry.render(name)
    if (!upstream) continue

    ToolRegistry.register({
      name,
      render: (props) => <Dynamic component={upstream} {...props} defaultOpen />,
    })
  }

  for (const name of CONTEXT_TOOLS) {
    ToolRegistry.register({
      name,
      render: ContextToolRenderer,
    })
  }
}
