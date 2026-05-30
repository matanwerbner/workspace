import { ipcMain } from 'electron';
import { readdir, readFile, writeFile, stat, lstat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { assertInsideRoots, assertParentInsideRoots } from './roots';

export interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface SearchResult {
  path: string;
  line?: number;
  preview?: string;
}

const IGNORED = new Set(['.git', 'node_modules', '.DS_Store', '.next', 'dist', 'out']);

export function registerFsHandlers(): void {
  ipcMain.handle(
    'fs:listDir',
    async (_e, dirPath: string, _rootPath: string): Promise<DirEntry[]> => {
      const realDir = await assertInsideRoots(dirPath);
      const entries = await readdir(realDir, { withFileTypes: true });
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

  ipcMain.handle('fs:readFile', async (_e, filePath: string, _rootPath: string): Promise<string> => {
    const realPath = await assertInsideRoots(filePath);
    const s = await stat(realPath);
    if (s.size > 5 * 1024 * 1024) throw new Error('File too large (>5MB)');
    return await readFile(realPath, 'utf8');
  });

  ipcMain.handle(
    'fs:writeFile',
    async (_e, filePath: string, content: string, _rootPath: string): Promise<void> => {
      // Reject a final symlink outright so writes cannot follow a link out of the
      // workspace. Validate the (real) parent dir for both new and existing files.
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

  ipcMain.handle(
    'fs:createFile',
    async (_e, filePath: string, _rootPath: string): Promise<void> => {
      const target = await assertParentInsideRoots(filePath);
      // lstat (not access) so a dangling/escaping symlink counts as existing and
      // is rejected rather than being followed by the write below.
      let exists = false;
      try {
        await lstat(target);
        exists = true;
      } catch {
        exists = false;
      }
      if (exists) throw new Error('File already exists');
      await writeFile(target, '', 'utf8');
    },
  );

  ipcMain.handle(
    'fs:search',
    async (
      _e,
      query: string,
      rootPath: string,
      opts?: { maxResults?: number },
    ): Promise<SearchResult[]> => {
      const searchRoot = await assertInsideRoots(rootPath);
      const needle = query.toLowerCase();
      if (!needle) return [];
      const limit = opts?.maxResults ?? 100;
      const results: SearchResult[] = [];

      const walk = async (dir: string): Promise<void> => {
        if (results.length >= limit) return;
        let entries;
        try {
          entries = await readdir(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const entry of entries) {
          if (results.length >= limit) return;
          if (IGNORED.has(entry.name)) continue;
          const full = join(dir, entry.name);
          if (entry.isDirectory()) {
            await walk(full);
            continue;
          }
          if (!entry.isFile()) continue;

          // Name match (always recorded, no line/preview).
          if (entry.name.toLowerCase().includes(needle)) {
            results.push({ path: full });
            if (results.length >= limit) return;
          }

          // Content match — skip large or binary-looking files.
          let s;
          try {
            s = await stat(full);
          } catch {
            continue;
          }
          if (s.size > 1024 * 1024) continue;
          let buf;
          try {
            buf = await readFile(full);
          } catch {
            continue;
          }
          // A NUL byte is a strong signal the file is binary, not text.
          if (buf.includes(0)) continue;
          const content = buf.toString('utf8');
          const lower = content.toLowerCase();
          if (!lower.includes(needle)) continue;
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(needle)) {
              results.push({ path: full, line: i + 1, preview: lines[i].trim().slice(0, 200) });
              break;
            }
          }
          if (results.length >= limit) return;
        }
      };

      await walk(searchRoot);
      return results.slice(0, limit);
    },
  );

  ipcMain.handle('fs:basename', async (_e, p: string): Promise<string> => basename(p));
}
