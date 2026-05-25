import { useEffect, useRef, useState } from 'react';
import type { ViewInstance } from '../types';
import type { BrowserViewConfig } from './types';

interface WebviewElement extends HTMLElement {
  src: string;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  stop: () => void;
  loadURL: (url: string) => Promise<void>;
  getURL: () => string;
}

export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed) || /^file:\/\//i.test(trimmed)) return trimmed;
  if (/^[^\s]+\.[^\s]+$/.test(trimmed)) return `https://${trimmed}`;
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

export function BrowserView({ instance }: { instance: ViewInstance<BrowserViewConfig> }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const webviewRef = useRef<WebviewElement | null>(null);
  const [addressInput, setAddressInput] = useState(instance.config.initialUrl);
  const [loading, setLoading] = useState(false);
  const [canBack, setCanBack] = useState(false);
  const [canForward, setCanForward] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mount the <webview> imperatively. React's JSX path for custom elements
  // can re-create the node on re-render, which restarts navigation; doing it
  // by hand keeps the element stable for the lifetime of this component.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const wv = document.createElement('webview') as WebviewElement;
    wv.setAttribute('src', instance.config.initialUrl);
    wv.setAttribute('allowpopups', 'true');
    wv.style.display = 'inline-flex';
    wv.style.width = '100%';
    wv.style.height = '100%';
    container.appendChild(wv);
    webviewRef.current = wv;

    const onStartLoading = () => {
      setLoading(true);
      setError(null);
    };
    const onStopLoading = () => {
      setLoading(false);
      try {
        setCanBack(wv.canGoBack());
        setCanForward(wv.canGoForward());
      } catch {
        /* webview not yet attached */
      }
    };
    const onNavigate = (e: Event) => {
      const url = (e as Event & { url?: string }).url;
      if (url) setAddressInput(url);
    };
    const onFailLoad = (e: Event) => {
      const detail = e as Event & {
        errorDescription?: string;
        errorCode?: number;
        isMainFrame?: boolean;
      };
      if (detail.errorCode === -3) return;
      if (detail.isMainFrame === false) return;
      setError(detail.errorDescription ?? 'Failed to load page');
      setLoading(false);
    };
    const onConsole = (e: Event) => {
      const detail = e as Event & { level?: number; message?: string };
      // eslint-disable-next-line no-console
      console.log('[webview]', detail.message);
    };

    wv.addEventListener('did-start-loading', onStartLoading);
    wv.addEventListener('did-stop-loading', onStopLoading);
    wv.addEventListener('did-navigate', onNavigate);
    wv.addEventListener('did-navigate-in-page', onNavigate);
    wv.addEventListener('did-fail-load', onFailLoad);
    wv.addEventListener('console-message', onConsole);

    return () => {
      wv.removeEventListener('did-start-loading', onStartLoading);
      wv.removeEventListener('did-stop-loading', onStopLoading);
      wv.removeEventListener('did-navigate', onNavigate);
      wv.removeEventListener('did-navigate-in-page', onNavigate);
      wv.removeEventListener('did-fail-load', onFailLoad);
      wv.removeEventListener('console-message', onConsole);
      wv.remove();
      webviewRef.current = null;
    };
  }, [instance.config.initialUrl]);

  const navigate = (raw: string) => {
    const url = normalizeUrl(raw);
    if (!url) return;
    setAddressInput(url);
    const wv = webviewRef.current;
    if (!wv) return;
    // loadURL is preferred but only exists after the webview is attached.
    if (typeof wv.loadURL === 'function') {
      void wv.loadURL(url).catch(() => {
        /* surfaces via did-fail-load */
      });
    } else {
      wv.setAttribute('src', url);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(addressInput);
  };

  return (
    <div className="browser-view">
      <div className="browser-view-toolbar">
        <button
          className="btn-ghost"
          onClick={() => webviewRef.current?.goBack()}
          disabled={!canBack}
          aria-label="Back"
          title="Back"
        >
          ←
        </button>
        <button
          className="btn-ghost"
          onClick={() => webviewRef.current?.goForward()}
          disabled={!canForward}
          aria-label="Forward"
          title="Forward"
        >
          →
        </button>
        <button
          className="btn-ghost"
          onClick={() =>
            loading ? webviewRef.current?.stop() : webviewRef.current?.reload()
          }
          aria-label={loading ? 'Stop' : 'Reload'}
          title={loading ? 'Stop' : 'Reload'}
        >
          {loading ? '×' : '↻'}
        </button>
        <form className="browser-view-address" onSubmit={onSubmit}>
          <input
            type="text"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            spellCheck={false}
            placeholder="Enter URL or search"
          />
        </form>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div ref={containerRef} className="browser-view-content" />
    </div>
  );
}
