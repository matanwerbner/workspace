# Phase 4: Code Quality Pass and README Update — Research

**Researched:** 2026-06-03
**Domain:** TypeScript/Electron code cleanup, documentation accuracy
**Confidence:** HIGH (entire codebase read directly, no external lookups required)

---

## Summary

Phase 4 is a cleanup and documentation phase with no new features. The work falls into three categories:

1. **Fix TypeScript errors** — `npm run typecheck` currently fails with 4 errors across two configs (3 in the node config, 1 in the web config). These must be zero before the phase is done.

2. **Remove or reconcile dead code** — several patterns survive in the codebase past their usefulness: a dead import (`nativeImage`), a field maintained in the schema but never written (`viewTypeUsage`), and a UI component that exists as future infrastructure (`SvgCanvas`). Each needs a clear disposition (remove or document the intent).

3. **Update documentation** — README.md describes a much earlier version of the app (single view type, no real AI backend, old name "WorkspaceAI"). CLAUDE.md contains a verifiable inaccuracy in the log-field documentation. Both need accurate rewrites based on the codebase as it stands today.

**Primary recommendation:** Work through the issues in this order — TypeScript errors first (they gate `npm run typecheck`), then dead-code cleanup (these affect maintainability), then naming inconsistencies (cosmetic but confusing), then documentation (safest last; depends on all other fixes being done first).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| TypeScript error fixes | Electron main (node) + Renderer (web) | — | Errors span both tsconfig scopes |
| Dead-code removal | Renderer + Electron main | — | Issues appear in both processes |
| Naming consistency | Electron IPC + Renderer | — | `workspaceai-*` store names in electron; MODEL_OPTIONS labels in renderer |
| README rewrite | Docs only | — | No code change; reflects current codebase state |
| CLAUDE.md fix | Docs only | — | Single log-field name inaccuracy to correct |

---

## Concrete Issues Found

### TypeScript Errors (must fix — gate for `npm run typecheck`)

**Node config (`tsconfig.node.json`) — 3 errors:**

1. `electron/main.ts:1` — `nativeImage` is imported but never read.
   - **Root cause:** The `setDockIcon` function was refactored from `nativeImage.createFromPath()` to offscreen Chromium rendering, but the import was not cleaned up.
   - **Fix:** Remove `nativeImage` from the import destructure on line 1.

2. `electron/main.ts:223–225` — `Property 'workspaces' / 'activeWorkspaceId' does not exist on type '{}'`
   - **Root cause:** `getPersistedAppState()` in `electron/ipc/store.ts` returns `unknown` (typed as the `Schema['appState']` which is `unknown`). `main.ts` accesses `.workspaces` and `.activeWorkspaceId` on it without a type guard.
   - **Fix:** Add a type guard around the property access, or widen the return type of `getPersistedAppState()` to include the expected shape. The simplest approach consistent with the existing pattern in `electron/ipc/roots.ts` (`collectRootPaths` already handles `unknown` input) is to add the same isRecord + Array.isArray guards already used in roots.ts.

**Web config (`tsconfig.web.json`) — 1 error:**

3. `src/views/__tests__/registry.test.ts:56` — `ComponentType<{instance: unknown}>` is not assignable to `ComponentType<{instance: ViewInstance<unknown>}>`.
   - **Root cause:** The mock component in the test uses `instance: unknown` but `registerView` expects `ComponentType<{instance: ViewInstance<TConfig>}>`. The `vi.fn()` cast to `React.ComponentType<{instance: unknown}>` is not compatible.
   - **Fix:** Change the test's type annotation to `React.ComponentType<{ instance: ViewInstance<unknown> }>` so it matches the actual `registerView` signature.

### Dead Code (disposition required)

**`viewTypeUsage` field — remove or promote to used**

- `PersistedAppState.viewTypeUsage: Record<string, number>` exists in `src/state/types.ts`.
- `migrate.ts` reads it from persisted blobs and preserves it, and `snapshot()` always writes `viewTypeUsage: {}`.
- There are no writes to this field anywhere in the store (confirmed: no `viewTypeUsage` in `src/shell/` or `src/App.tsx`).
- It is read by `migrate.ts` and tested in `src/state/__tests__/migrate.test.ts` for round-trip preservation — but nothing produces the non-empty case in production.
- **Disposition:** This is purposeful schema scaffolding but currently dead. The cleanest path is to keep it in the persisted schema (it does no harm) but remove the `AppStore` type if it was ever there — checking: it is NOT in `AppStore` interface, only in `PersistedAppState`. Current state is safe — no action needed unless the task decides to trim the type.

**`nativeImage` import — confirmed dead, remove**

