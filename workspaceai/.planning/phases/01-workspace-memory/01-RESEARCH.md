# Phase 01: Workspace-Level Memory for Claude — Research

**Researched:** 2026-06-03
**Domain:** Electron IPC, React tool integration, filesystem security, AI tool loop
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Memory stored at `{workspace.homeFolder}/memory/` — uses existing `homeFolder` field
- `MEMORY.md` index injected into every system prompt via `buildSystemPrompt()`, appended after view-type context, shared across all view types
- `read_memory(topic: string)` tool — no approval prompt (read-only)
- `write_memory(name, description, type, content)` tool — always-allow behavior, no per-call prompt
- Entry file format: YAML frontmatter (`name`, `description`, `metadata.type`) + markdown body — same schema as `~/.claude` memory
- Index format: `- [name](file.md) — one-line hook` per entry
- Types: `user`, `project`, `feedback`, `reference`
- Memory is workspace-scoped, shared across all panels/views within a workspace

### Claude's Discretion

- Whether to register tools globally in `ChatPanel.tsx` or per-view in each `registerView()` call
- Fallback behavior when `homeFolder` is unset (options: userData directory keyed by workspace ID, or disable memory)

### Deferred Ideas (OUT OF SCOPE)

- User visibility UI — a "Memory" panel in sidebar for viewing/editing/deleting entries
- Memory limits / eviction — max entry count or total size cap with auto-pruning
- Cross-workspace shared memory — global memory entries shared across all workspaces
</user_constraints>

---

## Summary

This phase adds two AI tools (`read_memory`, `write_memory`) and a system-prompt memory index to WorkspaceAI. The implementation touches four distinct layers: (1) a new `memory:*` IPC namespace in the main process for filesystem operations, (2) a `homeFolder`-as-root registration gap that must be patched, (3) `buildSystemPrompt()` extension in `ChatPanel.tsx` for index injection, and (4) global tool registration to make both tools available across all view types.

The codebase is well-structured and the patterns are clear. The most significant finding is a **security gap**: `homeFolder` is never passed to `registerRoot()`, meaning memory reads/writes will fail `assertInsideRoots` validation unless the planner adds an explicit `registerRoot(homeFolder)` call. The `workspace:initHomeFolder` handler already creates the `memory/` subdirectory, so storage scaffolding is partially in place.

The `always-allow` mechanism currently works at the view level (all tools in a view are auto-approved). Per-tool always-allow does not exist natively — the planner must decide whether to introduce per-tool always-allow state or to implement `write_memory` auto-execution by bypassing `requestApproval` before the tool is dispatched.

**Primary recommendation:** Add `memory:readEntry`, `memory:writeEntry`, `memory:readIndex`, and `memory:ensureDir` IPC handlers modeled on `fs.ts`; patch `seedRootsFromState` and `workspace:setActiveHomeFolder` to also register `homeFolder` as a root; inject tools globally in `ChatPanel.tsx`'s `send()` function rather than per-view registration.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Memory file I/O (read/write `.md` files) | Main Process (IPC) | — | All filesystem access goes through `ipcMain.handle` + `assertInsideRoots`; renderer cannot directly read disk |
| Memory index injection into system prompt | Frontend (React/renderer) | — | `buildSystemPrompt()` runs in renderer; reads index content fetched via IPC before chat starts |
| `read_memory` / `write_memory` tool dispatch | Frontend (ChatPanel) | — | Tool execution loop lives entirely in `ChatPanel.tsx`; `executeTool` is called renderer-side |
| Root allowlist enforcement | Main Process | — | `assertInsideRoots` is server-side; renderer cannot bypass it |
| `memory/` directory creation | Main Process | — | Already handled in `workspace:initHomeFolder`; new handler should call `mkdir({recursive:true})` as safety net |
| YAML frontmatter parsing | Frontend | — | Parsing happens when building tool result strings; no main-process parsing needed |
| Fallback path when `homeFolder` unset | Main Process | Frontend | IPC handler returns error/null; renderer decides whether to surface warning or silently skip memory injection |

---

## Standard Stack

No new npm packages are required for this phase. [VERIFIED: codebase grep]

