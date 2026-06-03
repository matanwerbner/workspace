# Phase 01 — Workspace-Level Memory for Claude

**Date:** 2026-06-03
**Status:** Context captured — ready for planning

---

## Domain

Per-workspace persistent memory that Claude can read and write, letting it remember user preferences, project context, and decisions **across chat sessions** within a workspace. Memory is **shared across all panels/views** within a workspace (not scoped per view).

---

## Decisions

### Claude's Interface to Memory

**Read — tiny index injection:**
- `MEMORY.md` content (bullet list of entry names + one-line descriptions) is injected into the system prompt on every chat session.
- The index is small by design (~50 tokens max). It gives Claude enough signal to know whether a `read_memory` call is worth making — without loading full entry content.
- Injected as a section in `buildSystemPrompt()` in `src/shell/ChatPanel.tsx`, appended after the existing view-type context. Shared across all view types.

**Read — selective fetch tool:**
- Claude has a `read_memory(topic: string)` tool to fetch the full content of a specific memory entry.
- Claude calls this only when the index indicates relevant context exists.
- No approval prompt — treated as a read-only operation.

**Write — always-allow tool:**
- Claude has a `write_memory(name: string, description: string, type: string, content: string)` tool to create or update a memory entry.
- `always-allow` behavior — no approval prompt per write. User can review memory files directly on disk.
- Claude writes proactively when it detects something worth remembering.

### Storage Format and Location

**Location:** `{workspace.homeFolder}/memory/`
- Uses the workspace's existing `homeFolder` path (already stored in `Workspace.homeFolder` in `src/state/types.ts`).
- Consistent with the convention that workspace root folders contain a `memory/` subdirectory.
- **Fallback when `homeFolder` is unset:** defer to planner — options are userData directory keyed by workspace ID, or disabling memory for that workspace.

**Structure:** `MEMORY.md` index + per-entry `.md` files
- `MEMORY.md` — the index file. One line per entry: `- [name](file.md) — one-line description`. This is the content injected into the system prompt.
- Individual entries: one `.md` file per memory entry (e.g., `user-preferences.md`, `project-goals.md`).

### Memory Schema

**Entry file format:** Same frontmatter as `~/.claude` memory:
```yaml
---
name: short-kebab-case-slug
description: one-line summary
metadata:
  type: user | project | feedback | reference
---

Memory content here (markdown body).
```

**Types:** `user`, `project`, `feedback`, `reference` — identical to the global `~/.claude` memory system. No new taxonomy.

**Index format:** Bullet list matching `MEMORY.md` convention:
```
- [name](file.md) — one-line hook
```

---

## Canonical Refs

Downstream agents must read these files before planning:

- `src/state/types.ts` — `Workspace` type (`homeFolder` field); any schema changes for memory go here
- `src/shell/ChatPanel.tsx` — `buildSystemPrompt()` (lines 34–75); tool execution loop (`MAX_AGENT_TURNS`, approve/reject/always-allow flow)
- `electron/ipc/` — pattern for adding new IPC handlers (see `fs.ts`, `terminal.ts`)
- `electron/preload.ts` — all `contextBridge` methods must be declared here
- `src/ipc/client.ts` — typed wrappers around `window.api`; new memory IPC calls go here
- `electron/ipc/roots.ts` — `assertInsideRoots` for filesystem path validation (memory reads/writes must be validated)

---

## Code Context

**Reusable assets:**
- `buildSystemPrompt()` in `src/shell/ChatPanel.tsx:34` — extend to inject memory index section
- Tool execution loop in `ChatPanel.tsx` — `write_memory` and `read_memory` register as `AiTool` entries per view type OR as global tools injected regardless of view
- `electron/ipc/fs.ts` — `readFile` / `writeFile` handlers are the pattern for memory file I/O; memory IPC can wrap or reuse these
- `makeId()` in `src/lib/uid.ts` — available for generating memory file names if needed
- `Workspace.homeFolder` in `src/state/types.ts:30` — the storage root anchor; no type change needed

**Integration points:**
- Memory tools must be available in ALL view types (code, browser, terminal, pdf, notepad) — not just one. The planner should decide whether to register them globally in `ChatPanel.tsx` or per-view in each `registerView()` call.
- The `always-allow` behavior for `write_memory` needs to hook into the existing `alwaysAllowedTools` state in `ChatPanel.tsx`.
- Filesystem access must go through `assertInsideRoots` — the `homeFolder` path should already be a registered root (seeded via `seedRootsFromState`), but the planner should verify this.

---

## Deferred Ideas

- **User visibility UI** — A "Memory" panel in the sidebar where users can view, edit, and delete entries. Separate phase.
- **Memory limits / eviction** — Max entry count or total size cap, with auto-pruning. Separate phase.
- **Cross-workspace shared memory** — Global memory entries shared across all workspaces. Separate phase.
