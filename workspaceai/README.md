# WorkspaceAI

A macOS container app for views, each with its own dedicated AI console.

## Stack

- **Electron** + **electron-vite**
- **React 18** + **TypeScript**
- **Monaco Editor** (the VS Code editor) for code views
- **Zustand** for state, persisted to disk via **electron-store**
- **react-resizable-panels** for the resizable AI chat split

## Architecture

The app uses a small **view-type registry** so new view types can be added by dropping a folder in `src/views/<name>/` and calling `registerView()`. Today there is one view type — Code View — that opens a folder, shows a file tree, and edits files in Monaco.

```
src/
├── App.tsx                 # hydrates state, mounts shell
├── shell/                  # Sidebar, MainPane, ChatPanel, AddViewModal
├── views/
│   ├── registry.ts         # registerView / listViewTypes / getViewType
│   ├── types.ts            # ViewTypeDefinition interface
│   └── code/               # the Code View type
│       ├── index.tsx       # registerView({ typeId: 'code', ... })
│       ├── CodeView.tsx
│       ├── FileTree.tsx
│       └── MonacoHost.tsx
├── state/                  # Zustand store + persistence
├── ipc/client.ts           # typed wrapper around window.api
├── lib/                    # shared utilities (uid, …)
└── theme/                  # CSS variables + app styles

electron/
├── main.ts                 # window, IPC registration, before-quit flush
├── preload.ts              # contextBridge → window.api
└── ipc/                    # fs, dialog, store handlers
```

## Run it

```bash
npm install
npm run dev
```

The app opens with an empty sidebar. Click **+** → **Code View** → pick a folder.
Use ⌘S to save the current file.

## Adding a new view type

There are two cases.

### Case A — pure renderer view (uses only existing IPC)

If your view only needs `fs`, `dialog`, or `store` calls that already exist:

1. Create `src/views/myview/index.tsx`:

   ```tsx
   import { registerView } from '../registry';
   import { MyView } from './MyView';

   registerView({
     typeId: 'myview',
     label: 'My View',
     description: 'What it does.',
     icon: <span>★</span>,
     createConfig: async () => ({ name: 'My View', config: {} }),
     Component: MyView,
   });
   ```

2. Import it in `src/App.tsx`:

   ```ts
   import './views/myview';
   ```

That's it — the `+` picker, sidebar, chat panel, and persistence all wire up automatically.

### Case B — view needs new native APIs (e.g. terminal, browser)

A new native capability requires changes on both sides of Electron's process boundary. The contextBridge is statically defined at preload time, so this can't be plugin-loaded at runtime. Expect to touch:

1. `electron/ipc/<myview>.ts` — `ipcMain.handle(...)` handlers
2. `electron/ipc/index.ts` — register the new handlers
3. `electron/preload.ts` — add bridge methods
4. `src/ipc/client.ts` — typed wrappers
5. `src/views/<myview>/` — your view (same as Case A)
6. `src/App.tsx` — import the registration

Use a namespaced channel convention (`terminal:*`, `browser:*`) so different view types don't collide.

## AI chat

The chat panel is fully functional UI-wise; messages echo back with `"AI backend not configured. You sent: ..."`. Wire a real backend by editing `src/shell/ChatPanel.tsx` (the `send` function).

Each view gets its own chat history and chat-panel layout state (collapsed/size), persisted across restarts.

## Persistence

State is debounced (200 ms) into `electron-store`. On clean quit, the main process triggers a final synchronous flush via `window.__flushAppState`. Schema is versioned (`schemaVersion: 1`); on bumps, hydrate falls back to defaults rather than crashing.