All needed capabilities are already present:
- `node:fs/promises` (`readFile`, `writeFile`, `mkdir`) — used in `electron/ipc/workspace.ts` [VERIFIED: codebase grep]
- `node:path` (`join`) — used throughout `electron/ipc/` [VERIFIED: codebase grep]
- YAML frontmatter can be parsed with a simple regex/string split (no `js-yaml` needed; the frontmatter schema is fixed and simple) [ASSUMED — no YAML parser currently in the project]

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual frontmatter parsing | `js-yaml` or `gray-matter` | Adds a dependency for a trivial schema; not worth it for 4 known fields |
| New `memory:*` IPC handlers | Reuse existing `fs:readFile` / `fs:writeFile` | Memory logic (index management, directory creation, entry formatting) belongs in the main process; tool handler would be chatty and complex if built from raw fs IPC calls |

---

## Package Legitimacy Audit

No external packages are installed in this phase.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
User sends chat message
        |
        v
[ChatPanel.tsx: send()]
  - Collects globalMemoryTools (read_memory, write_memory)
  - Merges with view-specific tools
  - Reads memory index from IPC (memory:readIndex)
  - Calls buildSystemPrompt() with index content appended
        |
        v
[Anthropic API: ai:chat]
  - Tools: [view tools] + [read_memory, write_memory]
  - System prompt includes MEMORY.md index section
        |
        v
[Tool use block returned]
        |
   -----+------
   |           |
read_memory  write_memory
   |           |
   v           v
[executeMemoryTool()]   [executeMemoryTool()]
  - Calls memory:readEntry(topic)    - auto-executes (no requestApproval)
  - Returns entry content            - Calls memory:writeEntry(name,desc,type,content)
                                     - Updates MEMORY.md index
        |
        v
[Main Process: memory IPC handlers]
  assertInsideRoots(homeFolder/memory/...)
  readFile / writeFile via node:fs/promises
```

### Recommended Project Structure

```
electron/ipc/
├── memory.ts          # new — registerMemoryHandlers()
├── fs.ts              # unchanged
├── workspace.ts       # patch: registerRoot(homeFolder) in initHomeFolder + setActiveHomeFolder
└── roots.ts           # patch: seedRootsFromState reads workspace.homeFolder

src/shell/
├── ChatPanel.tsx      # patch: globalMemoryTools, index injection, per-tool always-allow
└── memory.ts          # new (optional) — pure helpers: parseIndex(), formatEntry(), etc.
```

### Pattern 1: IPC Handler Registration (from `electron/ipc/fs.ts`)

**What:** Export a `register*Handlers()` function that calls `ipcMain.handle()` for each channel.
**When to use:** Every new IPC namespace follows this pattern. [VERIFIED: codebase]

```typescript
// Source: electron/ipc/fs.ts pattern
export function registerMemoryHandlers(): void {
  ipcMain.handle('memory:readIndex', async (_e, homeFolder: string): Promise<string | null> => {
    const indexPath = join(homeFolder, 'memory', 'MEMORY.md');
    const realPath = await assertInsideRoots(indexPath);
    try {
      return await readFile(realPath, 'utf8');
    } catch {
      return null; // no index yet — caller treats as empty
    }
  });

  ipcMain.handle(
    'memory:writeEntry',
    async (_e, homeFolder: string, name: string, description: string, type: string, content: string): Promise<void> => {
      const memDir = join(homeFolder, 'memory');
      await mkdir(memDir, { recursive: true });
      // assertParentInsideRoots used for new-file writes (parent may exist, file may not)
      const entryFile = `${name}.md`;
      const entryPath = join(memDir, entryFile);
      const target = await assertParentInsideRoots(entryPath);
      const frontmatter = `---\nname: ${name}\ndescription: ${description}\nmetadata:\n  type: ${type}\n---\n\n`;
      await writeFile(target, frontmatter + content, 'utf8');
      // Update MEMORY.md index
      await updateIndex(homeFolder, name, description, entryFile);
    },
  );

  ipcMain.handle('memory:readEntry', async (_e, homeFolder: string, topic: string): Promise<string | null> => {
    const entryPath = join(homeFolder, 'memory', `${topic}.md`);
    try {
      const realPath = await assertInsideRoots(entryPath);
      return await readFile(realPath, 'utf8');
    } catch {
      return null;
    }
  });
}
```

### Pattern 2: Global Tool Injection in ChatPanel (currently per-view only)

**What:** Currently `tools` and `executeTool` come exclusively from `getViewType(view.typeId)`. To make memory tools available in ALL view types, the `send()` function must merge a global tool set.
**When to use:** Any tool that is workspace-wide rather than view-type-specific.

```typescript
// Source: src/shell/ChatPanel.tsx — send() function, lines 288-289 (current pattern)
const def = getViewType(view.typeId);
const tools: AiTool[] = def?.tools ?? [];
const executeTool = def?.executeTool;

