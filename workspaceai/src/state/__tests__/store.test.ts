// Mock the Electron bridge before importing the store so all api/log calls
// inside store.ts are no-ops (no window.api available in node/vitest).
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../ipc/client', () => ({
  api: {
    storeGet: vi.fn().mockResolvedValue(null),
    storeSet: vi.fn().mockResolvedValue(undefined),
    aiHasKey: vi.fn().mockResolvedValue(false),
    workspaceExport: vi.fn().mockResolvedValue('{}'),
    workspaceImport: vi.fn().mockResolvedValue(null),
  },
  log: vi.fn(),
}));

import {
  selectActiveViewId,
  selectActiveWorkspace,
  selectChatMessages,
  selectChatViewState,
  selectViews,
  useAppStore,
} from '../store';
import type { ChatMessage, Workspace } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function ws(id: string, name = 'WS'): Workspace {
  return {
    id,
    name,
    views: [],
    chatByViewId: {},
    chatStateByViewId: {},
    activeViewId: null,
  };
}

function msg(id: string, content = 'hello'): ChatMessage {
  return { id, role: 'user', content, timestamp: 1000 };
}

const BASE = {
  hydrated: false,
  apiKeySet: false,
  settingsOpen: false,
  workspaces: [] as Workspace[],
  activeWorkspaceId: null as string | null,
  settings: { model: 'test-model', maxTokens: 4096 },
  viewContextByViewId: {} as Record<string, string>,
  lastImportMissingPaths: [] as string[],
};

beforeEach(() => {
  // Merge-reset data fields only — passing `true` would wipe action functions.
  useAppStore.setState(BASE);
});

// ── Selectors ─────────────────────────────────────────────────────────────────

describe('selectActiveWorkspace', () => {
  it('returns null when there are no workspaces', () => {
    expect(selectActiveWorkspace(useAppStore.getState())).toBeNull();
  });

  it('returns the workspace whose id matches activeWorkspaceId', () => {
    useAppStore.setState({ workspaces: [ws('w1'), ws('w2')], activeWorkspaceId: 'w2' });
    const active = selectActiveWorkspace(useAppStore.getState());
    expect(active?.id).toBe('w2');
  });

  it('returns null when activeWorkspaceId does not match any workspace', () => {
    useAppStore.setState({ workspaces: [ws('w1')], activeWorkspaceId: 'w_missing' });
    expect(selectActiveWorkspace(useAppStore.getState())).toBeNull();
  });
});

describe('selectViews', () => {
  it('returns empty array when no active workspace', () => {
    expect(selectViews(useAppStore.getState())).toEqual([]);
  });

  it('returns the views of the active workspace', () => {
    const workspace = {
      ...ws('w1'),
      views: [
        { id: 'v1', typeId: 'code', name: 'main', config: {} },
        { id: 'v2', typeId: 'browser', name: 'docs', config: {} },
      ],
    };
    useAppStore.setState({ workspaces: [workspace], activeWorkspaceId: 'w1' });
    const views = selectViews(useAppStore.getState());
    expect(views).toHaveLength(2);
    expect(views[0].id).toBe('v1');
  });
});

describe('selectActiveViewId', () => {
  it('returns null when no active workspace', () => {
    expect(selectActiveViewId(useAppStore.getState())).toBeNull();
  });

  it('returns the activeViewId of the active workspace', () => {
    useAppStore.setState({
      workspaces: [{ ...ws('w1'), activeViewId: 'v99' }],
      activeWorkspaceId: 'w1',
    });
    expect(selectActiveViewId(useAppStore.getState())).toBe('v99');
  });
});

describe('selectChatMessages', () => {
  it('returns empty array when there are no messages', () => {
    useAppStore.setState({ workspaces: [ws('w1')], activeWorkspaceId: 'w1' });
    expect(selectChatMessages(useAppStore.getState(), 'v1')).toEqual([]);
  });

  it('returns messages for the given viewId', () => {
    const workspace = {
      ...ws('w1'),
      chatByViewId: { v1: [msg('m1'), msg('m2', 'world')] },
    };
    useAppStore.setState({ workspaces: [workspace], activeWorkspaceId: 'w1' });
    const msgs = selectChatMessages(useAppStore.getState(), 'v1');
    expect(msgs).toHaveLength(2);
    expect(msgs[1].content).toBe('world');
  });
});

