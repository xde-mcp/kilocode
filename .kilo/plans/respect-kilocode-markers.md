# Plan: Respect `kilocode_change` Markers During Upstream Merge

## Problem

Files in `packages/opencode/script/` (and potentially other directories) have `kilocode_change` markers that indicate Kilo-specific customizations. However, the upstream merge tool classifies these as `script-transform` which does `git checkout --theirs` (takes the upstream version) and only applies GitHub URL/branding regex replacements. This **completely discards** all `kilocode_change`-marked code.

### Affected Files

| File              | Markers | What Gets Lost                                             |
| ----------------- | ------- | ---------------------------------------------------------- |
| `build.ts`        | 9       | Nix ELF patchelf fixes, archive renaming, repository field |
| `postinstall.mjs` | 3       | Platform/arch detection, binary lookup, `bin/.kilo` path   |
| `publish.ts`      | 16      | npm provenance, Docker/Homebrew/PKGBUILD Kilo branding     |
| `seed-e2e.ts`     | 3       | Kilo provider/model defaults, agent rename                 |

### Root Cause Chain

1. `config.ts:175` → `scriptFiles: ["script/*.ts", "packages/opencode/script/*.ts"]`
2. `report.ts` → `classifyFile()` returns `"script"` for these paths
3. `report.ts` → `getRecommendation()` returns `"script-transform"` for type `"script"`
4. `transform-scripts.ts` → `transformScriptFile()` does `git checkout --theirs` + regex replacements
5. No check for `kilocode_change` markers anywhere in this pipeline

## Solution

Add a marker-awareness check so that **any file with `kilocode_change` markers that would otherwise be auto-resolved is instead classified as `manual`** (requires human review). This applies generally, not just to script files.

### Changes

#### 1. Add `hasKilocodeMarkers()` helper

**File:** `script/upstream/utils/markers.ts` (new file)

Create a helper that reads the Kilo version (HEAD) of a file and checks for `kilocode_change` markers:

```ts
import { $ } from "bun"

export async function hasKilocodeMarkers(path: string): Promise<boolean> {
  try {
    const content = await $`git show HEAD:${path}`.text()
    return content.includes("kilocode_change")
  } catch {
    return false
  }
}
```

#### 2. Make `getRecommendation()` async and add marker check

**File:** `script/upstream/utils/report.ts`

- Change `getRecommendation()` from sync to `async`
- After the normal classification determines an auto-resolve recommendation, check for markers
- Auto-resolve recommendations that should be checked: `script-transform`, `take-theirs-transform`, `i18n-transform`, `tauri-transform`, `extension-transform`, `web-transform`
- If `hasKilocodeMarkers(path)` returns `true`, override to `{ recommendation: "manual", reason: "contains kilocode_change markers, needs manual review" }`
- Do NOT check for markers on `keep-ours`, `skip`, `manual`, or `package-transform` (package.json files don't use JS-style markers and have their own merge strategy)

```ts
// After the existing type-based switch:
const autoResolveTypes = new Set([
  "script-transform",
  "take-theirs-transform",
  "i18n-transform",
  "tauri-transform",
  "extension-transform",
  "web-transform",
])

if (autoResolveTypes.has(recommendation) && (await hasKilocodeMarkers(path))) {
  return {
    recommendation: "manual",
    reason: "contains kilocode_change markers, needs manual review",
  }
}
```

#### 3. Update `analyzeConflicts()` to await async recommendation

**File:** `script/upstream/utils/report.ts`

Change the iteration to `await` the now-async `getRecommendation()`:

```ts
// Before (sync):
const { recommendation, reason } = getRecommendation(path, keepOurs, skipFiles)

// After (async):
const { recommendation, reason } = await getRecommendation(path, keepOurs, skipFiles)
```

#### 4. Guard each `transformConflicted*` function against marker files

**File:** `script/upstream/transforms/transform-scripts.ts` (and similar transforms)

In `transformScriptFile()`, before doing `git checkout --theirs`, check for markers:

```ts
import { hasKilocodeMarkers } from "../utils/markers"

// In transformScriptFile, at the start:
if (await hasKilocodeMarkers(file)) {
  if (options?.verbose) console.log(`  Skipping ${file} (has kilocode_change markers)`)
  return
}
```

Apply the same guard in:

- `transform-scripts.ts` → `transformScriptFile()`
- `transform-take-theirs.ts` → the per-file handler
- `transform-i18n.ts` → the per-file handler
- `transform-tauri.ts` → the per-file handler
- `transform-extensions.ts` → the per-file handler
- `transform-web.ts` → the per-file handler

This provides **defense in depth**: even if the recommendation classification is somehow bypassed (e.g., the merge step 7c calls transforms directly on all conflicted files), each transform will independently skip files with markers.

### Why Not Other Approaches

| Alternative                                               | Issue                                                                               |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Remove `packages/opencode/script/*.ts` from `scriptFiles` | Only fixes scripts, not other file types. Doesn't protect against future additions. |
| Add all marked files to `keepOurs`                        | Loses ALL upstream changes, including legitimate improvements                       |
| Filter in `merge.ts` only                                 | Transforms can be called from other entry points (CLI, analyze)                     |

### Testing

1. Run `bun run script/upstream/analyze.ts` to verify that files with `kilocode_change` markers now show `manual` recommendation instead of `script-transform`
2. Specifically verify that `packages/opencode/script/build.ts`, `postinstall.mjs`, `publish.ts`, and `seed-e2e.ts` are classified as `manual`
3. Verify that `packages/opencode/script/check-migrations.ts` and `schema.ts` (no markers) still get `script-transform`
