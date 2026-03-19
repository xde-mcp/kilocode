# Chat Autocomplete Improvement Plan

## Problem Statement

The current chat autocomplete (ghost text + @-mention) implementation is brittle and event-driven in a way that makes state hard to reason about. The legacy extension (`kilocode-legacy-5`) had a more reactive, centralized architecture that was more robust. This plan outlines concrete changes to bring the current implementation to parity and beyond.

---

## Current Architecture (kilo-vscode)

| Subsystem               | Files                                                                       |
| ----------------------- | --------------------------------------------------------------------------- |
| Ghost text autocomplete | `PromptInput.tsx` (inline), extension-side `handleChatCompletionRequest.ts` |
| @-mention file search   | `useFileMention.ts` hook, `file-mention-utils.ts`                           |
| Highlight overlay       | Inline in `PromptInput.tsx`                                                 |

**Key characteristics:**

- SolidJS signals for local UI state
- `postMessage` / `onMessage` request-response with `requestId` correlation
- Ghost text and @-mention logic are interleaved in `PromptInput.tsx`'s event handlers
- No single source of truth for ghost text visibility — show/hide logic is scattered across `handleInput`, `handleKeyDown`, `handleFocus`, `handleBlur`, and the message listener

## Legacy Architecture (kilocode-legacy-5)

| Subsystem               | Files                                                 |
| ----------------------- | ----------------------------------------------------- |
| Ghost text autocomplete | `useChatAutocompleteText.ts` hook                     |
| @-mention context menu  | `context-mentions.ts` utils + `ContextMenu.tsx`       |
| /slash commands         | `slash-commands.ts` utils + `SlashCommandMenu.tsx`    |
| Highlight overlay       | Managed by `updateHighlights()` in `ChatTextArea.tsx` |

**Key characteristics:**

- Each subsystem is a standalone module with its own state and trigger logic
- Ghost text has a **single idempotent sync function** (`syncAutocompleteTextVisibility`) that derives visibility from current state — called from every relevant handler
- Priority-based `handleKeyDown` chain: slash commands > @-mentions > ghost text > send
- `useRef` for internal tracking (focus, debounce, request ID, prefix), `useState` only for rendered ghost text — minimizes re-renders
- Ghost text is saved on blur and restored on focus
- Uses `document.execCommand("insertText")` for undo-preserving acceptance

---

## Identified Bugs and Fragile Patterns

### 1. No single source of truth for ghost text visibility

**Impact: High**

Ghost text show/hide logic is scattered across multiple event handlers in `PromptInput.tsx`. Each handler independently decides whether to clear or keep ghost text. This makes it easy for edge cases to leave ghost text visible when it shouldn't be (or vice versa).

**Fix:** Extract a `syncGhostText()` function (following the legacy pattern) that idempotently derives whether ghost text should be visible based on current state: focused, cursor at end, prefix matches current text, @-mention not open. Call this from every handler instead of inline show/hide logic.

### 2. No cancellation of in-flight LLM requests

**Impact: High**

When the user types a new character, `requestCounter` increments but the old FIM request keeps streaming. `AutocompleteModel.generateFimResponse()` accepts an `AbortSignal` but nobody passes one. Multiple overlapping LLM requests pile up, wasting compute.

**Fix:** Create an `AbortController` per request in `handleChatCompletionRequest`. Pass its signal to `generateFimResponse()`. Abort the previous controller when a new request arrives. On the webview side, send a `cancelChatCompletion` message when the user types (before the debounce fires) so the extension can abort immediately.

### 3. New `ChatTextAreaAutocomplete` + `FileIgnoreController` + `VisibleCodeTracker` created per request

**Impact: Medium**

Every 500ms keystroke creates new instances including I/O-heavy `FileIgnoreController.initialize()`. These should be cached and reused.

**Fix:** Create these once in `KiloProvider` (or a dedicated autocomplete service) and reuse across requests. The `VisibleCodeTracker` snapshot can be refreshed per request without recreating the whole object.

### 4. Telemetry instance mismatch

**Impact: Medium**

`handleChatCompletionRequest` creates a per-request `AutocompleteTelemetry` inside each `ChatTextAreaAutocomplete`, but `handleChatCompletionAccepted` uses a separate singleton. Request and acceptance events go to different instances, breaking session-level correlation.

**Fix:** Use a single shared telemetry instance across request and acceptance handlers.

