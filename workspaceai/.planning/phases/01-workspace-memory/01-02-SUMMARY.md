---
phase: 01-workspace-memory
plan: "02"
subsystem: electron-ipc-roots
tags: [security, trusted-roots, ipc, tdd]
requires:
  - 01-01-PLAN.md
provides:
  - collectRootPaths (pure helper, unit-testable)
  - homeFolder registered at startup via seedRootsFromState
  - homeFolder registered on active-workspace switch via workspace:setActiveHomeFolder
affects:
  - electron/ipc/roots.ts
  - electron/ipc/workspace.ts
  - src/state/__tests__/seedRoots.test.ts
tech_stack:
  added: []
  patterns:
    - pure extraction function for unit-testability (collect then apply)
    - TDD unit tests for pure path-collection logic
key_files:
  created:
    - src/state/__tests__/seedRoots.test.ts
  modified:
    - electron/ipc/roots.ts
    - electron/ipc/workspace.ts
decisions:
  - Extracted collectRootPaths as pure exported function so path-collection logic is testable under Vitest without mocking Electron or node:fs
  - registerRoot unchanged — it already silently ignores non-existent directories via realpathSync try/catch, correct for homeFolders that may not yet exist on disk
  - seedRootsFromState delegates entirely to collectRootPaths(state).forEach(registerRoot)
  - workspace.ts setActiveHomeFolder registers homeFolder immediately on every active-workspace switch
metrics:
  duration: "~157 seconds"
  completed: "2026-06-03"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 2
---

# Phase 01 Plan 02: Register homeFolder as trusted root — Summary

**One-liner:** Extract pure `collectRootPaths` helper that collects workspace homeFolder + view rootPath/cwd, register homeFolder at startup seeding and on active-workspace switch so memory IPC paths pass `assertInsideRoots`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extract collectRootPaths + register homeFolder in seedRootsFromState | 5572364 | electron/ipc/roots.ts |
| 2 | Register homeFolder on active-workspace switch + collection unit test | 68ad11a | electron/ipc/workspace.ts, src/state/__tests__/seedRoots.test.ts, package-lock.json |

## What Was Built

### Task 1 — roots.ts refactor

Added `export function collectRootPaths(state: unknown): string[]` that:
- Guards `state` is a non-null object with an Array `workspaces`
- For each workspace, pushes `homeFolder` if it is a string (the gap being closed)
- For each view, pushes `config.rootPath` and `config.cwd` if they are strings
- Has NO `registerRoot`, `realpath`, or `node:fs` references — pure extraction

Refactored `seedRootsFromState` to: `for (const p of collectRootPaths(state)) registerRoot(p);`

### Task 2 — workspace.ts patch + unit tests

Patched `workspace:setActiveHomeFolder` to compute `const p = typeof path === 'string' && path.length > 0 ? path : null` then call `registerRoot(p)` when p is non-null — so every active-workspace change registers the homeFolder immediately.

Created `src/state/__tests__/seedRoots.test.ts` with 6 tests covering the full behavior table from the plan:
- null input → []
- empty object → []
- homeFolder string included
- homeFolder + rootPath + cwd all included
- workspace without homeFolder → []
- non-string homeFolder ignored

## Test Results

```
vitest run src/state/__tests__/seedRoots.test.ts

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Duration  83ms
```

## Verification

- `export function collectRootPaths` confirmed in roots.ts (line 69)
- `homeFolder` collected inside collectRootPaths (lines 76-77)
- `seedRootsFromState` delegates via `collectRootPaths(state)` (line 97)
- `import { registerRoot, seedRootsFromState } from './roots'` in workspace.ts (line 5)
- `registerRoot(p)` called in setActiveHomeFolder when p is non-null (line 94)
- `npx tsc --noEmit` — zero errors in roots.ts and workspace.ts

## Deviations from Plan

None — plan executed exactly as written. The TDD flag on Task 2 was honored; since `collectRootPaths` was implemented in Task 1, the tests passed GREEN immediately on first run (no separate failing-then-passing cycle needed).

## Threat Surface Scan

No new network endpoints, auth paths, or external-facing changes introduced. The changes are confined to:
- Adding `homeFolder` to the set of paths that `registerRoot` considers (already guarded by `realpathSync` + `isDirectory` in `registerRoot`, unchanged)
- Registering homeFolder on active-workspace switch (T-01-08 accepted — homeFolder comes from user-chosen folder picker)

No new threat flags beyond those already in the plan's threat model.

## Known Stubs

None.

## Self-Check: PASSED

- electron/ipc/roots.ts: FOUND and modified
- electron/ipc/workspace.ts: FOUND and modified
- src/state/__tests__/seedRoots.test.ts: FOUND and created
- Commit 5572364: FOUND in git log
- Commit 68ad11a: FOUND in git log
- Tests: 6/6 passing
