import { describe, expect, it } from 'vitest';
import { collectRootPaths } from '../../../electron/ipc/roots';

describe('collectRootPaths', () => {
  it('returns [] for null input (no throw)', () => {
    expect(collectRootPaths(null)).toEqual([]);
  });

  it('returns [] for an empty object (no workspaces array)', () => {
    expect(collectRootPaths({})).toEqual([]);
  });

  it('includes homeFolder when present as a string', () => {
    const state = {
      workspaces: [{ homeFolder: '/home/ws1', views: [] }],
    };
    expect(collectRootPaths(state)).toContain('/home/ws1');
  });

  it('includes homeFolder, rootPath, and cwd when all present', () => {
    const state = {
      workspaces: [
        {
          homeFolder: '/home/ws1',
          views: [{ config: { rootPath: '/code', cwd: '/tmp' } }],
        },
      ],
    };
    const paths = collectRootPaths(state);
    expect(paths).toContain('/home/ws1');
    expect(paths).toContain('/code');
    expect(paths).toContain('/tmp');
  });

  it('returns [] for a workspace without homeFolder', () => {
    const state = {
      workspaces: [{ views: [] }],
    };
    expect(collectRootPaths(state)).toEqual([]);
  });

  it('ignores non-string homeFolder values (e.g. number)', () => {
    const state = {
      workspaces: [{ homeFolder: 123, views: [] }],
    };
    expect(collectRootPaths(state)).toEqual([]);
  });
});
