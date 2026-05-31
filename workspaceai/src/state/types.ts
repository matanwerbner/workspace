import type { ViewInstance } from '../views/types';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
<<<<<<< Updated upstream
=======
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
  // When true, the AI is instructed to author expressive HTML and the chat
  // renders it as-is instead of treating the response as markdown.
  htmlResponses?: boolean;
  // Optional explicit path to a code-server / openvscode-server binary for the
  // Cursor (embedded VS Code) view. When unset, the main process searches PATH.
  codeServerPath?: string;
>>>>>>> Stashed changes
}

export interface PersistedAppState {
  schemaVersion: 1;
  views: ViewInstance[];
  activeViewId: string | null;
  chatByViewId: Record<string, ChatMessage[]>;
  chatStateByViewId: Record<string, { collapsed: boolean; sizePct: number }>;
}
