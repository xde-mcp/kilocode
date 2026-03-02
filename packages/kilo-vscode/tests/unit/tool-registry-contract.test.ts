/**
 * ToolRegistry tool name contract test.
 *
 * The kilo-vscode webview overrides specific tool names in
 * VscodeToolOverrides.tsx (e.g. "bash") and TaskToolExpanded.tsx (e.g. "task").
 * VscodeSessionTurn imports Message/UserMessageDisplay from @kilocode/kilo-ui/message-part.
 *
 * This test verifies that the tool names we depend on are still registered
 * in the upstream ToolRegistry (message-part.tsx). If upstream removes or
 * renames a tool, this test will fail.
 */

import { describe, it, expect } from "bun:test"
import fs from "node:fs"
import path from "node:path"

const MONOREPO_ROOT = path.resolve(import.meta.dir, "../../../..")
const MESSAGE_PART_FILE = path.join(MONOREPO_ROOT, "packages/ui/src/components/message-part.tsx")

/**
 * Tool names that kilo-vscode overrides or uses directly.
 * Sources:
 *   - VscodeToolOverrides.tsx: "bash"
 *   - TaskToolExpanded.tsx:    "task"
 *   - TaskToolExpanded.tsx uses getToolInfo() which handles all of these
 */
const TOOL_NAMES_WE_DEPEND_ON = ["bash", "task", "read", "write", "glob", "edit", "todowrite"]

describe("ToolRegistry tool name contract", () => {
  it("all tools overridden or used by kilo-vscode are still registered in ToolRegistry", () => {
    const src = fs.readFileSync(MESSAGE_PART_FILE, "utf-8")
    for (const name of TOOL_NAMES_WE_DEPEND_ON) {
      expect(src, `Tool "${name}" no longer registered in message-part.tsx`).toContain(`name: "${name}"`)
    }
  })
})
