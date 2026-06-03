# Phase 01: Workspace-Level Memory for Claude - Pattern Map

**Mapped:** 2026-06-03
**Files analyzed:** 7 new/modified files
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `electron/ipc/memory.ts` | IPC handler module | file-I/O | `electron/ipc/fs.ts` | exact |
| `electron/ipc/roots.ts` (patch) | security/utility | request-response | `electron/ipc/roots.ts` | self |
| `electron/ipc/workspace.ts` (patch) | IPC handler | request-response | `electron/ipc/workspace.ts` | self |
| `electron/ipc/index.ts` (patch) | registration | request-response | `electron/ipc/index.ts` | self |
| `electron/preload.ts` (patch) | bridge | request-response | `electron/preload.ts` | self |
| `src/ipc/client.ts` (patch) | IPC client wrapper | request-response | `src/ipc/client.ts` | self |
| `src/views/types.ts` (patch) | type definition | — | `src/views/types.ts` | self |
| `src/shell/ChatPanel.tsx` (patch) | React component | request-response | `src/shell/ChatPanel.tsx` | self |

---

## Pattern Assignments

### `electron/ipc/memory.ts` (new, IPC handler module, file-I/O)

**Analog:** `electron/ipc/fs.ts`

**Imports pattern** (`electron/ipc/fs.ts` lines 1–4):
```typescript
import { ipcMain } from 'electron';
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { assertInsideRoots, assertParentInsideRoots } from './roots';
```

**Export function pattern** (`electron/ipc/fs.ts` lines 20–21):
```typescript
export function registerMemoryHandlers(): void {
  ipcMain.handle('memory:readIndex', async (_e, homeFolder: string): Promise<string | null> => {
```

**Read handler pattern** (`electron/ipc/fs.ts` lines 40–45):
```typescript
ipcMain.handle('fs:readFile', async (_e, filePath: string, _rootPath: string): Promise<string> => {
  const realPath = await assertInsideRoots(filePath);
  const s = await stat(realPath);
  if (s.size > 5 * 1024 * 1024) throw new Error('File too large (>5MB)');
  return await readFile(realPath, 'utf8');
});
```
For `memory:readIndex` and `memory:readEntry`, return `null` on ENOENT (not throw) — graceful first-use pattern.

**Write handler with symlink check** (`electron/ipc/fs.ts` lines 47–62):
```typescript
ipcMain.handle(
  'fs:writeFile',
  async (_e, filePath: string, content: string, _rootPath: string): Promise<void> => {
    const target = await assertParentInsideRoots(filePath);
    let link = false;
    try {
      link = (await lstat(target)).isSymbolicLink();
    } catch {
      link = false;
    }
    if (link) throw new Error('Access denied: refusing to write through a symlink');
    await writeFile(target, content, 'utf8');
  },
);
```

**mkdir pattern** (`electron/ipc/workspace.ts` lines 55–56):
```typescript
await mkdir(join(folderPath, 'logs'), { recursive: true });
await mkdir(join(folderPath, 'memory'), { recursive: true });
```
Copy this exact `mkdir(path, { recursive: true })` idiom before every write to ensure the `memory/` dir exists.

