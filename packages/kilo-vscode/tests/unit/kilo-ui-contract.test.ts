/**
 * Runtime contract tests for kilo-vscode's dependencies on @kilocode/kilo-ui.
 *
 * These tests import the upstream UI modules directly and verify at runtime
 * that the exports kilo-vscode depends on still exist with the expected shape.
 *
 * Because the upstream modules use SolidJS JSX (jsxImportSource: "solid-js"),
 * they must be loaded from within packages/ui/ where bun picks up the correct
 * tsconfig. We use Bun.spawnSync to run a small check script in that context.
 */

import { describe, it, expect } from "bun:test"
import path from "node:path"

const MONOREPO_ROOT = path.resolve(import.meta.dir, "../../../..")
const UI_DIR = path.join(MONOREPO_ROOT, "packages/ui")

function check(code: string): { ok: boolean; output: string } {
  const result = Bun.spawnSync(["bun", "--conditions=browser", "-e", code], {
    cwd: UI_DIR,
    stdout: "pipe",
    stderr: "pipe",
  })
  const stdout = result.stdout.toString()
  const stderr = result.stderr.toString()
  return {
    ok: result.exitCode === 0,
    output: stdout + stderr,
  }
}

/**
 * Tool names that kilo-vscode overrides or uses directly.
 * Sources:
 *   - VscodeToolOverrides.tsx: "bash"
 *   - TaskToolExpanded.tsx:    "task"
 *   - TaskToolExpanded.tsx uses getToolInfo() which handles all of these
 */
const TOOL_NAMES_WE_DEPEND_ON = ["bash", "task", "read", "write", "glob", "edit", "todowrite"]

describe("ToolRegistry tool name contract (runtime)", () => {
  it("all tools used by kilo-vscode are registered in ToolRegistry", () => {
    const names = JSON.stringify(TOOL_NAMES_WE_DEPEND_ON)
    const result = check(`
      import { ToolRegistry } from "./src/components/message-part.tsx"
      const names = ${names}
      const missing = names.filter(n => typeof ToolRegistry.render(n) !== "function")
      if (missing.length) {
        console.error("Missing tools: " + missing.join(", "))
        process.exit(1)
      }
      console.log("ok")
    `)
    expect(result.ok, `ToolRegistry check failed: ${result.output}`).toBe(true)
  })
})

describe("getToolInfo() export contract (runtime)", () => {
  it("getToolInfo is an exported function", () => {
    const result = check(`
      import { getToolInfo } from "./src/components/message-part.tsx"
      if (typeof getToolInfo !== "function") {
        console.error("getToolInfo is " + typeof getToolInfo)
        process.exit(1)
      }
      console.log("ok")
    `)
    expect(result.ok, `getToolInfo check failed: ${result.output}`).toBe(true)
  })

  it("ToolInfo type is exported (type re-exported as value via ToolRegistry)", () => {
    const result = check(`
      import { ToolRegistry } from "./src/components/message-part.tsx"
      if (typeof ToolRegistry !== "object" || typeof ToolRegistry.register !== "function") {
        console.error("ToolRegistry shape wrong")
        process.exit(1)
      }
      console.log("ok")
    `)
    expect(result.ok, `ToolRegistry shape check failed: ${result.output}`).toBe(true)
  })
})

describe("DataProvider contract (runtime)", () => {
  it("DataProvider and useData are exported functions", () => {
    const result = check(`
      import { DataProvider, useData } from "./src/context/data.tsx"
      if (typeof DataProvider !== "function") {
        console.error("DataProvider is " + typeof DataProvider)
        process.exit(1)
      }
      if (typeof useData !== "function") {
        console.error("useData is " + typeof useData)
        process.exit(1)
      }
      console.log("ok")
    `)
    expect(result.ok, `DataProvider check failed: ${result.output}`).toBe(true)
  })
})
