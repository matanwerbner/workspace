import { describe, expect, it } from 'vitest';
import { normalizeUrl } from '../url';

describe('normalizeUrl', () => {
  it('prefixes a bare domain with https://', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com');
    expect(normalizeUrl('sub.example.co.uk/path')).toBe('https://sub.example.co.uk/path');
  });

  it('passes a full http(s) url through unchanged', () => {
    expect(normalizeUrl('https://example.com/a?b=c')).toBe('https://example.com/a?b=c');
    expect(normalizeUrl('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('passes file:// urls through unchanged', () => {
    expect(normalizeUrl('file:///Users/me/index.html')).toBe('file:///Users/me/index.html');
  });

  it('falls back to a Google search for plain text', () => {
    expect(normalizeUrl('hello world')).toBe(
      'https://www.google.com/search?q=hello%20world',
    );
    expect(normalizeUrl('weather')).toBe('https://www.google.com/search?q=weather');
  });

  it('trims surrounding whitespace and returns empty for blank input', () => {
    expect(normalizeUrl('  example.com  ')).toBe('https://example.com');
    expect(normalizeUrl('   ')).toBe('');
  });
});