**Full `memory:writeEntry` handler to produce** (from RESEARCH.md Pattern 1 + fs.ts pattern):
```typescript
ipcMain.handle(
  'memory:writeEntry',
  async (_e, homeFolder: string, name: string, description: string, type: string, content: string): Promise<void> => {
    const memDir = join(homeFolder, 'memory');
    await mkdir(memDir, { recursive: true });

    const entryFileName = `${name}.md`;
    const entryPath = join(memDir, entryFileName);
    const entryTarget = await assertParentInsideRoots(entryPath);

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

---

### `electron/ipc/index.ts` (patch — register new handlers)

**Analog:** `electron/ipc/index.ts` (self)

**Import pattern** (lines 1–8):
```typescript
import { registerFsHandlers } from './fs';
import { registerDialogHandlers } from './dialog';
// ... other imports ...
import { registerWorkspaceHandlers } from './workspace';
```
Add: `import { registerMemoryHandlers } from './memory';`

**Registration pattern** (lines 94–112):
```typescript
export function registerIpcHandlers(): void {
  withLogging(() => {
    registerFsHandlers();
    // ...
    registerWorkspaceHandlers();
    // ADD:
    registerMemoryHandlers();
  });
}
```

**`withLogging` wrapper** (lines 58–92) — all handlers registered inside `withLogging()` are automatically logged. `registerMemoryHandlers()` must be called inside this block so `memory:*` channels appear in session logs.

**SUMMARIZED_CHANNELS pattern** (lines 18–19):
```typescript
const SUMMARIZED_CHANNELS = new Set(['ai:chat', 'terminal:write', 'fs:writeFile']);
```
Add `'memory:writeEntry'` to this set so large memory bodies are summarized, not stored verbatim.

---

### `electron/ipc/roots.ts` (patch — register homeFolder)

**Analog:** `electron/ipc/roots.ts` (self)

**`seedRootsFromState` function** (lines 68–84) — exact current code:
```typescript
export function seedRootsFromState(state: unknown): void {
  if (typeof state !== 'object' || state === null) return;
  const workspaces = (state as { workspaces?: unknown }).workspaces;
  if (!Array.isArray(workspaces)) return;
  for (const ws of workspaces) {
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

**Patch — add homeFolder registration** before the `views` loop:
```typescript
// NEW: register workspace homeFolder
const homeFolder = (ws as { homeFolder?: unknown })?.homeFolder;
if (typeof homeFolder === 'string') registerRoot(homeFolder);
```

**`registerRoot` function** (lines 13–23) — shows required directory existence check: `realpathSync` + `statSync().isDirectory()` before adding to `roots` Set. The homeFolder may not exist on disk yet (user hasn't picked one) — `registerRoot` already handles this gracefully via try/catch.

---

### `electron/ipc/workspace.ts` (patch — register homeFolder as root on setActiveHomeFolder)

**Analog:** `electron/ipc/workspace.ts` (self)

**`workspace:setActiveHomeFolder` handler** (lines 91–93) — current:
```typescript
ipcMain.handle('workspace:setActiveHomeFolder', (_e, path: string | null) => {
  setHomeFolder(typeof path === 'string' && path.length > 0 ? path : null);
});
```

**Patch** — add `registerRoot` call alongside `setHomeFolder`:
```typescript
import { registerRoot } from './roots';

ipcMain.handle('workspace:setActiveHomeFolder', (_e, path: string | null) => {
  const p = typeof path === 'string' && path.length > 0 ? path : null;
  setHomeFolder(p);
  if (p) registerRoot(p); // NEW: ensure memory IPC passes assertInsideRoots
});
```

---

### `electron/preload.ts` (patch — add memory IPC bridge methods)

**Analog:** `electron/preload.ts` (self)

**Workspace bridge method pattern** (lines 119–126):
```typescript
workspaceInitHomeFolder: (name: string): Promise<string | null> =>
  ipcRenderer.invoke('workspace:initHomeFolder', name),
workspaceSetActiveHomeFolder: (path: string | null): Promise<void> =>
  ipcRenderer.invoke('workspace:setActiveHomeFolder', path),
```

**New memory bridge methods to add** (same pattern):
```typescript
memoryReadIndex: (homeFolder: string): Promise<string | null> =>
  ipcRenderer.invoke('memory:readIndex', homeFolder),
memoryReadEntry: (homeFolder: string, topic: string): Promise<string | null> =>
  ipcRenderer.invoke('memory:readEntry', homeFolder, topic),
memoryWriteEntry: (
  homeFolder: string,
  name: string,
  description: string,
  type: string,
  content: string,
): Promise<void> =>
  ipcRenderer.invoke('memory:writeEntry', homeFolder, name, description, type, content),
```

**`contextBridge.exposeInMainWorld`** (line 154) — no change needed, the `api` object is spread automatically via `typeof api`.

---

### `src/ipc/client.ts` (patch — add typed wrappers)

**Analog:** `src/ipc/client.ts` (self)

**Wrapper pattern** (lines 83–87):
```typescript
workspaceInitHomeFolder: (name: string) => bridge().workspaceInitHomeFolder(name),
workspaceSetActiveHomeFolder: (path: string | null) =>
  bridge().workspaceSetActiveHomeFolder(path),
```

**New wrappers to add** (same pattern):
```typescript
memoryReadIndex: (homeFolder: string) => bridge().memoryReadIndex(homeFolder),
memoryReadEntry: (homeFolder: string, topic: string) =>
  bridge().memoryReadEntry(homeFolder, topic),
memoryWriteEntry: (
  homeFolder: string,
  name: string,
  description: string,
  type: string,
  content: string,
) => bridge().memoryWriteEntry(homeFolder, name, description, type, content),
```

---

### `src/views/types.ts` (patch — add `alwaysAllow` field to `AiTool`)

**Analog:** `src/views/types.ts` (self)

**Current `AiTool` interface** (lines 10–14):
```typescript
export interface AiTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}
```

**Patch — add optional `alwaysAllow` field**:
```typescript
export interface AiTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  alwaysAllow?: boolean; // if true, skip approval prompt entirely
}
```

---

### `src/shell/ChatPanel.tsx` (patch — global tools, index injection, per-tool always-allow)

**Analog:** `src/shell/ChatPanel.tsx` (self)

**Imports to add** (line 3 — add `selectActiveWorkspace`):
```typescript
import { selectChatMessages, selectViews, selectActiveWorkspace, useAppStore } from '../state/store';
```

**Existing store selector pattern** (lines 240–243):
```typescript
const settings = useAppStore((s) => s.settings);
const setSettings = useAppStore((s) => s.setSettings);
const views = useAppStore(selectViews);
```
Add: `const workspace = useAppStore(selectActiveWorkspace);`

**`alwaysAllowRef` pattern** (line 258):
```typescript
const alwaysAllowRef = useRef<Set<string>>(new Set());
```

**`requestApproval` function** (lines 269–274 — current):
```typescript
const requestApproval = (block: Anthropic.ToolUseBlock): Promise<'approve' | 'reject'> => {
  if (alwaysAllowRef.current.has(viewId)) return Promise.resolve('approve');
  return new Promise((resolve) => {
    setPendingApproval({ id: block.id, name: block.name, input: block.input, resolve });
  });
};
```

**Patch `requestApproval` for per-tool always-allow** (reference GLOBAL_TOOLS map):
```typescript
const requestApproval = (block: Anthropic.ToolUseBlock, allToolsMap: Map<string, AiTool>): Promise<'approve' | 'reject'> => {
  const toolDef = allToolsMap.get(block.name);
  if (toolDef?.alwaysAllow || alwaysAllowRef.current.has(viewId)) return Promise.resolve('approve');
  return new Promise((resolve) => {
    setPendingApproval({ id: block.id, name: block.name, input: block.input, resolve });
  });
};
```

**`send()` tool registration** (lines 288–291 — current):
```typescript
const def = getViewType(view.typeId);
const tools: AiTool[] = def?.tools ?? [];
const executeTool = def?.executeTool;
const extraContext = def?.getContext ? def.getContext(view) : '';
```

**Patch — merge global tools + memory index injection** (insert after line 291, before line 346):
```typescript
// Global tools available in ALL view types
const GLOBAL_TOOLS: AiTool[] = [
  {
    name: 'read_memory',
    description: 'Fetch the full content of a memory entry by name.',
    input_schema: {
      type: 'object',
      properties: { topic: { type: 'string', description: 'Entry name (kebab-case slug).' } },
      required: ['topic'],
    },
    alwaysAllow: true,
  },
  {
    name: 'write_memory',
    description: 'Create or update a persistent memory entry for this workspace.',
    input_schema: {
      type: 'object',
      properties: {
        name:        { type: 'string', description: 'Kebab-case slug (e.g. user-preferences).' },
        description: { type: 'string', description: 'One-line summary shown in the index.' },
        type:        { type: 'string', enum: ['user', 'project', 'feedback', 'reference'] },
        content:     { type: 'string', description: 'Markdown body of the memory entry.' },
      },
      required: ['name', 'description', 'type', 'content'],
    },
    alwaysAllow: true,
  },
];
const allTools = [...(def?.tools ?? []), ...GLOBAL_TOOLS];
const allToolsMap = new Map(allTools.map((t) => [t.name, t]));
```

**`buildSystemPrompt` call** (lines 346–351 — current):
```typescript
const baseContext = [viewContext, extraContext].filter(Boolean).join('\n\n');
const responseFormat: ResponseFormat = settings.htmlResponses ? 'html' : 'markdown';
const systemBase = buildSystemPrompt(view, baseContext, responseFormat);
const systemPrompt = settings.systemPromptOverride
  ? `${systemBase}\n\n${settings.systemPromptOverride}`
  : systemBase;
```

**Patch — inject memory index** (replace the `baseContext` line):
```typescript
// Fetch workspace memory index (null if homeFolder unset or no index yet)
let memoryIndexSection = '';
if (workspace?.homeFolder) {
  const index = await api.memoryReadIndex(workspace.homeFolder);
  if (index?.trim()) {
    memoryIndexSection = `## Workspace Memory\n\n${index.trim()}\n\nUse \`read_memory\` to fetch full entry content when relevant.`;
  }
}
const baseContext = [viewContext, extraContext, memoryIndexSection].filter(Boolean).join('\n\n');
```

**`sdkTools` mapping** (lines 353–357 — current):
```typescript
const sdkTools: Anthropic.Tool[] = tools.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.input_schema as Anthropic.Tool.InputSchema,
}));
```
Change `tools.map` to `allTools.map` so global tools are included.

**Tool execution dispatch** (lines 447–503 — current stops at `!executeTool`):
```typescript
if (result.stopReason !== 'tool_use' || toolUseBlocks.length === 0 || !executeTool) {
  completed = true;
  break;
}
```
This must be changed: global tools can execute even if `executeTool` is undefined. The execution block should try global tool handler first, then fall through to `executeTool`:
```typescript
if (result.stopReason !== 'tool_use' || toolUseBlocks.length === 0) {
  completed = true;
  break;
}

