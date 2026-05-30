import { describe, expect, it } from 'vitest';
import { detectLanguage } from '../lang';

describe('detectLanguage', () => {
  it('maps common extensions to Monaco language ids', () => {
    expect(detectLanguage('index.ts')).toBe('typescript');
    expect(detectLanguage('app.tsx')).toBe('typescript');
    expect(detectLanguage('script.js')).toBe('javascript');
    expect(detectLanguage('data.json')).toBe('json');
    expect(detectLanguage('main.py')).toBe('python');
    expect(detectLanguage('lib.rs')).toBe('rust');
    expect(detectLanguage('styles.scss')).toBe('scss');
    expect(detectLanguage('config.yaml')).toBe('yaml');
  });

  it('is case-insensitive about the extension', () => {
    expect(detectLanguage('README.MD')).toBe('markdown');
    expect(detectLanguage('Component.TSX')).toBe('typescript');
  });

  it('uses the last extension for multi-dotted names', () => {
    expect(detectLanguage('archive.tar.gz')).toBe('plaintext');
    expect(detectLanguage('types.d.ts')).toBe('typescript');
  });

  it('falls back to plaintext for unknown or missing extensions', () => {
    expect(detectLanguage('notes.xyz')).toBe('plaintext');
    expect(detectLanguage('Makefile')).toBe('plaintext');
    expect(detectLanguage('')).toBe('plaintext');
  });
});
