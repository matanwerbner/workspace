import { dialog, ipcMain, BrowserWindow } from 'electron';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { seedRootsFromState } from './roots';

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
  ipcMain.handle('workspace:export', (_e, workspace: Record<string, unknown> & { name: string }) =>
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