```
// electron/main.ts line 1
import { app, BrowserWindow, Menu, nativeImage, net, protocol, session, shell } from 'electron';
//                                   ^^^^^^^^^^^
// Used by old setDockIcon (nativeImage.createFromPath). New setDockIcon uses
// offscreen Chromium rendering instead. nativeImage is never referenced below.
```

**`SvgCanvas` component + `image` ResponseFormat — intentional but suppressed**

- `ChatPanel.tsx` lines 87–128: `SvgCanvas` renders SVG via canvas for the `image` ResponseFormat.
- Line 132: `void SvgCanvas;` suppresses the unused-variable error.
- The `image` case exists in `buildSystemPrompt` and in the `ResponseFormat` type but is not wired to any UI control.
- The comment on line 130–132 explains the intent.
- **Disposition:** This is documented future infrastructure. For this phase: evaluate whether to remove the dead branch or promote it. The comment is intentional, so keeping it with the existing comment is acceptable. However, the `void SvgCanvas` suppression is a code smell. If the `image` format is genuinely out of scope, remove the SvgCanvas component and the `image` case from `buildSystemPrompt` and `ResponseFormat`. If it is being kept for near-term use, the `void` suppression is acceptable.

### Naming Inconsistencies

**`MODEL_OPTIONS` labels differ between ChatPanel and SettingsModal**

| File | Labels |
|------|--------|
| `src/shell/ChatPanel.tsx:28–30` | `'Opus 4.8'`, `'Sonnet 4.6'`, `'Haiku 4.5'` |
| `src/shell/SettingsModal.tsx:10–12` | `'Claude Opus 4.8'`, `'Claude Sonnet 4.6'`, `'Claude Haiku 4.5'` |

The user sees both dropdowns; they should use the same labels. Either extract to a shared constant or pick one format and apply it to both.

**Store names still use "workspaceai" brand**

| Location | Value |
|----------|-------|
| `electron/ipc/ai.ts:10` | `name: 'workspaceai-keys'` |
| `electron/ipc/store.ts:11` | `name: 'workspaceai-state'` |

These are `electron-store` file names (stored at `~/Library/Application Support/orbit/` on macOS). Changing them would invalidate existing user installations (keys and state would be lost on upgrade). **Do not rename these store files** — note in RESEARCH that this is intentionally left as-is to avoid breaking upgrades.

**WSAI_FILTERS label says "WorkspaceAI Workspace"**

`electron/ipc/workspace.ts:15`:
```ts
const WSAI_FILTERS: Electron.FileFilter[] = [
  { name: 'WorkspaceAI Workspace', extensions: ['wsai.json', 'json'] },
];
```
The label shown in the macOS save/open dialog still says "WorkspaceAI Workspace". This should become "Orbit Workspace". The `.wsai.json` extension is a cosmetic issue but changing it is a breaking change for existing export files — leave the extension but fix the human-readable label.

### Console.log / Console.warn Calls

Three `console.*` calls remain in non-test code:

| File | Line | Call |
|------|------|------|
| `src/shell/Sidebar.tsx:100` | `console.error('Failed to create workspace:', err)` | Error path in `onCreateWorkspace` |
| `src/state/store.ts:366` | `console.error('Workspace import failed:', e)` | Error path in `importWorkspace` |
| `src/state/store.ts:382` | `console.warn('Imported workspace has missing paths:', result.missingPaths)` | Warning in `importWorkspace` |
| `src/views/browser/BrowserView.tsx:116` | `console.log('[webview]', detail.message)` | Debug log in webview console bridge |

All these paths already call `log(...)` from `ipc/client` for the session log file, except `BrowserView.tsx:116` which only does `console.log`. The convention in this codebase is to route all observability through the session log (never raw `console.*`), so these should be replaced with `log(category, action, detail)` calls or removed.

---

## README.md — Gap Analysis

The current README.md was written when the app had one view type and a stub AI backend. Here is every section that needs to change:

| README Section | Current (stale) | Correct (current) |
|---------------|-----------------|-------------------|
| Title | `# WorkspaceAI` | `# Orbit` |
| Tagline | "A macOS container app for views…" | Accurate but thin — mention Claude API integration |
| Stack | Missing: `node-pty`, `marked`, `pdfjs-dist`, Anthropic SDK | Add all relevant deps |
| Architecture → view types | "Today there is one view type — Code View" | 5 view types: code, browser, terminal, pdf, notepad |
| Architecture → file tree | Shows `views/code/` only; missing `views/browser`, `views/terminal`, `views/pdf`, `views/notepad`, `shell/memory.ts`, `shell/termBuffer.ts`, `electron/logger.ts`, etc. | Current tree with all directories |
| Architecture → IPC section | Not present | Add: IPC channels table, preload bridge pattern, security model (roots, CSP) |
| AI chat section | "messages echo back with 'AI backend not configured'" | Claude API fully wired, streaming, agentic loop, tool calls, approval flow |
| Persistence | Correct conceptually but missing: workspace model, multi-workspace, memory, homeFolder | Update with current schema (v2), workspace/memory details |
| "Adding a new view type" | Mentions old `FileTree.tsx` path; otherwise structurally correct | Update Case B step list, remove stale file references |
| Missing sections | — | Add: Session Logging, Workspace Memory, Terminal Reconnect (dev mode), Build & Package |

