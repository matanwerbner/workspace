import { contextBridge, ipcRenderer } from 'electron';

// eslint-disable-next-line no-console
console.log('[preload] loading');

const api = {
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickFolder'),
  pickFile: (filters?: Electron.FileFilter[]): Promise<string | null> =>
    ipcRenderer.invoke('dialog:pickFile', filters),
  confirm: (message: string): Promise<boolean> =>
    ipcRenderer.invoke('dialog:confirm', message),
  listDir: (dirPath: string, rootPath: string) =>
    ipcRenderer.invoke('fs:listDir', dirPath, rootPath),
  readFile: (filePath: string, rootPath: string): Promise<string> =>
    ipcRenderer.invoke('fs:readFile', filePath, rootPath),
  writeFile: (filePath: string, content: string, rootPath: string): Promise<void> =>
    ipcRenderer.invoke('fs:writeFile', filePath, content, rootPath),
  basename: (p: string): Promise<string> => ipcRenderer.invoke('fs:basename', p),
  storeGet: (key: string): Promise<unknown> => ipcRenderer.invoke('store:get', key),
  storeSet: (key: string, value: unknown): Promise<void> =>
    ipcRenderer.invoke('store:set', key, value),
};

try {
  contextBridge.exposeInMainWorld('api', api);
  // eslint-disable-next-line no-console
  console.log('[preload] exposed window.api');
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('[preload] exposeInMainWorld failed', err);
}

export type ElectronApi = typeof api;
