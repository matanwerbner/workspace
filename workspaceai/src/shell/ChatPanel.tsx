import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../state/store';
import type { ChatMessage } from '../state/types';
import { makeId } from '../lib/uid';

interface Props {
  viewId: string;
  onToggleCollapse: () => void;
}

<<<<<<< Updated upstream
export function ChatPanel({ viewId, onToggleCollapse }: Props) {
  const messages = useAppStore((s) => s.chatByViewId[viewId] ?? []);
=======
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

const MODEL_OPTIONS: { label: string; value: string }[] = [
  { label: 'Opus 4.8', value: 'claude-opus-4-8' },
  { label: 'Sonnet 4.6', value: 'claude-sonnet-4-6' },
  { label: 'Haiku 4.5', value: 'claude-haiku-4-5-20251001' },
];

type ResponseFormat = 'markdown' | 'html' | 'image';

function buildSystemPrompt(view: ViewInstance, context: string, format: ResponseFormat): string {
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
  if (format === 'html') {
    parts.push(
      'Format your ENTIRE response as a single self-contained fragment of beautiful, expressive, semantic HTML. ' +
        'Use headings, paragraphs, lists, tables, <strong>/<em>, <code>/<pre>, and inline style attributes ' +
        '(colors, spacing, borders, backgrounds, rounded corners) to make it visually rich and easy to scan. ' +
        'Output ONLY the HTML fragment — no <script>, no <style> blocks, no <html>/<head>/<body> wrappers, and no markdown code fences.',
    );
  } else if (format === 'image') {
    parts.push(
      'Respond with a single self-contained SVG document that visually answers the request — a diagram, chart, ' +
        'illustration, or styled graphic. Set explicit width and height attributes (e.g. width="640" height="420") ' +
        'and a matching viewBox. Use only inline SVG primitives (shapes, paths, text, gradients) — no <script>, no ' +
        '<foreignObject>, no external images or fonts. Output ONLY the <svg>…</svg> markup, with no commentary or markdown fences.',
    );
  } else {
    parts.push('Be concise and precise. Use markdown only when it clearly improves readability.');
  }
  return parts.join('\n\n');
}

// Strip a leading/trailing ```lang … ``` fence the model may add despite being
// asked not to, so the inner markup renders rather than showing the fence.
function stripFences(s: string): string {
  const m = s.match(/^\s*```(?:html|svg|xml)?\s*([\s\S]*?)\s*```\s*$/i);
  return m ? m[1] : s;
}

// Rasterize a model-authored SVG onto a <canvas>. SVG is declarative (no script
// execution) and the app CSP blocks scripts anyway, so this is safe.
function SvgCanvas({ svg }: { svg: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setFailed(false);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const avail = (canvas.parentElement?.clientWidth ?? 480) - 4;
      const natW = img.width || avail;
      const natH = img.height || Math.round(avail * 0.66);
      const scale = Math.min(1, avail / natW);
      const w = Math.round(natW * scale);
      const h = Math.round(natH * scale);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.scale(dpr, dpr);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      setFailed(true);
      URL.revokeObjectURL(url);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [svg]);

  if (failed) {
    return <div className="chat-message-content muted">Could not render the image.</div>;
  }
  return <canvas ref={canvasRef} className="chat-canvas" />;
}

function stringifyResult(res: unknown): string {
  if (typeof res === 'string') return res;
  try {
    return JSON.stringify(res, null, 2);
  } catch {
    return String(res);
  }
}

function AssistantMessage({
  content,
  isStreaming,
  htmlMode,
}: {
  content: string;
  isStreaming: boolean;
  htmlMode: boolean;
}) {
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

  // Inline scripts/handlers are blocked by the app CSP (script-src 'self'), so
  // model-authored HTML can't execute — only render its markup.
  const inner = htmlMode ? stripFences(content) : renderMarkdown(content);
  const withCursor = isStreaming ? inner + '<span class="chat-cursor">▌</span>' : inner;

  return (
    <div
      className={`chat-message-content ${htmlMode ? 'chat-html-content' : 'markdown-content'}`}
      dangerouslySetInnerHTML={{ __html: withCursor }}
      onClick={onClick}
    />
  );
}

export function ChatPanel({ viewId, onToggleCollapse, onOpenSettings }: Props) {
  const messages = useAppStore((s) => selectChatMessages(s, viewId));
>>>>>>> Stashed changes
  const appendMessage = useAppStore((s) => s.appendMessage);
  const clearChat = useAppStore((s) => s.clearChat);
<<<<<<< Updated upstream
=======
  const apiKeySet = useAppStore((s) => s.apiKeySet);
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const views = useAppStore(selectViews);
  const viewContext = useAppStore((s) => s.viewContextByViewId[viewId] ?? '');

  const view = views.find((v) => v.id === viewId);
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
    const reply: ChatMessage = {
      id: makeId('m'),
      role: 'assistant',
      content: `AI backend not configured. You sent: "${content}"`,
      timestamp: Date.now(),
    };
    setTimeout(() => appendMessage(viewId, reply), 250);
=======

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
    const systemBase = buildSystemPrompt(view, baseContext, settings.htmlResponses ? 'html' : 'markdown');
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
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
        <span className="chat-title">AI Console</span>
=======
        <div className="chat-header-left">
          <span className="chat-title">AI Console</span>
          {apiKeySet && (
            <>
              <select
                className="chat-select"
                value={settings.model}
                onChange={(e) => setSettings({ model: e.target.value })}
                disabled={busy}
                title="Model"
                aria-label="Model"
              >
                {MODEL_OPTIONS.every((o) => o.value !== settings.model) && (
                  <option value={settings.model}>{settings.model}</option>
                )}
                {MODEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                className="chat-select"
                value={settings.htmlResponses ? 'html' : 'markdown'}
                onChange={(e) => setSettings({ htmlResponses: e.target.value === 'html' })}
                title="Response format"
                aria-label="Response format"
              >
                <option value="markdown">Markdown</option>
                <option value="html">HTML</option>
              </select>
            </>
          )}
        </div>
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
        )}
        {messages.map((m) => (
          <div key={m.id} className={`chat-message role-${m.role}`}>
            <div className="chat-message-role">{m.role === 'user' ? 'You' : 'Assistant'}</div>
            <div className="chat-message-content">{m.content}</div>
          </div>
        ))}
=======
        ) : null}
        {messages.map((m) => {
          // Tool calls are not shown. Tool_use / tool_result turns carry no
          // text, so skip them entirely to avoid empty bubbles — but always keep
          // the in-flight streaming message (it shows the "Thinking…" state).
          const hasText = m.content.length > 0;
          if (!hasText && m.id !== streamingMsgId) return null;
          return (
            <div key={m.id} className={`chat-message role-${m.role}`}>
              <div className="chat-message-role">{m.role === 'user' ? 'You' : 'Assistant'}</div>
              {m.role === 'assistant' ? (
                <AssistantMessage
                  content={m.content}
                  isStreaming={m.id === streamingMsgId}
                  htmlMode={settings.htmlResponses ?? false}
                />
              ) : (
                <div className="chat-message-content">{m.content}</div>
              )}
            </div>
          );
        })}
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
>>>>>>> Stashed changes
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
