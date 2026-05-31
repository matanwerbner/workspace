import { ipcMain } from 'electron';
import { resolve } from 'node:path';
import { statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

// Absolute paths the renderer has explicitly opened and is allowed to fetch
// via the doc:// protocol or read via doc:read.
export const allow = new Set<string>();

export function isDocAllowed(p: string): boolean {
  return allow.has(resolve(p));
}

export function registerDocHandlers(): void {
  ipcMain.handle('doc:allow', (_e, p: string) => allow.add(resolve(p)));
  ipcMain.handle('doc:revoke', (_e, p: string) => allow.delete(resolve(p)));

  // Return the raw bytes of an allow-listed file. The renderer wraps these in a
  // blob: URL for the PDF view — Chromium's built-in PDF viewer renders blob:
  // (and file:///http://) but not our custom doc:// scheme, and that scheme is
  // not fetchable cross-origin from the renderer, so we hand over bytes here.
  ipcMain.handle('doc:read', async (_e, p: string): Promise<ArrayBuffer> => {
    const full = resolve(p);
    if (!allow.has(full)) throw new Error('Access denied: document is not allow-listed');
    if (!statSync(full).isFile()) throw new Error('Not a regular file');
    const buf = await readFile(full);
    // Hand back a standalone ArrayBuffer (structured-clones efficiently).
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  });
}
