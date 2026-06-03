---
phase: quick-260603-wtv
plan: 01
subsystem: shell/terminal
tags: [bugfix, tdd, tool-display, terminal, electron]
dependency_graph:
  requires: []
  provides: [run_command tool-call card rendering, in-app approval for run_command]
  affects: [src/shell/ChatPanel.tsx, src/shell/toolDisplay.ts, electron/ipc/terminal.ts, src/views/terminal/index.tsx]
tech_stack:
  added: [src/shell/toolDisplay.ts]
  patterns: [pure-module extraction, TDD red/green]
key_files:
  created:
    - src/shell/toolDisplay.ts
    - src/shell/__tests__/toolDisplay.test.ts
  modified:
    - src/shell/ChatPanel.tsx
    - electron/ipc/terminal.ts
    - src/views/terminal/index.tsx
decisions:
  - Extract TOOL_LABELS and helpers to a pure module for testability
  - toolDetail coalesces path/file/query/command so command is surfaced in approval card
metrics:
  duration: ~8 minutes
  completed: "2026-06-03"
  tasks_completed: 2
  files_modified: 5
status: complete
---

# Quick 260603-WTV: Fix run_command tool-call card rendering

**One-liner:** Extracted pure `toolDisplay.ts` helpers adding `run_command` label + command-detail support; removed Electron native dialog gate from `terminal:exec` and dropped `alwaysAllow` to route approval through the in-app card.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Failing test for toolDisplay helpers | 56bb7a1 | src/shell/__tests__/toolDisplay.test.ts |
| 1 (GREEN) | Extract toolDisplay with run_command support | 6397488 | src/shell/toolDisplay.ts, src/shell/ChatPanel.tsx, src/shell/__tests__/toolDisplay.test.ts |
| 2 | Remove native dialog, restore in-app approval | 4ea91c9 | electron/ipc/terminal.ts, src/views/terminal/index.tsx |

## What Was Done

### Task 1 — Extract testable tool-display helpers with run_command support

Created `src/shell/toolDisplay.ts` as a pure module (no React, no Electron, no node:* imports) exporting:
- `TOOL_LABELS` record with entries for all tools including `run_command` (active: "Running command…", done: "Ran command", verb: "run a shell command")
- `toolLabel(name, status?)` — returns human-friendly label
- `toolVerb(name)` — returns infinitive phrase for approval prompt
- `toolDetail(input)` — extracts path/file/query/**command** field (command field added as fix for run_command)

Updated `src/shell/ChatPanel.tsx` to import all three from `./toolDisplay` instead of defining them locally.

Created `src/shell/__tests__/toolDisplay.test.ts` with 17 tests covering all behaviors.

### Task 2 — Remove native confirmation dialog and restore in-app approval

In `electron/ipc/terminal.ts`:
- Removed `dialog.showMessageBox` native gate from the `terminal:exec` handler
- Removed the `dialog` and `BrowserWindow` imports (confirmed neither was referenced elsewhere)
- Handler now proceeds directly to `exec(...)` after computing `workDir`

In `src/views/terminal/index.tsx`:
- Removed `alwaysAllow: true` from the `run_command` tool definition
- run_command now routes through the existing `requestApproval` flow in ChatPanel

## Verification

```
PASS: showMessageBox removed from electron/ipc/terminal.ts
PASS: alwaysAllow removed from src/views/terminal/index.tsx
PASS: toolDisplay imported in src/shell/ChatPanel.tsx
PASS: run_command entry present in src/shell/toolDisplay.ts
PASS: 17/17 tests pass in src/shell/__tests__/toolDisplay.test.ts
```

## Deviations from Plan

**1. [Rule 1 - Bug] Test used a known tool for "unknown tool fallback" test**
- **Found during:** Task 1 GREEN phase
- **Issue:** Test used `append_to_note` for the "humanized fallback" behavior, but that tool IS in `TOOL_LABELS` and returns its specific label ("Updating note…"), not the humanized fallback.
- **Fix:** Changed test to use `do_something` (a genuinely unknown tool) to correctly exercise the fallback path.
- **Files modified:** src/shell/__tests__/toolDisplay.test.ts
- **Commit:** 6397488

## TDD Gate Compliance

- RED gate commit: 56bb7a1 (test failing with "Cannot find module '../toolDisplay'")
- GREEN gate commit: 6397488 (17/17 tests passing after implementation)
- REFACTOR: No refactor needed — code was clean on first pass.

## Known Stubs

None.

## Self-Check: PASSED

Files verified:
- FOUND: src/shell/toolDisplay.ts
- FOUND: src/shell/__tests__/toolDisplay.test.ts
- FOUND: src/shell/ChatPanel.tsx (modified)
- FOUND: electron/ipc/terminal.ts (modified)
- FOUND: src/views/terminal/index.tsx (modified)

Commits verified:
- FOUND: 56bb7a1 (RED test)
- FOUND: 6397488 (GREEN implementation)
- FOUND: 4ea91c9 (Task 2 fixes)
