import { create } from 'zustand';
import { api } from '../ipc/client';
import { makeId } from '../lib/uid';
import {
  DEFAULT_SETTINGS,
  cloneWorkspaceWithNewIds,
  migrate,
  snapshot,
} from './migrate';
import type { ViewInstance } from '../views/types';
import type {
  AppSettings,
  ChatMessage,
  ChatViewState,
  Workspace,
} from './types';

export { migrate };

const STORE_KEY = 'appState';
const DEFAULT_CHAT_PCT = 30;

const defaultChatState = (): ChatViewState => ({
  collapsed: false,
  sizePct: DEFAULT_CHAT_PCT,
});

function makeWorkspace(name: string): Workspace {
  return {
    id: makeId('w'),
    name,
    views: [],
    chatByViewId: {},
    chatStateByViewId: {},
    activeViewId: null,
  };
}

interface AppStore {
  hydrated: boolean;
  apiKeySet: boolean;
  settingsOpen: boolean;
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  settings: AppSettings;
  // View context (not persisted — rebuilt at runtime)
  viewContextByViewId: Record<string, string>;
  // Transient: absolute paths missing after the most recent workspace import.
  lastImportMissingPaths: string[];

  hydrate: () => Promise<void>;
  flush: () => Promise<void>;

  setApiKeySet: (value: boolean) => void;
  setSettingsOpen: (value: boolean) => void;

  addView: (view: ViewInstance) => void;
  removeView: (id: string) => void;
  setActiveView: (id: string | null) => void;
  renameView: (id: string, name: string) => void;

  appendMessage: (viewId: string, msg: ChatMessage) => void;
  updateMessageContent: (viewId: string, msgId: string, content: string) => void;
  updateMessage: (viewId: string, msgId: string, patch: Partial<ChatMessage>) => void;
  clearChat: (viewId: string) => void;

  getChatState: (viewId: string) => ChatViewState;
  setChatCollapsed: (viewId: string, collapsed: boolean) => void;
  setChatSizePct: (viewId: string, pct: number) => void;

  setViewContext: (viewId: string, context: string) => void;

  createWorkspace: (name?: string) => void;
  switchWorkspace: (id: string) => void;
  renameWorkspace: (id: string, name: string) => void;
  duplicateWorkspace: (id: string) => void;
  deleteWorkspace: (id: string) => void;

  setSettings: (partial: Partial<AppSettings>) => void;

  exportActiveWorkspace: () => Promise<string | null>;
  importWorkspace: () => Promise<void>;
  clearImportMissingPaths: () => void;
}

// ---- Selectors ----------------------------------------------------------

export function selectActiveWorkspace(s: AppStore): Workspace | null {
  return s.workspaces.find((w) => w.id === s.activeWorkspaceId) ?? null;
}

export function selectViews(s: AppStore): ViewInstance[] {
  return selectActiveWorkspace(s)?.views ?? [];
}

export function selectActiveViewId(s: AppStore): string | null {
  return selectActiveWorkspace(s)?.activeViewId ?? null;
}

export function selectChatMessages(s: AppStore, viewId: string): ChatMessage[] {
  return selectActiveWorkspace(s)?.chatByViewId[viewId] ?? [];
}

export function selectChatViewState(
  s: AppStore,
  viewId: string,
): ChatViewState | undefined {
  return selectActiveWorkspace(s)?.chatStateByViewId[viewId];
}

// ---- Workspace helpers --------------------------------------------------

// Apply a transform to the active workspace, returning the new workspaces array.
function updateActive(
  s: AppStore,
  fn: (w: Workspace) => Workspace,
): Workspace[] {
  return s.workspaces.map((w) => (w.id === s.activeWorkspaceId ? fn(w) : w));
}

