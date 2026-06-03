// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { toolLabel, toolVerb, toolDetail } from '../toolDisplay';

describe('toolLabel', () => {
  describe('run_command', () => {
    it('returns "Running command…" when active (no status)', () => {
      expect(toolLabel('run_command')).toBe('Running command…');
    });

    it('returns "Running command…" when status is pending', () => {
      expect(toolLabel('run_command', 'pending')).toBe('Running command…');
    });

    it('returns "Running command…" when status is approved', () => {
      expect(toolLabel('run_command', 'approved')).toBe('Running command…');
    });

    it('returns "Ran command" when status is done', () => {
      expect(toolLabel('run_command', 'done')).toBe('Ran command');
    });
  });

  describe('unknown tool fallback', () => {
    it('humanizes an unknown tool like "do_something" as "Do something…" when active', () => {
      expect(toolLabel('do_something')).toBe('Do something…');
    });

    it('humanizes an unknown tool like "do_something" as "Do something" when done', () => {
      expect(toolLabel('do_something', 'done')).toBe('Do something');
    });
  });
});

describe('toolVerb', () => {
  it('returns "run a shell command" for run_command', () => {
    expect(toolVerb('run_command')).toBe('run a shell command');
  });

  it('returns a fallback string for unknown tools', () => {
    expect(toolVerb('unknown_tool')).toBe('run unknown tool');
  });
});

describe('toolDetail', () => {
  it('returns the command field from a run_command input', () => {
    expect(toolDetail({ command: 'ls -la' })).toBe('ls -la');
  });

  it('trims the command field', () => {
    expect(toolDetail({ command: '  echo hello  ' })).toBe('echo hello');
  });

  it('returns the path field for file-based tools', () => {
    expect(toolDetail({ path: '/home/user/file.txt' })).toBe('/home/user/file.txt');
  });

  it('returns the file field', () => {
    expect(toolDetail({ file: 'notes.md' })).toBe('notes.md');
  });

  it('returns the query field for search tools', () => {
    expect(toolDetail({ query: 'search terms' })).toBe('search terms');
  });

  it('returns null for empty input', () => {
    expect(toolDetail({})).toBeNull();
  });

  it('returns null for null input', () => {
    expect(toolDetail(null)).toBeNull();
  });

  it('returns null for unrecognized fields', () => {
    expect(toolDetail({ foo: 'bar' })).toBeNull();
  });

  it('returns null when command is empty string', () => {
    expect(toolDetail({ command: '   ' })).toBeNull();
  });
});
