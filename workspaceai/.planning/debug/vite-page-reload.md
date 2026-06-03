---
slug: vite-page-reload
status: resolved
trigger: runtime page reload at 20:31:04 during npm run dev
created: 2026-06-03
---

# Debug Session: vite-page-reload

## Symptom

During dev mode (`npm run dev`), the Vite dev server prints `[vite] page reload index.html`,
causing ALL browser windows in the workspace to hard-refresh. This happens at runtime (reported
timestamp 20:31:04), not just at startup.

## Current Focus

**Hypothesis:** Vite's dev server watches the entire project root (`.`) because the renderer
config sets `root: '.'`. Any file written at runtime inside the project directory triggers a
full page reload.

**Next action:** Confirmed — root cause found. Apply fix.

## Evidence

- timestamp: 2026-06-03T17:31:04 — user-reported runtime reload
- timestamp: 2026-06-03 (investigation) — `logs/` directory exists INSIDE the project at
  `/Users/matanw/projects/workspace/workspaceai/logs/` containing 7 active session log files
- timestamp: 2026-06-03 (investigation) — `workspace-config.md` exists INSIDE the project at
  `/Users/matanw/projects/workspace/workspaceai/workspace-config.md`
- timestamp: 2026-06-03 (investigation) — `memory/` subdirectory exists inside the project
  (empty, but created by `workspace:initHomeFolder`)
- timestamp: 2026-06-03 (investigation) — `electron.vite.config.ts` renderer sets `root: '.'`
  (the project root). No `server.watch.ignored` is configured. Vite therefore watches ALL files
  under the project root via chokidar.
- timestamp: 2026-06-03 (investigation) — `logger.ts:logsDir()` returns
  `join(activeHomeFolder, 'logs')` when a homeFolder is set, or `join(app.getPath('userData'), 'logs')`
  as fallback. The active workspace has its homeFolder set to the project root itself
  (`/Users/matanw/projects/workspace/workspaceai`), so log files are written to
  `<project-root>/logs/` — directly inside Vite's watch tree.
- timestamp: 2026-06-03 (investigation) — `workspace.ts:workspace:initHomeFolder` creates
  `logs/` and `memory/` subdirs AND writes `workspace-config.md` inside whatever folder the
  user picks as the workspace homeFolder. The user picked the project root.
- timestamp: 2026-06-03 (investigation) — `.gitignore` contains `*.log` but this does NOT
  suppress Vite's chokidar watcher.
- timestamp: 2026-06-03 (investigation) — `electron-store` writes to
  `app.getPath('userData')/workspaceai-state.json` (macOS: `~/Library/Application Support/workspaceai/`),
  which is outside the project — not a trigger.

## Root Cause

The workspace `homeFolder` is set to the project root
(`/Users/matanw/projects/workspace/workspaceai`). When `logger.ts` writes a new log entry (or
rotates session files) to `<homeFolder>/logs/`, and when `workspace:initHomeFolder` writes
`workspace-config.md` to `<homeFolder>/`, those writes land inside the Vite dev server's watch
tree (which covers the entire project root due to `root: '.'` in `electron.vite.config.ts` and
no `server.watch.ignored` override). Chokidar detects the file changes and Vite triggers a full
page reload.

**Primary trigger file at reported timestamp:** `logs/session-2026-06-03T17-31-04-447Z-26466.log`
(written continuously while the app is running).

## Resolution

### Root Cause (one sentence)
The app's logger writes session `.log` files into `<homeFolder>/logs/`, and the active workspace
homeFolder is the project root, placing live-written log files directly inside Vite's chokidar
watch tree.

### Fix

Two complementary changes are needed:

**Fix 1 — Add `server.watch.ignored` to Vite renderer config (defensive, catches any future
runtime writes):**

In `electron.vite.config.ts`, add `server.watch.ignored` to the renderer config:

```ts
renderer: {
  root: '.',
  server: {
    watch: {
      ignored: ['**/logs/**', '**/memory/**', '**/*.log', '**/workspace-config.md'],
    },
  },
  // ...rest unchanged
}
```

**Fix 2 — Prevent users from selecting the project directory as a homeFolder (UX guard):**

This is a user-education / UX problem. The homeFolder picker in `workspace:initHomeFolder`
should either:
- Validate that the chosen folder is NOT inside the project's working directory, OR
- Default to a location outside the project (e.g., `~/Documents/WorkspaceAI/<name>` or
  a subfolder of `app.getPath('userData')`).

Fix 1 alone stops the symptom. Fix 2 prevents the root cause from recurring.

### Files to Change

1. `/Users/matanw/projects/workspace/workspaceai/electron.vite.config.ts` — add
   `server.watch.ignored` to the renderer block.
2. (Optional / recommended) `/Users/matanw/projects/workspace/workspaceai/electron/ipc/workspace.ts` —
   add a guard in `workspace:initHomeFolder` to warn or block when the selected folder is the
   app's working directory or a parent of it.
