# Phase 3: Workspace Homepage and Async WhatsApp Claude Agent — Pattern Map

**Mapped:** 2026-06-03
**Files analyzed:** 9 new/modified files
**Analogs found:** 9 / 9

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `electron/ipc/whatsapp.ts` | service | event-driven | `electron/ipc/terminal.ts` | role-match |
| `electron/ipc/ai.ts` | service | request-response | self (export `makeClient`) | exact |
| `electron/ipc/index.ts` | config | request-response | self (add `registerWhatsAppHandlers`) | exact |
| `electron/preload.ts` | middleware | request-response | self (add whatsapp bridge methods) | exact |
| `electron/main.ts` | config | event-driven | self (add `disposeWhatsApp`) | exact |
| `src/ipc/client.ts` | utility | request-response | self (add whatsapp typed methods) | exact |
| `src/state/types.ts` | model | — | self (add `WhatsAppAgentStatus`) | exact |
| `src/state/store.ts` | store | — | self (add whatsapp status slice) | exact |
| `src/shell/MainPane.tsx` | component | request-response | self (replace placeholder branch) | exact |
| `src/shell/HomepageView.tsx` | component | request-response | `src/shell/SettingsModal.tsx` or `src/shell/Sidebar.tsx` | role-match |
| `src/shell/__tests__/HomepageView.test.ts` | test | — | `src/shell/__tests__/memory.test.ts` | exact |
| `electron/ipc/__tests__/whatsapp.test.ts` | test | — | `src/shell/__tests__/memory.test.ts` | role-match |

---

## Pattern Assignments

### `electron/ipc/whatsapp.ts` (service, event-driven)

**Analog:** `electron/ipc/terminal.ts`

**Imports pattern** (`electron/ipc/terminal.ts` lines 1-6):
```typescript
import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as pty from 'node-pty';
import { exec } from 'node:child_process';
import { homedir } from 'node:os';
import { appendCapped } from '../../src/shell/termBuffer';
```

Apply for whatsapp.ts:
```typescript
import { ipcMain, BrowserWindow, app } from 'electron';
import { makeClient } from './ai';
// @whiskeysockets/baileys import after npm install
```

**Singleton state pattern** (`electron/ipc/terminal.ts` lines 7-9):
```typescript
const processes = new Map<string, pty.IPty>();
const viewSessions = new Map<string, { termId: string; outputBuf: string }>();
let nextId = 1;
```

Apply for whatsapp.ts:
```typescript
// Singleton service state — one socket per app instance
let sock: BaileysSocket | null = null;
let agentStatus: WhatsAppAgentStatus = { state: 'disconnected' };
const conversationHistory = new Map<string, Anthropic.MessageParam[]>();
```

**Dispose pattern** (`electron/ipc/terminal.ts` lines 11-17):
```typescript
export function disposeTerminals(): void {
  for (const p of processes.values()) {
    p.kill();
  }
  processes.clear();
  viewSessions.clear();
}
```

Apply for whatsapp.ts:
```typescript
export function disposeWhatsApp(): void {
  sock?.end(undefined);
  sock = null;
  agentStatus = { state: 'disconnected' };
  conversationHistory.clear();
}
```

**Register handler pattern** (`electron/ipc/terminal.ts` lines 19-62):
```typescript
export function registerTerminalHandlers(): void {
  ipcMain.handle('terminal:create', (event, { cwd, viewId }) => {
    // ... implementation
  });
  ipcMain.handle('terminal:kill', (_e, { termId }) => {
    // ... implementation
  });
}
```

Apply for whatsapp.ts:
```typescript
export function registerWhatsAppHandlers(): void {
  ipcMain.handle('whatsapp:start', async (_e) => { ... });
  ipcMain.handle('whatsapp:stop', async (_e) => { ... });
  ipcMain.handle('whatsapp:getStatus', (_e) => agentStatus);
}
```

