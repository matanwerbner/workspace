import { useEffect, useRef, useState } from 'react';
import { api } from '../../ipc/client';
import type { ViewInstance } from '../types';
import type { CodeViewConfig } from './types';

<<<<<<< Updated upstream
interface OpenFile {
  path: string;
  name: string;
  content: string;
  dirty: boolean;
=======
interface WebviewElement extends HTMLElement {
  src: string;
  reload: () => void;
  getURL: () => string;
>>>>>>> Stashed changes
}

type ServerState =
  | { phase: 'starting' }
  | { phase: 'ready'; url: string; serverId: string }
  | { phase: 'not_installed' }
  | { phase: 'error'; message: string };

// The Code view embeds a browser build of VS Code (code-server / openvscode-
// server). The main process spawns the server bound to loopback and this
// component renders it in a <webview>, the same mechanism the Browser view uses.
export function CodeView({ instance }: { instance: ViewInstance<CodeViewConfig> }) {
  const rootPath = instance.config.rootPath;
<<<<<<< Updated upstream
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [openFile, setOpenFile] = useState<OpenFile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const requestedPathRef = useRef<string | null>(null);
  const openFileRef = useRef<OpenFile | null>(null);
  openFileRef.current = openFile;

  const onSelect = useCallback(
    async (path: string) => {
      const current = openFileRef.current;
      if (current && current.dirty && current.path !== path) {
        const ok = await api.confirm(
          `"${current.name}" has unsaved changes. Discard and open another file?`,
        );
        if (!ok) return;
      }
      requestedPathRef.current = path;
      setSelectedPath(path);
      setLoadError(null);
      try {
        const [content, name] = await Promise.all([
          api.readFile(path, rootPath),
          api.basename(path),
        ]);
        if (requestedPathRef.current !== path) return;
        setOpenFile({ path, name, content, dirty: false });
      } catch (e) {
        if (requestedPathRef.current !== path) return;
        setOpenFile(null);
        setLoadError(e instanceof Error ? e.message : String(e));
      }
    },
    [rootPath],
  );

  const onChange = useCallback((next: string) => {
    setOpenFile((f) => (f ? { ...f, content: next, dirty: true } : f));
  }, []);

  const save = useCallback(async () => {
    const file = openFileRef.current;
    if (!file || !file.dirty) return;
    setSaving(true);
    try {
      await api.writeFile(file.path, file.content, rootPath);
      setOpenFile((f) => (f && f.path === file.path ? { ...f, dirty: false } : f));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [rootPath]);
=======
  const folderName = rootPath.split('/').filter(Boolean).pop() ?? rootPath;
  const codeServerPath = useAppStore((s) => s.settings.codeServerPath);
  const setViewContext = useAppStore((s) => s.setViewContext);

  const [state, setState] = useState<ServerState>({ phase: 'starting' });
  const [retryKey, setRetryKey] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const webviewRef = useRef<WebviewElement | null>(null);
  // Holds the most recent serverId so the unmount cleanup can stop it even if
  // state has moved on.
  const serverIdRef = useRef<string | null>(null);

  useEffect(() => {
    setViewContext(
      instance.id,
      `Editing the folder ${rootPath} in an embedded VS Code editor. ` +
        `Use the read_file/write_file/list_dir/search tools to inspect or change files.`,
    );
  }, [instance.id, rootPath, setViewContext]);
>>>>>>> Stashed changes

  // Start the server on mount (and on explicit retry / binary-path change).
  useEffect(() => {
    let cancelled = false;
    setState({ phase: 'starting' });

    void api
      .codeServerStart({ rootPath, binPath: codeServerPath })
      .then((res) => {
        if (cancelled) {
          // View unmounted mid-start: stop the server we just spawned.
          if (res.status === 'ok') void api.codeServerStop(res.serverId);
          return;
        }
        if (res.status === 'ok') {
          serverIdRef.current = res.serverId;
          setState({ phase: 'ready', url: res.url, serverId: res.serverId });
        } else if (res.status === 'not_installed') {
          setState({ phase: 'not_installed' });
        } else {
          setState({ phase: 'error', message: res.message });
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setState({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
        }
      });

    return () => {
      cancelled = true;
      const id = serverIdRef.current;
      if (id) {
        void api.codeServerStop(id);
        serverIdRef.current = null;
      }
    };
  }, [rootPath, codeServerPath, retryKey]);

  // Mount the <webview> imperatively once we have a URL, so React re-renders
  // never recreate the element and restart the editor session.
  useEffect(() => {
    if (state.phase !== 'ready') return;
    const container = containerRef.current;
    if (!container) return;

    const wv = document.createElement('webview') as WebviewElement;
    wv.setAttribute('partition', 'persist:codeserver');
    wv.setAttribute('src', state.url);
    wv.style.width = '100%';
    wv.style.height = '100%';
    wv.style.display = 'inline-flex';
    container.appendChild(wv);
    webviewRef.current = wv;

    return () => {
      wv.remove();
      webviewRef.current = null;
    };
  }, [state]);

  const openInCursor = () => {
    // Best-effort: launch the real Cursor app on the folder. Routed through the
    // existing exec channel (which confirms before running a host command).
    void api.terminalExec({ cwd: rootPath, command: `cursor ${JSON.stringify(rootPath)}` });
  };

  return (
    <div className="code-view">
      <div className="code-view-toolbar">
        <span className="code-view-title" title={rootPath}>
          <span className="code-view-badge">VS Code</span>
          {folderName}
        </span>
        <div className="code-view-toolbar-actions">
          {state.phase === 'ready' && (
            <button
              className="btn-ghost btn-sm"
              onClick={() => webviewRef.current?.reload()}
              title="Reload editor"
            >
              ↻ Reload
            </button>
          )}
          <button
            className="btn-ghost btn-sm"
            onClick={openInCursor}
            title="Open this folder in the Cursor desktop app"
          >
            Open in Cursor ↗
          </button>
        </div>
      </div>

      {state.phase === 'starting' && (
        <div className="code-view-status">
          <div className="code-view-status-title">Starting editor…</div>
          <div className="muted">Launching code-server for {folderName}.</div>
        </div>
      )}

      {state.phase === 'not_installed' && (
        <div className="code-view-status">
          <div className="code-view-status-title">code-server is not installed</div>
          <div className="code-view-status-body muted">
            The Code view embeds a browser build of VS Code. Install one of:
            <pre className="code-view-code">brew install code-server</pre>
            <pre className="code-view-code">npm install -g code-server</pre>
            or set an explicit binary path in Settings. <strong>openvscode-server</strong> also
            works.
          </div>
          <button className="btn-primary btn-sm" onClick={() => setRetryKey((k) => k + 1)}>
            Re-check
          </button>
        </div>
      )}

      {state.phase === 'error' && (
        <div className="code-view-status">
          <div className="code-view-status-title">Couldn't start the editor</div>
          <pre className="code-view-code code-view-error">{state.message}</pre>
          <button className="btn-primary btn-sm" onClick={() => setRetryKey((k) => k + 1)}>
            Retry
          </button>
        </div>
      )}

      <div
        ref={containerRef}
        className="code-view-content"
        style={{ display: state.phase === 'ready' ? 'flex' : 'none' }}
      />
    </div>
  );
}
