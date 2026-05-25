import { create } from 'zustand';
import { api } from '../ipc/client';
import type { ViewInstance } from '../views/types';
import type { ChatMessage, PersistedAppState } from './types';

const STORE_KEY = 'appState';
const SCHEMA_VERSION = 1 as const;
const DEFAULT_CHAT_PCT = 30;

interface ChatViewState {
  collapsed: boolean;
  sizePct: number;
}

const defaultChatState = (): ChatViewState => ({
  collapsed: false,
  sizePct: DEFAULT_CHAT_PCT,
});

interface AppStore {
  hydrated: boolean;
  views: ViewInstance[];
  activeViewId: string | null;
  chatByViewId: Record<string, ChatMessage[]>;
  chatStateByViewId: Record<string, ChatViewState>;

  hydrate: () => Promise<void>;
  flush: () => Promise<void>;

  addView: (view: ViewInstance) => void;
  removeView: (id: string) => void;
  setActiveView: (id: string | null) => void;

  appendMessage: (viewId: string, msg: ChatMessage) => void;
  clearChat: (viewId: string) => void;

  getChatState: (viewId: string) => ChatViewState;
  setChatCollapsed: (viewId: string, collapsed: boolean) => void;
  setChatSizePct: (viewId: string, pct: number) => void;
}

function snapshot(s: AppStore): PersistedAppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    views: s.views,
    activeViewId: s.activeViewId,
    chatByViewId: s.chatByViewId,
    chatStateByViewId: s.chatStateByViewId,
  };
}

export const useAppStore = create<AppStore>((set, get) => ({
  hydrated: false,
  views: [],
  activeViewId: null,
  chatByViewId: {},
  chatStateByViewId: {},

  hydrate: async () => {
    const persisted = await api.storeGet<PersistedAppState>(STORE_KEY);
    if (!persisted || persisted.schemaVersion !== SCHEMA_VERSION) {
      set({ hydrated: true });
      return;
    }
    const validIds = new Set(persisted.views.map((v) => v.id));
    const chatByViewId = Object.fromEntries(
      Object.entries(persisted.chatByViewId ?? {}).filter(([id]) => validIds.has(id)),
    );
    const chatStateByViewId = Object.fromEntries(
      Object.entries(persisted.chatStateByViewId ?? {}).filter(([id]) => validIds.has(id)),
    );
    set({
      views: persisted.views,
      activeViewId: validIds.has(persisted.activeViewId ?? '')
        ? persisted.activeViewId
        : persisted.views[0]?.id ?? null,
      chatByViewId,
      chatStateByViewId,
      hydrated: true,
    });
  },

  flush: async () => {
    await api.storeSet(STORE_KEY, snapshot(get()));
  },

  addView: (view) =>
    set((s) => ({
      views: [...s.views, view],
      activeViewId: view.id,
    })),

  removeView: (id) =>
    set((s) => {
      const views = s.views.filter((v) => v.id !== id);
      const { [id]: _droppedChat, ...restChat } = s.chatByViewId;
      const { [id]: _droppedChatState, ...restChatState } = s.chatStateByViewId;
      const activeViewId =
        s.activeViewId === id ? (views[0]?.id ?? null) : s.activeViewId;
      return {
        views,
        chatByViewId: restChat,
        chatStateByViewId: restChatState,
        activeViewId,
      };
    }),

  setActiveView: (id) => set({ activeViewId: id }),

  appendMessage: (viewId, msg) =>
    set((s) => ({
      chatByViewId: {
        ...s.chatByViewId,
        [viewId]: [...(s.chatByViewId[viewId] ?? []), msg],
      },
    })),

  clearChat: (viewId) =>
    set((s) => {
      const { [viewId]: _droppedChat, ...rest } = s.chatByViewId;
      return { chatByViewId: rest };
    }),

  getChatState: (viewId) => get().chatStateByViewId[viewId] ?? defaultChatState(),

  setChatCollapsed: (viewId, collapsed) =>
    set((s) => ({
      chatStateByViewId: {
        ...s.chatStateByViewId,
        [viewId]: { ...(s.chatStateByViewId[viewId] ?? defaultChatState()), collapsed },
      },
    })),

  setChatSizePct: (viewId, pct) =>
    set((s) => ({
      chatStateByViewId: {
        ...s.chatStateByViewId,
        [viewId]: { ...(s.chatStateByViewId[viewId] ?? defaultChatState()), sizePct: pct },
      },
    })),
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
