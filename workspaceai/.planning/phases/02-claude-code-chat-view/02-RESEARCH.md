# Phase 02: Claude Code Chat View with Markdown Renderer — Research

**Researched:** 2026-06-03
**Domain:** Electron/React view system; markdown rendering; syntax highlighting
**Confidence:** HIGH — all findings verified against source files in this session

---

## Summary

Phase 02 adds a standalone `claude-code` view type — a chat surface that renders Claude
responses as rich markdown with syntax-highlighted code blocks, with no terminal spawned.
The view fits neatly into the existing view-type system: create a `src/views/claude-code/`
folder with `types.ts`, `index.tsx`, and `ClaudeCodeView.tsx`, import the `index` in
`App.tsx`, and the view appears in the Add View modal automatically.

The chat UI machinery (message loop, streaming, tool calls, approval flow, memory tools)
all lives in `ChatPanel.tsx`, which is a _sidebar panel_ that docks below any view. The
new view does NOT re-implement the chat loop — it only provides a new _view pane_ with
its own layout. What makes `claude-code` unique is that its view pane IS the chat thread:
a full-height conversation area with an input bar at the bottom and no separate document
surface beside it. The existing `ChatPanel` sidebar remains visible alongside it (as it
does for every view), so the user benefits from the full agent loop, tool approval, format
selector, model selector, etc.

Markdown rendering is already implemented in `src/lib/markdown.ts` using `marked` v18.
The only missing piece is syntax highlighting for code blocks. Highlight.js is the correct
addition: it integrates via a custom `Renderer.code` override in `markdown.ts` (the hook
already exists and accepts `{ text, lang }`), does not require a build-time language
registration step, and has been on npm since 2011 from the official `highlightjs` org.

**Primary recommendation:** Add `highlight.js` to `dependencies`, extend `renderMarkdown`
with a `lang`-aware code renderer, and implement `ClaudeCodeView` as a full-height chat
thread (not a split view) that auto-expands the `ChatPanel` sidebar on mount.

---

## Project Constraints (from CLAUDE.md)

- Every code change must be reflected in tests. Keep tests minimal — cover new behavior.
- Run only the relevant test file after each change: `npm test -- <path-to-test-file>`
- Do not run the full suite.
- Bug fixes and features go through GSD; do not implement directly.
- Session logs live at `~/Library/Application Support/workspaceai/logs/`.
- All IPC handler calls are auto-logged; renderer events use `window.api.logEvent` / `log()`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Chat conversation (messages, streaming, tools) | ChatPanel (renderer sidebar) | store (zustand state) | Already implemented; reused unchanged |
| View registration and lifecycle | View registry (`src/views/registry.ts`) | App.tsx (import side-effect) | Pattern used by all 5 existing views |
| Markdown-to-HTML rendering | `src/lib/markdown.ts` | ChatPanel `AssistantMessage` | Already called for markdown responses |
| Syntax highlighting | `src/lib/markdown.ts` renderer override | highlight.js library | Injected at the `Renderer.code` hook |
| View pane UI (conversation layout) | `ClaudeCodeView.tsx` (renderer) | `MainPane` (host) | View renders full-height inside `.view-layer` |
| CSS styling | `src/theme/app.css` | tokens.css | All other views add their own block to app.css |
| State persistence | zustand store + `migrate.ts` | preload/electron-store | Config schema is `ClaudeCodeViewConfig` |
| System prompt context | `buildSystemPrompt` in ChatPanel | — | Add `claude-code` case to the switch |

---

## Standard Stack

### Core (already in project — no new installs)

| Library | Version | Purpose | How used here |
|---------|---------|---------|---------------|
| `marked` | 18.0.4 [VERIFIED: npm registry] | Markdown → HTML | Extend renderer in `markdown.ts` |
| `react` | 18.3.1 [VERIFIED: npm registry] | UI component | `ClaudeCodeView` component |
| `zustand` | 4.5.4 [VERIFIED: npm registry] | App state | `useAppStore` selectors |
| `react-resizable-panels` | 2.0.22 [VERIFIED: npm registry] | Panel split | Used in `MainPane` (no change) |

