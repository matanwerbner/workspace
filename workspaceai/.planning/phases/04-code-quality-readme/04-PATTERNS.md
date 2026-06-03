# Phase 4: Code Quality Pass and README Update — Pattern Map

**Mapped:** 2026-06-03
**Files analyzed:** 8 modified files + 2 doc files
**Analogs found:** 8 / 8

---

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `electron/main.ts` | entry/config | request-response | `electron/ipc/roots.ts` | role-match (type guard pattern) |
| `src/views/__tests__/registry.test.ts` | test | — | `src/state/__tests__/migrate.test.ts` | exact (vitest, same project) |
| `src/shell/ChatPanel.tsx` | component | event-driven | `src/shell/SettingsModal.tsx` | exact (same shell layer) |
| `src/shell/SettingsModal.tsx` | component | request-response | `src/shell/ChatPanel.tsx` | exact |
| `src/lib/models.ts` *(new)* | utility | transform | `src/lib/markdown.ts` (inferred) | role-match |
| `electron/ipc/workspace.ts` | ipc-handler | request-response | `electron/ipc/ai.ts` | exact (same ipc layer) |
| `src/shell/Sidebar.tsx` | component | event-driven | `src/state/store.ts` | partial (same log() pattern) |
| `src/state/store.ts` | store | CRUD | self (pre-existing log() usage) | exact |
| `src/views/browser/BrowserView.tsx` | component | event-driven | `src/state/store.ts` | partial (same log() pattern) |
| `README.md` | doc | — | current codebase | — |
| `CLAUDE.md` | doc | — | `electron/logger.ts` JSON shape | — |

---

## Pattern Assignments

### `electron/main.ts` — Fix TypeScript errors (lines 1, 223–225)

**Issue 1 — Dead import (`nativeImage`):**

Current line 1 (remove `nativeImage`):
```typescript
// BEFORE:
import { app, BrowserWindow, Menu, nativeImage, net, protocol, session, shell } from 'electron';

// AFTER:
import { app, BrowserWindow, Menu, net, protocol, session, shell } from 'electron';
```

**Issue 2 — `getPersistedAppState()` typed as `unknown`, properties accessed without guard:**

Current lines 222–226 (add runtime type guards):
```typescript
// BEFORE (causes TS2339):
const persistedState = getPersistedAppState();
const activeWs = Array.isArray(persistedState?.workspaces)
  ? (persistedState.workspaces as ...).find(...)
  : undefined;
```

**Analog — type guard pattern from `electron/ipc/roots.ts` lines 69–89:**
```typescript
export function collectRootPaths(state: unknown): string[] {
  const paths: string[] = [];
  if (typeof state !== 'object' || state === null) return paths;
  const workspaces = (state as { workspaces?: unknown }).workspaces;
  if (!Array.isArray(workspaces)) return paths;
  for (const ws of workspaces) {
    const homeFolder = (ws as { homeFolder?: unknown })?.homeFolder;
    if (typeof homeFolder === 'string') paths.push(homeFolder);
    // ...
  }
  return paths;
}
```

Apply the same `(state as { workspaces?: unknown }).workspaces` + `Array.isArray()` pattern to the `main.ts` access. The result should look like:

```typescript
const persistedState = getPersistedAppState();
const rawState = persistedState as { workspaces?: unknown; activeWorkspaceId?: unknown } | null;
const activeWs =
  rawState && Array.isArray(rawState.workspaces)
    ? (rawState.workspaces as Array<{ id: string; homeFolder?: string }>).find(
        (w) => w.id === rawState.activeWorkspaceId,
      )
    : undefined;
```

---

### `src/views/__tests__/registry.test.ts` — Fix ComponentType mismatch (line 56)

**Issue:** `vi.fn() as React.ComponentType<{ instance: unknown }>` is not assignable to `ComponentType<{ instance: ViewInstance<unknown> }>`.

**Current line 53–55:**
```typescript
const Component = vi.fn(() => null) as unknown as React.ComponentType<{
  instance: unknown;
}>;
```

