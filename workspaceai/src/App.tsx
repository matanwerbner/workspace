import { useEffect } from 'react';
import { useAppStore } from './state/store';
import { Sidebar } from './shell/Sidebar';
import { MainPane } from './shell/MainPane';
import { SettingsModal } from './shell/SettingsModal';
import { ErrorBoundary } from './shell/ErrorBoundary';
import { api } from './ipc/client';
import './views/code';
import './views/browser';
import './views/pdf';
import './views/terminal';

declare global {
  interface Window {
    __flushAppState?: () => Promise<void>;
  }
}

export function App() {
  const hydrated = useAppStore((s) => s.hydrated);
  const hydrate = useAppStore((s) => s.hydrate);
  const settingsOpen = useAppStore((s) => s.settingsOpen);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    window.__flushAppState = () => useAppStore.getState().flush();
    return () => {
      delete window.__flushAppState;
    };
  }, []);

  // Listen for Settings open events from the main-process menu (⌘,)
  useEffect(() => {
    const open = () => setSettingsOpen(true);
    api.onOpenSettings(open);
    return () => api.offOpenSettings(open);
  }, [setSettingsOpen]);

  // ⌘, keyboard shortcut in renderer (works when webview doesn't have focus)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setSettingsOpen]);

  if (!hydrated) {
    return (
      <div className="loading-screen">
        <div className="muted">Loading…</div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="app-shell">
        <Sidebar />
        <MainPane />
        {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      </div>
    </ErrorBoundary>
  );
}