export const useAppStore = create<AppStore>((set, get) => ({
  hydrated: false,
  apiKeySet: false,
  settingsOpen: false,
  workspaces: [],
  activeWorkspaceId: null,
  settings: { ...DEFAULT_SETTINGS },
  viewContextByViewId: {},
  lastImportMissingPaths: [],

  hydrate: async () => {
    const [persisted, keySet] = await Promise.all([
      api.storeGet<unknown>(STORE_KEY),
      api.aiHasKey(),
    ]);
    const state = migrate(persisted);
    set({
      workspaces: state.workspaces,
      activeWorkspaceId:
        state.workspaces.find((w) => w.id === state.activeWorkspaceId)?.id ??
        state.workspaces[0]?.id ??
        null,
      settings: state.settings,
      apiKeySet: keySet,
      hydrated: true,
    });
  },

  flush: async () => {
    await api.storeSet(STORE_KEY, snapshot(get()));
  },

  setApiKeySet: (value) => set({ apiKeySet: value }),
  setSettingsOpen: (value) => set({ settingsOpen: value }),

  addView: (view) =>
    set((s) => ({
      workspaces: updateActive(s, (w) => ({
        ...w,
        views: [...w.views, view],
        activeViewId: view.id,
      })),
    })),

  removeView: (id) =>
    set((s) => {
      const { [id]: _ctx, ...restContext } = s.viewContextByViewId;
      return {
        viewContextByViewId: restContext,
        workspaces: updateActive(s, (w) => {
          const views = w.views.filter((v) => v.id !== id);
          const { [id]: _c, ...restChat } = w.chatByViewId;
          const { [id]: _cs, ...restChatState } = w.chatStateByViewId;
          return {
            ...w,
            views,
            chatByViewId: restChat,
            chatStateByViewId: restChatState,
            activeViewId:
              w.activeViewId === id ? (views[0]?.id ?? null) : w.activeViewId,
          };
        }),
      };
    }),

  setActiveView: (id) =>
    set((s) => ({
      workspaces: updateActive(s, (w) => ({ ...w, activeViewId: id })),
    })),

  renameView: (id, name) =>
    set((s) => ({
      workspaces: updateActive(s, (w) => ({
        ...w,
        views: w.views.map((v) => (v.id === id ? { ...v, name } : v)),
      })),
    })),

  appendMessage: (viewId, msg) =>
    set((s) => ({
      workspaces: updateActive(s, (w) => ({
        ...w,
        chatByViewId: {
          ...w.chatByViewId,
          [viewId]: [...(w.chatByViewId[viewId] ?? []), msg],
        },
      })),
    })),

  updateMessageContent: (viewId, msgId, content) =>
    set((s) => ({
      workspaces: updateActive(s, (w) => ({
        ...w,
        chatByViewId: {
          ...w.chatByViewId,
          [viewId]: (w.chatByViewId[viewId] ?? []).map((m) =>
            m.id === msgId ? { ...m, content } : m,
          ),
        },
      })),
    })),

  updateMessage: (viewId, msgId, patch) =>
    set((s) => ({
      workspaces: updateActive(s, (w) => ({
        ...w,
        chatByViewId: {
          ...w.chatByViewId,
          [viewId]: (w.chatByViewId[viewId] ?? []).map((m) =>
            m.id === msgId ? { ...m, ...patch } : m,
          ),
        },
      })),
    })),

  clearChat: (viewId) =>
    set((s) => ({
      workspaces: updateActive(s, (w) => {
        const { [viewId]: _dropped, ...rest } = w.chatByViewId;
        return { ...w, chatByViewId: rest };
      }),
    })),

  getChatState: (viewId) =>
    selectActiveWorkspace(get())?.chatStateByViewId[viewId] ?? defaultChatState(),

  setChatCollapsed: (viewId, collapsed) =>
    set((s) => ({
      workspaces: updateActive(s, (w) => ({
        ...w,
        chatStateByViewId: {
          ...w.chatStateByViewId,
          [viewId]: { ...(w.chatStateByViewId[viewId] ?? defaultChatState()), collapsed },
        },
      })),
    })),

  setChatSizePct: (viewId, pct) =>
    set((s) => ({
      workspaces: updateActive(s, (w) => ({
        ...w,
        chatStateByViewId: {
          ...w.chatStateByViewId,
          [viewId]: { ...(w.chatStateByViewId[viewId] ?? defaultChatState()), sizePct: pct },
        },
      })),
    })),

  setViewContext: (viewId, context) =>
    set((s) => ({
      viewContextByViewId: { ...s.viewContextByViewId, [viewId]: context },
    })),

  createWorkspace: (name) =>
    set((s) => {
      const ws = makeWorkspace(name?.trim() || `Workspace ${s.workspaces.length + 1}`);
      return {
        workspaces: [...s.workspaces, ws],
        activeWorkspaceId: ws.id,
      };
    }),

  switchWorkspace: (id) =>
    set((s) => (s.workspaces.some((w) => w.id === id) ? { activeWorkspaceId: id } : {})),

  renameWorkspace: (id, name) =>
    set((s) => ({
      workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, name } : w)),
    })),

  duplicateWorkspace: (id) =>
    set((s) => {
      const src = s.workspaces.find((w) => w.id === id);
      if (!src) return {};
      const copy = cloneWorkspaceWithNewIds(src, `${src.name} copy`);
      return {
        workspaces: [...s.workspaces, copy],
        activeWorkspaceId: copy.id,
      };
    }),

  deleteWorkspace: (id) =>
    set((s) => {
      const workspaces = s.workspaces.filter((w) => w.id !== id);
      const activeWorkspaceId =
        s.activeWorkspaceId === id
          ? (workspaces[0]?.id ?? null)
          : s.activeWorkspaceId;
      return { workspaces, activeWorkspaceId };
    }),

  setSettings: (partial) =>
    set((s) => ({ settings: { ...s.settings, ...partial } })),

  exportActiveWorkspace: async () => {
    const workspace = selectActiveWorkspace(get());
    if (!workspace) return null;
    return api.workspaceExport(workspace);
  },

  importWorkspace: async () => {
    let result;
    try {
      result = await api.workspaceImport();
    } catch (e) {
      console.error('Workspace import failed:', e);
      set({ lastImportMissingPaths: [`Import failed: ${e instanceof Error ? e.message : String(e)}`] });
      return;
    }
    if (!result) return;
    const name =
      (typeof result.workspace?.name === 'string' && result.workspace.name) ||
      'Imported workspace';
    const imported = cloneWorkspaceWithNewIds(result.workspace, name);
    set((s) => ({
      workspaces: [...s.workspaces, imported],
      activeWorkspaceId: imported.id,
      lastImportMissingPaths: result.missingPaths,
    }));
    if (result.missingPaths.length > 0) {
      console.warn('Imported workspace has missing paths:', result.missingPaths);
    }
  },

  clearImportMissingPaths: () => set({ lastImportMissingPaths: [] }),
}));

let persistTimer: ReturnType<typeof setTimeout> | null = null;
useAppStore.subscribe((state) => {
  if (!state.hydrated) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void api.storeSet(STORE_KEY, snapshot(state));
  }, 200);
});

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    void useAppStore.getState().flush();
  });
}
