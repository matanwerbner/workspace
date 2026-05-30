import { registerView } from '../registry';
import { BrowserView, normalizeUrl } from './BrowserView';
import { promptForUrl } from './UrlPrompt';
import { browserHandles } from './handles';
import type { BrowserViewConfig } from './types';
import type { AiTool, ViewInstance } from '../types';

function deriveName(url: string): string {
  try {
    const { hostname } = new URL(url);
    return hostname || url;
  } catch {
    return url;
  }
}

const tools: AiTool[] = [
  {
    name: 'navigate',
    description: 'Navigate the embedded browser to a URL or search query.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'A URL or search terms.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'get_page_text',
    description: 'Get the visible text content of the currently loaded page.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'click',
    description: 'Click the first element matching a CSS selector on the page.',
    input_schema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'A CSS selector.' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'fill',
    description: 'Set the value of the first input matching a CSS selector and fire an input event.',
    input_schema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'A CSS selector for the input.' },
        value: { type: 'string', description: 'The value to fill in.' },
      },
      required: ['selector', 'value'],
    },
  },
];

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  instance: ViewInstance<BrowserViewConfig>,
): Promise<unknown> {
  const handle = browserHandles.get(instance.id);
  if (!handle) throw new Error('Browser view is not mounted');
  switch (name) {
    case 'navigate':
      handle.navigate(String(input.url));
      return { ok: true };
    case 'get_page_text':
      return handle.getPageText();
    case 'click':
      await handle.click(String(input.selector));
      return { ok: true };
    case 'fill':
      await handle.fill(String(input.selector), String(input.value));
      return { ok: true };
    default:
      throw new Error(`Unknown tool: ${name}`);
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
  tools,
  executeTool,
  getContext: (instance) => {
    const handle = browserHandles.get(instance.id);
    const url = handle?.getUrl() || instance.config.initialUrl;
    return `Current page: ${url}`;
  },
});
