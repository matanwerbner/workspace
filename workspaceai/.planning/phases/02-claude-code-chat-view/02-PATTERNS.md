# Phase 02: Claude Code Chat View with Markdown Renderer — Pattern Map

**Mapped:** 2026-06-03
**Files analyzed:** 6 new/modified files
**Analogs found:** 6 / 6

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/views/claude-code/types.ts` | model | — | `src/views/notepad/types.ts` | exact |
| `src/views/claude-code/index.tsx` | config/registry | request-response | `src/views/notepad/index.tsx` | exact |
| `src/views/claude-code/ClaudeCodeView.tsx` | component | request-response (display) | `src/views/notepad/NotepadView.tsx` | role-match |
| `src/lib/markdown.ts` (modify) | utility | transform | `src/lib/markdown.ts` (existing) | self |
| `src/shell/ChatPanel.tsx` (modify) | component/controller | request-response | `src/shell/ChatPanel.tsx` lines 35–76 | self |
| `src/App.tsx` (modify) | config | — | `src/App.tsx` lines 8–12 | self |

---

## Pattern Assignments

### `src/views/claude-code/types.ts` (model)

**Analog:** `src/views/notepad/types.ts`

**Full file pattern** (lines 1–3 of analog):
```typescript
export interface NotepadViewConfig {
  content: string;
}
```

**Apply as:**
```typescript
// src/views/claude-code/types.ts
// This view has no persistent config; the empty object keeps the pattern consistent.
export interface ClaudeCodeViewConfig {
  // intentionally empty — no document path or content to store
}
```

---

### `src/views/claude-code/index.tsx` (config/registry)

**Analog:** `src/views/notepad/index.tsx`

**Imports pattern** (lines 1–4):
```typescript
import { registerView } from '../registry';
import { NotepadView, extractText } from './NotepadView';
import type { NotepadViewConfig } from './types';
import type { AiTool } from '../types';
```

**Registration pattern** (lines 36–71): The full `registerView<T>({...})` call with `typeId`, `label`, `description`, `icon`, `createConfig`, `Component`. For `claude-code`, omit `tools` and `executeTool` (no document surface). Omit `getContext` (ChatPanel injects context from the system prompt case).

```typescript
// src/views/claude-code/index.tsx
import { registerView } from '../registry';
import { ClaudeCodeView } from './ClaudeCodeView';
import type { ClaudeCodeViewConfig } from './types';