**Push-event helper pattern** (`electron/main.ts` line 130):
```typescript
BrowserWindow.getAllWindows()[0]?.webContents.send('shell:openSettings');
```

Apply for whatsapp.ts:
```typescript
function pushStatus(payload: WhatsAppStatusEvent): void {
  BrowserWindow.getAllWindows()[0]?.webContents.send('whatsapp:status', payload);
}
function pushMessage(payload: WhatsAppMessageEvent): void {
  BrowserWindow.getAllWindows()[0]?.webContents.send('whatsapp:message', payload);
}
```

**Anthropic client reuse pattern** (`electron/ipc/ai.ts` lines 62-66):
```typescript
function makeClient(): Anthropic | null {
  const key = resolveKey();
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}
```

`makeClient` must be exported: add `export` keyword to the function declaration.

**Non-streaming Claude call** (pattern from `electron/ipc/ai.ts` lines 93-128, simplified):
```typescript
async function runAgentTurn(userText: string, jid: string): Promise<string> {
  const client = makeClient();
  if (!client) return '(No API key configured)';
  const history = conversationHistory.get(jid) ?? [];
  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-20),
    { role: 'user', content: userText },
  ];
  const result = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages,
  });
  const block = result.content.find((b) => b.type === 'text');
  const reply = block?.type === 'text' ? block.text : '';
  // Update history
  conversationHistory.set(jid, [
    ...messages,
    { role: 'assistant', content: reply },
  ]);
  return reply;
}
```

**Auth state directory pattern** (RESEARCH.md pitfall 2):
```typescript
import { app } from 'electron';
import { join } from 'node:path';

const authDir = join(app.getPath('userData'), 'whatsapp-auth');
```

---

### `electron/ipc/ai.ts` (service — export `makeClient`)

**Modification:** Add `export` to the existing `makeClient` function declaration.

**Before** (`electron/ipc/ai.ts` line 62):
```typescript
function makeClient(): Anthropic | null {
```

**After:**
```typescript
export function makeClient(): Anthropic | null {
```

No other changes to this file.

---

### `electron/ipc/index.ts` (config — register whatsapp handlers)

**Analog:** `electron/ipc/index.ts` (self — pattern already established)

**Registration pattern** (`electron/ipc/index.ts` lines 102-121):
```typescript
export function registerIpcHandlers(): void {
  withLogging(() => {
    registerFsHandlers();
    registerDialogHandlers();
    // ... all existing registrations ...
    registerMemoryHandlers();
    // ADD:
    registerWhatsAppHandlers();

    ipcMain.handle('shell:openExternal', ...);
  });
  // log:event registration below
}
```

Import to add at top of file (lines 1-13 pattern):
```typescript
import { registerWhatsAppHandlers } from './whatsapp';
```

---

### `electron/preload.ts` (middleware — add whatsapp bridges)

**Analog:** `electron/preload.ts` (self — existing push-listener pattern)

**Push listener pattern** (`electron/preload.ts` lines 163-168 — existing `onOpenSettings`):
```typescript
onOpenSettings: (cb: () => void): void => {
  ipcRenderer.on('shell:openSettings', cb);
},
offOpenSettings: (cb: () => void): void => {
  ipcRenderer.removeListener('shell:openSettings', cb);
},
```

Apply for whatsapp push channels:
```typescript
onWhatsAppStatus: (cb: (payload: WhatsAppStatusEvent) => void): void => {
  ipcRenderer.on('whatsapp:status', (_e, p) => cb(p));
},
offWhatsAppStatus: (cb: (payload: WhatsAppStatusEvent) => void): void => {
  ipcRenderer.removeListener('whatsapp:status', cb);
},
onWhatsAppMessage: (cb: (payload: WhatsAppMessageEvent) => void): void => {
  ipcRenderer.on('whatsapp:message', (_e, p) => cb(p));
},
offWhatsAppMessage: (cb: (payload: WhatsAppMessageEvent) => void): void => {
  ipcRenderer.removeListener('whatsapp:message', cb);
},
```