// ... in the per-block loop:
let res: unknown;
if (block.name === 'read_memory') {
  const { topic } = block.input as { topic: string };
  res = workspace?.homeFolder
    ? (await api.memoryReadEntry(workspace.homeFolder, topic)) ?? `No memory entry found for "${topic}".`
    : 'Memory not available: workspace has no home folder set.';
} else if (block.name === 'write_memory') {
  const { name, description, type, content } = block.input as {
    name: string; description: string; type: string; content: string;
  };
  if (workspace?.homeFolder) {
    await api.memoryWriteEntry(workspace.homeFolder, name, description, type, content);
    res = `Memory entry "${name}" saved.`;
  } else {
    res = 'Memory not available: workspace has no home folder set.';
  }
} else if (executeTool) {
  res = await executeTool(block.name, block.input as Record<string, unknown>, view);
} else {
  res = `Unknown tool: ${block.name}`;
}
```

---

## Shared Patterns

### IPC Handler Module Structure
**Source:** `electron/ipc/fs.ts` lines 1–21
**Apply to:** `electron/ipc/memory.ts`
```typescript
import { ipcMain } from 'electron';
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { assertInsideRoots, assertParentInsideRoots } from './roots';

export function registerMemoryHandlers(): void {
  ipcMain.handle('memory:...', async (_e, ...args) => { ... });
}
```

### Symlink Safety Check
**Source:** `electron/ipc/fs.ts` lines 53–59
**Apply to:** `memory:writeEntry` handler (any write)
```typescript
let link = false;
try {
  link = (await lstat(target)).isSymbolicLink();
} catch {
  link = false;
}
if (link) throw new Error('Access denied: refusing to write through a symlink');
```

### Graceful ENOENT (null return)
**Source:** `electron/ipc/workspace.ts` lines 52–53 (cancel/empty check pattern)
**Apply to:** `memory:readIndex`, `memory:readEntry`
```typescript
try {
  return await readFile(realPath, 'utf8');
} catch {
  return null; // ENOENT on first use — caller treats as empty
}
```

### Store Selector Pattern
**Source:** `src/shell/ChatPanel.tsx` lines 240–243
**Apply to:** `workspace` selector in `ChatPanel.tsx`
```typescript
const workspace = useAppStore(selectActiveWorkspace); // add alongside existing selectors
```
`selectActiveWorkspace` is exported from `src/state/store.ts` line 92.

### Bridge Method Declaration
**Source:** `electron/preload.ts` lines 119–121 + `src/ipc/client.ts` lines 83–86
**Apply to:** All three new `memory*` methods in both files
- preload: `methodName: (args): Promise<ReturnType> => ipcRenderer.invoke('channel', args)`
- client: `methodName: (args) => bridge().methodName(args)`

---

## No Analog Found

All files have close analogs. No entries required here.

---

## Metadata

**Analog search scope:** `electron/ipc/`, `src/shell/`, `src/ipc/`, `src/views/`, `src/state/`
**Files scanned:** 10 source files read directly
**Pattern extraction date:** 2026-06-03
