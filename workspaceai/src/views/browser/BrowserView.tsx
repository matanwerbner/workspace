import { useEffect, useRef, useState } from 'react';
import { normalizeUrl } from '../../lib/url';
import { useAppStore } from '../../state/store';
import type { ViewInstance } from '../types';
import type { BrowserViewConfig } from './types';
import { browserHandles } from './handles';

export { normalizeUrl };

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
  executeJavaScript: (code: string) => Promise<unknown>;
}

export function BrowserView({ instance }: { instance: ViewInstance<BrowserViewConfig> }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const webviewRef = useRef<WebviewElement | null>(null);
  const [addressInput, setAddressInput] = useState(instance.config.initialUrl);
  const setViewContext = useAppStore((s) => s.setViewContext);
  const [loading, setLoading] = useState(false);
  const [canBack, setCanBack] = useState(false);
  const [canForward, setCanForward] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Stable handle to the current navigate fn so the AI handle can call it.
  const navigateRef = useRef<(raw: string) => void>(() => {});

  // Mount the <webview> imperatively. React's JSX path for custom elements
  // can re-create the node on re-render, which restarts navigation; doing it
  // by hand keeps the element stable for the lifetime of this component.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const wv = document.createElement('webview') as WebviewElement;
    wv.setAttribute('partition', 'persist:browserviews');
    wv.setAttribute('src', instance.config.initialUrl);
    wv.setAttribute('allowpopups', 'true');
    wv.style.display = 'inline-flex';
    wv.style.width = '100%';
    wv.style.height = '100%';
    container.appendChild(wv);
    webviewRef.current = wv;

    setViewContext(instance.id, `Current page: ${instance.config.initialUrl}`);

    // Register an imperative handle the AI tools can drive while mounted.
    browserHandles.set(instance.id, {
      navigate: (url: string) => navigateRef.current(url),
      getUrl: () => {
        try {
          return wv.getURL();
        } catch {
          return '';
        }
      },
      getPageText: async () =>
        String((await wv.executeJavaScript('document.body.innerText')) ?? ''),
      click: async (selector: string) => {
        const js = `(() => { const el = document.querySelector(${JSON.stringify(
          selector,
        )}); if (!el) throw new Error('No element matches selector'); el.click(); return true; })()`;
        await wv.executeJavaScript(js);
      },
      fill: async (selector: string, value: string) => {
        const js = `(() => { const el = document.querySelector(${JSON.stringify(
          selector,
        )}); if (!el) throw new Error('No element matches selector'); el.value = ${JSON.stringify(
          value,
        )}; el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`;
        await wv.executeJavaScript(js);
      },
    });

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
      if (url) {
        setAddressInput(url);
        setViewContext(instance.id, `Current page: ${url}`);
      }
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
      browserHandles.delete(instance.id);
    };
  }, [instance.id, instance.config.initialUrl]);

  const navigate = (raw: string) => {
    const url = normalizeUrl(raw);
    if (!url) return;
    setAddressInput(url);
    const wv = webviewRef.current;
    if (!wv) return;
    if (typeof wv.loadURL === 'function') {
      void wv.loadURL(url).catch(() => {
        /* surfaces via did-fail-load */
      });
    } else {
      wv.setAttribute('src', url);
    }
  };
  navigateRef.current = navigate;

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
