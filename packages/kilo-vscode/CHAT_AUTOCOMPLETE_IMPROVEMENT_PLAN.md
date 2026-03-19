# Chat Autocomplete Improvement Plan

## Current State Comparison

### Legacy Extension (kilocode-legacy-5)

**Framework:** React with `useState`/`useCallback`/`useMemo`/`useRef`

**Architecture:**

- Single monolithic `ChatTextArea.tsx` (~2045 lines) manages everything: `@` mentions, `/` slash commands, ghost-text FIM autocomplete, STT, image paste, prompt history
- Uses React's natural re-render cycle for state synchronization — when `inputValue`, `showContextMenu`, `searchQuery`, or `selectedMenuIndex` change, the component re-renders and everything stays consistent
- Mention state (`showContextMenu`, `searchQuery`, `selectedMenuIndex`, `selectedType`, `fileSearchResults`) lives as `useState` in the component — React guarantees consistency across re-renders
- Ghost-text autocomplete is extracted into `useChatAutocompleteText` hook with a **`syncAutocompleteTextVisibility()` function** — a single idempotent function that reconciles all state (focus, cursor position, prefix match) into a yes/no visibility decision. This is called from every event handler instead of each handler independently deciding what to show/hide
- `ContextMenu.tsx` is a pure presentational component — it receives `filteredOptions`, `selectedIndex`, `onSelect` as props and just renders. All filtering logic lives in `getContextMenuOptions()` pure function
- File search uses `fzf` (fuzzy matching) client-side on a pre-loaded `filePaths` array from extension state, plus server-side `searchFiles` for deeper results. Both contribute to `getContextMenuOptions()` output

**Key Design Decisions:**

- Mention types are rich: Files, Folders, Git commits, Problems, Terminal, URLs, Images, Modes — all through one unified `ContextMenu` with `ContextMenuOptionType` enum
- Slash commands are separate from mentions (`SlashCommandMenu` component, `shouldShowSlashCommandsMenu()` logic) but share the same keyboard navigation pattern
- `insertMention()` and `removeMention()` are pure functions that handle text manipulation with space escaping

### Current Extension (kilocode-3)

**Framework:** SolidJS with `createSignal`/`createEffect`

**Architecture:**

- `PromptInput.tsx` (~755 lines) is the main component
- `@` file mention logic extracted to `useFileMention.ts` hook (173 lines) + `file-mention-utils.ts` (48 lines)
- Ghost-text FIM autocomplete is inline in `PromptInput.tsx` (not extracted to a hook)
- **No slash command support** — i18n keys exist but no implementation
- **Only file mentions** — no folders, git commits, problems, terminal, URLs, images, or modes via `@`

**State Management Approach:**

- SolidJS signals for reactive state (`text`, `ghostText`, `mentionQuery`, `mentionResults`, `mentionIndex`)
- Plain `let` variables for non-reactive state (`workspaceDir`, `requestCounter`, `debounceTimer`, `fileSearchCounter`)
- Event-driven via `vscode.onMessage()` handler that imperatively updates signals based on message type
- Each event handler independently manages ghost text state: `handleInput` clears it, `handleKeyDown` clears it in multiple places, `handleSend` clears it — no single source of truth

## Key Differences

| Aspect                  | Legacy (React)                                               | Current (SolidJS)                               |
| ----------------------- | ------------------------------------------------------------ | ----------------------------------------------- |
| Mention types           | Files, folders, git, problems, terminal, URLs, images, modes | Files only                                      |
| Slash commands          | Full `/command` menu with fuzzy matching                     | None                                            |
| Ghost-text state mgmt   | Single `syncAutocompleteTextVisibility()` function           | Scattered across 8+ locations                   |
| File search             | Client-side fzf on pre-loaded paths + server search          | Server-only search with 150ms debounce          |
| Mention text handling   | `insertMention()` pure function with space escaping          | Inline regex replacement in `selectMentionFile` |
| Space after mention     | Automatically inserted                                       | Missing — next word concatenates with path      |
| Keyboard navigation     | Unified across context menu + slash commands                 | File mentions only                              |
| Scroll to active item   | `useEffect` on `selectedIndex` with direct DOM measurement   | `queueMicrotask` with `scrollIntoView`          |
| Stale response handling | Random request ID string                                     | Incrementing counter + string prefix comparison |
| Pre-loaded file list    | `filePaths` + `openedTabs` from extension state context      | Not available — fully server-dependent          |

## Bugs in Current Implementation

### Bug 1: "No files found" flash on every keystroke

