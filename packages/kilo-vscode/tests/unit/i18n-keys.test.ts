/**
 * Translation key validation
 *
 * Ensures every string-literal translation key passed to a t() function
 * actually exists in the corresponding English dictionary.
 *
 * Three independent key pools are checked:
 *   1. Webview (sidebar + agent manager): merged from app, ui, kilo-i18n, agent-manager dicts
 *   2. CLI backend (extension-side server-manager): cli-backend/i18n dict
 *   3. Autocomplete (extension-side): autocomplete/i18n dict
 *
 * Dynamic keys (template literals, variables) are intentionally skipped —
 * only string literals are validated.
 */

import { describe, it, expect } from "bun:test"
import { Glob } from "bun"
import path from "node:path"

// ── Dictionaries ────────────────────────────────────────────────────────────

// Webview layer 1: app-local (sidebar)
import { dict as appEn } from "../../webview-ui/src/i18n/en"
// Webview layer 2: upstream UI (@opencode-ai/ui re-exported via @kilocode/kilo-ui)
import { dict as uiEn } from "../../../ui/src/i18n/en"
// Webview layer 3: kilo-i18n overrides
import { dict as kiloEn } from "../../../kilo-i18n/src/en"
// Webview layer 4: agent manager
import { dict as amEn } from "../../webview-ui/agent-manager/i18n/en"

// Extension-side: CLI backend
import { dict as cliEn } from "../../src/services/cli-backend/i18n/en"
// Extension-side: autocomplete
import { dict as acEn } from "../../src/services/autocomplete/i18n/en"

const ROOT = path.resolve(import.meta.dir, "../..")

// Merge webview dictionaries in the same priority order as language.tsx
const webviewKeys = new Set(Object.keys({ ...appEn, ...uiEn, ...kiloEn, ...amEn }))
const cliKeys = new Set(Object.keys(cliEn))
const acKeys = new Set(Object.keys(acEn))

// ── File scanning ───────────────────────────────────────────────────────────

interface Missing {
  file: string
  line: number
  key: string
}

/**
 * Regex to match t("key") / t('key') calls.
 *
 * Captures the string literal argument to any of these patterns:
 *   t("key")  language.t("key")  i18n.t("key")
 *
 * Skips template literals (backticks) and variable arguments.
 */
const T_CALL = /(?:^|[^a-zA-Z_$])t\(\s*(?:["'])([^"']+)["']/g

function extractKeys(content: string): Array<{ line: number; key: string }> {
  const results: Array<{ line: number; key: string }> = []
  const lines = content.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i]
    let match: RegExpExecArray | null
    T_CALL.lastIndex = 0
    while ((match = T_CALL.exec(text)) !== null) {
      const key = match[1]
      if (key) results.push({ line: i + 1, key })
    }
  }
  return results
}

async function collectFiles(glob: Glob, dir: string): Promise<string[]> {
  const files: string[] = []
  for await (const entry of glob.scan({ cwd: dir, absolute: true })) {
    files.push(entry)
  }
  return files
}

// ── Webview files ───────────────────────────────────────────────────────────

async function findWebviewMissing(): Promise<Missing[]> {
  const glob = new Glob("**/*.{ts,tsx}")
  const dirs = [path.join(ROOT, "webview-ui/src"), path.join(ROOT, "webview-ui/agent-manager")]

  const files: string[] = []
  for (const dir of dirs) {
    files.push(...(await collectFiles(glob, dir)))
  }

  // Exclude i18n dictionary files themselves and storybook files
  const filtered = files.filter((f) => !f.includes("/i18n/") && !f.includes(".stories.") && !f.includes("/stories/"))

  const missing: Missing[] = []
  for (const file of filtered) {
    const content = await Bun.file(file).text()
    for (const { line, key } of extractKeys(content)) {
      if (!webviewKeys.has(key)) {
        missing.push({ file: path.relative(ROOT, file), line, key })
      }
    }
  }
  return missing
}

// ── CLI backend files ───────────────────────────────────────────────────────

async function findCliBackendMissing(): Promise<Missing[]> {
  const glob = new Glob("**/*.ts")
  const dir = path.join(ROOT, "src/services/cli-backend")

  const files = (await collectFiles(glob, dir)).filter((f) => !f.includes("/i18n/"))

  const missing: Missing[] = []
  for (const file of files) {
    const content = await Bun.file(file).text()
    for (const { line, key } of extractKeys(content)) {
      if (!cliKeys.has(key)) {
        missing.push({ file: path.relative(ROOT, file), line, key })
      }
    }
  }
  return missing
}

// ── Autocomplete files ──────────────────────────────────────────────────────

async function findAutocompleteMissing(): Promise<Missing[]> {
  const glob = new Glob("**/*.ts")
  const dir = path.join(ROOT, "src/services/autocomplete")

  const files = (await collectFiles(glob, dir)).filter((f) => !f.includes("/i18n/") && !f.includes("/shims/"))

  const missing: Missing[] = []
  for (const file of files) {
    const content = await Bun.file(file).text()
    for (const { line, key } of extractKeys(content)) {
      if (!acKeys.has(key)) {
        missing.push({ file: path.relative(ROOT, file), line, key })
      }
    }
  }
  return missing
}

// ── Tests ───────────────────────────────────────────────────────────────────

function formatReport(missing: Missing[]): string {
  return missing.map((m) => `  ${m.file}:${m.line} — "${m.key}"`).join("\n")
}

describe("i18n key validation — no missing translation keys", () => {
  it("webview: all t() string literal keys exist in merged dictionaries", async () => {
    const missing = await findWebviewMissing()
    if (missing.length > 0) {
      expect(
        missing,
        `Found ${missing.length} translation key(s) not present in any dictionary:\n${formatReport(missing)}`,
      ).toEqual([])
    }
    expect(missing).toEqual([])
  })

  it("cli-backend: all t() string literal keys exist in cli-backend dictionary", async () => {
    const missing = await findCliBackendMissing()
    if (missing.length > 0) {
      expect(
        missing,
        `Found ${missing.length} translation key(s) not present in cli-backend dictionary:\n${formatReport(missing)}`,
      ).toEqual([])
    }
    expect(missing).toEqual([])
  })

  it("autocomplete: all t() string literal keys exist in autocomplete dictionary", async () => {
    const missing = await findAutocompleteMissing()
    if (missing.length > 0) {
      expect(
        missing,
        `Found ${missing.length} translation key(s) not present in autocomplete dictionary:\n${formatReport(missing)}`,
      ).toEqual([])
    }
    expect(missing).toEqual([])
  })
})