// NEW pattern — merge global tools:
const GLOBAL_TOOLS: AiTool[] = [
  {
    name: 'read_memory',
    description: 'Fetch the full content of a memory entry by name.',
    input_schema: {
      type: 'object',
      properties: { topic: { type: 'string', description: 'Entry name (slug).' } },
      required: ['topic'],
    },
  },
  {
    name: 'write_memory',
    description: 'Create or update a persistent memory entry for this workspace.',
    input_schema: {
      type: 'object',
      properties: {
        name:        { type: 'string', description: 'Kebab-case slug.' },
        description: { type: 'string', description: 'One-line summary.' },
        type:        { type: 'string', enum: ['user', 'project', 'feedback', 'reference'] },
        content:     { type: 'string', description: 'Markdown body.' },
      },
      required: ['name', 'description', 'type', 'content'],
    },
  },
];

const allTools = [...(def?.tools ?? []), ...GLOBAL_TOOLS];
```

### Pattern 3: Per-Tool Always-Allow (new mechanism needed)

**What:** The current `alwaysAllowRef` bypasses approval for ALL tools in a view. `write_memory` needs unconditional auto-execution without touching the existing per-view always-allow state.

**Options (Claude's discretion):**
- **Option A — Per-tool bypass set:** Add a `Set<string>` of tool names that skip `requestApproval` entirely. `write_memory` is seeded into this set at construction. `read_memory` is also added (read-only is safe).
- **Option B — Tool-level `alwaysAllow` flag on `AiTool`:** Add `alwaysAllow?: boolean` to the `AiTool` interface and check it before calling `requestApproval`.

Option B is cleaner and more extensible. It requires a single-line change to the `AiTool` interface and a two-line guard in the approval flow.

```typescript
// src/views/types.ts — add field
export interface AiTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  alwaysAllow?: boolean; // if true, never prompts for approval
}

// src/shell/ChatPanel.tsx — guard in tool execution loop
const allToolsMap = new Map(allTools.map((t) => [t.name, t]));

const requestApproval = (block: Anthropic.ToolUseBlock): Promise<'approve' | 'reject'> => {
  const toolDef = allToolsMap.get(block.name);
  if (toolDef?.alwaysAllow || alwaysAllowRef.current.has(viewId)) {
    return Promise.resolve('approve');
  }
  return new Promise((resolve) => {
    setPendingApproval({ id: block.id, name: block.name, input: block.input, resolve });
  });
};
```

### Pattern 4: System Prompt Memory Index Injection

**What:** `buildSystemPrompt()` currently accepts `context: string` as its second parameter — a concatenation of `viewContext` and `extraContext`. Memory index should be appended as a separate section AFTER view context, always present.

```typescript
// Source: src/shell/ChatPanel.tsx lines 346-351 (current)
const baseContext = [viewContext, extraContext].filter(Boolean).join('\n\n');
const systemBase = buildSystemPrompt(view, baseContext, responseFormat);

// NEW: fetch index before building prompt, append as section
const memoryIndex = workspace?.homeFolder
  ? await api.memoryReadIndex(workspace.homeFolder)
  : null;

const memorySection = memoryIndex
  ? `## Workspace Memory\n\n${memoryIndex}\n\nUse \`read_memory\` to fetch full entry content.`
  : null;