registerView<ClaudeCodeViewConfig>({
  typeId: 'claude-code',
  label: 'Claude Code',
  description: 'Chat directly with Claude — responses rendered as rich markdown.',
  icon: <span className="view-type-icon">✦</span>,
  createConfig: async () => ({ name: 'Claude Chat', config: {} }),
  Component: ClaudeCodeView,
  // No tools, executeTool, or getContext — no document surface.
  // Memory tools are injected globally by ChatPanel via GLOBAL_MEMORY_TOOLS.
});
```

---

### `src/views/claude-code/ClaudeCodeView.tsx` (component, display)

**Analog:** `src/views/notepad/NotepadView.tsx`

**Imports pattern** (lines 1–13 of analog):
```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
// ...
import { useAppStore } from '../../state/store';
import type { ViewInstance } from '../types';
import type { NotepadViewConfig } from './types';
```

**Component signature pattern** (line 51 of analog):
```typescript
export function NotepadView({ instance }: { instance: ViewInstance<NotepadViewConfig> }) {
```

**useEffect / store selector pattern** (lines 52–78 of analog):
- Select store actions via `useAppStore((s) => s.someAction)` (one selector per action)
- Use `useEffect` with `[instance.id, ...]` deps for side effects tied to the view instance

**Apply as:**
```tsx
// src/views/claude-code/ClaudeCodeView.tsx
import { useEffect } from 'react';
import { selectChatMessages, useAppStore } from '../../state/store';
import { renderMarkdown } from '../../lib/markdown';
import type { ViewInstance } from '../types';
import type { ClaudeCodeViewConfig } from './types';

export function ClaudeCodeView({ instance }: { instance: ViewInstance<ClaudeCodeViewConfig> }) {
  const messages = useAppStore((s) => selectChatMessages(s, instance.id));
  const setChatCollapsed = useAppStore((s) => s.setChatCollapsed);

  // Ensure ChatPanel is open whenever this view mounts
  useEffect(() => {
    setChatCollapsed(instance.id, false);
  }, [instance.id, setChatCollapsed]);

  return (
    <div className="claude-code-view">
      {messages.length === 0 ? (
        <div className="claude-code-empty muted">
          Start a conversation in the AI Console below.
        </div>
      ) : (
        <div className="claude-code-thread">
          {messages.map((m) =>
            m.role === 'assistant' && m.content ? (
              <div
                key={m.id}
                className="claude-code-bubble"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
              />
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
```

---

### `src/lib/markdown.ts` (modify — add highlight.js)

**Analog:** `src/lib/markdown.ts` (self — extend existing file)

**Current full file** (lines 1–17):
```typescript
import { marked, Renderer } from 'marked';

// Override the HTML renderer to escape raw HTML blocks instead of passing them through.
const renderer = new Renderer();
renderer.html = ({ raw }: { raw: string }) =>
  raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

marked.use({ renderer, gfm: true, breaks: true });

export function renderMarkdown(text: string): string {
  try {
    return marked.parse(text, { async: false }) as string;
  } catch {
    return `<p>${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
  }
}
```

**Extension pattern** — add after the `renderer.html` override, before `marked.use(...)`:
```typescript
// Add these imports at top of file (after existing marked imports):
import type { Tokens } from 'marked';
import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import html from 'highlight.js/lib/languages/xml';  // hljs uses 'xml' for html
import css from 'highlight.js/lib/languages/css';
import markdown from 'highlight.js/lib/languages/markdown';
import diff from 'highlight.js/lib/languages/diff';

hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('html', html);
hljs.registerLanguage('xml', html);
hljs.registerLanguage('css', css);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('diff', diff);

// Add renderer.code override BEFORE the marked.use({ renderer, ... }) call:
renderer.code = ({ text, lang }: Tokens.Code): string => {
  if (lang && hljs.getLanguage(lang)) {
    const highlighted = hljs.highlight(text, { language: lang }).value;
    return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`;
  }
  // Fallback: escape HTML entities (do NOT escape already-highlighted output)
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<pre><code>${escaped}</code></pre>`;
};
```

**Critical:** `renderer.code` must be added before `marked.use({ renderer, ... })`. The `highlighted` value already contains HTML `<span>` elements from hljs — never run `.replace(/</g, '&lt;')` on the highlighted output or spans will double-encode.

---

### `src/shell/ChatPanel.tsx` (modify — add `claude-code` system prompt case)

**Analog:** `src/shell/ChatPanel.tsx` lines 35–76 (self — extend existing switch)

**Existing switch pattern** (lines 37–57):
```typescript
function buildSystemPrompt(view: ViewInstance, context: string, format: ResponseFormat): string {
  const parts = ['You are a helpful AI assistant integrated into Orbit.'];
  switch (view.typeId) {
    case 'code':
      parts.push('You are helping the user write and understand code.');
      if (context) parts.push(context);
      break;
    case 'browser':
      parts.push('You are helping while the user browses the web.');
      if (context) parts.push(context);
      break;
    case 'terminal':
      parts.push('You are helping the user work in a terminal session. ...');
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
  // ...format handling follows
```

**Add before `default:`:**
```typescript
case 'claude-code':
  parts.push(
    'You are an AI coding assistant. Respond in clear, idiomatic markdown. ' +
    'Use fenced code blocks with language tags for all code.',
  );
  break;
```

---

### `src/App.tsx` (modify — add import side-effect)

**Analog:** `src/App.tsx` lines 8–12 (self)

**Existing import block** (lines 8–12):
```typescript
import './views/code';
import './views/browser';
import './views/pdf';
import './views/terminal';
import './views/notepad';
```

**Add:**
```typescript
import './views/claude-code';
```

Order is not significant; add after `notepad` to keep alphabetical grouping.

---

## Shared Patterns

### Store selector pattern
**Source:** `src/views/notepad/NotepadView.tsx` lines 52–53, `src/shell/ChatPanel.tsx` line 3
**Apply to:** `ClaudeCodeView.tsx`
```typescript
// One useAppStore call per selector — do not combine into a single object destructure
const messages = useAppStore((s) => selectChatMessages(s, instance.id));
const setChatCollapsed = useAppStore((s) => s.setChatCollapsed);
```

### useEffect dependency array
**Source:** `src/views/notepad/NotepadView.tsx` lines 63–68, 71–78
**Apply to:** `ClaudeCodeView.tsx`
```typescript
// Always include instance.id and any store actions in deps
useEffect(() => {
  setChatCollapsed(instance.id, false);
}, [instance.id, setChatCollapsed]);
```

### View root class naming
**Source:** `src/views/notepad/NotepadView.tsx` line 95
**Apply to:** `ClaudeCodeView.tsx`
```tsx
// Root div: {typeId}-view
<div className="claude-code-view">
```

### Test pattern — registry
**Source:** `src/views/__tests__/registry.test.ts` lines 1–35
**Apply to:** Add cases to existing file (do not create new test file)
```typescript
// Pattern: import the view module for side effect, then assert getViewType returns correct fields
import '../../views/claude-code';  // side-effect registers the view
const entry = getViewType('claude-code');
expect(entry?.typeId).toBe('claude-code');
expect(entry?.label).toBe('Claude Code');
```

### Test pattern — markdown
**Source:** `src/lib/__tests__/markdown.test.ts` lines 1–28
**Apply to:** Add cases to existing file (do not create new test file)
```typescript
// Pattern: call renderMarkdown with a fenced block, assert HTML output
it('highlights typescript code block', () => {
  const html = renderMarkdown('```typescript\nconst x: number = 1;\n```');
  expect(html).toContain('class="hljs language-typescript"');
});

it('falls back to plain code for unknown language', () => {
  const html = renderMarkdown('```\nfoo\n```');
  expect(html).not.toContain('hljs');
  expect(html).toContain('<pre><code>');
});
```

---

## No Analog Found

All files for this phase have close analogs in the codebase. No new patterns need to be sourced from external documentation.

---

## Metadata

**Analog search scope:** `src/views/`, `src/lib/`, `src/shell/`, `src/App.tsx`
**Files scanned:** 8
**Pattern extraction date:** 2026-06-03
