import { useEffect, useRef } from 'react';
import '@xterm/xterm/css/xterm.css';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { selectActiveViewId, useAppStore } from '../../state/store';
import type { ViewInstance } from '../types';
import type { TerminalViewConfig } from './types';
import { attachSession } from './attachSession';
import { api } from '../../ipc/client';

const OUTPUT_LIMIT = 3000;

export function TerminalView({ instance }: { instance: ViewInstance<TerminalViewConfig> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isActive = useAppStore((s) => selectActiveViewId(s) === instance.id);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const termIdRef = useRef<string | null>(null);
  const disposedRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    disposedRef.current = false;

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
    terminal.open(container);
    termRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const cwdLabel = instance.config.cwd ?? '(home)';
    const setViewContext = (ctx: string) =>
      useAppStore.getState().setViewContext(instance.id, ctx);
    setViewContext(`Shell cwd: ${cwdLabel}\nNo output yet.`);

    let outputBuf = '';
    const updateContext = (buf: string) => {
      const trimmed = buf.length > OUTPUT_LIMIT ? buf.slice(-OUTPUT_LIMIT) : buf;
      const clean = trimmed.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\r/g, '');
      setViewContext(`Shell cwd: ${cwdLabel}\n\nRecent output:\n${clean}`);
    };

    void attachSession({
      viewId: instance.id,
      cwd: instance.config.cwd,
      isDisposed: () => disposedRef.current,
      reconnect: api.terminalReconnect,
      create: api.terminalCreate,
      kill: (termId) => void api.terminalKill(termId),
      writeToTerminal: (data) => {
        terminal.write(data);
        outputBuf += data;
        updateContext(outputBuf);
      },
      onResolved: (termId) => {
        termIdRef.current = termId;
        requestAnimationFrame(() => {
          if (container.offsetWidth > 0 && container.offsetHeight > 0) {
            fitAddon.fit();
          }
        });
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
      },
    });

    return () => {
      disposedRef.current = true;
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
    requestAnimationFrame(() => {
      const t = termRef.current;
      const f = fitAddonRef.current;
      if (!t || !f) return;
      f.fit();
      t.refresh(0, t.rows - 1);
    });
  }, [isActive]);

  // Refit when the container is resized (panel drag, window resize).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      const f = fitAddonRef.current;
      if (!f) return;
      if (container.offsetWidth === 0 || container.offsetHeight === 0) return;
      f.fit();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="terminal-view">
      <div className="terminal-inset">
        <div ref={containerRef} className="terminal-container" />
      </div>
    </div>
  );
}