// Modify buildSystemPrompt signature or inject after:
const systemBase = buildSystemPrompt(view, baseContext, responseFormat);
const systemWithMemory = memorySection
  ? `${systemBase}\n\n${memorySection}`
  : systemBase;
```

Note: `workspace` is available from `views.find((v) => v.id === viewId)` — but that is a `ViewInstance`, not a `Workspace`. The active workspace must be read from the store: `useAppStore((s) => selectActiveWorkspace(s))`.

### Anti-Patterns to Avoid

- **Calling `assertInsideRoots` on `homeFolder` without first calling `registerRoot(homeFolder)`:** `assertInsideRoots` resolves the real path and checks against registered roots. If `homeFolder` is not in `roots`, ALL memory IPC calls will throw "Access denied: path is outside the workspace root". This is the most critical pitfall.
- **Registering memory tools per-view:** Adding them to each `registerView()` call means 5 copies of the same tool, with execution logic duplicated. Global injection in `ChatPanel.tsx` is correct.
- **Parsing YAML frontmatter with a regex that breaks on colons in the body:** The description field may contain colons. Use a line-by-line parser that stops at the closing `---` line.
- **Writing the index on every tool call without reading it first:** Index updates must be additive — read, parse, upsert the entry, write back. Overwriting the index wholesale on each `write_memory` call risks clobbering concurrent writes.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Directory creation before write | Manual `mkdir` + `exists` check | `mkdir(path, { recursive: true })` | Idempotent, handles races [VERIFIED: codebase — used in workspace.ts:55-56] |
| Symlink escape in new files | Manual symlink check | `assertParentInsideRoots` | Already handles symlinked parent escape [VERIFIED: roots.ts:52-64] |
| Unique memory file names | Custom hash | `makeId()` from `src/lib/uid.ts` | Already available; or use the kebab-case `name` field directly as filename |

**Key insight:** The IPC security model (`assertInsideRoots` / `assertParentInsideRoots`) is the only path to safe filesystem writes. Never bypass it, even for internal memory operations.

---

## Runtime State Inventory

> Not applicable — this is a greenfield feature addition, not a rename/refactor/migration phase.

---

## Environment Availability

No external tools, runtimes, or CLIs are required beyond the existing project setup.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `node:fs/promises` | Memory IPC handlers | ✓ | Built-in (Node) | — |
| `node:path` | Memory IPC handlers | ✓ | Built-in (Node) | — |
| Vitest | Tests | ✓ | (in package.json) | — |

---

## Common Pitfalls

### Pitfall 1: homeFolder Not Registered as a Root

**What goes wrong:** Every `memory:readIndex`, `memory:readEntry`, `memory:writeEntry` IPC call passes the memory path to `assertInsideRoots` or `assertParentInsideRoots`. These functions check `roots` — a `Set<string>` populated only by `registerRoot()`. `homeFolder` is never passed to `registerRoot()` anywhere in the current codebase.

**Why it happens:** `seedRootsFromState` (in `roots.ts:68-84`) only scans `view.config.rootPath` and `view.config.cwd` — it does not read `workspace.homeFolder`. The `workspace:setActiveHomeFolder` handler only updates the logger directory, not the roots set.

**How to avoid:** Two registration points needed:
1. In `workspace:setActiveHomeFolder` IPC handler — call `registerRoot(path)` when the active workspace changes.
2. In `seedRootsFromState` — add a loop over `ws.homeFolder` alongside the existing view-config loop.

**Warning signs:** IPC call logs show `access denied: path is outside the workspace root` for `memory:*` channels.

### Pitfall 2: Missing `workspace` Reference in `ChatPanel.tsx`

**What goes wrong:** `ChatPanel.tsx` currently has access to `view: ViewInstance` but NOT to the containing `Workspace`. Reading the memory index before each chat requires `workspace.homeFolder`. Without it, the index fetch has no path to use.

**Why it happens:** The component receives `viewId` as a prop and looks up the `ViewInstance` from the store. `Workspace` is a separate entity in the store.

**How to avoid:** Add a store selector: `const workspace = useAppStore((s) => selectActiveWorkspace(s))`. The memory feature is workspace-scoped, so using the active workspace is correct. Alternatively, look up the workspace by scanning `workspaces` for the one whose `views` contains `viewId`.

**Warning signs:** `workspace` is `undefined`, memory index injection is silently skipped, Claude has no memory context.

### Pitfall 3: Always-Allow Scope is Currently Per-View, Not Per-Tool

**What goes wrong:** The existing `alwaysAllowRef` grants blanket approval to all tools in a view when "Always allow" is clicked. If `write_memory` is implemented using this mechanism, the user would be prompted once, then ALL tools (including risky ones like `write_file`) would be auto-approved — not just memory tools.

**Why it happens:** `alwaysAllowRef.current.has(viewId)` is the only bypass check before `requestApproval` blocks on user input.

**How to avoid:** Implement per-tool always-allow via the `AiTool.alwaysAllow?: boolean` field (see Pattern 3 above). Check `toolDef?.alwaysAllow` before checking `alwaysAllowRef`. This way, `write_memory` and `read_memory` can be unconditionally auto-executed without affecting the existing always-allow UX for other tools.

**Warning signs:** "Always allow" button unexpectedly auto-approves file writes or terminal commands after a single memory write.

### Pitfall 4: Index File Missing on First Memory Write

**What goes wrong:** On first use, `MEMORY.md` doesn't exist. A `readFile` call on it will throw ENOENT. The IPC handler must handle this gracefully.

**Why it happens:** `workspace:initHomeFolder` creates the `memory/` directory but writes no `MEMORY.md` file.

**How to avoid:** `memory:readIndex` returns `null` (not throws) when the file doesn't exist. On the first `write_memory`, the index write path must call `mkdir({ recursive: true })` before writing.

**Warning signs:** Memory write fails on a fresh workspace with "ENOENT: no such file or directory".

### Pitfall 5: Index Format Drift Between Write and System Prompt

**What goes wrong:** `MEMORY.md` is written by the IPC handler but read raw and injected verbatim into the system prompt. If the format diverges (e.g., an entry is added with a different bullet style), the index becomes inconsistent.

**How to avoid:** The IPC handler owns the canonical index format. Index generation logic should be a single function called on every write: parse existing entries (or start fresh), upsert the new entry, regenerate the full file from the canonical format.

---

## Code Examples

### Read MEMORY.md Index (IPC handler)

```typescript
// Source: pattern from electron/ipc/fs.ts:40-45
ipcMain.handle('memory:readIndex', async (_e, homeFolder: string): Promise<string | null> => {
  const indexPath = join(homeFolder, 'memory', 'MEMORY.md');
  let realPath: string;
  try {
    realPath = await assertInsideRoots(indexPath);
  } catch {
    return null; // homeFolder not yet a registered root, or path doesn't exist
  }
  try {
    return await readFile(realPath, 'utf8');
  } catch {
    return null; // ENOENT on first use
  }
});
```

### Write Memory Entry + Update Index (IPC handler)

```typescript
// Source: pattern from electron/ipc/fs.ts:47-62 (writeFile) + workspace.ts:55-56 (mkdir)
ipcMain.handle(
  'memory:writeEntry',
  async (_e, homeFolder: string, name: string, description: string, type: string, content: string): Promise<void> => {
    const memDir = join(homeFolder, 'memory');
    await mkdir(memDir, { recursive: true }); // safe on existing dir

    const entryFileName = `${name}.md`;
    const entryPath = join(memDir, entryFileName);
    const entryTarget = await assertParentInsideRoots(entryPath);

    // Reject symlink writes (mirroring fs.ts:54-59)
    let link = false;
    try { link = (await lstat(entryTarget)).isSymbolicLink(); } catch { link = false; }
    if (link) throw new Error('Access denied: refusing to write through a symlink');

    const body = `---\nname: ${name}\ndescription: ${description}\nmetadata:\n  type: ${type}\n---\n\n${content}`;
    await writeFile(entryTarget, body, 'utf8');

    // Upsert index
    const indexPath = join(memDir, 'MEMORY.md');
    const indexTarget = await assertParentInsideRoots(indexPath);
    let existing = '';
    try { existing = await readFile(indexTarget, 'utf8'); } catch { /* first entry */ }
    const lines = existing.split('\n').filter((l) => l.startsWith('- '));
    const newLine = `- [${name}](${entryFileName}) — ${description}`;
    const filtered = lines.filter((l) => !l.startsWith(`- [${name}](`));
    const newIndex = [...filtered, newLine].join('\n') + '\n';
    await writeFile(indexTarget, newIndex, 'utf8');
  },
);
```

### Fetching Memory Index Before Chat (ChatPanel.tsx)

```typescript
// Source: pattern from ChatPanel.tsx send() function, lines 283-350
const workspace = useAppStore((s) => selectActiveWorkspace(s)); // add this selector

