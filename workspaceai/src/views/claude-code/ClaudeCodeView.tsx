import { useEffect, useRef } from 'react';
import '@xterm/xterm/css/xterm.css';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { selectActiveViewId, useAppStore } from '../../state/store';
import type { ViewInstance } from '../types';
import type { ClaudeCodeViewConfig } from './types';
import { attachSession } from '../terminal/attachSession';
import { api } from '../../ipc/client';

const OUTPUT_LIMIT = 3000;

const NOT_FOUND_MSG =
  '\r\n\x1b[1;33mclaude not found.\x1b[0m\r\n\r\n' +
  'Install it with:\r\n' +
  '  npm install -g @anthropic-ai/claude-code\r\n\r\n' +
  'Then reopen this view.\r\n';

export function ClaudeCodeView({ instance }: { instance: ViewInstance<ClaudeCodeViewConfig> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isActive = useAppStore((s) => selectActiveViewId(s) === instance.id);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const termIdRef = useRef<string | null>(null);
  const disposedRef = useRef(false);
  const openedRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    disposedRef.current = false;
    openedRef.current = false;

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
    termRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const cwdLabel = instance.config.cwd ?? '(home)';
    const setViewContext = (ctx: string) =>
      useAppStore.getState().setViewContext(instance.id, ctx);
    setViewContext(`Claude Code in: ${cwdLabel}\nNo output yet.`);

    let outputBuf = '';
    const updateContext = (buf: string) => {
      const trimmed = buf.length > OUTPUT_LIMIT ? buf.slice(-OUTPUT_LIMIT) : buf;
      const clean = trimmed.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\r/g, '');
      setViewContext(`Claude Code in: ${cwdLabel}\n\nRecent output:\n${clean}`);
    };

    // Try to spawn claude-code directly. If not found, fall back to a shell
    // and show an install message. Using command: means no shell wrapper.
    let notFound = false;
    const createFn = async (opts: { cwd?: string; viewId?: string }) => {
      try {
        return await api.terminalCreate({ ...opts, command: 'claude' });
      } catch {
        notFound = true;
        return api.terminalCreate(opts); // fall back to plain shell
      }
    };

    void attachSession({
      viewId: instance.id,
      cwd: instance.config.cwd,
      isDisposed: () => disposedRef.current,
      reconnect: api.terminalReconnect,
      create: createFn,
      kill: (termId) => void api.terminalKill(termId),
      writeToTerminal: (data) => {
        terminal.write(data);
        outputBuf += data;
        updateContext(outputBuf);
      },
      onResolved: (termId) => {
        termIdRef.current = termId;
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
          if (termIdRef.current) void api.terminalWrite(termIdRef.current, data);
        });
        terminal.onResize(({ cols, rows }) => {
          if (termIdRef.current) void api.terminalResize(termIdRef.current, cols, rows);
        });

        // Write install instructions if cli wasn't found
        if (notFound) {
          terminal.write(NOT_FOUND_MSG);
        }
      },
    });

    // Defer terminal.open() until the container has real dimensions. The
    // observer lives inside this effect so it shares the terminal's lifecycle.
    let opened = false;
    const observer = new ResizeObserver(() => {
      if (container.offsetWidth === 0 || container.offsetHeight === 0) return;
      if (!opened) {
        terminal.open(container);
        opened = true;
        openedRef.current = true;
      }
      fitAddon.fit();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      disposedRef.current = true;
      openedRef.current = false;
      if (termIdRef.current) {
        api.terminalOffData(termIdRef.current);
        api.terminalOffExit(termIdRef.current);
        void api.terminalKill(termIdRef.current);
        termIdRef.current = null;
      }
      terminal.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [instance.id, instance.config.cwd]);

  // Refit and repaint when the view becomes visible after being hidden.
  useEffect(() => {
    if (!isActive) return;
    const container = containerRef.current;
    requestAnimationFrame(() => {
      const t = termRef.current;
      const f = fitAddonRef.current;
      if (!t || !f || !container || !openedRef.current) return;
      if (container.offsetWidth === 0 || container.offsetHeight === 0) return;
      f.fit();
      t.refresh(0, t.rows - 1);
    });
  }, [isActive]);

  return (
    <div className="terminal-view">
      <div className="terminal-inset">
        <div ref={containerRef} className="terminal-container" />
      </div>
    </div>
  );
}
