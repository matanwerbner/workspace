import { app } from 'electron';
import { createWriteStream, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import type { WriteStream } from 'node:fs';
import { join } from 'node:path';

// Per-session debug logging. Each app launch opens one log file under
// <userData>/logs/, and we keep only the most recent MAX_SESSIONS files so the
// directory never grows without bound. Logs are JSON-lines so a session can be
// machine-parsed or eyeballed when debugging.

const MAX_SESSIONS = 20;
const SESSION_PREFIX = 'session-';
const SESSION_EXT = '.log';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level?: LogLevel;
  category: string;
  action: string;
  detail?: unknown;
}

let stream: WriteStream | null = null;
let sessionId = '';
let sessionPath = '';

function logsDir(): string {
  return join(app.getPath('userData'), 'logs');
}

// Build a filesystem-and-sort friendly timestamp: 2026-06-03T14-22-09-123Z.
function fileStamp(d: Date): string {
  return d.toISOString().replace(/[:.]/g, '-');
}

// Keep only the newest MAX_SESSIONS-1 existing session files so that, once the
// new file for this session is added, the directory holds at most MAX_SESSIONS.
function rotateSessions(dir: string): void {
  let files: string[];
  try {
    files = readdirSync(dir).filter(
      (f) => f.startsWith(SESSION_PREFIX) && f.endsWith(SESSION_EXT),
    );
  } catch {
    return;
  }
  // Sort oldest → newest by mtime, falling back to name (timestamped) order.
  const withTime = files.map((name) => {
    let mtime = 0;
    try {
      mtime = statSync(join(dir, name)).mtimeMs;
    } catch {
      mtime = 0;
    }
    return { name, mtime };
  });
  withTime.sort((a, b) => a.mtime - b.mtime || a.name.localeCompare(b.name));

  const keep = MAX_SESSIONS - 1;
  const removeCount = withTime.length - keep;
  for (let i = 0; i < removeCount; i++) {
    try {
      unlinkSync(join(dir, withTime[i].name));
    } catch {
      // Best-effort cleanup; ignore files we can't remove.
    }
  }
}

// Open the session log file. Safe to call once at startup; subsequent calls are
// no-ops. Never throws — logging must not be able to crash the app.
export function initLogger(): void {
  if (stream) return;
  try {
    const dir = logsDir();
    mkdirSync(dir, { recursive: true });
    rotateSessions(dir);

    const now = new Date();
    sessionId = `${fileStamp(now)}-${process.pid}`;
    sessionPath = join(dir, `${SESSION_PREFIX}${sessionId}${SESSION_EXT}`);
    stream = createWriteStream(sessionPath, { flags: 'a' });

    logEvent({
      category: 'app',
      action: 'session:start',
      detail: {
        sessionId,
        version: app.getVersion(),
        electron: process.versions.electron,
        platform: process.platform,
        packaged: app.isPackaged,
      },
    });
  } catch {
    // If we can't open the log file, leave stream null — logEvent becomes a
    // no-op rather than throwing on every call.
    stream = null;
  }
}

export function getSessionLogPath(): string {
  return sessionPath;
}

// Truncate large string values so a single huge payload can't bloat the log.
const MAX_STR = 2000;
function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.length > MAX_STR ? `${value.slice(0, MAX_STR)}…[+${value.length - MAX_STR}]` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= 4) return '…';
  if (Array.isArray(value)) {
    const cap = 50;
    const out = value.slice(0, cap).map((v) => sanitize(v, depth + 1));
    if (value.length > cap) out.push(`…[+${value.length - cap} more]`);
    return out;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitize(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

export function logEvent(entry: LogEntry): void {
  if (!stream) return;
  try {
    const line = JSON.stringify({
      t: new Date().toISOString(),
      level: entry.level ?? 'info',
      cat: entry.category,
      action: entry.action,
      ...(entry.detail !== undefined ? { detail: sanitize(entry.detail) } : {}),
    });
    stream.write(line + '\n');
  } catch {
    // Never let logging throw into the calling path.
  }
}

export function closeLogger(): Promise<void> {
  if (!stream) return Promise.resolve();
  logEvent({ category: 'app', action: 'session:end' });
  return new Promise<void>((resolve) => {
    const s = stream!;
    stream = null;
    s.once('finish', resolve);
    s.once('error', () => resolve());
    try {
      s.end();
    } catch {
      resolve();
    }
  });
}