---

## CLAUDE.md — Accuracy Issue

**Log field names are wrong.** CLAUDE.md says:

> Log entries follow the shape: `{ ts, level, category, action, detail }`.

The grep examples in the debugging section use:
```bash
grep '"category":"chat"' …
```

The actual JSON emitted by `electron/logger.ts` line 161–167 is:
```json
{ "t": "…ISO…", "level": "info", "cat": "chat", "action": "…", "detail": {} }
```

The field is `t` (not `ts`) and `cat` (not `category`). The grep commands in CLAUDE.md will produce zero results on real log files.

**Fix:**
- Change the shape documentation to `{ t, level, cat, action, detail }`.
- Update the grep examples to use `"cat":"chat"` and `"cat":"ipc"`.

---

## Architecture Patterns

### View Type Registration Pattern (standard — no changes needed)

```typescript
// Every view type follows this pattern in src/views/<name>/index.tsx
registerView<TConfig>({
  typeId: 'name',
  label: 'Label',
  description: 'One-line description.',
  icon: <span className="view-type-icon">…</span>,
  createConfig: async () => { /* picker dialog → { name, config } */ },
  Component: TheViewComponent,
  tools?: AiTool[],          // optional — AI tools this view exposes
  executeTool?: async (name, input, instance) => { /* run tool */ },
  getContext?: (instance) => string,  // injected into system prompt
});
```

### Session Logging Pattern (standard — use consistently)

```typescript
// In renderer code:
import { log } from '../ipc/client';
log('category', 'action', { detail: 'object' }, /* level? */);

// In electron/ipc handlers: automatic via withLogging() wrapper in ipc/index.ts
// Manual: import { logEvent } from '../logger'; logEvent({ category, action, detail });
```

Never use `console.log`/`console.error` in non-test code — route everything through `log()`.

### Consistent Model Options (extract as shared constant)

Recommendation: extract `MODEL_OPTIONS` to `src/lib/models.ts` and import in both `ChatPanel.tsx` and `SettingsModal.tsx`. Use the longer "Claude Opus 4.8" format (matches brand).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| TypeScript unused-var suppression | `void foo;` workaround | Remove the dead code or add a `// eslint-disable-next-line` with justification — but for this phase, just remove the dead component |
| Store file naming | Renaming `electron-store` file names | Leave as-is — changes break user upgrades |

---

## Common Pitfalls

### Pitfall 1: Renaming electron-store file names
**What goes wrong:** If `workspaceai-state` or `workspaceai-keys` are renamed, existing users lose their persisted state and API key on upgrade because electron-store uses the `name` as the filename.
**How to avoid:** Leave store file names unchanged. Note in the README that the internal storage files use the legacy `workspaceai-*` names.

### Pitfall 2: Fixing `getPersistedAppState()` return type too aggressively
**What goes wrong:** Returning `PersistedAppState` directly from `getPersistedAppState()` in `store.ts` would require importing from `src/state/types.ts` into the electron main process — crossing the process boundary in the type system. The main process currently intentionally treats the value as `unknown` and uses runtime checks.
**How to avoid:** The fix for the TypeScript error in `main.ts` should use runtime type guards (matching the pattern in `roots.ts:collectRootPaths`) rather than importing the renderer-side `PersistedAppState` type into the main process.

### Pitfall 3: SvgCanvas/image format — removing too much or too little
**What goes wrong:** The `image` ResponseFormat exists in `buildSystemPrompt` and `ResponseFormat` type but the UI only exposes `markdown`/`html`. If SvgCanvas is removed, the `image` case in `buildSystemPrompt` becomes dead. If both are removed but the setting is later added, the work is repeated.
**How to avoid:** Decide once: either remove the entire `image` branch and `SvgCanvas` (clean), or keep both with a comment explaining they are ready for when the UI exposes the option. Either is acceptable; the goal is no `void SvgCanvas` suppression line.

---

## Validation Architecture

The project has two validation mechanisms:

### TypeScript typecheck (must pass)
```bash
npm run typecheck
```
Runs both `typecheck:node` and `typecheck:web`. Currently fails with 4 errors. After this phase it must pass clean (zero errors).

### Vitest unit tests (must stay green)
```bash
npm test
```
Currently: 12 test files, 162 tests, all passing. Any code changes in this phase must not break existing tests.

