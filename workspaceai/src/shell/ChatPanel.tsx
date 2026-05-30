import { useCallback, useEffect, useRef, useState } from 'react';
import type Anthropic from '@anthropic-ai/sdk';
import { selectChatMessages, selectViews, useAppStore } from '../state/store';
import { api } from '../ipc/client';
import { renderMarkdown } from '../lib/markdown';
import type { ChatMessage, ChatToolCall } from '../state/types';
import { getViewType } from '../views/registry';
import type { AiTool, ViewInstance } from '../views/types';
import { makeId } from '../lib/uid';

interface Props {
  viewId: string;
  onToggleCollapse: () => void;
  onOpenSettings: () => void;
}

// Hard cap on agentic tool-use rounds, so a tool whose result keeps prompting
// further tool calls cannot spin the loop indefinitely (cost / no settling).
const MAX_AGENT_TURNS = 25;

// A tool call awaiting the user's approve/reject decision.
interface PendingApproval {
  id: string;
  name: string;
  input: unknown;
  resolve: (decision: 'approve' | 'reject') => void;
}

function shortModelName(model: string): string {
  if (model.includes('opus')) return 'Opus';
  if (model.includes('sonnet')) return 'Sonnet';
  if (model.includes('haiku')) return 'Haiku';
  return model.split('-')[1] ?? model;
}

function buildSystemPrompt(view: ViewInstance, context: string): string {
  const parts = ['You are a helpful AI assistant integrated into WorkspaceAI.'];
  switch (view.typeId) {
    case 'code':
      parts.push('You are helping the user write and understand code.');
      if (context) parts.push(context);
      break;
    case 'browser':
      parts.push('You are helping while the user browses the web.');
      // context already carries the "Current page: <url>" label from getContext.
      if (context) parts.push(context);
      break;
    case 'terminal':
      parts.push('You are helping the user work in a terminal session. You can run commands via the run_command tool.');
      if (context) parts.push(context);
      break;
    case 'pdf':
      parts.push('You are helping while the user reads a document.');
      if (context) parts.push(context);
      break;
    default:
      if (context) parts.push(context);
      break;
  }
  parts.push('Be concise and precise. Use markdown only when it clearly improves readability.');
  return parts.join('\n\n');
}

function stringifyResult(res: unknown): string {
  if (typeof res === 'string') return res;
  try {
    return JSON.stringify(res, null, 2);
  } catch {
    return String(res);
  }
}

function AssistantMessage({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  // Intercept link clicks and open them externally instead of navigating the renderer
  const onClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    if (!anchor) return;
    e.preventDefault();
    const href = anchor.getAttribute('href');
    if (href) void api.openExternal(href);
  }, []);

  if (isStreaming && content.length === 0) {
    return (
      <div className="chat-message-content">
        <span className="chat-thinking">Thinking…</span>
      </div>
    );
  }

  const html = renderMarkdown(content);
  const cursorHtml = isStreaming ? html + '<span class="chat-cursor">▌</span>' : html;

  return (
    <div
      className="chat-message-content markdown-content"
      dangerouslySetInnerHTML={{ __html: cursorHtml }}
      onClick={onClick}
    />
  );
}

function ToolCallCard({ call }: { call: ChatToolCall }) {
  return (
    <div className={`chat-tool-call status-${call.status}`}>
      <div className="chat-tool-call-head">
        <span className="chat-tool-call-name">{call.name}</span>
        <span className="chat-tool-call-status">{call.status}</span>
      </div>
      <pre className="chat-tool-call-input">{stringifyResult(call.input)}</pre>
      {call.result !== undefined && (
        <pre className="chat-tool-call-result">{stringifyResult(call.result)}</pre>
      )}
    </div>
  );
}

