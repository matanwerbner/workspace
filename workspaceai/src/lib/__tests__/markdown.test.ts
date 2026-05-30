import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../markdown';

describe('renderMarkdown', () => {
  it('renders basic markdown to HTML', () => {
    const html = renderMarkdown('# Title\n\nSome **bold** text.');
    expect(html).toContain('<h1');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('escapes raw HTML instead of emitting a live element', () => {
    const html = renderMarkdown('<div onclick="evil()">hi</div>');
    expect(html).not.toContain('<div onclick');
    expect(html).toContain('&lt;div');
  });

  it('does not emit a live <script> tag', () => {
    const html = renderMarkdown('Before\n\n<script>alert(1)</script>\n\nAfter');
    expect(html.toLowerCase()).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes inline raw HTML embedded in text', () => {
    const html = renderMarkdown('hello <img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});
