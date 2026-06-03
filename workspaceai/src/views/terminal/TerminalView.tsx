import { useEffect, useRef } from 'react';
import '@xterm/xterm/css/xterm.css';
import { selectActiveViewId, useAppStore } from '../../state/store';
import type { ViewInstance } from '../types';
import type { TerminalViewConfig } from './types';
import { fitIfVisible, getOrCreateSession, getSession } from './sessionCache';

export function TerminalView({ instance }: { instance: ViewInstance<TerminalViewConfig> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isActive = useAppStore((s) => selectActiveViewId(s) === instance.id);

  // Attach the cached xterm host to this container. The session (xterm buffer +
  // pty) is owned by the module-level cache, so on unmount we only DETACH — the
  // shell keeps running and its scrollback survives remounts (HMR, tab switches).
  // The pty is killed only on real view removal (see the view's onRemove hook).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const session = getOrCreateSession(instance.id, instance.config.cwd);
    container.appendChild(session.host);
    requestAnimationFrame(() => {
      session.fitAddon.fit();
      session.terminal.refresh(0, session.terminal.rows - 1);
    });
    return () => {
      if (session.host.parentNode === container) {
        container.removeChild(session.host);
      }
    };
  }, [instance.id, instance.config.cwd]);

  // Refit and repaint when the view becomes visible after being hidden (display:none
  // collapses the canvas; xterm doesn't auto-repaint rows when it comes back).
  useEffect(() => {
    if (!isActive) return;
    requestAnimationFrame(() => {
      const session = getSession(instance.id);
      if (!session) return;
      session.fitAddon.fit();
      session.terminal.refresh(0, session.terminal.rows - 1);
    });
  }, [isActive, instance.id]);

  // Refit when the container is resized (panel drag, window resize).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      const session = getSession(instance.id);
      if (!session) return;
      fitIfVisible(session);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [instance.id]);

  return (
    <div className="terminal-view">
      <div className="terminal-inset">
        <div ref={containerRef} className="terminal-container" />
      </div>
    </div>
  );
}