describe('selectChatViewState', () => {
  it('returns undefined when no state recorded', () => {
    useAppStore.setState({ workspaces: [ws('w1')], activeWorkspaceId: 'w1' });
    expect(selectChatViewState(useAppStore.getState(), 'v1')).toBeUndefined();
  });

  it('returns the stored chat view state', () => {
    const workspace = {
      ...ws('w1'),
      chatStateByViewId: { v1: { collapsed: true, sizePct: 40 } },
    };
    useAppStore.setState({ workspaces: [workspace], activeWorkspaceId: 'w1' });
    const state = selectChatViewState(useAppStore.getState(), 'v1');
    expect(state).toEqual({ collapsed: true, sizePct: 40 });
  });
});

// ── Workspace actions ─────────────────────────────────────────────────────────

describe('createWorkspace', () => {
  it('adds a workspace and makes it active', () => {
    useAppStore.getState().createWorkspace('Alpha');
    const s = useAppStore.getState();
    expect(s.workspaces).toHaveLength(1);
    expect(s.workspaces[0].name).toBe('Alpha');
    expect(s.activeWorkspaceId).toBe(s.workspaces[0].id);
  });

  it('auto-generates a name when none is provided', () => {
    useAppStore.getState().createWorkspace();
    useAppStore.getState().createWorkspace();
    const { workspaces } = useAppStore.getState();
    expect(workspaces).toHaveLength(2);
    expect(workspaces[0].name).toMatch(/Workspace/);
  });

  it('trims whitespace from the provided name', () => {
    useAppStore.getState().createWorkspace('  Beta  ');
    expect(useAppStore.getState().workspaces[0].name).toBe('Beta');
  });

  it('stores homeFolder when provided', () => {
    useAppStore.getState().createWorkspace('MyWS', '/home/user/my-workspace');
    expect(useAppStore.getState().workspaces[0].homeFolder).toBe('/home/user/my-workspace');
  });

  it('leaves homeFolder undefined when not provided', () => {
    useAppStore.getState().createWorkspace('MyWS');
    expect(useAppStore.getState().workspaces[0].homeFolder).toBeUndefined();
  });
});

describe('switchWorkspace', () => {
  it('switches to an existing workspace', () => {
    useAppStore.setState({ workspaces: [ws('w1'), ws('w2')], activeWorkspaceId: 'w1' });
    useAppStore.getState().switchWorkspace('w2');
    expect(useAppStore.getState().activeWorkspaceId).toBe('w2');
  });

  it('does nothing for an unknown id', () => {
    useAppStore.setState({ workspaces: [ws('w1')], activeWorkspaceId: 'w1' });
    useAppStore.getState().switchWorkspace('w_unknown');
    expect(useAppStore.getState().activeWorkspaceId).toBe('w1');
  });
});

describe('renameWorkspace', () => {
  it('renames the workspace with the given id', () => {
    useAppStore.setState({ workspaces: [ws('w1', 'Old')], activeWorkspaceId: 'w1' });
    useAppStore.getState().renameWorkspace('w1', 'New');
    expect(useAppStore.getState().workspaces[0].name).toBe('New');
  });

  it('does not affect other workspaces', () => {
    useAppStore.setState({ workspaces: [ws('w1', 'A'), ws('w2', 'B')], activeWorkspaceId: 'w1' });
    useAppStore.getState().renameWorkspace('w1', 'AA');
    expect(useAppStore.getState().workspaces[1].name).toBe('B');
  });
});

describe('duplicateWorkspace', () => {
  it('creates a copy with a new id and " copy" suffix in the name', () => {
    useAppStore.setState({ workspaces: [ws('w1', 'MyWS')], activeWorkspaceId: 'w1' });
    useAppStore.getState().duplicateWorkspace('w1');
    const { workspaces, activeWorkspaceId } = useAppStore.getState();
    expect(workspaces).toHaveLength(2);
    const copy = workspaces[1];
    expect(copy.id).not.toBe('w1');
    expect(copy.name).toBe('MyWS copy');
    expect(activeWorkspaceId).toBe(copy.id);
  });

  it('does nothing for an unknown id', () => {
    useAppStore.setState({ workspaces: [ws('w1')], activeWorkspaceId: 'w1' });
    useAppStore.getState().duplicateWorkspace('w_unknown');
    expect(useAppStore.getState().workspaces).toHaveLength(1);
  });
});

