/**
 * DataProvider props contract test.
 *
 * The kilo-vscode webview passes an onOpenFile callback to the DataProvider
 * from @kilocode/kilo-ui. This test verifies that the DataProvider still
 * accepts the onOpenFile prop and that the OpenFileFn type is still defined.
 *
 * If upstream removes the kilocode_change additions in data.tsx, this will fail.
 */

import { describe, it, expect } from "bun:test"
import fs from "node:fs"
import path from "node:path"

const MONOREPO_ROOT = path.resolve(import.meta.dir, "../../../..")
const DATA_CONTEXT_FILE = path.join(MONOREPO_ROOT, "packages/ui/src/context/data.tsx")

describe("DataProvider props contract", () => {
  it("DataProvider still accepts onOpenFile prop", () => {
    const src = fs.readFileSync(DATA_CONTEXT_FILE, "utf-8")
    expect(src).toContain("onOpenFile")
    expect(src).toContain("OpenFileFn")
  })

  it("openFile is exposed on the context return value", () => {
    const src = fs.readFileSync(DATA_CONTEXT_FILE, "utf-8")
    expect(src).toContain("openFile:")
  })
})