// Inside send(), before buildSystemPrompt():
let memoryIndexSection = '';
if (workspace?.homeFolder) {
  const index = await api.memoryReadIndex(workspace.homeFolder);
  if (index?.trim()) {
    memoryIndexSection = `## Workspace Memory\n\n${index.trim()}\n\nUse \`read_memory\` to fetch full entry content when relevant.`;
  }
}
const baseContext = [viewContext, extraContext, memoryIndexSection].filter(Boolean).join('\n\n');
```

### Registering homeFolder as Root (roots.ts patch)

```typescript
// Source: electron/ipc/roots.ts:68-84 — add homeFolder scanning
export function seedRootsFromState(state: unknown): void {
  if (typeof state !== 'object' || state === null) return;
  const workspaces = (state as { workspaces?: unknown }).workspaces;
  if (!Array.isArray(workspaces)) return;
  for (const ws of workspaces) {
    // NEW: register workspace homeFolder
    const homeFolder = (ws as { homeFolder?: unknown })?.homeFolder;
    if (typeof homeFolder === 'string') registerRoot(homeFolder);

    const views = (ws as { views?: unknown })?.views;
    if (!Array.isArray(views)) continue;
    for (const view of views) {
      const config = (view as { config?: unknown })?.config;
      if (typeof config !== 'object' || config === null) continue;
      const root = (config as { rootPath?: unknown }).rootPath;
      const cwd = (config as { cwd?: unknown }).cwd;
      if (typeof root === 'string') registerRoot(root);
      if (typeof cwd === 'string') registerRoot(cwd);
    }
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| N/A — new feature | New feature | — | — |

**Relevant existing infrastructure:**
- `workspace:initHomeFolder` already creates `memory/` subdirectory [VERIFIED: workspace.ts:56]
- `MEMORY.md` convention already used in `~/.claude` memory and referenced in user MEMORY.md [VERIFIED: project context]
- `assertParentInsideRoots` already exists for new-file writes [VERIFIED: roots.ts:52-64]

---

## Key Architectural Findings

### Finding 1: AiTool Shape (exact)
[VERIFIED: src/views/types.ts]

```typescript
export interface AiTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}
```

`executeTool` signature: `(name: string, input: Record<string, unknown>, instance: ViewInstance) => Promise<unknown>`

The return value of `executeTool` is `unknown` and is stringified via `stringifyResult()` before being sent back to the API as a `tool_result` content string. [VERIFIED: ChatPanel.tsx:133-140, 507-511]

### Finding 2: Always-Allow Mechanism (exact)
[VERIFIED: src/shell/ChatPanel.tsx:258-278]

- State: `alwaysAllowRef = useRef<Set<string>>(new Set())` — a `Set` of `viewId` strings (NOT tool names)
- Opting in: User clicks "Always allow" button → `resolveApproval('approve', true)` → `alwaysAllowRef.current.add(viewId)`
- Check: `if (alwaysAllowRef.current.has(viewId)) return Promise.resolve('approve')` — bypasses the Promise-based approval gate for ALL subsequent tool calls in that view
- There is NO per-tool bypass mechanism; it is exclusively per-view

### Finding 3: Tool Registration is Per-View Type Only
[VERIFIED: ChatPanel.tsx:288-289, views/registry.ts, views/notepad/index.tsx]

```typescript
// ChatPanel.tsx send()
const def = getViewType(view.typeId);
const tools: AiTool[] = def?.tools ?? [];
const executeTool = def?.executeTool;
```

There is NO global tool list. Tools from `GLOBAL_TOOLS` must be merged into `allTools` in `send()` and execution must be handled via a separate code path before falling through to `executeTool`.

### Finding 4: buildSystemPrompt Injection Point
[VERIFIED: ChatPanel.tsx:34-75, 346-351]

`buildSystemPrompt(view, baseContext, responseFormat)` appends `context` as a section after the view-type intro. The memory index section should be added BEFORE calling `buildSystemPrompt` by appending it to `baseContext`, OR appended to the output string after the call. Either is clean; appending to `baseContext` (as a third filter item) is more consistent with existing code.

### Finding 5: homeFolder Root Registration Gap (CRITICAL)
[VERIFIED: electron/ipc/roots.ts, electron/main.ts, electron/ipc/workspace.ts]

`homeFolder` is NEVER passed to `registerRoot()`. The `seedRootsFromState` function iterates `view.config.rootPath` and `view.config.cwd` only. The `workspace:setActiveHomeFolder` handler only calls `setHomeFolder()` (logger). This means ALL memory IPC calls will fail the `assertInsideRoots` check unless fixed.

**Fix required:** Two registration points:
1. Patch `seedRootsFromState` in `roots.ts` to also register `workspace.homeFolder`
2. Patch `workspace:setActiveHomeFolder` in `workspace.ts` to also call `registerRoot(path)` when a homeFolder is set

### Finding 6: homeFolder Unset Fallback
[VERIFIED: src/state/types.ts:31 — `homeFolder?: string`]

`homeFolder` is optional. The workspace creation flow in `Sidebar.tsx` calls `workspaceInitHomeFolder` which is user-initiated (folder picker dialog). Workspaces without a homeFolder exist normally. The IPC handlers must return `null` gracefully and the ChatPanel must silently skip memory injection when `homeFolder` is undefined. The CONTEXT.md defers the fallback decision to the planner — the two options are:
- Return `null` from all memory IPC calls, skip memory in system prompt (simplest)
- Use `app.getPath('userData')` keyed by workspace ID as fallback (consistent with how `codeServer.ts` handles its data directory at line 136-138)

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | YAML frontmatter can be parsed with a simple line-by-line split (no npm package needed) | Standard Stack | If frontmatter contains multi-line values, the simple parser would misparse. Mitigation: enforce single-line description/name in `write_memory` schema |
| A2 | The `workspace` containing a given `viewId` is always the active workspace | Code Examples | In theory a view could belong to a non-active workspace; in practice the chat panel only renders for the active workspace's views |

---

## Open Questions (RESOLVED)

1. **Fallback when `homeFolder` is unset**
   - What we know: `homeFolder` is optional; ~50% of workspaces may lack it (new users haven't gone through the folder-picker flow)
   - What's unclear: Should memory be silently disabled (return empty), or should there be a fallback path in `userData`?
   - RESOLVED: Silently disabled — when `homeFolder` is unset, memory tools are not injected into the tool list and the index section is omitted from the system prompt. No fallback path to `userData`. User can assign a homeFolder to enable memory.

2. **Async index fetch adds latency to every chat send()**
   - What we know: `send()` currently has no async setup before the AI call; adding `memoryReadIndex` adds one IPC round-trip before each message
   - What's unclear: Is ~1ms local disk read acceptable, or should the index be pre-loaded reactively and stored in component state?
   - RESOLVED: Pre-load reactively — `useEffect` in `ChatPanel.tsx` watches `workspace?.homeFolder` and calls `memoryReadIndex` into component state on mount and whenever `homeFolder` changes. The `send()` function reads from component state synchronously, adding zero latency to the chat send path.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run src/state/__tests__/` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MEM-01 | `read_memory` tool fetches entry content | unit | `npx vitest run src/shell/__tests__/memory-tools.test.ts` | ❌ Wave 0 |
| MEM-02 | `write_memory` creates entry + updates MEMORY.md index | unit | `npx vitest run src/shell/__tests__/memory-tools.test.ts` | ❌ Wave 0 |
| MEM-03 | MEMORY.md index injected in system prompt when homeFolder set | unit | `npx vitest run src/shell/__tests__/memory-tools.test.ts` | ❌ Wave 0 |
| MEM-04 | Memory skipped gracefully when homeFolder unset | unit | `npx vitest run src/shell/__tests__/memory-tools.test.ts` | ❌ Wave 0 |
| MEM-05 | `write_memory` never triggers approval prompt | unit | `npx vitest run src/shell/__tests__/memory-tools.test.ts` | ❌ Wave 0 |
| MEM-06 | `assertInsideRoots` blocks paths outside homeFolder | unit | `npx vitest run src/views/__tests__/` (existing pattern) | ❌ Wave 0 |
| MEM-07 | `seedRootsFromState` registers workspace.homeFolder | unit | `npx vitest run` (extends existing store tests) | ❌ Wave 0 |

### Wave 0 Gaps

- [ ] `src/shell/__tests__/memory-tools.test.ts` — covers MEM-01 through MEM-05
- [ ] IPC handler unit test for `memory:writeEntry` index upsert logic — covers MEM-02 edge cases (first write, update existing entry)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | yes | `assertInsideRoots` / `assertParentInsideRoots` on all memory paths |
| V5 Input Validation | yes | Validate `name` is kebab-case slug (no path traversal: no `..`, no `/`), validate `type` is one of 4 known values |
| V6 Cryptography | no | — |

### Known Threat Patterns for Electron IPC + Filesystem

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via `name` parameter (`../../etc/passwd`) | Tampering | Validate `name` matches `/^[a-z0-9-]+$/` before constructing file path; `assertParentInsideRoots` provides a second layer |
| Symlink escape via `homeFolder/memory/entry.md` → symlink outside root | Elevation of privilege | `lstat` check before write (pattern from `fs.ts:54-59`); `assertInsideRoots` follows realpath for reads |
| Renderer-injected `homeFolder` path pointing outside user directory | Tampering | `homeFolder` should come from the main-process store (persisted state), not from renderer-supplied IPC arguments. The `memory:*` handlers should resolve `homeFolder` from server-side state, not trust what the renderer sends |

**Critical security note on `homeFolder` trust:** The current design has the renderer passing `homeFolder` as an IPC argument. This is a weak point — a compromised renderer could supply an arbitrary path. The existing `assertInsideRoots` check mitigates this IFF `homeFolder` is a registered root (see Finding 5). Consider instead having the main process look up `homeFolder` from its own persisted state, matching by active workspace ID, rather than trusting the renderer-supplied value.

---

## Sources

### Primary (HIGH confidence)
- `src/shell/ChatPanel.tsx` — full agentic loop, always-allow mechanism, buildSystemPrompt, tool execution — verified by direct read
- `src/views/types.ts` — `AiTool`, `ViewTypeDefinition`, `RegisteredViewType` interfaces — verified by direct read
- `src/state/types.ts` — `Workspace` type, `homeFolder?: string` — verified by direct read
- `electron/ipc/roots.ts` — `assertInsideRoots`, `assertParentInsideRoots`, `seedRootsFromState`, `registerRoot` — verified by direct read
- `electron/ipc/fs.ts` — IPC handler pattern, symlink check — verified by direct read
- `electron/ipc/workspace.ts` — `mkdir('memory')` on initHomeFolder, `setActiveHomeFolder` logger-only — verified by direct read
- `electron/ipc/index.ts` — `withLogging` wrapper, handler registration pattern — verified by direct read
- `electron/preload.ts` — contextBridge shape, IPC method signatures — verified by direct read
- `src/ipc/client.ts` — renderer-side wrappers — verified by direct read
- `src/views/notepad/index.tsx` — tool registration pattern with `registerView` — verified by direct read
- `src/views/registry.ts` — `registerView`, `getViewType` — verified by direct read

### Secondary (MEDIUM confidence)
- None required — all critical claims verified from codebase

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — no new packages; all building blocks verified in codebase
- Architecture: HIGH — all integration points read directly from source
- Pitfalls: HIGH — root registration gap confirmed by grepping every `registerRoot` callsite
- Security: HIGH — threat model follows existing `fs.ts` patterns

**Research date:** 2026-06-03
**Valid until:** 2026-07-03 (stable codebase; only invalidated if `ChatPanel.tsx` tool loop changes)