**Fix — change type annotation to match `registerView` signature:**
```typescript
const Component = vi.fn(() => null) as unknown as React.ComponentType<{
  instance: ViewInstance<unknown>;
}>;
```

The `ViewInstance` type is imported from `../views/types` — check existing imports in the test file and add the import if missing.

---

### `src/lib/models.ts` *(new file)* — Shared MODEL_OPTIONS constant

**Purpose:** Extract the `MODEL_OPTIONS` array so both `ChatPanel.tsx` and `SettingsModal.tsx` import from one source.

**Pattern — use the longer "Claude …" label format (from `SettingsModal.tsx` lines 9–13):**
```typescript
// src/lib/models.ts
export const MODEL_OPTIONS: { label: string; value: string }[] = [
  { label: 'Claude Opus 4.8', value: 'claude-opus-4-8' },
  { label: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6' },
  { label: 'Claude Haiku 4.5', value: 'claude-haiku-4-5-20251001' },
];
```

**Import in `ChatPanel.tsx` and `SettingsModal.tsx`:**
```typescript
import { MODEL_OPTIONS } from '../lib/models';
```

Remove the local `MODEL_OPTIONS` const from both files after adding the import.

---

### `src/shell/ChatPanel.tsx` — Remove SvgCanvas dead code

**Dead code block — `SvgCanvas` component (lines 85–132) and `image` ResponseFormat:**

The `void SvgCanvas;` suppression on line 132 is the code smell. Disposition: remove the entire `SvgCanvas` function, the `void SvgCanvas` line, and the `'image'` arm from:
- `type ResponseFormat` (line 33) — change to `'markdown' | 'html'`
- `buildSystemPrompt` switch — remove the `'image'` case (if present)
- Any `switch (format)` block that handles `'image'`

No analog needed — this is a clean deletion.

---

### `electron/ipc/workspace.ts` — Fix WSAI_FILTERS label

**Current lines 14–16:**
```typescript
const WSAI_FILTERS: Electron.FileFilter[] = [
  { name: 'WorkspaceAI Workspace', extensions: ['wsai.json', 'json'] },
];
```

**Fix — change only the human-readable `name`, leave extensions unchanged:**
```typescript
const WSAI_FILTERS: Electron.FileFilter[] = [
  { name: 'Orbit Workspace', extensions: ['wsai.json', 'json'] },
];
```

Extensions are not changed (`.wsai.json` is a breaking change for existing export files per RESEARCH.md Pitfall 1 note).

---

### `src/shell/Sidebar.tsx` — Replace `console.error` with `log()`

**Current lines 99–101:**
```typescript
}).catch((err: unknown) => {
  console.error('Failed to create workspace:', err);
});
```

**Analog — error log pattern from `src/state/store.ts` line 365:**
```typescript
log('workspace', 'import:error', { error: e instanceof Error ? e.message : String(e) }, 'error');
```

**Fix:**
```typescript
}).catch((err: unknown) => {
  log('workspace', 'create:error', { error: err instanceof Error ? err.message : String(err) }, 'error');
});
```

`log` is already imported in `src/ipc/client` — verify it is imported at the top of `Sidebar.tsx`. Signature: `log(category, action, detail?, level?)`.

---

### `src/state/store.ts` — Remove `console.error` / `console.warn` (lines 366, 382)

**Analog — the `log()` call on line 365 already fires before the `console.error` on line 366.** The `console.error` is redundant and should be deleted outright (the log call above it already records the error).

**Line 366 — remove:**
```typescript
// DELETE: console.error('Workspace import failed:', e);
```

**Lines 381–383 — replace `console.warn` with `log()` warn:**
```typescript
// BEFORE:
if (result.missingPaths.length > 0) {
  console.warn('Imported workspace has missing paths:', result.missingPaths);
}

// AFTER:
if (result.missingPaths.length > 0) {
  log('workspace', 'import:missing-paths', { paths: result.missingPaths }, 'warn');
}
```

---

### `src/views/browser/BrowserView.tsx` — Replace `console.log` with `log()` (line 116)