### 5. `syncMentionedPaths` uses naive substring matching

**Impact: Medium**

`text.includes(@${path})` can false-positive when one path is a prefix of another (e.g., `src/a.ts` vs `src/a.tsx`). Also matches `@path` appearing anywhere in text, not just as standalone tokens.

**Fix:** Use a regex with word-boundary or whitespace checks: `(?:^|\s)@path(?:\s|$)`. Process paths longest-first to prevent prefix shadowing.

### 6. `selectMentionFile` duplicates `buildTextAfterMentionSelect`

**Impact: Low**

The hook inlines the same regex replacement logic that the tested utility function provides.

**Fix:** Call `buildTextAfterMentionSelect()` from `selectMentionFile()` instead of duplicating the logic.

### 7. Overlay scroll sync gaps

**Impact: Low**

`syncHighlightScroll()` is called on `onScroll`, `onInput`, `onPaste` but not on programmatic scrolling (e.g., `textareaRef.scrollTop = textareaRef.scrollHeight` in `appendChatBoxMessage`).

**Fix:** Call `syncHighlightScroll()` after every programmatic scroll change, or use a `MutationObserver` / `ResizeObserver` to keep them in sync.

### 8. Ghost text not preserved across blur/focus

**Impact: Low**

Unlike the legacy implementation, the current code doesn't save ghost text on blur and restore it on focus. If the user clicks away and comes back, the ghost text is gone.

**Fix:** Save ghost text + prefix on blur. On focus, if the text hasn't changed, restore the saved ghost text.

---

## Implementation Plan

### Phase 1: Extract and centralize ghost text logic

**Goal:** Single source of truth for ghost text state, matching the legacy `useChatAutocompleteText` pattern.

1. Create `useGhostText.ts` hook that owns:
   - `ghostText` signal (the displayed completion string)
   - `prefix` tracking (text when request was made)
   - `requestId` counter
   - Debounce timer
   - `syncVisibility()` — idempotent function that derives whether ghost text should show
   - `request()` — triggers a new completion request
   - `accept()` / `acceptWord()` / `dismiss()` — user actions
   - Blur/focus save/restore

2. Remove all ghost text logic from `PromptInput.tsx` event handlers. Replace with calls to the hook's methods.

3. Wire up `syncVisibility()` to be called from: `onInput`, `onFocus`, `onBlur`, `onSelect` (cursor change), `onKeyDown`, and the message listener.

**Estimated effort:** 1-2 days

### Phase 2: Add request cancellation

1. In the extension side, maintain a single `AbortController` for the current autocomplete request.
2. Abort the previous request when a new one arrives.
3. Pass the `AbortSignal` through to `AutocompleteModel.generateFimResponse()`.
4. Add a `cancelChatCompletion` message type so the webview can proactively cancel.

**Estimated effort:** 0.5 days

### Phase 3: Cache per-request objects

1. Create an `AutocompleteService` class (or similar) in the extension that holds:
   - A cached `FileIgnoreController` (refreshed periodically, not per-request)
   - A cached `VisibleCodeTracker`
   - A shared `AutocompleteTelemetry` instance
   - The `AbortController` from Phase 2
2. `KiloProvider` instantiates this once and delegates to it.

**Estimated effort:** 0.5 days

### Phase 4: Fix @-mention edge cases

1. Fix `syncMentionedPaths` to use regex with boundary checks and longest-first processing.
2. Refactor `selectMentionFile` to call `buildTextAfterMentionSelect`.
3. Add scroll sync after programmatic scroll changes.

**Estimated effort:** 0.5 days

### Phase 5: Fix telemetry correlation

1. Use the shared `AutocompleteTelemetry` from Phase 3 for both request and acceptance tracking.
2. Remove the orphaned singleton in `handleChatCompletionAccepted.ts`.

**Estimated effort:** 0.5 days

---

## Out of Scope

- Adding /slash command support (separate feature, not a bug fix)
- Changing the highlight overlay rendering technique (current approach works)
- Changing from SolidJS to React (not practical)

## Success Criteria

- Ghost text never appears when @-mention dropdown is open
- Ghost text survives blur/focus without re-requesting
- Only one LLM request is in-flight at a time
- No per-request object creation overhead
- `syncMentionedPaths` correctly handles prefix-overlapping paths
- Telemetry correctly correlates requests with acceptances