**Invoke bridge pattern** (`electron/preload.ts` lines 77-85):
```typescript
terminalCreate: (opts: { cwd?: string; viewId?: string }): Promise<{ termId: string }> =>
  ipcRenderer.invoke('terminal:create', opts),
terminalKill: (termId: string): Promise<void> =>
  ipcRenderer.invoke('terminal:kill', { termId }),
```

Apply for whatsapp invoke channels:
```typescript
whatsappStart: (): Promise<void> => ipcRenderer.invoke('whatsapp:start'),
whatsappStop: (): Promise<void> => ipcRenderer.invoke('whatsapp:stop'),
whatsappGetStatus: (): Promise<WhatsAppAgentStatus> =>
  ipcRenderer.invoke('whatsapp:getStatus'),
```

---

### `electron/main.ts` (config — add `disposeWhatsApp`)

**Analog:** `electron/main.ts` (self — existing dispose pattern)

**Dispose-on-quit pattern** (`electron/main.ts` lines 245-263):
```typescript
app.on('before-quit', async (event) => {
  // ...
  disposeTerminals();
  disposeCodeServers();
  disposeStreams();
  // ADD:
  disposeWhatsApp();
  logEvent({ category: 'app', action: 'before-quit' });
  await closeLogger();
  app.exit(0);
});

app.on('window-all-closed', () => {
  disposeTerminals();
  disposeCodeServers();
  disposeStreams();
  // ADD:
  disposeWhatsApp();
  // ...
});
```

Import to add (lines 7-9 pattern):
```typescript
import { disposeWhatsApp } from './ipc/whatsapp';
```

---

### `src/ipc/client.ts` (utility — add whatsapp typed methods)

**Analog:** `src/ipc/client.ts` (self — bridge pattern)

**Bridge method pattern** (`src/ipc/client.ts` lines 110-111):
```typescript
onOpenSettings: (cb: () => void) => bridge().onOpenSettings(cb),
offOpenSettings: (cb: () => void) => bridge().offOpenSettings(cb),
```

Apply for whatsapp:
```typescript
whatsappStart: () => bridge().whatsappStart(),
whatsappStop: () => bridge().whatsappStop(),
whatsappGetStatus: () => bridge().whatsappGetStatus(),
onWhatsAppStatus: (cb: (p: WhatsAppStatusEvent) => void) =>
  bridge().onWhatsAppStatus(cb),
offWhatsAppStatus: (cb: (p: WhatsAppStatusEvent) => void) =>
  bridge().offWhatsAppStatus(cb),
onWhatsAppMessage: (cb: (p: WhatsAppMessageEvent) => void) =>
  bridge().onWhatsAppMessage(cb),
offWhatsAppMessage: (cb: (p: WhatsAppMessageEvent) => void) =>
  bridge().offWhatsAppMessage(cb),
```

---

### `src/state/types.ts` (model — add WhatsApp types)

**Analog:** `src/state/types.ts` (self — existing interface pattern)

**Interface pattern** (`src/state/types.ts` lines 23-26):
```typescript
export interface ChatViewState {
  collapsed: boolean;
  sizePct: number;
}
```

Apply for whatsapp types:
```typescript
export type WhatsAppConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'qr_pending'
  | 'connected';

export interface WhatsAppAgentStatus {
  state: WhatsAppConnectionState;
  qrCode?: string;        // base64 QR string when state === 'qr_pending'
  lastError?: string;
  lastReplyAt?: number;   // timestamp ms
}

export interface WhatsAppStatusEvent {
  status: WhatsAppAgentStatus;
}

export interface WhatsAppMessageEvent {
  jid: string;
  text: string;
  reply: string;
}
```

---

### `src/state/store.ts` (store — add whatsapp status slice)

**Analog:** `src/state/store.ts` (self — transient state pattern)

