# WorkspaceAI — Roadmap

## Phase 01: Workspace-Level Memory for Claude

**Goal:** Add persistent, per-workspace memory that Claude can read and write across chat sessions — letting it remember user preferences, project context, and decisions scoped to each workspace.

**Scope:**
- New `memory:*` IPC handlers for reading and writing memory files
- `read_memory(topic)` and `write_memory(name, description, type, content)` AI tools available in all view types
- Tiny index (`MEMORY.md` content) injected into every system prompt via `buildSystemPrompt()`
- Memory stored in `{workspace.homeFolder}/memory/` using `MEMORY.md` + per-entry `.md` files
- Same schema as `~/.claude` memory (YAML frontmatter: name, description, type)
- `write_memory` uses always-allow behavior (no per-call approval prompt)
- Fallback handling when `homeFolder` is unset

**Requirements:** MEM-01, MEM-02, MEM-03, MEM-04, MEM-05, MEM-06, MEM-07

**Plans:** 3 plans

Plans:
- [ ] 01-01-PLAN.md — Pure memory helpers + `memory:*` IPC handlers + registry wiring
- [ ] 01-02-PLAN.md — homeFolder root-registration gap fix (seedRootsFromState + setActiveHomeFolder)
- [ ] 01-03-PLAN.md — Bridge plumbing + `AiTool.alwaysAllow` + ChatPanel global tools, index injection, dispatch

**Status:** Pending

## Phase 02: Claude Code Chat View with Markdown Renderer

**Goal:** Add a dedicated chat view type that renders Claude responses as rich markdown/HTML with syntax-highlighted code blocks — no terminal required.

**Scope:**
- New `claude-code` view type registered alongside existing view types
- Chat component: input bar (textarea + send button) + message thread with user/assistant bubbles
- Assistant responses rendered as markdown (or raw HTML) with code block syntax highlighting
- Wired to the existing `ai:chat` IPC — reuse the same Claude backend, new output surface only
- No terminal spawned or shown for this view type

**Status:** Pending

## Phase 03: Workspace Homepage and Async WhatsApp Claude Agent

**Goal:** Add a workspace homepage/dashboard and a persistent background Claude agent that listens for incoming WhatsApp messages and processes them as workspace requests.

**Scope:**
- Homepage view shown when no specific view is active — surfaces recent sessions, pinned agents, quick actions
- Persistent async Claude agent connecting to WhatsApp (via whatsapp-web.js, Baileys, or Meta Cloud API)
- Agent listens for incoming messages on a configured account, routes each as a workspace request to the Claude AI loop, replies back to the WhatsApp thread
- Agent lifecycle managed by the main process (start/stop/restart) with status surfaced on the homepage

**Status:** Pending

## Phase 04: Code Quality Pass and README Update

**Goal:** Remove dead code, enforce consistent patterns, and update README and docs to accurately reflect the current state of the app.

**Scope:**
- Lint pass: fix all warnings/errors, remove dead code and unused imports
- Consistent naming and patterns across the codebase
- Targeted comments only where the WHY is non-obvious
- README update: project description, feature list, setup/install instructions, dev workflow (run/test/build), architecture overview (view system, IPC model, AI integration)
- Review CLAUDE.md and any other inline docs for accuracy

**Status:** Pending