**File:** `useFileMention.ts:112-121`
When user types `@`, `mentionQuery` is set immediately (showing the dropdown), but file search is debounced 150ms. During the gap, `mentionResults()` is stale/empty, showing "No files found" flash.

**Fix:** Don't show the dropdown until results arrive, or show a loading state, or keep previous results while loading.

### Bug 2: No space inserted after selecting a mention

**File:** `useFileMention.ts:99`
After selecting a file, the cursor is placed right after `@path`. User's next keystrokes concatenate with the path. Legacy inserts a space: `"@" + processedValue + " "`.

**Fix:** Append a space after the path in `selectMentionFile`.

### Bug 3: `buildTextAfterMentionSelect` is dead code

**File:** `file-mention-utils.ts:21`
The function exists and is tested, but `selectMentionFile` in `useFileMention.ts:90-99` duplicates the logic inline.

**Fix:** Either use the utility function or delete it.

### Bug 4: `syncMentionedPaths` false positives

**File:** `file-mention-utils.ts:12`
`text.includes(\`@${path}\`)`matches substrings: if mentioned path is`a.ts`, the text `@a.tsx` still matches. Path stays in set incorrectly.

**Fix:** Use a word-boundary regex: `/(?:^|\s)@${escapedPath}(?:\s|$)/` or check that the character after the path is whitespace/end.

### Bug 5: `workspaceDir` is never set before first search

**File:** `useFileMention.ts:41`
If user types `@path` manually (without using the dropdown) and sends, `workspaceDir` is `""`, producing malformed `file://` URLs.

**Fix:** Request `workspaceDir` at mount time, or make it a signal initialized from server state.

### Bug 6: Ghost text cleared in too many places, not enough

**File:** `PromptInput.tsx` lines 225, 234, 246, 274, 301, 401, 408, 433, 449, 499, 534
Ghost text is imperatively cleared in 11 different places. Missing: clicking in the middle of text (partially handled by `clearIfNotAtEnd` on `onClick`/`onSelect`/`onKeyUp` but not on focus changes or window blur).

### Bug 7: Ghost-text debounce timer not cleared on unmount race

**File:** `PromptInput.tsx:331`
If the component unmounts during a debounce, the timer fires and calls `requestAutocomplete`, which posts a message to a potentially dead webview.

**Fix:** Already handled in `onCleanup` at line 331, but `requestAutocomplete` itself doesn't check if the component is still mounted before posting.

## Improvement Plan

### Phase 1: Fix Critical Bugs (Low risk)

**1.1 — Insert space after mention selection**

- In `useFileMention.ts:selectMentionFile`, change line 99 to: `const newText = replaced + " " + after`
- Update cursor position: `const newCursor = replaced.length + 1`
- Update tests

**1.2 — Fix "No files found" flash**

