import { registerView } from '../registry';
import { BrowserView, normalizeUrl } from './BrowserView';
import { promptForUrl } from './UrlPrompt';
import type { BrowserViewConfig } from './types';

function deriveName(url: string): string {
  try {
    const { hostname } = new URL(url);
    return hostname || url;
  } catch {
    return url;
  }
}

registerView<BrowserViewConfig>({
  typeId: 'browser',
  label: 'Browser View',
  description: 'Open a web page in an embedded browser.',
  icon: <span className="view-type-icon">🌐</span>,
  createConfig: async () => {
    const raw = await promptForUrl('https://www.google.com');
    if (raw === null) return null;
    const url = normalizeUrl(raw);
    if (!url) return null;
    return { name: deriveName(url), config: { initialUrl: url } };
  },
  Component: BrowserView,
});
