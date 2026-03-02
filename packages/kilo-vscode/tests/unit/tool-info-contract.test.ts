/**
 * getToolInfo() return shape contract test.
 *
 * VscodeSessionTurn calls getToolInfo() from @kilocode/kilo-ui/message-part
 * and relies on the returned ToolInfo having `icon` and `title` fields.
 *
 * This test verifies that the ToolInfo type exported from message-part.tsx
 * still declares those fields. If upstream changes the shape, this will fail.
 */

import { describe, it, expect } from "bun:test"
import fs from "node:fs"
import path from "node:path"

const MONOREPO_ROOT = path.resolve(import.meta.dir, "../../../..")
const MESSAGE_PART_FILE = path.join(MONOREPO_ROOT, "packages/ui/src/components/message-part.tsx")

describe("getToolInfo() return shape contract", () => {
  it("getToolInfo still exports expected shape fields", () => {
    const src = fs.readFileSync(MESSAGE_PART_FILE, "utf-8")
    // ToolInfo type must still have these fields
    expect(src).toMatch(/icon\s*:/)
    expect(src).toMatch(/title\s*:/)
  })

  it("getToolInfo function is exported", () => {
    const src = fs.readFileSync(MESSAGE_PART_FILE, "utf-8")
    expect(src).toContain("export function getToolInfo")
  })

  it("ToolInfo type is exported", () => {
    const src = fs.readFileSync(MESSAGE_PART_FILE, "utf-8")
    expect(src).toContain("export type ToolInfo")
  })
})