**Transient non-persisted state pattern** (`src/state/store.ts` lines 45-50):
```typescript
// View context (not persisted — rebuilt at runtime)
viewContextByViewId: Record<string, string>;
// Transient: absolute paths missing after the most recent workspace import.
lastImportMissingPaths: string[];
```

Apply for whatsapp status (add to `AppStore` interface, lines ~45-50):
```typescript
// Transient: WhatsApp agent status (not persisted — seeded from IPC push events)
whatsappAgentStatus: WhatsAppAgentStatus;
setWhatsAppAgentStatus: (status: WhatsAppAgentStatus) => void;
```

**Initial state pattern** (`src/state/store.ts` line 123):
```typescript
export const useAppStore = create<AppStore>((set, get) => ({
  // ...
  viewContextByViewId: {},
  lastImportMissingPaths: [],
  // ADD:
  whatsappAgentStatus: { state: 'disconnected' },
  setWhatsAppAgentStatus: (status) => set({ whatsappAgentStatus: status }),
```

**Snapshot exclusion:** The whatsapp status slice is transient — it must NOT be included in `snapshot()` in `migrate.ts`. No change to snapshot/persist logic needed (top-level store fields not in `Workspace` are not persisted).

---

### `src/shell/MainPane.tsx` (component — replace placeholder branch)

**Analog:** `src/shell/MainPane.tsx` (self — existing placeholder at lines 80-87)

**Existing placeholder to replace** (`src/shell/MainPane.tsx` lines 80-87):
```tsx
{!active && (
  <div className="placeholder">
    <div className="placeholder-title">No view selected</div>
    <div className="placeholder-sub muted">
      Add a view from the sidebar to get started.
    </div>
  </div>
)}
```

**Replace with:**
```tsx
{!active && <HomepageView />}
```

Add import at top of file alongside existing shell imports:
```typescript
import { HomepageView } from './HomepageView';
```

---

### `src/shell/HomepageView.tsx` (component, request-response)

**Analog:** `src/shell/Sidebar.tsx` or `src/shell/SettingsModal.tsx` (store-reading React component)

**Store-reading component pattern** (`src/shell/MainPane.tsx` lines 14-23):
```tsx
const views = useAppStore(selectViews);
const activeViewId = useAppStore(selectActiveViewId);
// ...
const active = views.find((v) => v.id === activeViewId) ?? null;
```

Apply for HomepageView:
```tsx
import { useAppStore, selectActiveWorkspace, selectViews } from '../state/store';

export function HomepageView() {
  const workspace = useAppStore(selectActiveWorkspace);
  const views = useAppStore(selectViews);
  const agentStatus = useAppStore((s) => s.whatsappAgentStatus);
  const setWhatsAppAgentStatus = useAppStore((s) => s.setWhatsAppAgentStatus);
  // ...
}
```

**IPC side-effect pattern** (from `src/shell/ChatPanel.tsx` — `useEffect` + api call):
```tsx
useEffect(() => {
  // Subscribe to push events on mount; clean up on unmount.
  const handler = (status: WhatsAppAgentStatus) => setWhatsAppAgentStatus(status);
  api.onWhatsAppStatus(handler);
  return () => api.offWhatsAppStatus(handler);
}, [setWhatsAppAgentStatus]);
```

**Component structure:**
```tsx
export function HomepageView() {
  // 1. Store reads
  // 2. Push event subscription (useEffect)
  // 3. Render: workspace name, view list (last 3), agent status card
  return (
    <div className="homepage-view">
      <h1>{workspace?.name ?? 'Workspace'}</h1>
      <section className="recent-views">
        {views.slice(-3).reverse().map(v => (...))}
      </section>
      <section className="whatsapp-agent">
        {/* status display + start/stop controls */}
      </section>
    </div>
  );
}
```

---

### `src/shell/__tests__/HomepageView.test.ts` (test)

**Analog:** `src/shell/__tests__/memory.test.ts`

