import { useEffect } from 'react';
import { useAppStore } from './state/store';
import { Sidebar } from './shell/Sidebar';
import { MainPane } from './shell/MainPane';
import './views/code';
import './views/browser';
import './views/pdf';

declare global {
  interface Window {
    __flushAppState?: () => Promise<void>;
  }
}

export function App() {
  const hydrated = useAppStore((s) => s.hydrated);
  const hydrate = useAppStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    window.__flushAppState = () => useAppStore.getState().flush();
    return () => {
      delete window.__flushAppState;
    };
  }, []);

  if (!hydrated) {
    return (
      <div className="loading-screen">
        <div className="muted">Loading…</div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <MainPane />
    </div>
  );
}
