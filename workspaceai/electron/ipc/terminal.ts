import { ipcMain } from 'electron';
import * as pty from 'node-pty';
import { exec } from 'node:child_process';
import { homedir } from 'node:os';
import { appendCapped } from '../../src/shell/termBuffer';

const processes = new Map<string, pty.IPty>();
const viewSessions = new Map<string, { termId: string; outputBuf: string }>();
let nextId = 1;

export function disposeTerminals(): void {
  for (const p of processes.values()) {
    p.kill();
  }
  processes.clear();
  viewSessions.clear();
}

export function registerTerminalHandlers(): void {
  ipcMain.handle('terminal:create', (event, { cwd, viewId }: { cwd?: string; viewId?: string }) => {
    const termId = `term_${nextId++}`;
    const shell =
      process.platform === 'win32'
        ? 'powershell.exe'
        : (process.env['SHELL'] ?? '/bin/zsh');

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: cwd ?? homedir(),
      env: process.env as Record<string, string>,
    });

    if (viewId) {
      viewSessions.set(viewId, { termId, outputBuf: '' });
    }

    ptyProcess.onData((data) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('terminal:data', { termId, data });
      }
      if (viewId) {
        const entry = viewSessions.get(viewId);
        if (entry) {
          entry.outputBuf = appendCapped(entry.outputBuf, data);
        }
      }
    });

    ptyProcess.onExit(() => {
      processes.delete(termId);
      if (!event.sender.isDestroyed()) {
        event.sender.send('terminal:exit', { termId });
      }
      // Do NOT delete the viewSessions entry here — the reconnect handler is
      // the single cleanup point so it can detect and clean up dead ptys.
    });

    processes.set(termId, ptyProcess);
    return { termId };
  });

  ipcMain.handle('terminal:reconnect', (event, { viewId }: { viewId: string }) => {
    const entry = viewSessions.get(viewId);
    if (!entry) {
      return null;
    }
    if (!processes.has(entry.termId)) {
      // Pty already exited — clean up the orphaned entry.
      viewSessions.delete(viewId);
      return null;
    }
    // Pty is live — re-wire event.sender so future output reaches the new window.
    const livePty = processes.get(entry.termId)!;
    livePty.onData((data) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('terminal:data', { termId: entry.termId, data });
      }
      const e = viewSessions.get(viewId);
      if (e) {
        e.outputBuf = appendCapped(e.outputBuf, data);
      }
    });
    livePty.onExit(() => {
      processes.delete(entry.termId);
      if (!event.sender.isDestroyed()) {
        event.sender.send('terminal:exit', { termId: entry.termId });
      }
    });
    return { termId: entry.termId, outputBuf: entry.outputBuf };
  });

  ipcMain.handle('terminal:write', (_e, { termId, data }: { termId: string; data: string }) => {
    processes.get(termId)?.write(data);
  });

  ipcMain.handle(
    'terminal:resize',
    (_e, { termId, cols, rows }: { termId: string; cols: number; rows: number }) => {
      const p = processes.get(termId);
      if (p) p.resize(Math.max(1, cols), Math.max(1, rows));
    },
  );

  ipcMain.handle('terminal:kill', (_e, { termId }: { termId: string }) => {
    processes.get(termId)?.kill();
    processes.delete(termId);
    // Remove the matching view-session entry (if any) by termId.
    for (const [vid, vs] of viewSessions.entries()) {
      if (vs.termId === termId) {
        viewSessions.delete(vid);
        break;
      }
    }
  });

  ipcMain.handle(
    'terminal:exec',
    async (
      _e,
      { cwd, command }: { cwd?: string; command: string },
    ): Promise<{ stdout: string; stderr: string; code: number }> => {
      const workDir = cwd ?? homedir();
      return new Promise((resolve) => {
        exec(
          command,
          { cwd: workDir, timeout: 15000, maxBuffer: 1 << 20 },
          (error, stdout, stderr) => {
            const code =
              error && typeof error.code === 'number' ? error.code : error ? 1 : 0;
            resolve({ stdout, stderr, code });
          },
        );
      });
    },
  );
}
