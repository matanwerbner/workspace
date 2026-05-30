// Module-level registry mapping a browser view instance id to an imperative
// handle the AI tools can drive. BrowserView registers its handle on mount and
// removes it on unmount; the view's executeTool looks it up by instance id.
export interface BrowserHandle {
  navigate: (url: string) => void;
  getPageText: () => Promise<string>;
  click: (selector: string) => Promise<void>;
  fill: (selector: string, value: string) => Promise<void>;
  getUrl: () => string;
}

export const browserHandles = new Map<string, BrowserHandle>();
