import type { AiChatPayload, ElectronApi } from '../../electron/preload';
import type { Workspace } from '../state/types';

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

export interface SearchResult {
  path: string;
  line?: number;
  preview?: string;
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
  createFile: (filePath: string, rootPath: string) =>
    bridge().createFile(filePath, rootPath),
  search: (query: string, rootPath: string, opts?: { maxResults?: number }) =>
    bridge().search(query, rootPath, opts) as Promise<SearchResult[]>,
  basename: (p: string) => bridge().basename(p),
  storeGet: <T>(key: string) => bridge().storeGet(key) as Promise<T | null>,
  storeSet: (key: string, value: unknown) => bridge().storeSet(key, value),

  // AI
  aiHasKey: () => bridge().aiHasKey(),
  aiSetKey: (key: string) => bridge().aiSetKey(key),
  aiClearKey: () => bridge().aiClearKey(),
  aiChat: (payload: AiChatPayload) => bridge().aiChat(payload),
  aiCancelChat: (streamId: string) => bridge().aiCancelChat(streamId),
  aiOnChunk: (streamId: string, cb: (text: string) => void) =>
    bridge().aiOnChunk(streamId, cb),
  aiOffChunk: (streamId: string) => bridge().aiOffChunk(streamId),

  // Terminal
  terminalCreate: (opts: { cwd?: string }) => bridge().terminalCreate(opts),
  terminalWrite: (termId: string, data: string) => bridge().terminalWrite(termId, data),
  terminalResize: (termId: string, cols: number, rows: number) =>
    bridge().terminalResize(termId, cols, rows),
  terminalKill: (termId: string) => bridge().terminalKill(termId),
  terminalExec: (opts: { cwd?: string; command: string }) => bridge().terminalExec(opts),
  terminalOnData: (termId: string, cb: (data: string) => void) =>
    bridge().terminalOnData(termId, cb),
  terminalOffData: (termId: string) => bridge().terminalOffData(termId),
  terminalOnExit: (termId: string, cb: () => void) => bridge().terminalOnExit(termId, cb),
  terminalOffExit: (termId: string) => bridge().terminalOffExit(termId),

  // Workspace export/import
  workspaceExport: (workspace: Workspace) => bridge().workspaceExport(workspace),
  workspaceImport: () => bridge().workspaceImport(),

  // Doc protocol allow-list
  docAllow: (path: string) => bridge().docAllow(path),
  docRevoke: (path: string) => bridge().docRevoke(path),

  // Shell
  openExternal: (url: string) => bridge().openExternal(url),
  onOpenSettings: (cb: () => void) => bridge().onOpenSettings(cb),
  offOpenSettings: (cb: () => void) => bridge().offOpenSettings(cb),
};
