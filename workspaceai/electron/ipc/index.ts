import { registerFsHandlers } from './fs';
import { registerDialogHandlers } from './dialog';
import { registerStoreHandlers } from './store';
<<<<<<< Updated upstream
=======
import { registerAiHandlers } from './ai';
import { registerTerminalHandlers } from './terminal';
import { registerCodeServerHandlers } from './codeServer';
import { registerDocHandlers } from './doc';
import { registerWorkspaceHandlers } from './workspace';
>>>>>>> Stashed changes

export function registerIpcHandlers(): void {
  registerFsHandlers();
  registerDialogHandlers();
  registerStoreHandlers();
<<<<<<< Updated upstream
=======
  registerAiHandlers();
  registerTerminalHandlers();
  registerCodeServerHandlers();
  registerDocHandlers();
  registerWorkspaceHandlers();

  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      void shell.openExternal(url);
    }
  });
>>>>>>> Stashed changes
}
