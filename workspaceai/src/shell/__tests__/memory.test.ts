import { describe, expect, it } from 'vitest';
import {
  isValidMemoryName,
  formatEntry,
  upsertIndexLine,
  buildMemorySection,
  MEMORY_TYPES,
} from '../memory';

describe('MEMORY_TYPES', () => {
  it('contains the four expected types', () => {
    expect(MEMORY_TYPES).toContain('user');
    expect(MEMORY_TYPES).toContain('project');
    expect(MEMORY_TYPES).toContain('feedback');
    expect(MEMORY_TYPES).toContain('reference');
    expect(MEMORY_TYPES).toHaveLength(4);
  });
});

describe('isValidMemoryName', () => {
  it('accepts a typical kebab-case slug', () => {
    expect(isValidMemoryName('user-preferences')).toBe(true);
  });

  it('accepts a two-char alphanumeric name', () => {
    expect(isValidMemoryName('a1')).toBe(true);
  });

  it('accepts a single letter', () => {
    expect(isValidMemoryName('a')).toBe(true);
  });

  it('accepts digits in a name', () => {
    expect(isValidMemoryName('project-2024')).toBe(true);
  });

  it('rejects path traversal (..)', () => {
    expect(isValidMemoryName('../etc/passwd')).toBe(false);
  });

  it('rejects names with slashes', () => {
    expect(isValidMemoryName('foo/bar')).toBe(false);
  });

  it('rejects uppercase letters', () => {
    expect(isValidMemoryName('Foo')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidMemoryName('')).toBe(false);
  });

  it('rejects names starting with a dash', () => {
    expect(isValidMemoryName('-leading')).toBe(false);
  });

  it('rejects names with spaces', () => {
    expect(isValidMemoryName('foo bar')).toBe(false);
  });

  it('rejects names with dots', () => {
    expect(isValidMemoryName('foo.bar')).toBe(false);
  });
});

describe('formatEntry', () => {
  it('produces the correct frontmatter structure', () => {
    const result = formatEntry('user-prefs', 'Likes dark mode', 'user', 'Body text');
    expect(result).toBe(
      '---\nname: user-prefs\ndescription: Likes dark mode\nmetadata:\n  type: user\n---\n\nBody text',
    );
  });

  it('starts with the frontmatter header', () => {
    const result = formatEntry('user-prefs', 'Likes dark mode', 'user', 'Body text');
    expect(result.startsWith('---\nname: user-prefs\ndescription: Likes dark mode\nmetadata:\n  type: user\n---\n\n')).toBe(true);
  });

  it('ends with the content', () => {
    const result = formatEntry('user-prefs', 'Likes dark mode', 'user', 'Body text');
    expect(result.endsWith('Body text')).toBe(true);
  });

  it('handles multiline content', () => {
    const content = 'Line 1\nLine 2\nLine 3';
    const result = formatEntry('ref', 'A reference', 'reference', content);
    expect(result.endsWith(content)).toBe(true);
    expect(result).toContain('---\n\nLine 1\nLine 2');
  });
});

describe('upsertIndexLine', () => {
  it('appends a line to an empty index', () => {
    expect(upsertIndexLine('', 'a', 'desc a', 'a.md')).toBe('- [a](a.md) — desc a\n');
  });

  it('replaces an existing line for the same name (no duplication)', () => {
    expect(upsertIndexLine('- [a](a.md) — old\n', 'a', 'new desc', 'a.md')).toBe(
      '- [a](a.md) — new desc\n',
    );
  });

  it('appends a new name while keeping an existing one', () => {
    const result = upsertIndexLine('- [a](a.md) — desc a\n', 'b', 'desc b', 'b.md');
    expect(result).toContain('- [a](a.md) — desc a');
    expect(result).toContain('- [b](b.md) — desc b');
    expect(result.endsWith('\n')).toBe(true);
  });

  it('drops non-bullet lines (e.g. stray headings)', () => {
    const withHeading = '# Memory Index\n- [a](a.md) — desc a\n';
    const result = upsertIndexLine(withHeading, 'b', 'desc b', 'b.md');
    expect(result).not.toContain('# Memory Index');
    expect(result).toContain('- [a](a.md) — desc a');
    expect(result).toContain('- [b](b.md) — desc b');
  });

  it('uses the em-dash character (U+2014) as separator', () => {
    const result = upsertIndexLine('', 'x', 'desc', 'x.md');
    expect(result).toContain('—');
  });

  it('always ends with a newline', () => {
    const result = upsertIndexLine('- [a](a.md) — desc\n', 'b', 'new', 'b.md');
    expect(result.endsWith('\n')).toBe(true);
  });
});

describe('buildMemorySection', () => {
  it('returns empty string for null', () => {
    expect(buildMemorySection(null)).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(buildMemorySection('   ')).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(buildMemorySection('')).toBe('');
  });

  it('contains the ## Workspace Memory header', () => {
    const result = buildMemorySection('- [a](a.md) — desc');
    expect(result).toContain('## Workspace Memory');
  });

  it('contains the index text', () => {
    const indexContent = '- [a](a.md) — desc';
    const result = buildMemorySection(indexContent);
    expect(result).toContain(indexContent);
  });

  it('contains the read_memory reference', () => {
    const result = buildMemorySection('- [a](a.md) — desc');
    expect(result).toContain('read_memory');
  });

  it('trims whitespace from the index content', () => {
    const result = buildMemorySection('  - [a](a.md) — desc  ');
    expect(result).toContain('- [a](a.md) — desc');
  });
});
