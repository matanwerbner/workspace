import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as pty from 'node-pty';
import { exec } from 'node:child_process';
import { homedir } from 'node:os';

const processes = new Map<string, pty.IPty>();
let nextId = 1;

export function disposeTerminals(): void {
  for (const p of processes.values()) {
    p.kill();
  }
  processes.clear();
}

export function registerTerminalHandlers(): void {
  ipcMain.handle('terminal:create', (event, { cwd }: { cwd?: string }) => {
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

    ptyProcess.onData((data) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('terminal:data', { termId, data });
      }
    });

    ptyProcess.onExit(() => {
      processes.delete(termId);
      if (!event.sender.isDestroyed()) {
        event.sender.send('terminal:exit', { termId });
      }
    });

    processes.set(termId, ptyProcess);
    return { termId };
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
  });

  ipcMain.handle(
    'terminal:exec',
    async (
      _e,
      { cwd, command }: { cwd?: string; command: string },
    ): Promise<{ stdout: string; stderr: string; code: number }> => {
      const workDir = cwd ?? homedir();
      // Arbitrary shell command from the renderer/AI — gate behind explicit user
      // confirmation before running it on the host.
      const win = BrowserWindow.getFocusedWindow() ?? undefined;
      const opts: Electron.MessageBoxOptions = {
        type: 'warning',
        buttons: ['Cancel', 'Run command'],
        defaultId: 0,
        cancelId: 0,
        message: 'Run shell command?',
        detail: `${command}\n\nWorking directory: ${workDir}`,
      };
      const { response } = win
        ? await dialog.showMessageBox(win, opts)
        : await dialog.showMessageBox(opts);
      if (response !== 1) {
        return { stdout: '', stderr: 'Command cancelled by user', code: 1 };
      }
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
