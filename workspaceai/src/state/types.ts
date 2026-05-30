import type Anthropic from '@anthropic-ai/sdk';
import type { ViewInstance } from '../views/types';

export interface ChatToolCall {
  name: string;
  input: unknown;
  result?: unknown;
  status: 'pending' | 'approved' | 'rejected' | 'done';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: ChatToolCall[];
  // Full Anthropic content blocks for this turn (assistant tool_use turns and
  // user tool_result turns), preserved so multi-turn tool context can be
  // replayed faithfully. Absent for ordinary text-only messages.
  blocks?: Anthropic.MessageParam['content'];
}

export interface ChatViewState {
  collapsed: boolean;
  sizePct: number;
}

export interface Workspace {
  id: string;
  name: string;
  views: ViewInstance[];
  chatByViewId: Record<string, ChatMessage[]>;
  chatStateByViewId: Record<string, ChatViewState>;
  activeViewId: string | null;
}

export interface AppSettings {
  model: string;
  maxTokens: number;
  systemPromptOverride?: string;
}

export interface PersistedAppState {
  schemaVersion: 2;
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  settings: AppSettings;
}

export interface PersistedAppStateV1 {
  schemaVersion: 1;
  views: ViewInstance[];
  activeViewId: string | null;
  chatByViewId: Record<string, ChatMessage[]>;
  chatStateByViewId: Record<string, ChatViewState>;
}
