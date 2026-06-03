import { ipcMain } from 'electron';
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { assertInsideRoots, assertParentInsideRoots } from './roots';
import { formatEntry, upsertIndexLine, isValidMemoryName, MEMORY_TYPES } from '../../src/shell/memory';

export function registerMemoryHandlers(): void {
  // memory:readIndex — returns MEMORY.md content or null (never throws).
  // null is returned if homeFolder is not a registered root (plan 01-02 patches
  // that gap) or if the index file doesn't exist yet (first use).
  ipcMain.handle('memory:readIndex', async (_e, homeFolder: string): Promise<string | null> => {
    const indexPath = join(homeFolder, 'memory', 'MEMORY.md');
    let realPath: string;
    try {
      realPath = await assertInsideRoots(indexPath);
    } catch {
      return null; // homeFolder not yet a registered root, or path outside roots
    }
    try {
      return await readFile(realPath, 'utf8');
    } catch {
      return null; // ENOENT on first use — no index yet
    }
  });

  // memory:readEntry — returns entry file content or null (never throws).
  // Returns null immediately if the topic name is invalid (security gate).
  ipcMain.handle('memory:readEntry', async (_e, homeFolder: string, topic: string): Promise<string | null> => {
    if (!isValidMemoryName(topic)) return null;
    const entryPath = join(homeFolder, 'memory', `${topic}.md`);
    try {
      const realPath = await assertInsideRoots(entryPath);
      return await readFile(realPath, 'utf8');
    } catch {
      return null;
    }
  });

  // memory:writeEntry — creates/updates a named memory entry and updates MEMORY.md.
  // Throws on invalid name, invalid type, path-traversal attempts, or symlink writes.
  ipcMain.handle('memory:writeEntry', async (
    _e,
    homeFolder: string,
    name: string,
    description: string,
    type: string,
    content: string,
  ): Promise<void> => {
    // Validate name (path traversal gate — T-01-01)
    if (!isValidMemoryName(name)) throw new Error('Invalid memory name');

    // Validate type (T-01-04)
    if (!(MEMORY_TYPES as readonly string[]).includes(type))
      throw new Error('Invalid memory type');

    // Ensure memory/ directory exists (idempotent, handles races)
    const memDir = join(homeFolder, 'memory');
    await mkdir(join(homeFolder, 'memory'), { recursive: true });

    // Resolve and assert entry path (T-01-03 — assertParentInsideRoots for new files)
    const entryFileName = `${name}.md`;
    const entryPath = join(memDir, entryFileName);
    const entryTarget = await assertParentInsideRoots(entryPath);

    // Reject symlink writes (T-01-02 — mirrors fs.ts lines 53-59)
    let link = false;
    try {
      link = (await lstat(entryTarget)).isSymbolicLink();
    } catch {
      link = false;
    }
    if (link) throw new Error('Access denied: refusing to write through a symlink');

    // Write the entry file with YAML frontmatter + content
    await writeFile(entryTarget, formatEntry(name, description, type, content), 'utf8');

    // Upsert MEMORY.md index — read existing (or start empty), upsert, write back
    const indexPath = join(memDir, 'MEMORY.md');
    const indexTarget = await assertParentInsideRoots(indexPath);
    let existing = '';
    try {
      existing = await readFile(indexTarget, 'utf8');
    } catch {
      // ENOENT — first entry, start with empty index
    }
    const newIndex = upsertIndexLine(existing, name, description, entryFileName);
    await writeFile(indexTarget, newIndex, 'utf8');
  });
}