export function ChatPanel({ viewId, onToggleCollapse, onOpenSettings }: Props) {
  const messages = useAppStore((s) => selectChatMessages(s, viewId));
  const appendMessage = useAppStore((s) => s.appendMessage);
  const updateMessageContent = useAppStore((s) => s.updateMessageContent);
  const updateMessage = useAppStore((s) => s.updateMessage);
  const clearChat = useAppStore((s) => s.clearChat);
  const apiKeySet = useAppStore((s) => s.apiKeySet);
  const settings = useAppStore((s) => s.settings);
  const views = useAppStore(selectViews);
  const viewContext = useAppStore((s) => s.viewContextByViewId[viewId] ?? '');

  const view = views.find((v) => v.id === viewId);
  const [draft, setDraft] = useState('');
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const accRef = useRef('');
  const draftRef = useRef(draft);
  draftRef.current = draft;
  // The streamId of the currently in-flight request, used to abort on cancel.
  const activeStreamRef = useRef<string | null>(null);
  // True once the user has cancelled — used to break out of the agentic loop.
  const cancelledRef = useRef(false);
  // View ids the user has chosen to always allow tool calls for (session only).
  const alwaysAllowRef = useRef<Set<string>>(new Set());

  // Scroll to bottom whenever messages change (including streaming updates)
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pendingApproval]);

  const isStreaming = streamingMsgId !== null;

  // Ask the user to approve/reject a tool call. Resolves with the decision.
  const requestApproval = (
    block: Anthropic.ToolUseBlock,
  ): Promise<'approve' | 'reject'> => {
    if (alwaysAllowRef.current.has(viewId)) return Promise.resolve('approve');
    return new Promise((resolve) => {
      setPendingApproval({
        id: block.id,
        name: block.name,
        input: block.input,
        resolve,
      });
    });
  };

  const resolveApproval = (decision: 'approve' | 'reject', alwaysAllow: boolean) => {
    if (alwaysAllow) alwaysAllowRef.current.add(viewId);
    const p = pendingApproval;
    setPendingApproval(null);
    p?.resolve(decision);
  };

  const send = async () => {
    const content = draftRef.current.trim();
    if (!content || isStreaming) return;
    if (!apiKeySet || !view) return;

    const def = getViewType(view.typeId);
    const tools: AiTool[] = def?.tools ?? [];
    const executeTool = def?.executeTool;
    const extraContext = def?.getContext ? def.getContext(view) : '';

    const userMsg: ChatMessage = {
      id: makeId('m'),
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    appendMessage(viewId, userMsg);
    setDraft('');

    cancelledRef.current = false;

    // Working message array in Anthropic shape. Seed from the existing
    // transcript, preferring the full stored content blocks (assistant tool_use
    // turns and tool_result turns) so multi-turn tool context is preserved, and
    // falling back to plain text for ordinary messages.
    const rawWorking: Anthropic.MessageParam[] = [...messages, userMsg]
      .map((m): Anthropic.MessageParam | null => {
        if (m.blocks !== undefined) return { role: m.role, content: m.blocks };
        if (m.content.length > 0) return { role: m.role, content: m.content };
        return null;
      })
      .filter((m): m is Anthropic.MessageParam => m !== null);

    // Sanitize: if a prior run errored mid-loop, an assistant turn with tool_use
    // blocks may have been saved without a paired tool_result user turn. The API
    // rejects any replay that contains such an orphan. Truncate at the first
    // unpaired tool_use so we send a valid prefix of the conversation.
    let cutAt = rawWorking.length;
    for (let i = 0; i < rawWorking.length; i++) {
      const m = rawWorking[i];
      if (
        m.role === 'assistant' &&
        Array.isArray(m.content) &&
        (m.content as Array<{ type: string }>).some((b) => b.type === 'tool_use')
      ) {
        const next = rawWorking[i + 1];
        const paired =
          next?.role === 'user' &&
          Array.isArray(next.content) &&
          (next.content as Array<{ type: string }>).some((b) => b.type === 'tool_result');
        if (!paired) { cutAt = i; break; }
      }
    }
    const working = rawWorking.slice(0, cutAt);

    const baseContext = [viewContext, extraContext].filter(Boolean).join('\n\n');
    const systemBase = buildSystemPrompt(view, baseContext);
    const systemPrompt = settings.systemPromptOverride
      ? `${systemBase}\n\n${settings.systemPromptOverride}`
      : systemBase;

    const sdkTools: Anthropic.Tool[] = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Tool.InputSchema,
    }));

    // Set once the model finishes a turn without requesting more tools.
    let completed = false;
    try {
      // Agentic loop: keep calling the model until it stops requesting tools,
      // bounded by MAX_AGENT_TURNS so it always terminates on its own.
      for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
        if (cancelledRef.current) break;

        const streamId = makeId('s');
        activeStreamRef.current = streamId;
        const assistantMsgId = streamId;
        const assistantMsg: ChatMessage = {
          id: assistantMsgId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
        };
        appendMessage(viewId, assistantMsg);
        setStreamingMsgId(assistantMsgId);
        accRef.current = '';

        api.aiOnChunk(streamId, (text) => {
          accRef.current += text;
          updateMessageContent(viewId, assistantMsgId, accRef.current);
        });

        let result;
        try {
          result = await api.aiChat({
            streamId,
            messages: working,
            systemPrompt,
            tools: sdkTools.length > 0 ? sdkTools : undefined,
            model: settings.model,
            maxTokens: settings.maxTokens,
          });
        } finally {
          api.aiOffChunk(streamId);
          setStreamingMsgId(null);
        }

        if (cancelledRef.current) break;

        const blocks = result.content;
        // A turn with no content blocks (e.g. an aborted stream) is not a valid
        // message to replay — stop here rather than pushing an empty turn that
        // the API would reject on the next round.
        if (blocks.length === 0) {
          completed = true;
          break;
        }
        // Append the assistant turn (full content blocks) to the working array.
        working.push({ role: 'assistant', content: blocks });

        const textBlocks = blocks.filter(
          (b): b is Anthropic.TextBlock => b.type === 'text',
        );
        const text = textBlocks.map((b) => b.text).join('');
        const toolUseBlocks = blocks.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
        );

        // Persist the assistant turn's visible text, its full content blocks
        // (for faithful multi-turn replay), plus any tool-call display records.
        updateMessage(viewId, assistantMsgId, {
          content: text,
          blocks,
          toolCalls:
            toolUseBlocks.length > 0
              ? toolUseBlocks.map((b) => ({
                  name: b.name,
                  input: b.input,
                  status: 'pending' as const,
                }))
              : undefined,
        });

        if (result.stopReason !== 'tool_use' || toolUseBlocks.length === 0 || !executeTool) {
          completed = true;
          break;
        }

        // Process each requested tool call: approve/reject, then execute.
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        const recorded: ChatToolCall[] = toolUseBlocks.map((b) => ({
          name: b.name,
          input: b.input,
          status: 'pending' as const,
        }));

        for (let i = 0; i < toolUseBlocks.length; i++) {
          if (cancelledRef.current) break;
          const block = toolUseBlocks[i];
          const decision = await requestApproval(block);
          if (cancelledRef.current) break;

          let res: unknown;
          if (decision === 'reject') {
            res = 'User rejected this tool call';
            recorded[i] = { ...recorded[i], status: 'rejected', result: res };
          } else {
            recorded[i] = { ...recorded[i], status: 'approved' };
            updateMessage(viewId, assistantMsgId, { content: text, toolCalls: [...recorded] });
            try {
              res = await executeTool(
                block.name,
                block.input as Record<string, unknown>,
                view,
              );
            } catch (e) {
              res = `Error executing tool: ${e instanceof Error ? e.message : String(e)}`;
            }
            recorded[i] = { ...recorded[i], status: 'done', result: res };
          }
          updateMessage(viewId, assistantMsgId, { content: text, toolCalls: [...recorded] });

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: stringifyResult(res),
          });
        }

        // Ensure every tool_use block has a paired tool_result, even if the
        // user cancelled partway through — an assistant tool_use turn with an
        // unpaired tool_use is rejected by the API if the array is ever replayed.
        for (let i = toolResults.length; i < toolUseBlocks.length; i++) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUseBlocks[i].id,
            content: 'Cancelled by user',
          });
          recorded[i] = { ...recorded[i], status: 'rejected', result: 'Cancelled by user' };
        }

        // Send all tool results back as a single user message and loop again.
        working.push({ role: 'user', content: toolResults });
        appendMessage(viewId, {
          id: makeId('m'),
          role: 'user',
          content: '',
          timestamp: Date.now(),
          toolCalls: recorded,
          blocks: toolResults,
        });

        if (cancelledRef.current) break;
      }

      // Loop ran to its cap while the model was still requesting tools: stop and
      // tell the user rather than silently dropping the last tool round.
      if (!completed && !cancelledRef.current) {
        appendMessage(viewId, {
          id: makeId('m'),
          role: 'assistant',
          content: `Stopped: reached the maximum of ${MAX_AGENT_TURNS} tool iterations.`,
          timestamp: Date.now(),
        });
      }
    } catch (e) {
      const errText = e instanceof Error ? e.message : String(e);
      const targetId = activeStreamRef.current;
      if (targetId) {
        updateMessageContent(
          viewId,
          targetId,
          accRef.current
            ? `${accRef.current}\n\n---\n*Error: ${errText}*`
            : `Error: ${errText}`,
        );
      }
    } finally {
      if (activeStreamRef.current) api.aiOffChunk(activeStreamRef.current);
      activeStreamRef.current = null;
      setStreamingMsgId(null);
      setPendingApproval(null);
      accRef.current = '';
    }
  };

  const cancelStream = async () => {
    cancelledRef.current = true;
    // Resolve any in-flight approval so the loop can unwind.
    pendingApproval?.resolve('reject');
    setPendingApproval(null);
    const streamId = activeStreamRef.current;
    if (streamId) {
      await api.aiCancelChat(streamId);
      api.aiOffChunk(streamId);
    }
    setStreamingMsgId(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const busy = isStreaming || pendingApproval !== null;

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="chat-header-left">
          <span className="chat-title">AI Console</span>
          {apiKeySet && (
            <span className="chat-model-badge">
              <span className="chat-model-dot" />
              {shortModelName(settings.model)}
            </span>
          )}
        </div>
        <div className="chat-header-actions">
          {messages.length > 0 && !busy && (
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
        {!apiKeySet ? (
          <div className="chat-no-key">
            <div className="chat-no-key-icon">⚙</div>
            <div className="chat-no-key-text">
              No API key configured.{' '}
              <button className="chat-link-btn" onClick={onOpenSettings}>
                Open Settings
              </button>{' '}
              to add your Anthropic API key.
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="chat-empty muted">
            Ask anything about what you're working on. ⏎ to send.
          </div>
        ) : null}
        {messages.map((m) => (
          <div key={m.id} className={`chat-message role-${m.role}`}>
            <div className="chat-message-role">{m.role === 'user' ? 'You' : 'Assistant'}</div>
            {m.role === 'assistant' ? (
              (m.content.length > 0 || !m.toolCalls) && (
                <AssistantMessage content={m.content} isStreaming={m.id === streamingMsgId} />
              )
            ) : m.content ? (
              <div className="chat-message-content">{m.content}</div>
            ) : null}
            {m.toolCalls?.map((call, i) => (
              <ToolCallCard key={`${m.id}-${i}`} call={call} />
            ))}
          </div>
        ))}
        {pendingApproval && (
          <div className="chat-approval-card">
            <div className="chat-approval-head">
              The assistant wants to run <strong>{pendingApproval.name}</strong>
            </div>
            <pre className="chat-approval-input">{stringifyResult(pendingApproval.input)}</pre>
            <div className="chat-approval-actions">
              <button
                className="btn-primary btn-sm"
                onClick={() => resolveApproval('approve', false)}
              >
                Approve
              </button>
              <button
                className="btn-ghost btn-sm"
                onClick={() => resolveApproval('reject', false)}
              >
                Reject
              </button>
              <button
                className="btn-ghost btn-sm"
                onClick={() => resolveApproval('approve', true)}
                title="Approve and auto-allow further tool calls in this view"
              >
                Always allow
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="chat-input-row">
        <textarea
          className="chat-input"
          rows={2}
          placeholder={
            !apiKeySet
              ? 'Configure API key in Settings…'
              : busy
                ? 'Waiting for response…'
                : 'Ask the AI… (⏎ send, ⇧⏎ newline)'
          }
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={!apiKeySet || busy}
        />
        {busy ? (
          <button className="btn-ghost" onClick={() => void cancelStream()}>
            Stop
          </button>
        ) : (
          <button
            className="btn-primary"
            onClick={() => void send()}
            disabled={!draft.trim() || !apiKeySet}
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}
