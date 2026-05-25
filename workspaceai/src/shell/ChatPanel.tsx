import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../state/store';
import type { ChatMessage } from '../state/types';
import { makeId } from '../lib/uid';

interface Props {
  viewId: string;
  onToggleCollapse: () => void;
}

export function ChatPanel({ viewId, onToggleCollapse }: Props) {
  const messages = useAppStore((s) => s.chatByViewId[viewId] ?? []);
  const appendMessage = useAppStore((s) => s.appendMessage);
  const clearChat = useAppStore((s) => s.clearChat);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const send = () => {
    const content = draft.trim();
    if (!content) return;
    const userMsg: ChatMessage = {
      id: makeId('m'),
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    appendMessage(viewId, userMsg);
    setDraft('');
    const reply: ChatMessage = {
      id: makeId('m'),
      role: 'assistant',
      content: `AI backend not configured. You sent: "${content}"`,
      timestamp: Date.now(),
    };
    setTimeout(() => appendMessage(viewId, reply), 250);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span className="chat-title">AI Console</span>
        <div className="chat-header-actions">
          {messages.length > 0 && (
            <button className="btn-ghost btn-sm" onClick={() => clearChat(viewId)}>
              Clear
            </button>
          )}
          <button className="btn-ghost btn-sm" onClick={onToggleCollapse} title="Collapse">
            ⌄
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty muted">
            AI backend not wired up yet. Messages will echo for now.
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`chat-message role-${m.role}`}>
            <div className="chat-message-role">{m.role === 'user' ? 'You' : 'Assistant'}</div>
            <div className="chat-message-content">{m.content}</div>
          </div>
        ))}
      </div>
      <div className="chat-input-row">
        <textarea
          className="chat-input"
          rows={2}
          placeholder="Ask the AI… (⏎ to send, ⇧⏎ for newline)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button className="btn-primary" onClick={send} disabled={!draft.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
