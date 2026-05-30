import { ipcMain } from 'electron';
import { resolve } from 'node:path';

// Absolute paths the renderer has explicitly opened and is allowed to fetch
// via the doc:// protocol.
export const allow = new Set<string>();

export function isDocAllowed(p: string): boolean {
  return allow.has(resolve(p));
}

export function registerDocHandlers(): void {
  ipcMain.handle('doc:allow', (_e, p: string) => allow.add(resolve(p)));
  ipcMain.handle('doc:revoke', (_e, p: string) => allow.delete(resolve(p)));
}
