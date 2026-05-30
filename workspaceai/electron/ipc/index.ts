import { ipcMain, shell } from 'electron';
import { registerFsHandlers } from './fs';
import { registerDialogHandlers } from './dialog';
import { registerStoreHandlers } from './store';
import { registerAiHandlers } from './ai';
import { registerTerminalHandlers } from './terminal';
import { registerDocHandlers } from './doc';
import { registerWorkspaceHandlers } from './workspace';

export function registerIpcHandlers(): void {
  registerFsHandlers();
  registerDialogHandlers();
  registerStoreHandlers();
  registerAiHandlers();
  registerTerminalHandlers();
  registerDocHandlers();
  registerWorkspaceHandlers();

  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      void shell.openExternal(url);
    }
  });
}