**Current lines 113–117:**
```typescript
const onConsole = (e: Event) => {
  const detail = e as Event & { level?: number; message?: string };
  // eslint-disable-next-line no-console
  console.log('[webview]', detail.message);
};
```

**Analog — `log()` pattern from `src/ipc/client.ts` lines 127–138:**
```typescript
log(category, action, detail?, level?)
```

**Fix:**
```typescript
const onConsole = (e: Event) => {
  const detail = e as Event & { level?: number; message?: string };
  log('browser', 'webview:console', { message: detail.message });
};
```

Remove the `// eslint-disable-next-line no-console` comment as well. Ensure `log` is imported from `../../ipc/client` at the top of the file.

---

### `CLAUDE.md` — Fix log field names in debugging section

**Current (wrong):**
```
Log entries follow the shape: { ts, level, category, action, detail }.
```
```bash
grep '"category":"chat"' …
grep '"category":"ipc"' …
```

**Actual shape from `electron/logger.ts`:**
```json
{ "t": "…ISO…", "level": "info", "cat": "chat", "action": "…", "detail": {} }
```

**Fix — update the shape line and all grep examples:**
```
Log entries follow the shape: { t, level, cat, action, detail }.
```
```bash
grep '"cat":"chat"' ~/Library/Application\ Support/workspaceai/logs/<session>.log
grep '"cat":"ipc"' ~/Library/Application\ Support/workspaceai/logs/<session>.log
```

---

### `README.md` — Full rewrite

No single analog — the rewrite must reflect the current codebase. Key sections to cover (content sourced from RESEARCH.md gap analysis):

| Section | Source of truth |
|---------|-----------------|
| Title | `# Orbit` |
| Stack | `package.json` dependencies list |
| View types (5) | `src/views/*/index.tsx` typeId registrations |
| File tree | `ls src/views/`, `ls electron/ipc/`, `ls src/shell/` |
| IPC channels | `electron/preload.ts` exported API surface |
| Security model | `electron/ipc/roots.ts` + CSP section in `main.ts` |
| AI integration | `src/shell/ChatPanel.tsx` agentic loop, streaming, tool calls, approval flow |
| Persistence | `src/state/types.ts` `PersistedAppState` schema (v2), `electron/ipc/store.ts` |
| Session logging | `electron/logger.ts` + `CLAUDE.md` debugging section |
| Build & package | `package.json` scripts: `dev`, `build`, `package` |
| Dev workflow | `npm run dev`, `npm test`, `npm run typecheck` |

---

## Shared Patterns

### Session log replacement for `console.*`

**Source:** `src/ipc/client.ts` lines 127–138, with usage examples throughout `src/state/store.ts`

**Apply to:** `src/shell/Sidebar.tsx`, `src/state/store.ts`, `src/views/browser/BrowserView.tsx`

```typescript
// Import at top of file:
import { log } from '../ipc/client';  // adjust relative path per file

// Usage:
log('category', 'action', { detail: 'object' });             // info level (default)
log('category', 'action', { detail: 'object' }, 'error');    // error level
log('category', 'action', { detail: 'object' }, 'warn');     // warn level
```

Category conventions already in use: `'workspace'`, `'view'`, `'chat'`, `'app'`, `'settings'`, `'browser'`

### Runtime type guard for `unknown` main-process state

**Source:** `electron/ipc/roots.ts` lines 69–89 (`collectRootPaths`)

**Apply to:** `electron/main.ts` lines 223–225

Pattern: cast `unknown` to `{ field?: unknown }`, check `typeof` or `Array.isArray()` before accessing nested properties. Never import renderer-side types (`PersistedAppState`) into the electron main process.

---

## No Analog Found

All files have clear analogs. No files in this phase require patterns from external sources.

---

## Metadata

**Analog search scope:** `electron/`, `src/shell/`, `src/state/`, `src/views/`, `src/ipc/`, `src/lib/`
**Files scanned:** 14 source files + 2 doc files
**Pattern extraction date:** 2026-06-03