**Phase deliverables → validation mapping:**

| Deliverable | How to verify |
|-------------|---------------|
| Remove `nativeImage` dead import | `npm run typecheck:node` — error TS6133 disappears |
| Fix `getPersistedAppState()` type issue | `npm run typecheck:node` — errors TS2339 disappear |
| Fix registry test ComponentType | `npm run typecheck:web` — error TS2322 disappears |
| `MODEL_OPTIONS` extraction | `npm run typecheck:web` + `npm test` — both pass |
| WSAI_FILTERS label fix | Grep for "WorkspaceAI Workspace" returns nothing |
| Console.* → log() replacements | `grep -rn "console\." src/ electron/` returns only test files |
| README accuracy | Human review against current `ls src/views/`, `cat electron/preload.ts` |
| CLAUDE.md log field fix | `grep '"cat":' …log` returns results on a real session log |

**Wave 0 gaps:** No new test files are needed for this phase. All changes are either type fixes, code cleanup, or documentation. The existing test suite covers the behavioral contracts that must not regress.

---

## Environment Availability

Step 2.6 SKIPPED — this phase is purely code/config/doc changes. No external tools, services, or runtimes beyond the project's existing dev dependencies.

---

## Open Questions (RESOLVED)

1. **`viewTypeUsage` field — promote or leave?**
   - What we know: the field is in the persisted schema, read by `migrate.ts`, tested for round-trip, but never written with real data. `snapshot()` always returns `{}`.
   - What's unclear: is there a plan to add usage tracking, or is this truly dead schema weight?
   - Recommendation: Leave it in the persisted schema (no breaking change, test passes) but note it in comments. Do not add it to `AppStore` until there is actual feature work.

2. **`SvgCanvas` / `image` format — remove or document?**
   - What we know: it exists, is suppressed with `void`, and has a comment explaining the intent.
   - Recommendation: Remove both `SvgCanvas` and the `image` branch from `buildSystemPrompt`/`ResponseFormat`. The feature is too incomplete to keep as live infrastructure. It can be re-added cleanly when the UI exposes it.

3. **`console.log` in `BrowserView.tsx:116`**
   - What we know: the webview console bridge logs `[webview]` messages to the console. This is debug tooling for the browser view.
   - Recommendation: Replace with `log('browser', 'webview:console', { message: detail.message })` so it goes into the session log file where all other debug events live.

---

## Sources

All findings are [VERIFIED] from direct codebase reads in this session. No external lookups were performed (this phase requires no new libraries or external APIs).

| File | What was checked |
|------|-----------------|
| `electron/main.ts` | Full read — dead import, type error, dock icon implementation |
| `electron/preload.ts` | Full read — complete IPC surface area for README |
| `electron/ipc/*.ts` | All 11 files — IPC handlers, naming issues |
| `electron/logger.ts` | Full read — actual JSON field names |
| `src/state/types.ts` | Full read — `viewTypeUsage` in schema |
| `src/state/migrate.ts` | Full read — `viewTypeUsage` handling |
| `src/shell/ChatPanel.tsx` | Full read — MODEL_OPTIONS, SvgCanvas, agentic loop |
| `src/shell/SettingsModal.tsx` | Full read — MODEL_OPTIONS duplicate |
| `src/shell/memory.ts` | Full read — memory helpers |
| `src/shell/termBuffer.ts` | Full read — terminal buffer cap |
| `src/views/*/index.tsx` | All 5 view registrations |
| `src/views/registry.ts` | Full read |
| `src/views/types.ts` | Full read |
| `src/ipc/client.ts` | Full read |
| `src/App.tsx` | Full read |
| `README.md` | Full read — gap analysis |
| `CLAUDE.md` | Full read — log field accuracy issue |
| `package.json` | Full read — dep list for README stack section |
| `tsconfig.node.json`, `tsconfig.web.json` | Full read — strict flags |
| `npm run typecheck` output | Both configs run — 4 errors confirmed |
| `npm test` output | All 162 tests passing |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Renaming `workspaceai-state`/`workspaceai-keys` store files would break existing users | Pitfall 1 | If no production users exist yet, renaming is safe — but the conservative choice is always to leave store names stable | 

**All other claims are VERIFIED from direct codebase reads.**

---

## Metadata

**Confidence breakdown:**
- Concrete issues (TypeScript errors, dead imports): HIGH — reproduced with `npm run typecheck`
- Dead code analysis: HIGH — confirmed by grepping all usages
- Documentation gap analysis: HIGH — README compared against actual running codebase
- CLAUDE.md inaccuracy: HIGH — logger.ts JSON shape verified against CLAUDE.md text

**Research date:** 2026-06-03
**Valid until:** Stable — no fast-moving external deps involved. Valid until the affected files are changed.