**Test file pattern** (`src/shell/__tests__/memory.test.ts` lines 1-9):
```typescript
import { describe, expect, it } from 'vitest';
import { ... } from '../memory';

describe('functionName', () => {
  it('description of behavior', () => {
    expect(...).toBe(...);
  });
});
```

**Note:** The `HomepageView` component renders with a Zustand store. Tests should mock the store slice and test the logic helpers (not the full React tree) to stay in `environment: 'node'` (no jsdom needed). If React rendering is needed, use `@testing-library/react` with a mock store.

Tests to cover:
- HP-01: workspace name appears in render output
- HP-02: last 3 views are listed (slice logic)
- HP-03: agent status state flows into the component

---

### `electron/ipc/__tests__/whatsapp.test.ts` (test)

**Analog:** `src/shell/__tests__/memory.test.ts` (module-level unit tests)

Tests to cover:
- WA-01: `disposeWhatsApp()` resets `agentStatus` to `{ state: 'disconnected' }` and clears `conversationHistory`
- WA-02: conversation history is per-JID (two JIDs do not share history)
- WA-03: `makeClient()` is now exported from `electron/ipc/ai.ts` and can be imported by `whatsapp.ts`

---

## Shared Patterns

### Main-process push event
**Source:** `electron/main.ts` line 130
**Apply to:** `electron/ipc/whatsapp.ts` (all status and message events)
```typescript
BrowserWindow.getAllWindows()[0]?.webContents.send('whatsapp:status', payload);
BrowserWindow.getAllWindows()[0]?.webContents.send('whatsapp:message', payload);
```

### Preload push listener registration
**Source:** `electron/preload.ts` lines 163-168
**Apply to:** `electron/preload.ts` (new whatsapp on/off methods), `src/ipc/client.ts`
```typescript
ipcRenderer.on('whatsapp:status', (_e, p) => cb(p));
ipcRenderer.removeListener('whatsapp:status', cb);
```

### Dispose on quit
**Source:** `electron/main.ts` lines 245-263
**Apply to:** `electron/main.ts` (add `disposeWhatsApp()` in both `before-quit` and `window-all-closed`)

### withLogging registration block
**Source:** `electron/ipc/index.ts` lines 102-121
**Apply to:** `electron/ipc/index.ts` (add `registerWhatsAppHandlers()` inside `withLogging` callback)

### Transient store slice (not persisted)
**Source:** `src/state/store.ts` lines 45-50, 123-130
**Apply to:** `src/state/store.ts` (add `whatsappAgentStatus` + `setWhatsAppAgentStatus` as top-level store fields outside the `Workspace` shape)

### Error pattern in IPC handler
**Source:** `electron/ipc/ai.ts` lines 93-128
```typescript
try {
  // ...
} catch (e) {
  throw new Error(e instanceof Error ? e.message : String(e));
}
```
**Apply to:** `electron/ipc/whatsapp.ts` (all `ipcMain.handle` callbacks)

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| Baileys socket setup inside `whatsapp.ts` | service | event-driven | No WebSocket push-based service exists in the codebase; follow Baileys README for `makeWASocket`, `useMultiFileAuthState`, and `sock.ev.on('messages.upsert', ...)` |

---

## Metadata

**Analog search scope:** `electron/ipc/`, `electron/`, `src/shell/`, `src/state/`, `src/ipc/`
**Files scanned:** 10
**Pattern extraction date:** 2026-06-03

**Key decisions:**
1. `makeClient()` in `electron/ipc/ai.ts` must be exported — it is currently unexported (line 62 has no `export` keyword).
2. WhatsApp agent runs in main process only; Baileys must never be imported in renderer.
3. Baileys auth state stored in `app.getPath('userData')/whatsapp-auth/` to avoid Vite file-watcher hot-reloads.
4. Homepage is a conditional render branch, not a registered view type — replaces the `!active` placeholder in `MainPane.tsx` lines 80-87.
5. Agent conversation history is `Map<jid, Anthropic.MessageParam[]>` in main process — NOT in Zustand store.
