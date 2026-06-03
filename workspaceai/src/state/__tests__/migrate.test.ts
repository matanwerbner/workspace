import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  cloneWorkspaceWithNewIds,
  migrate,
  snapshot,
} from '../migrate';
import type { Workspace } from '../types';

function sampleWorkspace(): Workspace {
  return {
    id: 'w_old',
    name: 'My Space',
    views: [
      { id: 'v1', typeId: 'code', name: 'src', config: { rootPath: '/tmp/proj' } },
      { id: 'v2', typeId: 'browser', name: 'docs', config: { initialUrl: 'https://x.dev' } },
    ],
    chatByViewId: {
      v1: [{ id: 'm1', role: 'user', content: 'hi', timestamp: 1 }],
    },
    chatStateByViewId: {
      v1: { collapsed: false, sizePct: 30 },
    },
    activeViewId: 'v1',
  };
}

describe('migrate', () => {
  it('upgrades a v1 blob into a single Default workspace', () => {
    const v1 = {
      schemaVersion: 1,
      views: [{ id: 'v1', typeId: 'code', name: 'src', config: { rootPath: '/a' } }],
      activeViewId: 'v1',
      chatByViewId: { v1: [{ id: 'm1', role: 'user', content: 'hi', timestamp: 1 }] },
      chatStateByViewId: { v1: { collapsed: false, sizePct: 30 } },
    };
    const result = migrate(v1);
    expect(result.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result.workspaces).toHaveLength(1);
    const [ws] = result.workspaces;
    expect(ws.name).toBe('Default');
    expect(ws.views).toHaveLength(1);
    expect(ws.activeViewId).toBe('v1');
    expect(ws.chatByViewId.v1).toHaveLength(1);
    expect(result.activeWorkspaceId).toBe(ws.id);
    expect(result.settings.model).toBeTruthy();
  });

  it('passes a v2 blob through, filling missing settings with defaults', () => {
    const v2 = {
      schemaVersion: 2,
      workspaces: [sampleWorkspace()],
      activeWorkspaceId: 'w_old',
      settings: { maxTokens: 8192 },
    };
    const result = migrate(v2);
    expect(result.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result.workspaces).toHaveLength(1);
    expect(result.activeWorkspaceId).toBe('w_old');
    expect(result.settings.maxTokens).toBe(8192);
    expect(result.settings.model).toBeTruthy();
    expect(result.viewTypeUsage).toEqual({});
  });

  it('preserves viewTypeUsage when present in a v2 blob', () => {
    const v2 = {
      schemaVersion: 2,
      workspaces: [sampleWorkspace()],
      activeWorkspaceId: 'w_old',
      settings: {},
      viewTypeUsage: { terminal: 3, code: 1 },
    };
    const result = migrate(v2);
    expect(result.viewTypeUsage).toEqual({ terminal: 3, code: 1 });
  });

  it('returns safe defaults for null/garbage/unknown schemaVersion without throwing', () => {
    for (const bad of [null, undefined, 42, 'nope', [], { schemaVersion: 99 }, {}]) {
      expect(() => migrate(bad)).not.toThrow();
      const result = migrate(bad);
      expect(result.schemaVersion).toBe(SCHEMA_VERSION);
      expect(result.workspaces).toEqual([]);
      expect(result.activeWorkspaceId).toBeNull();
      expect(result.settings.model).toBeTruthy();
    }
  });

  it('coerces a v1 blob with missing/garbage fields into empty defaults', () => {
    const result = migrate({ schemaVersion: 1 });
    const [ws] = result.workspaces;
    expect(ws.name).toBe('Default');
    expect(ws.views).toEqual([]);
    expect(ws.chatByViewId).toEqual({});
    expect(ws.activeViewId).toBeNull();
  });
});

describe('snapshot', () => {
  it('produces a serializable persisted-state shape', () => {
    const ws = sampleWorkspace();
    const snap = snapshot({
      workspaces: [ws],
      activeWorkspaceId: ws.id,
      settings: { model: 'm', maxTokens: 100 },
    });
    expect(snap.schemaVersion).toBe(SCHEMA_VERSION);
    expect(snap.workspaces).toHaveLength(1);
    expect(snap.activeWorkspaceId).toBe(ws.id);
    expect(snap.settings).toEqual({ model: 'm', maxTokens: 100 });
  });
});

describe('workspace export/import serialization', () => {
  it('round-trips a workspace through JSON preserving shape', () => {
    const ws = sampleWorkspace();
    const roundTripped = JSON.parse(JSON.stringify(ws)) as Workspace;
    expect(roundTripped).toEqual(ws);
    expect(roundTripped.views).toHaveLength(2);
    expect(roundTripped.chatByViewId.v1[0].content).toBe('hi');
  });

  it('regenerates unique ids on import while preserving names and config', () => {
    const ws = sampleWorkspace();
    const imported = cloneWorkspaceWithNewIds(ws, ws.name);

    // Names and config are preserved.
    expect(imported.name).toBe('My Space');
    expect(imported.views.map((v) => v.name)).toEqual(['src', 'docs']);
    expect(imported.views[0].config).toEqual({ rootPath: '/tmp/proj' });
    expect(imported.views[1].config).toEqual({ initialUrl: 'https://x.dev' });

    // All ids are fresh and unique.
    expect(imported.id).not.toBe(ws.id);
    const oldViewIds = ws.views.map((v) => v.id);
    const newViewIds = imported.views.map((v) => v.id);
    for (const oldId of oldViewIds) {
      expect(newViewIds).not.toContain(oldId);
    }
    expect(new Set(newViewIds).size).toBe(newViewIds.length);

    // Chat/state keyed data is remapped onto the new view ids.
    const remappedChatViewId = newViewIds[0];
    expect(imported.chatByViewId[remappedChatViewId]).toHaveLength(1);
    expect(imported.chatByViewId[remappedChatViewId][0].content).toBe('hi');
    expect(imported.chatStateByViewId[remappedChatViewId]).toEqual({
      collapsed: false,
      sizePct: 30,
    });
    expect(imported.activeViewId).toBe(remappedChatViewId);

    // Old keys must not survive.
    expect(imported.chatByViewId.v1).toBeUndefined();
  });

  it('produces a deep copy: mutating the clone does not affect the source', () => {
    const ws = sampleWorkspace();
    const imported = cloneWorkspaceWithNewIds(ws, 'copy');
    (imported.views[0].config as { rootPath: string }).rootPath = '/changed';
    expect((ws.views[0].config as { rootPath: string }).rootPath).toBe('/tmp/proj');
  });
});
