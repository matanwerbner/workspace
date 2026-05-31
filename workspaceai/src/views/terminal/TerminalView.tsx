import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { api } from '../../ipc/client';
import { useAppStore } from '../../state/store';
import type { ViewInstance } from '../types';
import type { TerminalViewConfig } from './types';

const OUTPUT_LIMIT = 3000;

export function TerminalView({ instance }: { instance: ViewInstance<TerminalViewConfig> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const setViewContext = useAppStore((s) => s.setViewContext);

  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      theme: {
        background: '#000000',
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
    terminal.open(containerRef.current);

    let termId: string | null = null;
    let disposed = false;
    let outputBuf = '';

    const cwd = instance.config.cwd ?? '(home)';
    setViewContext(instance.id, `Shell cwd: ${cwd}\nNo output yet.`);

    const updateContext = (buf: string) => {
      const trimmed = buf.length > OUTPUT_LIMIT ? buf.slice(-OUTPUT_LIMIT) : buf;
      // Strip ANSI escape codes for readable context
      const clean = trimmed.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\r/g, '');
      setViewContext(instance.id, `Shell cwd: ${cwd}\n\nRecent output:\n${clean}`);
    };

    const init = async () => {
      const result = await api.terminalCreate({ cwd: instance.config.cwd });
      if (disposed) {
        void api.terminalKill(result.termId);
        return;
      }
      termId = result.termId;
      fitAddon.fit();

      api.terminalOnData(termId, (data) => {
        terminal.write(data);
        outputBuf += data;
        updateContext(outputBuf);
      });
      api.terminalOnExit(termId, () => terminal.write('\r\n[Process exited]\r\n'));

      terminal.onData((data) => {
        if (termId) void api.terminalWrite(termId, data);
      });

      terminal.onResize(({ cols, rows }) => {
        if (termId) void api.terminalResize(termId, cols, rows);
      });
    };

    void init();

    const ro = new ResizeObserver(() => fitAddon.fit());
    ro.observe(containerRef.current);

    return () => {
      disposed = true;
      ro.disconnect();
      terminal.dispose();
      if (termId) {
        api.terminalOffData(termId);
        api.terminalOffExit(termId);
        void api.terminalKill(termId);
      }
    };
  }, [instance.config.cwd]);

  return (
    <div className="terminal-view">
      <div ref={containerRef} className="terminal-container" />
    </div>
  );
}