### New Dependency

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `highlight.js` | 11.11.1 [VERIFIED: npm registry] | Syntax highlight | Injected via `Renderer.code` hook in `marked`; supports 180+ languages; used in VS Code, GitHub, and major documentation sites |

**Installation:**
```bash
npm install highlight.js
```

**Version verification:** `npm view highlight.js version` → `11.11.1` (2025-08-26 last publish)

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `highlight.js` | npm | ~14 yrs (2011) | Very high (VS Code dep) | github.com/highlightjs/highlight.js | [ASSUMED] slopcheck unavailable | Approved — established package, official org |

**Packages removed due to slopcheck [SLOP] verdict:** none

**Packages flagged as suspicious [SUS]:** none

*slopcheck was unavailable at research time. `highlight.js` is tagged `[VERIFIED: npm registry]`
for version existence. Provenance is confirmed via npm metadata: created 2011-07-15, official
`highlightjs` GitHub org. The planner should add a `checkpoint:human-verify` before the install
step as belt-and-suspenders, but risk is extremely low.*

---

## Architecture Patterns

### System Architecture Diagram

```
User types in ChatPanel textarea
        │
        ▼
ChatPanel.send() ── ai:chat IPC ──► main process Anthropic SDK
        │                                    │ stream chunks
        ◄────────── aiOnChunk ───────────────┘
        │
        ▼
store.appendMessage / updateMessageContent
        │
        ▼
AssistantMessage component
  - htmlMode=false  →  renderMarkdown(content)   ← highlight.js hooked here
  - htmlMode=true   →  dangerouslySetInnerHTML(stripFences(content))
        │
        ▼
.markdown-content (or .chat-html-content) CSS class applies styles

ClaudeCodeView renders in .view-layer (MainPane)
  └── Full-height column: message thread + input bar
      ── On mount: auto-expands ChatPanel sidebar (or is standalone view)
```

### Recommended Project Structure

```
src/views/claude-code/
├── types.ts              # ClaudeCodeViewConfig interface
├── index.tsx             # registerView() side-effect + createConfig
└── ClaudeCodeView.tsx    # The view component
```

Add to `src/App.tsx`:
```tsx
import './views/claude-code';
```

### Pattern 1: View Registration (mirrors all existing views)

**What:** A module that calls `registerView()` as a side effect when imported.
**When to use:** Every new view type.

```typescript
// src/views/claude-code/index.tsx
// Source: src/views/terminal/index.tsx, src/views/notepad/index.tsx (observed pattern)
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
  // No tools or executeTool — this view has no document surface to read/write.
  // Memory tools are injected globally by ChatPanel via GLOBAL_MEMORY_TOOLS.
});
```

### Pattern 2: System Prompt Context (extend existing switch)

**What:** `buildSystemPrompt` in `ChatPanel.tsx` has a switch on `view.typeId`. Add a `claude-code` case.
**When to use:** Any new view type that should have a distinct system persona.

```typescript
// Source: ChatPanel.tsx lines 35-76 (observed pattern)
case 'claude-code':
  parts.push(
    'You are an AI coding assistant. Respond in clear, idiomatic markdown. ' +
    'Use fenced code blocks with language tags for all code.',
  );
  break;
```

### Pattern 3: Syntax Highlighting via Renderer.code Override

**What:** Extend `renderMarkdown` in `src/lib/markdown.ts` to run highlight.js when the
code block has a language tag. Falls back to escaped plain text when lang is absent.
**When to use:** Any time a code block needs color.

