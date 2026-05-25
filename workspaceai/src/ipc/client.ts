import type { ElectronApi } from '../../electron/preload';

declare global {
  interface Window {
    api: ElectronApi;
  }
}

export interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

function bridge(): ElectronApi {
  if (!window.api) {
    throw new Error(
      'Preload bridge not loaded — window.api is undefined. Check the renderer DevTools console for an earlier preload error.',
    );
  }
  return window.api;
}

export const api = {
  pickFolder: () => bridge().pickFolder(),
  pickFile: (filters?: FileFilter[]) => bridge().pickFile(filters),
  confirm: (message: string) => bridge().confirm(message),
  listDir: (dirPath: string, rootPath: string) =>
    bridge().listDir(dirPath, rootPath) as Promise<DirEntry[]>,
  readFile: (filePath: string, rootPath: string) => bridge().readFile(filePath, rootPath),
  writeFile: (filePath: string, content: string, rootPath: string) =>
    bridge().writeFile(filePath, content, rootPath),
  basename: (p: string) => bridge().basename(p),
  storeGet: <T>(key: string) => bridge().storeGet(key) as Promise<T | null>,
  storeSet: (key: string, value: unknown) => bridge().storeSet(key, value),
};
