import { app, BrowserWindow, Menu, net, protocol, session, shell } from 'electron';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { statSync } from 'node:fs';
import { registerIpcHandlers } from './ipc';
import { isDocAllowed } from './ipc/doc';
import { disposeTerminals } from './ipc/terminal';
import { disposeCodeServers } from './ipc/codeServer';
import { disposeStreams } from './ipc/ai';
import { getPersistedAppState } from './ipc/store';
import { seedRootsFromState } from './ipc/roots';
import { initLogger, closeLogger, logEvent } from './logger';

const isDev = !app.isPackaged;

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'doc',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

function registerDocProtocol(): void {
  protocol.handle('doc', (request) => {
    const url = new URL(request.url);
    // doc://_/<absolute-path> — pathname starts with "/", and the absolute
    // path itself also starts with "/", so the result already has a leading "/".
    const filePath = decodeURIComponent(url.pathname);
    // Only serve files the renderer has explicitly allowed, and only if the
    // resolved path is a regular file.
    let isFile = false;
    try {
      isFile = statSync(filePath).isFile();
    } catch {
      isFile = false;
    }
    if (!isDocAllowed(filePath) || !isFile) {
      return new Response('Forbidden', { status: 403 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

// NOTE: script-src still allows 'unsafe-inline'/'unsafe-eval' because Monaco and
// the Vite dev runtime require them; fully removing these (nonce/hash-based CSP)
// is deferred to the packaging work (P0.1) where the production bundle can be
// runtime-verified. The directives below still close the object/base/framing
// XSS vectors, which Monaco does not depend on.
const CSP =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob: doc:; " +
  "font-src 'self' data:; " +
  "connect-src 'self' ws: wss: http://localhost:* https://localhost:*; " +
  "worker-src 'self' blob:; " +
  "frame-src 'self' doc:; " +
  "object-src 'none'; " +
  "base-uri 'self'; " +
  "frame-ancestors 'none'";

function registerCsp(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP],
      },
    });
  });
}

// Harden every <webview> guest that attaches: strip any preload, force the
// safe sandbox defaults, and route guest-initiated popups to the OS browser
// instead of letting a navigated page open windows with arbitrary settings.
function registerWebviewHardening(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (_e, webPreferences) => {
      delete webPreferences.preload;
      webPreferences.nodeIntegration = false;
      webPreferences.contextIsolation = true;
    });
    if (contents.getType() === 'webview') {
      contents.setWindowOpenHandler(({ url }) => {
        const parsed = new URL(url);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
          void shell.openExternal(url);
        }
        return { action: 'deny' };
      });
    }
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'Orbit',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a1a',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
  });

  win.on('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function buildMenu(): void {
  const openSettings = () => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('shell:openSettings');
  };

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Preferences…',
          accelerator: 'CmdOrCtrl+,',
          click: openSettings,
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        ...(isDev
          ? ([
              { role: 'reload' },
              { role: 'forceReload' },
              { role: 'toggleDevTools' },
              { type: 'separator' },
            ] as Electron.MenuItemConstructorOptions[])
          : []),
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  // Seed the log directory from the active workspace's homeFolder (if set)
  // so session logs land there from the very first event.
  const persistedState = getPersistedAppState();
  const activeWs = Array.isArray(persistedState?.workspaces)
    ? (persistedState.workspaces as Array<{ id: string; homeFolder?: string }>).find(
        (w) => w.id === persistedState.activeWorkspaceId,
      )
    : undefined;
  initLogger(activeWs?.homeFolder ?? undefined);
  registerCsp();
  registerWebviewHardening();
  registerDocProtocol();
  registerIpcHandlers();
  // Re-anchor workspace roots from persisted state so restored views keep fs
  // access after a restart, without trusting renderer-supplied paths.
  seedRootsFromState(persistedState);
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', async (event) => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win || win.webContents.isDestroyed()) return;
  event.preventDefault();
  try {
    await Promise.race([
      win.webContents.executeJavaScript('window.__flushAppState?.()', true),
      new Promise<void>((resolve) => setTimeout(resolve, 3000)),
    ]);
  } catch {
    // Best-effort; proceed with quit regardless.
  }
  disposeTerminals();
  disposeCodeServers();
  disposeStreams();
  logEvent({ category: 'app', action: 'before-quit' });
  await closeLogger();
  app.exit(0);
});

app.on('window-all-closed', () => {
  disposeTerminals();
  disposeCodeServers();
  disposeStreams();
  if (process.platform !== 'darwin') {
    logEvent({ category: 'app', action: 'window-all-closed' });
    void closeLogger().then(() => app.quit());
  }
});
