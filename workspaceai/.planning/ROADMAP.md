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

**Plans:** 2 plans

**Wave 1**

- [ ] 02-01-PLAN.md — Install highlight.js + extend renderMarkdown with syntax-highlighted code blocks

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 02-02-PLAN.md — Scaffold the `claude-code` view type and wire it into the app

**Status:** Planned

## Phase 03: Workspace Homepage and Async WhatsApp Claude Agent

**Goal:** Add a workspace homepage/dashboard and a persistent background Claude agent that listens for incoming WhatsApp messages and processes them as workspace requests.

**Scope:**

- Homepage view shown when no specific view is active — surfaces recent sessions, pinned agents, quick actions
- Persistent async Claude agent connecting to WhatsApp (via whatsapp-web.js, Baileys, or Meta Cloud API)
- Agent listens for incoming messages on a configured account, routes each as a workspace request to the Claude AI loop, replies back to the WhatsApp thread
- Agent lifecycle managed by the main process (start/stop/restart) with status surfaced on the homepage

**Plans:** 5 plans

**Wave 1**

- [ ] 03-01-PLAN.md — Verify `@whiskeysockets/baileys` package legitimacy (blocking checkpoint)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 03-02-PLAN.md — Install Baileys, add shared WhatsApp types, create failing test scaffolds

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 03-03-PLAN.md — Build the WhatsApp Baileys service (`electron/ipc/whatsapp.ts`), drive WA-01/02/03 Green
- [ ] 03-04-PLAN.md — `whatsappAgentStatus` store slice + HomepageView component, drive HP-01/02/03 Green

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 03-05-PLAN.md — Wire it together: preload bridge, typed IPC client, handler registration, dispose hooks, MainPane render swap

**Status:** Planned

## Phase 05: Terminal Session Reconnect Across Page Reloads

**Goal:** Preserve pty processes across Vite full page reloads in dev mode — renderer reconnects to the existing shell session instead of spawning a new one and orphaning the old process.

**Scope:**

- Main process keeps a `viewId → {termId, pty, outputBuffer}` registry in `terminal.ts`
- New `terminal:reconnect` IPC handler: returns existing `termId` + buffered output for a given `viewId`, or `null` if none
- `terminal:create` registers the new pty under the `viewId` key
- `terminal:kill` removes both the `termId` and `viewId` entries
- `sessionCache.ts` calls `terminalReconnect(instanceId)` before spawning a new pty — attaches to the live process and replays buffered output if one exists
- Scrollback buffer capped at a configurable size (default 50 KB) in the main process
- Orphaned pty cleanup: when `terminal:reconnect` is called for a `viewId` that has a dead pty (exited), the entry is removed and `null` is returned
- No change to production build behavior — reconnect is a dev-mode concern but the code path is always present

**Requirements:** TERM-01, TERM-02, TERM-03, TERM-04

**Plans:** 2 plans

Plans:

- [ ] 05-01-PLAN.md — Main-process viewId registry, viewId-aware create, `terminal:reconnect` handler, 50 KB buffer cap, preload + typed-client plumbing
- [ ] 05-02-PLAN.md — Renderer reconnect-before-create: `attachSession` orchestrator + tests, `getOrCreateSession` wiring

**Status:** Pending

## Phase 04: Code Quality Pass and README Update

**Goal:** Remove dead code, enforce consistent patterns, and update README and docs to accurately reflect the current state of the app.

**Scope:**

- Lint pass: fix all warnings/errors, remove dead code and unused imports
- Consistent naming and patterns across the codebase
- Targeted comments only where the WHY is non-obvious
- README update: project description, feature list, setup/install instructions, dev workflow (run/test/build), architecture overview (view system, IPC model, AI integration)
- Review CLAUDE.md and any other inline docs for accuracy

**Plans:** 3 plans

**Wave 1**

- [ ] 04-01-PLAN.md — Fix TS errors, remove dead code, extract shared MODEL_OPTIONS, rename dialog label
- [ ] 04-02-PLAN.md — Replace `console.*` calls with structured `log()` routed to the session log

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 04-03-PLAN.md — Rewrite README for Orbit + fix the CLAUDE.md log-field inaccuracy

**Status:** Planned
