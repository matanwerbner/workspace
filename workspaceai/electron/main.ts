import { app, BrowserWindow, net, protocol, shell } from 'electron';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { registerIpcHandlers } from './ipc';
<<<<<<< Updated upstream
=======
import { isDocAllowed } from './ipc/doc';
import { disposeTerminals } from './ipc/terminal';
import { disposeCodeServers } from './ipc/codeServer';
import { disposeStreams } from './ipc/ai';
import { getPersistedAppState } from './ipc/store';
import { seedRootsFromState } from './ipc/roots';
>>>>>>> Stashed changes

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
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'WorkspaceAI',
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

app.whenReady().then(() => {
  registerDocProtocol();
  registerIpcHandlers();
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
    await win.webContents.executeJavaScript('window.__flushAppState?.()', true);
  } catch {
    // Best-effort; proceed with quit regardless.
  }
<<<<<<< Updated upstream
=======
  disposeTerminals();
  disposeCodeServers();
  disposeStreams();
>>>>>>> Stashed changes
  app.exit(0);
});

app.on('window-all-closed', () => {
<<<<<<< Updated upstream
=======
  disposeTerminals();
  disposeCodeServers();
  disposeStreams();
>>>>>>> Stashed changes
  if (process.platform !== 'darwin') app.quit();
});
