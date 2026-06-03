import { ipcMain, shell } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { registerFsHandlers } from './fs';
import { registerDialogHandlers } from './dialog';
import { registerStoreHandlers } from './store';
import { registerAiHandlers } from './ai';
import { registerTerminalHandlers } from './terminal';
import { registerCodeServerHandlers } from './codeServer';
import { registerDocHandlers } from './doc';
import { registerWorkspaceHandlers } from './workspace';
import { registerMemoryHandlers } from './memory';
import { logEvent } from '../logger';

// Channels we never log argument/return payloads for, to keep secrets out of
// the debug log. The invocation itself is still recorded.
const REDACTED_CHANNELS = new Set(['ai:setKey']);
// Channels too chatty or too large to log every payload verbatim — we log a
// compact summary instead (see summarizeArgs/summarizeResult).
const SUMMARIZED_CHANNELS = new Set(['ai:chat', 'terminal:write', 'fs:writeFile', 'memory:writeEntry']);

function summarizeArgs(channel: string, args: unknown[]): unknown {
  if (REDACTED_CHANNELS.has(channel)) return '[redacted]';
  if (channel === 'ai:chat') {
    const p = args[0] as
      | { streamId?: string; messages?: unknown[]; tools?: unknown[]; model?: string; maxTokens?: number }
      | undefined;
    return {
      streamId: p?.streamId,
      model: p?.model,
      maxTokens: p?.maxTokens,
      messageCount: Array.isArray(p?.messages) ? p?.messages.length : 0,
      toolCount: Array.isArray(p?.tools) ? p?.tools.length : 0,
    };
  }
  if (channel === 'terminal:write') {
    const p = args[0] as { termId?: string; data?: string } | undefined;
    return { termId: p?.termId, bytes: p?.data?.length ?? 0 };
  }
  if (channel === 'fs:writeFile') {
    const [filePath, content] = args as [string, string, string];
    return { filePath, bytes: typeof content === 'string' ? content.length : 0 };
  }
  if (channel === 'memory:writeEntry') {
    // args: [homeFolder, name, description, type, content]
    const name = args[1] as string;
    const type = args[3] as string;
    const content = args[4];
    return { name, type, bytes: typeof content === 'string' ? content.length : 0 };
  }
  return args;
}

function summarizeResult(channel: string, result: unknown): unknown {
  if (REDACTED_CHANNELS.has(channel)) return '[redacted]';
  if (channel === 'ai:chat') {
    const r = result as { content?: unknown[]; stopReason?: string } | undefined;
    return { stopReason: r?.stopReason, blockCount: Array.isArray(r?.content) ? r?.content.length : 0 };
  }
  if (SUMMARIZED_CHANNELS.has(channel)) return undefined;
  return result;
}

// Wrap ipcMain.handle so every operation crossing into the main process is
// logged (start, completion + duration, or failure) without each handler
// having to opt in. Restored after all handlers register.
function withLogging<T>(register: () => T): T {
  const original = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = ((
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
  ) => {
    return original(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      const started = Date.now();
      logEvent({ category: 'ipc', action: channel, detail: { args: summarizeArgs(channel, args) } });
      try {
        const result = await listener(event, ...args);
        logEvent({
          category: 'ipc',
          action: `${channel}:ok`,
          detail: { ms: Date.now() - started, result: summarizeResult(channel, result) },
        });
        return result;
      } catch (e) {
        logEvent({
          level: 'error',
          category: 'ipc',
          action: `${channel}:error`,
          detail: { ms: Date.now() - started, error: e instanceof Error ? e.message : String(e) },
        });
        throw e;
      }
    }) as unknown as void;
  }) as typeof ipcMain.handle;

  try {
    return register();
  } finally {
    ipcMain.handle = original;
  }
}

export function registerIpcHandlers(): void {
  withLogging(() => {
    registerFsHandlers();
    registerDialogHandlers();
    registerStoreHandlers();
    registerAiHandlers();
    registerTerminalHandlers();
    registerCodeServerHandlers();
    registerDocHandlers();
    registerWorkspaceHandlers();
    registerMemoryHandlers();

    ipcMain.handle('shell:openExternal', (_e, url: string) => {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        void shell.openExternal(url);
      }
    });
  });

  // Renderer-originated semantic events (chat lifecycle, view/workspace ops).
  // Registered outside withLogging so we don't double-log the transport itself.
  ipcMain.handle(
    'log:event',
    (_e, entry: { level?: 'debug' | 'info' | 'warn' | 'error'; category: string; action: string; detail?: unknown }) => {
      if (!entry || typeof entry.category !== 'string' || typeof entry.action !== 'string') return;
      logEvent({ level: entry.level, category: entry.category, action: entry.action, detail: entry.detail });
    },
  );
}
