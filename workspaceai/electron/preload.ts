import { contextBridge, ipcRenderer } from 'electron';
import type Anthropic from '@anthropic-ai/sdk';
import type { Workspace } from '../src/state/types';
import type { SearchResult } from './ipc/fs';

// Per-stream chunk handlers kept in preload context to avoid contextBridge closure restrictions.
const chunkHandlers = new Map<string, (text: string) => void>();
ipcRenderer.on('ai:chunk', (_e, data: { streamId: string; text: string }) => {
  chunkHandlers.get(data.streamId)?.(data.text);
});

// Terminal data/exit handlers keyed by termId.
const termDataHandlers = new Map<string, (data: string) => void>();
const termExitHandlers = new Map<string, () => void>();
ipcRenderer.on('terminal:data', (_e, { termId, data }: { termId: string; data: string }) => {
  termDataHandlers.get(termId)?.(data);
});
ipcRenderer.on('terminal:exit', (_e, { termId }: { termId: string }) => {
  termExitHandlers.get(termId)?.();
});

export interface AiChatPayload {
  streamId: string;
  messages: Anthropic.MessageParam[];
  systemPrompt?: string;
  tools?: Anthropic.Tool[];
  model?: string;
  maxTokens?: number;
}

export interface AiChatResult {
  content: Anthropic.ContentBlock[];
  stopReason: Anthropic.Message['stop_reason'];
}

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
  createFile: (filePath: string, rootPath: string): Promise<void> =>
    ipcRenderer.invoke('fs:createFile', filePath, rootPath),
  search: (
    query: string,
    rootPath: string,
    opts?: { maxResults?: number },
  ): Promise<SearchResult[]> => ipcRenderer.invoke('fs:search', query, rootPath, opts),
  basename: (p: string): Promise<string> => ipcRenderer.invoke('fs:basename', p),
  storeGet: (key: string): Promise<unknown> => ipcRenderer.invoke('store:get', key),
  storeSet: (key: string, value: unknown): Promise<void> =>
    ipcRenderer.invoke('store:set', key, value),

  // AI
  aiHasKey: (): Promise<boolean> => ipcRenderer.invoke('ai:hasKey'),
  aiSetKey: (key: string): Promise<void> => ipcRenderer.invoke('ai:setKey', key),
  aiClearKey: (): Promise<void> => ipcRenderer.invoke('ai:clearKey'),
  aiChat: (payload: AiChatPayload): Promise<AiChatResult> =>
    ipcRenderer.invoke('ai:chat', payload),
  aiCancelChat: (streamId: string): Promise<void> =>
    ipcRenderer.invoke('ai:cancelChat', streamId),
  aiOnChunk: (streamId: string, cb: (text: string) => void): void => {
    chunkHandlers.set(streamId, cb);
  },
  aiOffChunk: (streamId: string): void => {
    chunkHandlers.delete(streamId);
  },

  // Terminal
  terminalCreate: (opts: { cwd?: string }): Promise<{ termId: string }> =>
    ipcRenderer.invoke('terminal:create', opts),
  terminalWrite: (termId: string, data: string): Promise<void> =>
    ipcRenderer.invoke('terminal:write', { termId, data }),
  terminalResize: (termId: string, cols: number, rows: number): Promise<void> =>
    ipcRenderer.invoke('terminal:resize', { termId, cols, rows }),
  terminalKill: (termId: string): Promise<void> =>
    ipcRenderer.invoke('terminal:kill', { termId }),
  terminalExec: (opts: {
    cwd?: string;
    command: string;
  }): Promise<{ stdout: string; stderr: string; code: number }> =>
    ipcRenderer.invoke('terminal:exec', opts),
  terminalOnData: (termId: string, cb: (data: string) => void): void => {
    termDataHandlers.set(termId, cb);
  },
  terminalOffData: (termId: string): void => {
    termDataHandlers.delete(termId);
  },
  terminalOnExit: (termId: string, cb: () => void): void => {
    termExitHandlers.set(termId, cb);
  },
  terminalOffExit: (termId: string): void => {
    termExitHandlers.delete(termId);
  },

  // Code server (embedded VS Code)
  codeServerStart: (opts: {
    rootPath: string;
    binPath?: string;
  }): Promise<
    | { status: 'ok'; serverId: string; url: string }
    | { status: 'not_installed' }
    | { status: 'error'; message: string }
  > => ipcRenderer.invoke('codeServer:start', opts),
  codeServerStop: (serverId: string): Promise<void> =>
    ipcRenderer.invoke('codeServer:stop', { serverId }),
  codeServerStatus: (opts?: {
    binPath?: string;
  }): Promise<{ kind: string | null; bin: string | null }> =>
    ipcRenderer.invoke('codeServer:status', opts ?? {}),

  // Workspace export/import
  workspaceInitHomeFolder: (name: string): Promise<string | null> =>
    ipcRenderer.invoke('workspace:initHomeFolder', name),
  workspaceSetActiveHomeFolder: (path: string | null): Promise<void> =>
    ipcRenderer.invoke('workspace:setActiveHomeFolder', path),
  workspaceExport: (workspace: Workspace): Promise<string | null> =>
    ipcRenderer.invoke('workspace:export', workspace),
  workspaceImport: (): Promise<{ workspace: Workspace; missingPaths: string[] } | null> =>
    ipcRenderer.invoke('workspace:import'),

  // Doc protocol allow-list
  docAllow: (path: string): Promise<void> => ipcRenderer.invoke('doc:allow', path),
  docRevoke: (path: string): Promise<void> => ipcRenderer.invoke('doc:revoke', path),
  docRead: (path: string): Promise<ArrayBuffer> => ipcRenderer.invoke('doc:read', path),

  // Shell
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('shell:openExternal', url),

  // Debug logging — renderer pushes semantic events into the session log file.
  logEvent: (entry: {
    level?: 'debug' | 'info' | 'warn' | 'error';
    category: string;
    action: string;
    detail?: unknown;
  }): Promise<void> => ipcRenderer.invoke('log:event', entry),

  // Settings open event sent from the main-process menu
  onOpenSettings: (cb: () => void): void => {
    ipcRenderer.on('shell:openSettings', cb);
  },
  offOpenSettings: (cb: () => void): void => {
    ipcRenderer.removeListener('shell:openSettings', cb);
  },
};

contextBridge.exposeInMainWorld('api', api);

export type ElectronApi = typeof api;