describe('deleteWorkspace', () => {
  it('removes the workspace and falls back to the first remaining', () => {
    useAppStore.setState({ workspaces: [ws('w1'), ws('w2')], activeWorkspaceId: 'w1' });
    useAppStore.getState().deleteWorkspace('w1');
    const s = useAppStore.getState();
    expect(s.workspaces).toHaveLength(1);
    expect(s.workspaces[0].id).toBe('w2');
    expect(s.activeWorkspaceId).toBe('w2');
  });

  it('sets activeWorkspaceId to null when the last workspace is deleted', () => {
    useAppStore.setState({ workspaces: [ws('w1')], activeWorkspaceId: 'w1' });
    useAppStore.getState().deleteWorkspace('w1');
    const s = useAppStore.getState();
    expect(s.workspaces).toHaveLength(0);
    expect(s.activeWorkspaceId).toBeNull();
  });

  it('keeps activeWorkspaceId unchanged when a non-active workspace is deleted', () => {
    useAppStore.setState({ workspaces: [ws('w1'), ws('w2')], activeWorkspaceId: 'w2' });
    useAppStore.getState().deleteWorkspace('w1');
    expect(useAppStore.getState().activeWorkspaceId).toBe('w2');
  });
});

// ── View actions ──────────────────────────────────────────────────────────────

describe('addView', () => {
  it('appends the view to the active workspace and makes it active', () => {
    useAppStore.setState({ workspaces: [ws('w1')], activeWorkspaceId: 'w1' });
    const view = { id: 'v1', typeId: 'code', name: 'main.ts', config: {} };
    useAppStore.getState().addView(view);
    const s = useAppStore.getState();
    expect(s.workspaces[0].views).toHaveLength(1);
    expect(s.workspaces[0].views[0]).toEqual(view);
    expect(s.workspaces[0].activeViewId).toBe('v1');
  });
});

describe('removeView', () => {
  it('removes the view and its chat/state data', () => {
    const workspace: Workspace = {
      ...ws('w1'),
      views: [{ id: 'v1', typeId: 'code', name: 'f', config: {} }],
      chatByViewId: { v1: [msg('m1')] },
      chatStateByViewId: { v1: { collapsed: false, sizePct: 30 } },
      activeViewId: 'v1',
    };
    useAppStore.setState({ workspaces: [workspace], activeWorkspaceId: 'w1' });
    useAppStore.getState().removeView('v1');
    const w = useAppStore.getState().workspaces[0];
    expect(w.views).toHaveLength(0);
    expect(w.chatByViewId['v1']).toBeUndefined();
    expect(w.chatStateByViewId['v1']).toBeUndefined();
    expect(w.activeViewId).toBeNull();
  });

  it('falls back activeViewId to the first remaining view', () => {
    const workspace: Workspace = {
      ...ws('w1'),
      views: [
        { id: 'v1', typeId: 'code', name: 'a', config: {} },
        { id: 'v2', typeId: 'code', name: 'b', config: {} },
      ],
      activeViewId: 'v1',
    };
    useAppStore.setState({ workspaces: [workspace], activeWorkspaceId: 'w1' });
    useAppStore.getState().removeView('v1');
    expect(useAppStore.getState().workspaces[0].activeViewId).toBe('v2');
  });

  it('does not change activeViewId when a non-active view is removed', () => {
    const workspace: Workspace = {
      ...ws('w1'),
      views: [
        { id: 'v1', typeId: 'code', name: 'a', config: {} },
        { id: 'v2', typeId: 'code', name: 'b', config: {} },
      ],
      activeViewId: 'v2',
    };
    useAppStore.setState({ workspaces: [workspace], activeWorkspaceId: 'w1' });
    useAppStore.getState().removeView('v1');
    expect(useAppStore.getState().workspaces[0].activeViewId).toBe('v2');
  });
});

describe('setActiveView', () => {
  it('updates activeViewId in the active workspace', () => {
    useAppStore.setState({ workspaces: [{ ...ws('w1'), activeViewId: 'v1' }], activeWorkspaceId: 'w1' });
    useAppStore.getState().setActiveView('v2');
    expect(useAppStore.getState().workspaces[0].activeViewId).toBe('v2');
  });
});

