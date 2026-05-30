import { makeId } from '../lib/uid';
import type {
  AppSettings,
  PersistedAppState,
  PersistedAppStateV1,
  Workspace,
} from './types';

// Pure persistence helpers: migration, snapshot serialization, and workspace
// id-regeneration. Kept free of React/Electron/zustand imports so they can be
// unit tested in a plain node environment.

export const SCHEMA_VERSION = 2 as const;

export const DEFAULT_SETTINGS: AppSettings = {
  model: 'claude-sonnet-4-6',
  maxTokens: 4096,
};

function freshState(): PersistedAppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    workspaces: [],
    activeWorkspaceId: null,
    settings: { ...DEFAULT_SETTINGS },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function migrate(raw: unknown): PersistedAppState {
  if (!isRecord(raw)) return freshState();

  if (raw.schemaVersion === SCHEMA_VERSION) {
    const workspaces = Array.isArray(raw.workspaces)
      ? (raw.workspaces as Workspace[])
      : [];
    const activeWorkspaceId =
      typeof raw.activeWorkspaceId === 'string' ? raw.activeWorkspaceId : null;
    const settings = isRecord(raw.settings)
      ? { ...DEFAULT_SETTINGS, ...(raw.settings as Partial<AppSettings>) }
      : { ...DEFAULT_SETTINGS };
    return { schemaVersion: SCHEMA_VERSION, workspaces, activeWorkspaceId, settings };
  }

  if (raw.schemaVersion === 1) {
    const v1 = raw as unknown as PersistedAppStateV1;
    const workspace: Workspace = {
      id: makeId('w'),
      name: 'Default',
      views: Array.isArray(v1.views) ? v1.views : [],
      chatByViewId: isRecord(v1.chatByViewId) ? v1.chatByViewId : {},
      chatStateByViewId: isRecord(v1.chatStateByViewId) ? v1.chatStateByViewId : {},
      activeViewId: typeof v1.activeViewId === 'string' ? v1.activeViewId : null,
    };
    return {
      schemaVersion: SCHEMA_VERSION,
      workspaces: [workspace],
      activeWorkspaceId: workspace.id,
      settings: { ...DEFAULT_SETTINGS },
    };
  }

  return freshState();
}

// Deep-copy a workspace, regenerating its id and every view id. Chat/context
// data keyed by old view ids is remapped to the new ids. Defensive against
// malformed input (e.g. a hand-edited import file with missing/!array fields).
export function cloneWorkspaceWithNewIds(src: Workspace, name: string): Workspace {
  const idMap = new Map<string, string>();
  const srcViews = Array.isArray(src?.views) ? src.views : [];
  const views = srcViews.map((v) => {
    const newId = makeId('v');
    idMap.set(v.id, newId);
    return { ...v, id: newId, config: structuredClone(v.config) };
  });
  const remapKeyed = <T>(record: Record<string, T> | undefined): Record<string, T> => {
    const out: Record<string, T> = {};
    if (!record || typeof record !== 'object') return out;
    for (const [oldId, value] of Object.entries(record)) {
      const newId = idMap.get(oldId);
      if (newId) out[newId] = structuredClone(value);
    }
    return out;
  };
  return {
    id: makeId('w'),
    name,
    views,
    chatByViewId: remapKeyed(src?.chatByViewId),
    chatStateByViewId: remapKeyed(src?.chatStateByViewId),
    activeViewId: src?.activeViewId ? (idMap.get(src.activeViewId) ?? null) : null,
  };
}

export function snapshot(state: {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  settings: AppSettings;
}): PersistedAppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    workspaces: state.workspaces,
    activeWorkspaceId: state.activeWorkspaceId,
    settings: state.settings,
  };
}