- Add a `loading` signal to `useFileMention`
- Set `loading(true)` when `requestFileSearch` is called, `loading(false)` when results arrive
- In the dropdown, show "Searching..." while loading instead of "No files found"
- Alternatively: keep showing previous results until new ones arrive (legacy's approach: "Don't clear results until we have new ones. This prevents flickering.")

**1.3 — Fix `syncMentionedPaths` substring matching**

- Replace `text.includes(\`@${path}\`)` with a regex that requires a word boundary after the path
- Add test cases for the `a.ts` / `a.tsx` scenario

**1.4 — Use `buildTextAfterMentionSelect` or delete it**

- Refactor `selectMentionFile` to call `buildTextAfterMentionSelect` (after fixing it to include trailing space)
- Or delete it and its tests if the inline approach is preferred

**1.5 — Initialize `workspaceDir` properly**

- Convert `workspaceDir` to a signal
- Request it from the extension at mount time (add a `requestWorkspaceDir` message)
- Or derive it from the server connection's session directory

### Phase 2: Extract and Centralize Ghost-Text State (Medium risk)

**2.1 — Extract ghost-text autocomplete to a hook**
Create `useGhostText.ts` hook (mirroring legacy's `useChatAutocompleteText`):

```
interface GhostText {
  text: Accessor<string>
  accept: () => void
  dismiss: () => void
  sync: () => void        // single source of truth function
  onInput: (val: string) => void
  onKeyDown: (e: KeyboardEvent) => boolean
  enabled: Accessor<boolean>
}
```

Key design: a single `sync()` function that checks (1) focus, (2) cursor at end, (3) prefix still matches, (4) not in mention mode — and sets ghost text visibility accordingly. Every event handler calls `sync()` instead of independently managing `setGhostText("")`.

**2.2 — Clean up PromptInput.tsx**

- Remove all inline ghost text management from `PromptInput.tsx`
- Wire `handleInput`, `handleKeyDown`, `clearIfNotAtEnd` to the hook
- Reduces `PromptInput.tsx` by ~80 lines

### Phase 3: Rich Mention Types (Medium risk, high value)

**3.1 — Add mention type system**
Introduce a `MentionType` enum similar to legacy's `ContextMenuOptionType`:

```
enum MentionType {
  File = "file",
  Folder = "folder",
  Problems = "problems",
  Terminal = "terminal",
  URL = "url",
  Git = "git",
}
```

**3.2 — Add top-level category menu**
When user types just `@` (empty query), show categories:

- Problems, Terminal, URL, Folder, File, Git
- Selecting a category drills into it (like legacy)

**3.3 — Add client-side fuzzy matching**

- Pre-load open tabs and workspace file list from the server
- Use `fzf` or similar for instant client-side matching
- Fall back to server search for deep queries
- This eliminates the 150ms debounce latency for common files

### Phase 4: Slash Commands (Medium risk, high value)

**4.1 — Add `/` command detection**

- Detect `/` at start of input (like legacy's `shouldShowSlashCommandsMenu`)
- Show a command dropdown above the input

**4.2 — Implement command menu**

- Port `SlashCommandMenu` component to SolidJS
- Support mode switching, `/newtask`, and workflow commands
- Use fuzzy matching on command names

**4.3 — Wire keyboard navigation**

- Share the arrow key / enter / tab / escape pattern with mentions
- Ensure slash commands and mentions are mutually exclusive (legacy's approach)

### Phase 5: Architectural Cleanup (Low risk)

**5.1 — Consolidate event handler into a dispatch pattern**
Replace the chain of `if (message.type === ...)` in the `vscode.onMessage` handler with a dispatch map:

```ts
const handlers: Record<string, (msg: any) => void> = {
  chatCompletionResult: handleCompletionResult,
  fileSearchResult: handleFileSearchResult,
  autocompleteSettingsLoaded: handleSettingsLoaded,
  // ...
}
```

**5.2 — Fix extension-side per-request instantiation**
`handleChatCompletionRequest.ts` creates new `FileIgnoreController`, `VisibleCodeTracker`, and `ChatTextAreaAutocomplete` on every request. These should be cached/reused.

**5.3 — Fix telemetry instance mismatch**
`handleChatCompletionAccepted.ts` uses a singleton `AutocompleteTelemetry`, while `handleChatCompletionRequest.ts` creates a new one per request. Unify to a single shared instance.

## Priority Order

| Priority | Phase                            | Effort    | Impact                                           |
| -------- | -------------------------------- | --------- | ------------------------------------------------ |
| P0       | 1.1 Space after mention          | 15 min    | Fixes daily annoyance                            |
| P0       | 1.2 Flash on empty results       | 30 min    | Fixes jarring visual bug                         |
| P0       | 1.3 Substring false positive     | 30 min    | Fixes incorrect mention tracking                 |
| P1       | 2.1-2.2 Ghost-text hook          | 2-3 hours | Reduces scattered state bugs, easier maintenance |
| P1       | 1.4-1.5 Dead code + workspaceDir | 1 hour    | Code quality + edge case fix                     |
| P2       | 3.1-3.3 Rich mentions + fuzzy    | 4-6 hours | Feature parity with legacy, faster UX            |
| P2       | 4.1-4.3 Slash commands           | 3-4 hours | Feature parity with legacy                       |
| P3       | 5.1-5.3 Architectural cleanup    | 2-3 hours | Maintainability                                  |

## Design Principles (from Legacy)

1. **Single source of truth for visibility**: Legacy's `syncAutocompleteTextVisibility()` is the key pattern. One idempotent function that derives visibility from all relevant state. Call it everywhere instead of hand-managing show/hide in each handler.

2. **Keep previous results while loading**: Don't clear search results until new ones arrive. This prevents flickering.

3. **Pure functions for text manipulation**: `insertMention()`, `removeMention()`, `shouldShowContextMenu()` are all pure functions. The current codebase already does this for some utils but not consistently.

4. **Client-side fuzzy matching first**: Pre-load the file list and do instant fuzzy matching. Only hit the server for deep/expensive queries. This makes the dropdown feel instant.

5. **Space after mentions**: Always insert a trailing space after selecting a mention. This is the standard in every mention system (Slack, GitHub, Discord, etc.).
