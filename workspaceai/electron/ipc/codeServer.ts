import { app, ipcMain } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { connect, createServer } from 'node:net';
import { accessSync, constants, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, isAbsolute } from 'node:path';
import { registerRoot } from './roots';

// Embedded VS Code (code-server / openvscode-server) lifecycle. Modeled on
// terminal.ts: a Map of running child processes plus a disposeCodeServers()
// export called from main.ts on quit. Each running server is keyed by a
// serverId returned to the renderer, which uses it to stop the server when the
// view unmounts.

interface RunningServer {
  child: ChildProcess;
  port: number;
  // Tail of stdout+stderr, kept for surfacing a useful message if the process
  // dies before it ever starts listening.
  log: string;
}

const servers = new Map<string, RunningServer>();
let nextId = 1;

export function disposeCodeServers(): void {
  for (const { child } of servers.values()) {
    try {
      child.kill();
    } catch {
      // best-effort
    }
  }
  servers.clear();
}

// GUI apps launched from Finder/Dock inherit a minimal PATH that omits the
// common locations where code-server is installed (Homebrew, npm global). Search
// those explicitly in addition to the inherited PATH so resolution works in a
// packaged build, not just `npm run dev` (which inherits the shell PATH).
const EXTRA_PATH_DIRS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  join(process.env['HOME'] ?? '', '.npm-global/bin'),
  join(process.env['HOME'] ?? '', '.local/bin'),
  // nvm installs the global bin under a version-specific dir; NVM_BIN points at
  // the active one when set, which covers code-server installed via nvm's npm.
  process.env['NVM_BIN'] ?? '',
];

function searchDirs(): string[] {
  const fromEnv = (process.env['PATH'] ?? '').split(':').filter(Boolean);
  return [...new Set([...fromEnv, ...EXTRA_PATH_DIRS].filter(Boolean))];
}

function isExecutable(p: string): boolean {
  try {
    accessSync(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// Resolve a binary name to an absolute executable path by scanning the search
// dirs. An absolute override is used directly if executable.
function resolveOnPath(name: string): string | null {
  if (isAbsolute(name)) return isExecutable(name) ? name : null;
  for (const dir of searchDirs()) {
    const candidate = join(dir, name);
    if (isExecutable(candidate)) return candidate;
  }
  return null;
}

type Resolved = { bin: string; kind: 'code-server' | 'openvscode-server' };

// Resolution order: explicit override → code-server → openvscode-server.
function resolveServerBinary(override?: string): Resolved | null {
  if (override && override.trim()) {
    const bin = resolveOnPath(override.trim());
    if (bin) {
      const kind = bin.includes('openvscode') ? 'openvscode-server' : 'code-server';
      return { bin, kind };
    }
  }
  const cs = resolveOnPath('code-server');
  if (cs) return { bin: cs, kind: 'code-server' };
  const ov = resolveOnPath('openvscode-server');
  if (ov) return { bin: ov, kind: 'openvscode-server' };
  return null;
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        const { port } = addr;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error('Could not determine a free port')));
      }
    });
  });
}