describe('renameView', () => {
  it('renames only the matching view', () => {
    const workspace: Workspace = {
      ...ws('w1'),
      views: [
        { id: 'v1', typeId: 'code', name: 'old', config: {} },
        { id: 'v2', typeId: 'code', name: 'keep', config: {} },
      ],
    };
    useAppStore.setState({ workspaces: [workspace], activeWorkspaceId: 'w1' });
    useAppStore.getState().renameView('v1', 'new');
    const views = useAppStore.getState().workspaces[0].views;
    expect(views[0].name).toBe('new');
    expect(views[1].name).toBe('keep');
  });
});

describe('updateViewConfig', () => {
  it('replaces the config for the matching view', () => {
    const workspace: Workspace = {
      ...ws('w1'),
      views: [{ id: 'v1', typeId: 'code', name: 'f', config: { rootPath: '/old' } }],
    };
    useAppStore.setState({ workspaces: [workspace], activeWorkspaceId: 'w1' });
    useAppStore.getState().updateViewConfig('v1', { rootPath: '/new' });
    expect(useAppStore.getState().workspaces[0].views[0].config).toEqual({ rootPath: '/new' });
  });
});

// ── Chat actions ──────────────────────────────────────────────────────────────

describe('appendMessage', () => {
  it('adds a message to the view chat', () => {
    useAppStore.setState({ workspaces: [ws('w1')], activeWorkspaceId: 'w1' });
    useAppStore.getState().appendMessage('v1', msg('m1', 'first'));
    useAppStore.getState().appendMessage('v1', msg('m2', 'second'));
    const msgs = useAppStore.getState().workspaces[0].chatByViewId['v1'];
    expect(msgs).toHaveLength(2);
    expect(msgs[0].content).toBe('first');
    expect(msgs[1].content).toBe('second');
  });
});

describe('updateMessageContent', () => {
  it('replaces only the content of the matching message', () => {
    const workspace: Workspace = {
      ...ws('w1'),
      chatByViewId: { v1: [msg('m1', 'old'), msg('m2', 'keep')] },
    };
    useAppStore.setState({ workspaces: [workspace], activeWorkspaceId: 'w1' });
    useAppStore.getState().updateMessageContent('v1', 'm1', 'new');
    const msgs = useAppStore.getState().workspaces[0].chatByViewId['v1'];
    expect(msgs[0].content).toBe('new');
    expect(msgs[1].content).toBe('keep');
  });
});

describe('updateMessage', () => {
  it('merges a patch into the matching message', () => {
    const workspace: Workspace = {
      ...ws('w1'),
      chatByViewId: {
        v1: [{ id: 'm1', role: 'user', content: 'hi', timestamp: 1000 }],
      },
    };
    useAppStore.setState({ workspaces: [workspace], activeWorkspaceId: 'w1' });
    useAppStore.getState().updateMessage('v1', 'm1', { content: 'patched', timestamp: 2000 });
    const m = useAppStore.getState().workspaces[0].chatByViewId['v1'][0];
    expect(m.content).toBe('patched');
    expect(m.timestamp).toBe(2000);
    expect(m.id).toBe('m1');
  });
});

describe('clearChat', () => {
  it('removes all messages for the given view', () => {
    const workspace: Workspace = {
      ...ws('w1'),
      chatByViewId: { v1: [msg('m1'), msg('m2')], v2: [msg('m3')] },
    };
    useAppStore.setState({ workspaces: [workspace], activeWorkspaceId: 'w1' });
    useAppStore.getState().clearChat('v1');
    const chat = useAppStore.getState().workspaces[0].chatByViewId;
    expect(chat['v1']).toBeUndefined();
    expect(chat['v2']).toHaveLength(1);
  });
});

// ── Chat state actions ────────────────────────────────────────────────────────

describe('getChatState', () => {
  it('returns default state (not collapsed, 30%) when not recorded', () => {
    useAppStore.setState({ workspaces: [ws('w1')], activeWorkspaceId: 'w1' });
    const state = useAppStore.getState().getChatState('v1');
    expect(state.collapsed).toBe(false);
    expect(state.sizePct).toBe(30);
  });

  it('returns the stored state when it exists', () => {
    const workspace: Workspace = {
      ...ws('w1'),
      chatStateByViewId: { v1: { collapsed: true, sizePct: 55 } },
    };
    useAppStore.setState({ workspaces: [workspace], activeWorkspaceId: 'w1' });
    expect(useAppStore.getState().getChatState('v1')).toEqual({ collapsed: true, sizePct: 55 });
  });
});

