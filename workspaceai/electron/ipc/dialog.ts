import { dialog, ipcMain, BrowserWindow } from 'electron';

function withWindow<T>(
  fn: (win: BrowserWindow | undefined) => Promise<T>,
): Promise<T> {
  return fn(BrowserWindow.getFocusedWindow() ?? undefined);
}

export function registerDialogHandlers(): void {
  ipcMain.handle('dialog:pickFolder', () =>
    withWindow(async (win) => {
      const opts: Electron.OpenDialogOptions = {
        properties: ['openDirectory', 'createDirectory'],
      };
      const result = win
        ? await dialog.showOpenDialog(win, opts)
        : await dialog.showOpenDialog(opts);
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0];
    }),
  );

  ipcMain.handle(
    'dialog:pickFile',
    (_e, filters?: Electron.FileFilter[]) =>
      withWindow(async (win) => {
        const opts: Electron.OpenDialogOptions = {
          properties: ['openFile'],
          filters,
        };
        const result = win
          ? await dialog.showOpenDialog(win, opts)
          : await dialog.showOpenDialog(opts);
        if (result.canceled || result.filePaths.length === 0) return null;
        return result.filePaths[0];
      }),
  );

  ipcMain.handle('dialog:confirm', (_e, message: string) =>
    withWindow(async (win) => {
      const opts: Electron.MessageBoxOptions = {
        type: 'question',
        buttons: ['Discard', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        message,
      };
      const result = win
        ? await dialog.showMessageBox(win, opts)
        : await dialog.showMessageBox(opts);
      return result.response === 0;
    }),
  );
}
