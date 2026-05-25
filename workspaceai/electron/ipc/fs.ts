import { ipcMain } from 'electron';
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, basename, resolve, sep } from 'node:path';

export interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

const IGNORED = new Set(['.git', 'node_modules', '.DS_Store', '.next', 'dist', 'out']);

function isPathInside(child: string, parent: string): boolean {
  const c = resolve(child);
  const p = resolve(parent);
  return c === p || c.startsWith(p + sep);
}

function assertInside(path: string, root: string): void {
  if (!isPathInside(path, root)) {
    throw new Error('Access denied: path is outside the workspace root');
  }
}

export function registerFsHandlers(): void {
  ipcMain.handle(
    'fs:listDir',
    async (_e, dirPath: string, rootPath: string): Promise<DirEntry[]> => {
      assertInside(dirPath, rootPath);
      const entries = await readdir(dirPath, { withFileTypes: true });
      return entries
        .filter((e) => !IGNORED.has(e.name))
        .map((e) => ({
          name: e.name,
          path: join(dirPath, e.name),
          isDirectory: e.isDirectory(),
        }))
        .sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
    },
  );

  ipcMain.handle('fs:readFile', async (_e, filePath: string, rootPath: string): Promise<string> => {
    assertInside(filePath, rootPath);
    const s = await stat(filePath);
    if (s.size > 5 * 1024 * 1024) throw new Error('File too large (>5MB)');
    return await readFile(filePath, 'utf8');
  });

  ipcMain.handle(
    'fs:writeFile',
    async (_e, filePath: string, content: string, rootPath: string): Promise<void> => {
      assertInside(filePath, rootPath);
      await writeFile(filePath, content, 'utf8');
    },
  );

  ipcMain.handle('fs:basename', async (_e, p: string): Promise<string> => basename(p));
}