describe('setChatCollapsed', () => {
  it('sets collapsed without affecting sizePct', () => {
    const workspace: Workspace = {
      ...ws('w1'),
      chatStateByViewId: { v1: { collapsed: false, sizePct: 40 } },
    };
    useAppStore.setState({ workspaces: [workspace], activeWorkspaceId: 'w1' });
    useAppStore.getState().setChatCollapsed('v1', true);
    const state = useAppStore.getState().workspaces[0].chatStateByViewId['v1'];
    expect(state.collapsed).toBe(true);
    expect(state.sizePct).toBe(40);
  });

  it('creates the entry from defaults when it does not exist yet', () => {
    useAppStore.setState({ workspaces: [ws('w1')], activeWorkspaceId: 'w1' });
    useAppStore.getState().setChatCollapsed('v1', true);
    const state = useAppStore.getState().workspaces[0].chatStateByViewId['v1'];
    expect(state.collapsed).toBe(true);
    expect(state.sizePct).toBe(30);
  });
});

describe('setChatSizePct', () => {
  it('sets sizePct without affecting collapsed', () => {
    const workspace: Workspace = {
      ...ws('w1'),
      chatStateByViewId: { v1: { collapsed: true, sizePct: 30 } },
    };
    useAppStore.setState({ workspaces: [workspace], activeWorkspaceId: 'w1' });
    useAppStore.getState().setChatSizePct('v1', 60);
    const state = useAppStore.getState().workspaces[0].chatStateByViewId['v1'];
    expect(state.sizePct).toBe(60);
    expect(state.collapsed).toBe(true);
  });
});

// ── Misc state actions ────────────────────────────────────────────────────────

describe('setViewContext', () => {
  it('stores context string for a view', () => {
    useAppStore.getState().setViewContext('v1', 'file: foo.ts\ncwd: /proj');
    expect(useAppStore.getState().viewContextByViewId['v1']).toBe('file: foo.ts\ncwd: /proj');
  });

  it('overwrites an existing context', () => {
    useAppStore.getState().setViewContext('v1', 'old');
    useAppStore.getState().setViewContext('v1', 'new');
    expect(useAppStore.getState().viewContextByViewId['v1']).toBe('new');
  });
});

describe('setSettings', () => {
  it('merges partial settings without clobbering unchanged keys', () => {
    useAppStore.setState({ settings: { model: 'model-a', maxTokens: 1000 } });
    useAppStore.getState().setSettings({ maxTokens: 8192 });
    const { settings } = useAppStore.getState();
    expect(settings.model).toBe('model-a');
    expect(settings.maxTokens).toBe(8192);
  });

  it('can set optional fields', () => {
    useAppStore.getState().setSettings({ htmlResponses: true, systemPromptOverride: 'Be terse.' });
    const { settings } = useAppStore.getState();
    expect(settings.htmlResponses).toBe(true);
    expect(settings.systemPromptOverride).toBe('Be terse.');
  });
});

describe('setApiKeySet', () => {
  it('flips the apiKeySet flag', () => {
    expect(useAppStore.getState().apiKeySet).toBe(false);
    useAppStore.getState().setApiKeySet(true);
    expect(useAppStore.getState().apiKeySet).toBe(true);
  });
});

describe('setSettingsOpen', () => {
  it('toggles the settingsOpen flag', () => {
    useAppStore.getState().setSettingsOpen(true);
    expect(useAppStore.getState().settingsOpen).toBe(true);
    useAppStore.getState().setSettingsOpen(false);
    expect(useAppStore.getState().settingsOpen).toBe(false);
  });
});

describe('clearImportMissingPaths', () => {
  it('empties the lastImportMissingPaths array', () => {
    useAppStore.setState({ lastImportMissingPaths: ['/a', '/b'] });
    useAppStore.getState().clearImportMissingPaths();
    expect(useAppStore.getState().lastImportMissingPaths).toEqual([]);
  });
});
