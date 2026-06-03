import { app, dialog, ipcMain, BrowserWindow } from 'electron';
import { existsSync, realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { registerRoot, seedRootsFromState } from './roots';
import { setHomeFolder } from '../logger';

function withWindow<T>(
  fn: (win: BrowserWindow | undefined) => Promise<T>,
): Promise<T> {
  return fn(BrowserWindow.getFocusedWindow() ?? undefined);
}

const WSAI_FILTERS: Electron.FileFilter[] = [
  { name: 'WorkspaceAI Workspace', extensions: ['wsai.json', 'json'] },
];

// Absolute-path config fields that we verify on import.
const PATH_FIELDS = ['rootPath', 'filePath', 'cwd'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function collectMissingPaths(workspace: Record<string, unknown>): string[] {
  const missing: string[] = [];
  const views = Array.isArray(workspace.views) ? workspace.views : [];
  for (const view of views) {
    const config = isRecord(view) && isRecord(view.config) ? view.config : null;
    if (!config) continue;
    for (const field of PATH_FIELDS) {
      const value = config[field];
      if (typeof value === 'string' && value.length > 0 && !existsSync(value)) {
        missing.push(value);
      }
    }
  }
  return missing;
}

export function registerWorkspaceHandlers(): void {
  ipcMain.handle('workspace:initHomeFolder', (_e, name: string) =>
    withWindow(async (win) => {
      const opts: Electron.OpenDialogOptions = {
        properties: ['openDirectory', 'createDirectory'],
        message: `Choose a home folder for "${name}"`,
        buttonLabel: 'Select Folder',
      };
      const result = win
        ? await dialog.showOpenDialog(win, opts)
        : await dialog.showOpenDialog(opts);
      if (result.canceled || result.filePaths.length === 0) return null;

      const folderPath = result.filePaths[0];

      // Prevent using the app's own source/resource directory as a workspace
      // home — writing logs and memory files inside the project root causes
      // Vite's file watcher to trigger page reloads on every log write.
      try {
        const appRoot = realpathSync(app.getAppPath());
        const chosen = realpathSync(folderPath);
        if (chosen === appRoot || chosen.startsWith(appRoot + '/')) {
          await dialog.showMessageBox(win ?? BrowserWindow.getFocusedWindow()!, {
            type: 'error',
            title: 'Invalid folder',
            message: 'Cannot use the application directory as a workspace home folder. Please choose a different location.',
            buttons: ['OK'],
          });
          return null;
        }
      } catch {
        // realpathSync can fail on non-existent paths; skip the guard and let
        // mkdir below surface any real I/O error.
      }

      await mkdir(join(folderPath, 'logs'), { recursive: true });
      await mkdir(join(folderPath, 'memory'), { recursive: true });

      const configPath = join(folderPath, 'workspace-config.md');
      if (!existsSync(configPath)) {
        await writeFile(
          configPath,
          `# ${name}\n\nCreated: ${new Date().toISOString()}\n`,
          'utf8',
        );
      }

      return folderPath;
    }),
  );

  ipcMain.handle('workspace:export',(_e, workspace: Record<string, unknown> & { name: string }) =>
    withWindow(async (win) => {
      const opts: Electron.SaveDialogOptions = {
        defaultPath: `${workspace.name}.wsai.json`,
        filters: WSAI_FILTERS,
      };
      const result = win
        ? await dialog.showSaveDialog(win, opts)
        : await dialog.showSaveDialog(opts);
      if (result.canceled || !result.filePath) return null;
      const payload = {
        schemaVersion: 2,
        exportedAt: new Date().toISOString(),
        workspace,
      };
      await writeFile(result.filePath, JSON.stringify(payload, null, 2), 'utf8');
      return result.filePath;
    }),
  );

  ipcMain.handle('workspace:setActiveHomeFolder', (_e, path: string | null) => {
    const p = typeof path === 'string' && path.length > 0 ? path : null;
    setHomeFolder(p);
    if (p !== null) registerRoot(p);
  });

  ipcMain.handle('workspace:import', () =>
    withWindow(async (win) => {
      const opts: Electron.OpenDialogOptions = {
        properties: ['openFile'],
        filters: WSAI_FILTERS,
      };
      const result = win
        ? await dialog.showOpenDialog(win, opts)
        : await dialog.showOpenDialog(opts);
      if (result.canceled || result.filePaths.length === 0) return null;

      const raw = await readFile(result.filePaths[0], 'utf8');
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error('Invalid workspace file: not valid JSON');
      }
      const workspace =
        isRecord(parsed) && isRecord(parsed.workspace) ? parsed.workspace : null;
      if (!workspace) {
        throw new Error('Invalid workspace file: missing workspace object');
      }
      const missingPaths = collectMissingPaths(workspace);
      // Anchor existing-directory roots from the imported workspace server-side
      // so its code/terminal views pass fs validation.
      seedRootsFromState({ workspaces: [workspace] });
      return { workspace, missingPaths };
    }),
  );
}
