import { marked, Renderer } from 'marked';

// Override the HTML renderer to escape raw HTML blocks instead of passing them through.
// This prevents any HTML injected in AI responses from executing (XSS hardening).
const renderer = new Renderer();
renderer.html = ({ raw }: { raw: string }) =>
  raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

marked.use({ renderer, gfm: true, breaks: true });

export function renderMarkdown(text: string): string {
  try {
    return marked.parse(text, { async: false }) as string;
  } catch {
    return `<p>${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
  }
}
