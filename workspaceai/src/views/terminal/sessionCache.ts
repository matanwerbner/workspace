import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { api } from '../../ipc/client';
import { useAppStore } from '../../state/store';
import { attachSession } from './attachSession';

const OUTPUT_LIMIT = 3000;

export interface TermSession {
  terminal: Terminal;
  fitAddon: FitAddon;
  /**
   * Persistent host element owned by the cache (not by React). xterm opens into
   * this once; on remount we move it between the React-rendered containers so the
   * xterm buffer and pty survive component unmount/remount (HMR, tab switches).
   */
  host: HTMLDivElement;
  termId: string | null;
}

// Module-level singleton. Lives in its own module so a Fast Refresh / HMR update
// to TerminalView.tsx does NOT re-evaluate this file — the sessions (and their
// pty processes) survive the remount instead of being killed and respawned.
const sessions = new Map<string, TermSession>();

export function getSession(instanceId: string): TermSession | undefined {
  return sessions.get(instanceId);
}

/**
 * Fit the terminal to its host ONLY when the host is actually visible with real
 * dimensions. A hidden view (display:none via the `hidden` attr) collapses the
 * host to 0×0, and FitAddon.fit() then computes a degenerate ~10×6 and pushes
 * that to the pty — the shell reflows to 10 columns and its scrollback is wiped,
 * which shows up as a spurious terminal "reset" when switching tabs. Guarding on
 * size makes every fit site a no-op while hidden, so the pty keeps its real size.
 */
export function fitIfVisible(session: TermSession): void {
  const { host } = session;
  // offsetWidth/Height are 0 when the element (or an ancestor) is display:none.
  if (host.offsetWidth === 0 || host.offsetHeight === 0) return;
  session.fitAddon.fit();
}

export function getOrCreateSession(
  instanceId: string,
  cwd: string | undefined,
): TermSession {
  const existing = sessions.get(instanceId);
  if (existing) return existing;

  const terminal = new Terminal({
    theme: {
      background: '#0d0d0d',
      foreground: '#d4d4d4',
      cursor: '#d4d4d4',
      selectionBackground: 'rgba(100, 100, 255, 0.3)',
    },
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    fontSize: 13,
    cursorBlink: true,
    allowTransparency: false,
    scrollback: 5000,
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  const host = document.createElement('div');
  host.className = 'terminal-host';
  host.style.width = '100%';
  host.style.height = '100%';
  terminal.open(host);

  const session: TermSession = { terminal, fitAddon, host, termId: null };
  sessions.set(instanceId, session);

  const cwdLabel = cwd ?? '(home)';
  const setViewContext = (ctx: string) =>
    useAppStore.getState().setViewContext(instanceId, ctx);
  setViewContext(`Shell cwd: ${cwdLabel}\nNo output yet.`);

  let outputBuf = '';
  const updateContext = (buf: string) => {
    const trimmed = buf.length > OUTPUT_LIMIT ? buf.slice(-OUTPUT_LIMIT) : buf;
    // Strip ANSI escape codes for readable context
    const clean = trimmed.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\r/g, '');
    setViewContext(`Shell cwd: ${cwdLabel}\n\nRecent output:\n${clean}`);
  };

  void attachSession({
    viewId: instanceId,
    cwd,
    isDisposed: () => !sessions.has(instanceId),
    reconnect: api.terminalReconnect,
    create: api.terminalCreate,
    kill: (termId) => void api.terminalKill(termId),
    writeToTerminal: (data) => {
      terminal.write(data);
      outputBuf += data;
      updateContext(outputBuf);
    },
    onResolved: (termId) => {
      session.termId = termId;
      fitIfVisible(session);
    },
    wireListeners: (termId) => {
      api.terminalOnData(termId, (data) => {
        terminal.write(data);
        outputBuf += data;
        updateContext(outputBuf);
      });
      api.terminalOnExit(termId, () =>
        terminal.write('\r\n[Process exited]\r\n'),
      );
      terminal.onData((data) => {
        if (session.termId) void api.terminalWrite(session.termId, data);
      });
      terminal.onResize(({ cols, rows }) => {
        if (session.termId) void api.terminalResize(session.termId, cols, rows);
      });
    },
  });

  return session;
}

/** Tear down a session for good — kills the pty. Call only on real view removal. */
export function disposeSession(instanceId: string): void {
  const session = sessions.get(instanceId);
  if (!session) return;
  sessions.delete(instanceId);
  if (session.termId) {
    api.terminalOffData(session.termId);
    api.terminalOffExit(session.termId);
    void api.terminalKill(session.termId);
  }
  session.terminal.dispose();
  session.host.remove();
}
