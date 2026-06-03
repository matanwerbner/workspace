---
phase: 05-terminal-session-reconnect-across-page-reloads
plan: 01
subsystem: terminal
tags: [terminal, ipc, session-reconnect, buffer]
dependency_graph:
  requires: []
  provides: [viewSessions-registry, terminal:reconnect-channel, termBuffer-helper]
  affects: [electron/ipc/terminal.ts, electron/preload.ts, src/ipc/client.ts]
tech_stack:
  added: []
  patterns: [viewId-keyed registry, capped tail-buffer, sender re-wiring on reconnect]
key_files:
  created:
    - src/shell/termBuffer.ts
    - src/shell/__tests__/termBuffer.test.ts
  modified:
    - electron/ipc/terminal.ts
    - electron/preload.ts
    - src/ipc/client.ts
decisions:
  - "onExit does NOT delete the viewSessions entry — reconnect is the single cleanup point for dead ptys (detects the dead pty and removes the entry, returning null)"
  - "node-pty onData/onExit register additional listeners on reconnect; stale create-time listeners become guarded no-ops via isDestroyed()"
  - "No feature flag — viewId-absent callers follow the original code path byte-for-byte"
metrics:
  duration: ~15min
  completed: 2026-06-03
  tasks: 3
  files: 5
---

# Phase 05 Plan 01: Terminal Session Reconnect — Main-Process Registry and IPC Plumbing Summary

**One-liner:** viewId-keyed `viewSessions` registry in the main process with a `terminal:reconnect` IPC handler that returns the live session (re-wiring `event.sender`) or null for dead/missing ptys, plus a 50 KB capped output buffer extracted into the pure `src/shell/termBuffer.ts` helper.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Pure output-buffer cap helper + unit tests | 9c44f1d | src/shell/termBuffer.ts, src/shell/__tests__/termBuffer.test.ts |
| 2 | viewId registry, reconnect handler, kill cleanup | b87e3f0 | electron/ipc/terminal.ts |
| 3 | Expose terminalReconnect through preload + typed client | a0c001d | electron/preload.ts, src/ipc/client.ts |

## What Was Built

**`src/shell/termBuffer.ts`** — Pure module (no electron/node imports) exporting:
- `TERM_BUFFER_CAP = 50000` — the 50 KB cap constant
- `appendCapped(buf, chunk): string` — concatenates and tail-slices when over cap

**`electron/ipc/terminal.ts`** — Extended with:
- `viewSessions: Map<string, { termId, outputBuf }>` keyed by viewId
- `terminal:create` accepts optional `viewId`, registers entry and accumulates capped output in `onData`
- `terminal:reconnect` handler: returns `{termId, outputBuf}` for live pty (re-wiring `event.sender` with fresh `onData`/`onExit`), or `null` + deletes orphaned entry for dead pty
- `terminal:kill` iterates `viewSessions` to remove the entry matching the killed `termId`
- `disposeTerminals` calls `viewSessions.clear()` after killing all ptys

**`electron/preload.ts`** — Added `terminalReconnect(viewId)` bridge method; updated `terminalCreate` to accept optional `viewId`.

**`src/ipc/client.ts`** — Added typed `terminalReconnect(viewId)` wrapper; updated `terminalCreate` signature.

## Verifications

- `npx vitest run src/shell/__tests__/termBuffer.test.ts` — 8/8 tests pass
- `npm run typecheck:node` — 0 errors in `electron/ipc/terminal.ts`
- `npm run typecheck:web` — 0 errors in `electron/preload.ts` or `src/ipc/client.ts`

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all registry logic is fully wired. The renderer-side reconnect call (plan 05-02) is not yet implemented, but this plan's contract is complete and self-consistent.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes beyond what the plan's threat model covers (T-05-01 through T-05-SC all addressed).

## Self-Check: PASSED

- src/shell/termBuffer.ts: EXISTS
- src/shell/__tests__/termBuffer.test.ts: EXISTS
- electron/ipc/terminal.ts: EXISTS and MODIFIED
- electron/preload.ts: EXISTS and MODIFIED
- src/ipc/client.ts: EXISTS and MODIFIED
- Commits 9c44f1d, b87e3f0, a0c001d: VERIFIED in git log