// Poll until something is accepting TCP connections on the port, or time out.
function waitForPort(port: number, timeoutMs = 20000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const attempt = () => {
      const sock = connect(port, '127.0.0.1');
      sock.once('connect', () => {
        sock.destroy();
        resolve(true);
      });
      sock.once('error', () => {
        sock.destroy();
        if (Date.now() > deadline) resolve(false);
        else setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

// Each server gets its own user-data-dir, keyed by the folder it serves. Sharing
// one dir across concurrent instances makes VS Code's shared process collide
// ("a shared process crashed" toast); isolating it also persists per-folder
// editor state (open tabs, layout) across restarts.
function userDataDirFor(rootPath: string): string {
  const hash = createHash('sha1').update(rootPath).digest('hex').slice(0, 16);
  const dir = join(app.getPath('userData'), 'code-server', hash);
  mkdirSync(dir, { recursive: true });

  // Seed the embedded editor with a dark color theme on first creation. code-
  // server has no CLI flag for this — it reads VS Code user settings from
  // <user-data-dir>/User/settings.json. Only write when absent so a user's own
  // theme choice (persisted here per folder) is never clobbered.
  const settingsPath = join(dir, 'User', 'settings.json');
  if (!existsSync(settingsPath)) {
    mkdirSync(join(dir, 'User'), { recursive: true });
    writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          'workbench.colorTheme': 'Default Dark Modern',
          'workbench.startupEditor': 'none',
        },
        null,
        2,
      ),
    );
  }
  return dir;
}

function argsFor(
  kind: Resolved['kind'],
  port: number,
  rootPath: string,
  userDataDir: string,
): string[] {
  if (kind === 'openvscode-server') {
    return [
      '--without-connection-token',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--user-data-dir',
      userDataDir,
      rootPath,
    ];
  }
  // code-server
  return [
    '--auth',
    'none',
    '--bind-addr',
    `127.0.0.1:${port}`,
    '--disable-telemetry',
    '--disable-update-check',
    '--user-data-dir',
    userDataDir,
    rootPath,
  ];
}

type StartResult =
  | { status: 'ok'; serverId: string; url: string }
  | { status: 'not_installed' }
  | { status: 'error'; message: string };

export function registerCodeServerHandlers(): void {
  ipcMain.handle(
    'codeServer:start',
    async (
      _e,
      { rootPath, binPath }: { rootPath: string; binPath?: string },
    ): Promise<StartResult> => {
      const resolved = resolveServerBinary(binPath);
      if (!resolved) return { status: 'not_installed' };

      // Anchor the folder as a trusted root (consistent with other views).
      registerRoot(rootPath);

      let port: number;
      try {
        port = await findFreePort();
      } catch (e) {
        return { status: 'error', message: e instanceof Error ? e.message : String(e) };
      }

      const userDataDir = userDataDirFor(rootPath);
      const child = spawn(resolved.bin, argsFor(resolved.kind, port, rootPath, userDataDir), {
        cwd: rootPath,
        env: { ...process.env, PATH: searchDirs().join(':') },
      });

      const serverId = `cs_${nextId++}`;
      const entry: RunningServer = { child, port, log: '' };
      servers.set(serverId, entry);

      const capture = (buf: Buffer) => {
        entry.log = (entry.log + buf.toString()).slice(-4000);
      };
      child.stdout?.on('data', capture);
      child.stderr?.on('data', capture);

      // If the process dies before it ever listens, surface its output.
      let earlyExit: string | null = null;
      const onEarlyExit = (code: number | null) => {
        earlyExit = `code-server exited (code ${code ?? 'null'}) before listening.\n${entry.log}`.trim();
      };
      child.once('exit', onEarlyExit);
      child.once('error', (err) => {
        earlyExit = `Failed to launch code-server: ${err.message}`;
      });

      const ready = await waitForPort(port);
      child.removeListener('exit', onEarlyExit);

      if (!ready) {
        try {
          child.kill();
        } catch {
          // best-effort
        }
        servers.delete(serverId);
        return {
          status: 'error',
          message: earlyExit ?? `Timed out waiting for code-server on port ${port}.\n${entry.log}`,
        };
      }

      const url = `http://127.0.0.1:${port}/?folder=${encodeURIComponent(rootPath)}`;
      return { status: 'ok', serverId, url };
    },
  );

  ipcMain.handle('codeServer:stop', (_e, { serverId }: { serverId: string }) => {
    const entry = servers.get(serverId);
    if (entry) {
      try {
        entry.child.kill();
      } catch {
        // best-effort
      }
      servers.delete(serverId);
    }
  });

  ipcMain.handle(
    'codeServer:status',
    (_e, { binPath }: { binPath?: string } = {}): { kind: string | null; bin: string | null } => {
      const resolved = resolveServerBinary(binPath);
      return resolved ? { kind: resolved.kind, bin: resolved.bin } : { kind: null, bin: null };
    },
  );
}