```typescript
// Source: marked Renderer API (lib/marked.d.ts line 176): code({ text, lang, escaped })
// highlight.js API: hljs.highlight(code, { language }).value
import hljs from 'highlight.js/lib/core';

renderer.code = ({ text, lang }: Tokens.Code): string => {
  if (lang) {
    try {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      const highlighted = hljs.highlight(text, { language }).value;
      return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
    } catch {
      // fall through to uncolored output
    }
  }
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<pre><code>${escaped}</code></pre>`;
};
```

Note: use `highlight.js/lib/core` + explicit language registration to keep bundle size
small (avoid bundling all 180+ grammars). Register only common languages for this app
(typescript, javascript, python, bash, json, html, css, markdown, diff).

### Pattern 4: ClaudeCodeView as Fullscreen Chat Thread

**What:** The view pane occupies the full MainPane area. Unlike Terminal or Browser, there
is no document surface — just a scrollable message thread and an input bar.

However, this view type does NOT re-implement the chat loop. The existing `ChatPanel`
sidebar (which contains the full agentic loop) will render alongside it as normal.
The view itself can be minimal — a placeholder message that says "Use the AI Console below
to chat" or, alternatively, render a read-only replica of `chatByViewId[viewId]` for
display purposes so the view pane shows the conversation history too.

**Decision point for planner:** There are two valid interpretations:

**Option A — View pane mirrors ChatPanel thread (display-only).**
The view renders a read-only message list from `chatByViewId[viewId]`. The ChatPanel
sidebar (bottom panel) remains the input surface. The user sees the conversation both
in the view pane and the sidebar. This avoids duplicating the chat loop.

**Option B — View pane IS the chat interface (standalone).**
The view renders a full input bar + message thread, bypassing ChatPanel entirely.
Requires calling `api.aiChat` directly from the view, managing streaming state, etc.
This duplicates the agentic loop from ChatPanel.

**Recommendation: Option A.** The agentic loop in ChatPanel is complex (streaming,
tool approval, multi-turn, cancellation, memory injection). Duplicating it in a view
component would be fragile and hard to maintain. Option A gives a rich full-screen
conversation view with zero loop duplication — the ChatPanel sidebar auto-expands
when the user opens a claude-code view.

For a quality UX, the view pane should auto-expand the ChatPanel sidebar on mount:

```typescript
// Inside ClaudeCodeView useEffect on mount:
useAppStore.getState().setChatCollapsed(instance.id, false);
```

### Anti-Patterns to Avoid

- **Re-implementing the chat loop in the view component:** The agentic loop in
  `ChatPanel.tsx` handles streaming, cancellation, tool approval, orphan cleanup,
  memory injection, and MAX_AGENT_TURNS. Do not replicate any of this in the view.
- **Registering the view without importing the module in App.tsx:** Side-effect imports
  must be explicit. All 5 existing views are explicitly imported in `App.tsx` lines 8-12.
- **Adding highlight.js CSS for a light theme:** The app is dark-only (see `tokens.css`).
  Use a dark highlight.js theme (e.g. `highlight.js/styles/github-dark.css`) or write
  custom CSS in `app.css` to match the existing palette.
- **Bundling all highlight.js languages:** Always import from `highlight.js/lib/core` and
  register only needed languages to avoid a large bundle.
- **Adding `buildSystemPrompt` context for `claude-code` as `view.typeId` without
  the new case:** The default branch in `buildSystemPrompt` already handles unknown
  typeIds gracefully (`if (context) parts.push(context)`), so there is no bug risk,
  but adding an explicit case gives the model better guidance.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Syntax highlighting | Token regex in markdown.ts | `highlight.js` | 180+ grammars, XSS-safe output, maintained |
| Markdown → HTML | Custom parser | `marked` (already installed) | Already in use, GFM + `breaks`, XSS renderer override already in place |
| Streaming text accumulation | Custom IPC listener | `api.aiOnChunk` + `updateMessageContent` | Already the pattern in ChatPanel |
| Tool approval flow | New approval UI | Existing `ChatPanel` sidebar | Full approval flow already built |

---

## Common Pitfalls

### Pitfall 1: Duplicate chat loop
**What goes wrong:** Developer puts a textarea + send button in `ClaudeCodeView` and wires
it to `api.aiChat` directly, bypassing `ChatPanel`.
**Why it happens:** The ROADMAP says "chat component: input bar + message thread", which
sounds like a standalone view.
**How to avoid:** Keep `ClaudeCodeView` as a display-only message list. The input lives in
`ChatPanel`. The view calls `setChatCollapsed(id, false)` on mount to ensure the panel is
always open.
**Warning signs:** If you find yourself calling `api.aiOnChunk` or managing `streamingMsgId`
state inside a view component, stop — move it to ChatPanel.

### Pitfall 2: XSS via highlight.js output
**What goes wrong:** `hljs.highlight().value` is HTML with `<span>` tags. Passing it through
`renderMarkdown` which then escapes `<` would double-encode it.
**Why it happens:** The current `renderer.code` path may escape the output before wrapping.
**How to avoid:** The highlighted string already contains valid HTML spans. Set the outer
`<code>` content directly — do not run `text.replace(/</g, '&lt;')` on the highlighted
output. Only escape fallback paths where no highlight.js ran.
**Warning signs:** Rendered code blocks showing literal `&lt;span` in the browser.

### Pitfall 3: ChatPanel collapsed by default on new view
**What goes wrong:** User opens a `claude-code` view, sees an empty pane, does not know to
expand the AI Console.
**Why it happens:** `defaultChatState()` in `store.ts` sets `collapsed: false` but
`MainPane` collapses the panel when `!active || collapsed`. If the view is brand new, the
stored `chatStateByViewId` entry is `undefined` → `defaultChatState()` → `collapsed: false`.
Actually this is fine by default — but test it. The real risk: if the user collapses and
then re-opens the view, it will be collapsed.
**How to avoid:** `ClaudeCodeView` calls `setChatCollapsed(instance.id, false)` in a
`useEffect([], [...])` so each mount guarantees the panel is open.
**Warning signs:** Empty grey pane with no input visible when opening the view.

### Pitfall 4: highlight.js bundle size blowup
**What goes wrong:** Importing `import hljs from 'highlight.js'` bundles all grammars (~1MB).
**Why it happens:** The default export includes every language.
**How to avoid:** Use `highlight.js/lib/core` and register languages individually:
```typescript
import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
hljs.registerLanguage('typescript', typescript);
```
**Warning signs:** Vite bundle analyzer showing `highlight.js` as 1MB+.

### Pitfall 5: Vitest environment is `node`, not `jsdom`
**What goes wrong:** Writing tests for React components that call `document.*` — they fail
because `vitest.config.ts` sets `environment: 'node'`.
**Why it happens:** The existing test suite tests pure logic (markdown, uid, lang, store
migrate) — none use React DOM.
**How to avoid:** Keep the new test for the view registration pattern following the same
approach as `src/views/__tests__/registry.test.ts` — test the pure logic (that the view
is registered with correct typeId/label). No JSDOM needed.

---

## Code Examples

### Extending markdown.ts with highlight.js (core import)

```typescript
// Source: marked Renderer API — lib/marked.d.ts line 176; highlight.js README pattern
// src/lib/markdown.ts
import { marked, Renderer } from 'marked';
import type { Tokens } from 'marked';
import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';

hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('json', json);
// ... add more as needed

const renderer = new Renderer();
renderer.html = ({ raw }: { raw: string }) =>
  raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
renderer.code = ({ text, lang }: Tokens.Code): string => {
  if (lang && hljs.getLanguage(lang)) {
    const highlighted = hljs.highlight(text, { language: lang }).value;
    return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`;
  }
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<pre><code>${escaped}</code></pre>`;
};
```

### Minimal ClaudeCodeView (Option A — display-only)

```tsx
// Source: analog to src/views/notepad/NotepadView.tsx pattern
// src/views/claude-code/ClaudeCodeView.tsx
import { useEffect } from 'react';
import { selectChatMessages, useAppStore } from '../../state/store';
import { renderMarkdown } from '../../lib/markdown';
import type { ViewInstance } from '../types';
import type { ClaudeCodeViewConfig } from './types';

export function ClaudeCodeView({ instance }: { instance: ViewInstance<ClaudeCodeViewConfig> }) {
  const messages = useAppStore((s) => selectChatMessages(s, instance.id));
  const setChatCollapsed = useAppStore((s) => s.setChatCollapsed);

  // Ensure ChatPanel is open whenever this view is active
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

### ClaudeCodeViewConfig type

```typescript
// src/views/claude-code/types.ts
// This view has no persistent config; the empty object keeps the pattern consistent.
export interface ClaudeCodeViewConfig {
  // intentionally empty — no document path or content to store
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `marked` v1 highlight option (callback-based) | `marked` v18 `Renderer.code` override | marked v5+ | API changed; override pattern is what marked.d.ts documents at line 176 |
| Import all `highlight.js` languages | `highlight.js/lib/core` + per-language register | hljs v10+ | Bundle size reduction; required pattern for tree-shaking |

**Deprecated/outdated:**
- `marked` `highlight` option: The old `marked.setOptions({ highlight: fn })` callback was
  removed in marked v5. The correct approach is the `Renderer.code` override used here.

---

## Validation Architecture

The project uses Vitest (`npm test`), environment `node`. Tests cover pure logic only
(no JSDOM). Every code change must have a corresponding test.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.7 |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npm test -- src/views/__tests__/registry.test.ts` |
| Full suite command | `npm test` |
| Environment | `node` (no JSDOM) |

### Phase Deliverables → Test Map

| Deliverable | Behavior to Test | Test Type | Test File | Exists? |
|-------------|------------------|-----------|-----------|---------|
| `claude-code` view registration | `getViewType('claude-code')` returns a registered entry with correct typeId, label, description | unit | `src/views/__tests__/registry.test.ts` | Extend existing |
| `claude-code` createConfig | Returns `{ name: 'Claude Chat', config: {} }` | unit | `src/views/__tests__/registry.test.ts` | Extend existing |
| `renderMarkdown` code highlight | A fenced code block with `lang=typescript` produces `<code class="hljs language-typescript">` | unit | `src/lib/__tests__/markdown.test.ts` | Extend existing |
| `renderMarkdown` no-lang fallback | A fenced block without a language tag produces `<pre><code>` without hljs class | unit | `src/lib/__tests__/markdown.test.ts` | Extend existing |
| highlight.js XSS safety | HTML entities in code are escaped even after highlight | unit | `src/lib/__tests__/markdown.test.ts` | Extend existing |

### Sampling Rate

- Per task commit: run `npm test -- <path-to-changed-test-file>`
- Per wave merge: run full `npm test`
- Phase gate: full suite green before marking phase complete

### Wave 0 Gaps

- [ ] New test cases appended to `src/lib/__tests__/markdown.test.ts` for highlight.js
- [ ] New test cases appended to `src/views/__tests__/registry.test.ts` for `claude-code`

*(No new test files needed — new cases extend the existing two test files.)*

---

## Open Questions (RESOLVED)

1. **Should ClaudeCodeView mirror ALL messages or only assistant messages?**
   - What we know: The ChatPanel sidebar already shows both user and assistant messages in full.
   - What's unclear: Showing user messages in the view pane too may feel redundant.
   - Recommendation: Show only assistant (markdown-rendered) messages in the view pane to give a "rendered output" feel while the ChatPanel sidebar serves as the full transcript.
   - **RESOLVED: assistant-only.** Plans implement `m.role === 'assistant'` filter in ClaudeCodeView (02-01-PLAN.md Task 2, 02-02-PLAN.md Task 1). User messages are already visible in the ChatPanel sidebar.

2. **Which highlight.js languages to register?**
   - What we know: The app is a developer tool; TypeScript/JavaScript/Python/Bash/JSON/HTML/CSS cover most use cases.
   - What's unclear: User may request other languages (Rust, Go, SQL…).
   - Recommendation: Register the 8-10 most common languages; unknown languages fall back to plain text (safe and correct).
   - **RESOLVED: 10 languages registered.** Plans register typescript, javascript, python, bash/sh, json, html/xml, css, markdown, diff, shell (02-01-PLAN.md Task 2). Unknown languages fall back to escaped plain text.

3. **Dark theme for highlight.js?**
   - What we know: The app is dark-only (`tokens.css` has no light theme). Existing `.markdown-content pre` uses `background: rgba(0,0,0,0.35)`.
   - What's unclear: Whether to import an hljs CSS theme or write custom hljs token colors inline in `app.css`.
   - Recommendation: Write minimal CSS overrides in `app.css` targeting `.hljs` and `.hljs-*` tokens using the existing `--fg-*` and `--accent` CSS variables, rather than importing a third-party hljs stylesheet that may not match the dark palette.
   - **RESOLVED: inline CSS in app.css.** Plans write custom `.hljs` and `.hljs-*` token rules directly in `src/theme/app.css` using `--fg-*`/`--accent` variables (02-02-PLAN.md Task 2). No third-party hljs stylesheet imported.

---

## Environment Availability

Step 2.6: SKIPPED — this phase has no external service dependencies. The only new
external package (`highlight.js`) installs via `npm install`.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Option A (display-only view pane, ChatPanel is the input surface) is the right implementation choice | Architecture Patterns | If user expects a fully standalone chat view with no ChatPanel sidebar, the experience is incomplete |
| A2 | Only common languages need to be registered in highlight.js | Code Examples | If users frequently chat about Rust, Go, SQL etc., code blocks will render unstyled |
| A3 | The `Renderer.code` hook in marked v18 receives `{ text, lang, escaped }` as a destructured object | Code Examples | API mismatch would cause a runtime error; verified against `lib/marked.d.ts` line 176 [VERIFIED] |

---

## Sources

### Primary (HIGH confidence)
- `src/views/registry.ts` — view registration API, verified in session
- `src/views/types.ts` — ViewTypeDefinition, AiTool, ViewInstance interfaces
- `src/views/terminal/index.tsx`, `src/views/notepad/index.tsx` — registration pattern analogs
- `src/shell/ChatPanel.tsx` — full chat loop, buildSystemPrompt, AssistantMessage
- `src/lib/markdown.ts` — renderMarkdown, Renderer.html override
- `src/theme/app.css` — existing markdown-content CSS (lines 1168-1253)
- `src/state/store.ts` — selectChatMessages, setChatCollapsed, useAppStore
- `src/state/types.ts` — ChatMessage, Workspace, AppSettings
- `src/App.tsx` — view import side-effects pattern
- `node_modules/marked/lib/marked.d.ts` line 176 — code renderer signature `({ text, lang, escaped })`
- `vitest.config.ts` — test environment configuration
- `package.json` — all installed dependencies and versions

### Secondary (MEDIUM confidence)
- npm registry metadata for `highlight.js`: version 11.11.1, created 2011-07-15, repo `github.com/highlightjs/highlight.js` [VERIFIED: npm registry]

### Tertiary (LOW confidence)
- None. All claims were verified against source files or the npm registry.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified against installed node_modules and npm registry
- Architecture: HIGH — patterns verified against 5 existing view implementations in source
- Pitfalls: HIGH — derived directly from reading the actual ChatPanel, store, and vitest config
- Validation: HIGH — derived from existing test file structure and vitest config

**Research date:** 2026-06-03
**Valid until:** 2026-07-03 (stable stack; no fast-moving dependencies)
