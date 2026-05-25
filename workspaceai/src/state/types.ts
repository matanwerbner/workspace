import type { ViewInstance } from '../views/types';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface PersistedAppState {
  schemaVersion: 1;
  views: ViewInstance[];
  activeViewId: string | null;
  chatByViewId: Record<string, ChatMessage[]>;
  chatStateByViewId: Record<string, { collapsed: boolean; sizePct: number }>;
}
