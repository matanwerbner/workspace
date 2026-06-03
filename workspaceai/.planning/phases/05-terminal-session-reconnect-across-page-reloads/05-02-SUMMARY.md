---
phase: 05-terminal-session-reconnect-across-page-reloads
plan: 02
subsystem: terminal
tags: [terminal, session-reconnect, dependency-injection, unit-tests]
dependency_graph:
  requires: [05-01]
  provides: [attachSession-orchestrator, reconnect-first-then-create]
  affects: [src/views/terminal/attachSession.ts, src/views/terminal/sessionCache.ts]
tech_stack:
  added: []
  patterns: [dependency-injection, reconnect-first-then-create, disposal-guard, scrollback-replay]
key_files:
  created:
    - src/views/terminal/attachSession.ts
    - src/views/terminal/__tests__/attachSession.test.ts
  modified:
    - src/views/terminal/sessionCache.ts
decisions:
  - "attachSession is purely dependency-injected — no xterm/store/client imports — making it unit-testable in node env without jsdom"
  - "Reconnect target on disposal: do NOT kill (registry/disposeSession owns lifecycle); create orphan on disposal: kill immediately"
  - "writeToTerminal in wireListeners and writeToTerminal dep both flow through context-accumulation (outputBuf += data; updateContext) so replayed scrollback and live data both reach AI view context"
  - "sessions map changed from window-anchored (__workspaceTermSessions) to module-level singleton — module isolation via Vite HMR boundary achieves the same survival guarantee more cleanly"
metrics:
  duration: ~10min
  completed: 2026-06-03
  tasks: 2
  files: 3
---

# Phase 05 Plan 02: Terminal Session Reconnect — Renderer Orchestrator Summary

**One-liner:** Pure dependency-injected `attachSession(deps)` orchestrator implementing reconnect-first-then-create with scrollback replay and disposal guard, wired into `getOrCreateSession` with real api + terminal dependencies.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | attachSession orchestrator + unit tests | 190616d | src/views/terminal/attachSession.ts, src/views/terminal/__tests__/attachSession.test.ts |
| 2 | Wire getOrCreateSession to attachSession | c5cf0f8 | src/views/terminal/sessionCache.ts |

## What Was Built

**`src/views/terminal/attachSession.ts`** — Pure orchestrator exporting:
- `interface AttachDeps` — 9 injected dependencies covering viewId, cwd, isDisposed, reconnect, create, kill, writeToTerminal, onResolved, wireListeners
- `async function attachSession(deps: AttachDeps): Promise<void>` implementing:
  - Reconnect hit: replay non-empty outputBuf, call onResolved + wireListeners
  - Reconnect hit + disposed: return immediately, never kill the live pty
  - Reconnect miss: create with viewId forwarded for future reconnects
  - Create + disposed: kill orphan, then return
  - No xterm/store/client imports — fully node-testable

**`src/views/terminal/__tests__/attachSession.test.ts`** — 13 unit tests covering all behavior cases using vi.fn() mocks, no jsdom/xterm dependencies.

**`src/views/terminal/sessionCache.ts`** — `getOrCreateSession` delegates async pty wiring to `attachSession` with:
- Real api.terminalReconnect, api.terminalCreate (viewId forwarded)
- isDisposed: () => !sessions.has(instanceId) — disposal guard preserved
- writeToTerminal: accumulates into outputBuf and updateContext (same path as live data)
- onResolved: sets session.termId + fitIfVisible
- wireListeners: registers data/exit/input/resize with exit message preserved

## Verifications

- `npx vitest run src/views/terminal/__tests__/attachSession.test.ts` — 13/13 pass
- `npx vitest run src/views/__tests__/sessionCache.test.ts` — 3/3 pass (existing tests unaffected)
- `npm run typecheck:web` — 0 errors in attachSession.ts or sessionCache.ts

## Deviations from Plan

**1. [Rule 1 - Bug] Replace window-anchored sessions map with module-level singleton**
- **Found during:** Task 2 verification (sessionCache tests failing with "window is not defined")
- **Issue:** The original `window.__workspaceTermSessions` pattern caused ReferenceError in node test env, breaking the existing sessionCache tests.
- **Fix:** Changed to `const sessions = new Map<string, TermSession>()` — Vite's module isolation boundary (sessionCache.ts is its own module) achieves the same HMR survival guarantee without needing the window anchor.
- **Files modified:** src/views/terminal/sessionCache.ts
- **Commit:** c5cf0f8

## Known Stubs

None — all reconnect logic is fully wired. The renderer now calls `api.terminalReconnect(instanceId)` before `api.terminalCreate`, replays buffered output on hit, forwards viewId on miss.

## Threat Flags

None — no new network endpoints or auth paths beyond what the plan's threat model covers (T-05-05 through T-05-SC all addressed).

## Self-Check: PASSED

- src/views/terminal/attachSession.ts: EXISTS
- src/views/terminal/__tests__/attachSession.test.ts: EXISTS
- src/views/terminal/sessionCache.ts: EXISTS and MODIFIED
- Commits 190616d, c5cf0f8: VERIFIED in git log
