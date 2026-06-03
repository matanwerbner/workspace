# Phase 3: Workspace Homepage and Async WhatsApp Claude Agent — Research

**Researched:** 2026-06-03
**Domain:** Electron renderer view system + main-process background service + WhatsApp Node.js integration
**Confidence:** HIGH (codebase), MEDIUM (WhatsApp library tradeoffs)

---

## Summary

Phase 3 has two loosely coupled deliverables. The **homepage** is a pure renderer concern: replace the current "No view selected" placeholder in `MainPane.tsx` with a purpose-built `HomepageView` React component. It does not need a new view type registered in the registry — the homepage is a workspace-level concept (shown when `activeViewId === null`), not a user-created view. The component reads from the existing Zustand store (recent views, workspace name) and surfaces WhatsApp agent status via new IPC events pushed from the main process.

The **WhatsApp agent** is a main-process background service that runs independently of any renderer view. It connects to WhatsApp, receives messages, drives the existing `ai:chat` IPC handler directly (reusing the same Anthropic streaming loop in `electron/ipc/ai.ts`), and pushes status/reply-receipt events back to the renderer via `BrowserWindow.getAllWindows()[0]?.webContents.send(...)`. Agent lifecycle (start/stop/restart) is exposed through new IPC handlers registered in a new file `electron/ipc/whatsapp.ts`.

The critical architectural question is the WhatsApp library choice. `whatsapp-web.js` (v1.34.7) uses **Puppeteer** (v24.x) which downloads and runs a separate headless Chromium process — this conflicts badly with the Electron environment (two competing Chromium runtimes, memory overhead, `node-pty` rebuild, and Puppeteer's postinstall that downloads a binary). `@whiskeysockets/baileys` (v6.7.x stable; v7.0.0-rc13 pre-release) uses a **pure WebSocket** approach with no browser dependency, making it far more suitable for an Electron main process.

**Primary recommendation:** Use `@whiskeysockets/baileys` v6.7.x (stable tag) for the WhatsApp integration. Implement the homepage as a conditional render branch inside `MainPane.tsx` rather than a registered view type.

---

## Project Constraints (from CLAUDE.md)

- All changes must be reflected in tests (keep them minimal — new behavior only).
- Run only relevant tests after each change: `npm test -- <path-to-relevant-test-file>`.
- Debugging uses session logs at `~/Library/Application Support/workspaceai/logs/`.
- Do not implement directly — use GSD to plan and track.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Homepage dashboard UI | Browser (Renderer) | — | Pure React component, no server needed |
| WhatsApp connection & polling | Main Process | — | Needs Node.js WebSocket, not available in sandboxed renderer |
| WhatsApp session auth state | Main Process (fs) | — | Session files must persist between app restarts |
| Routing WhatsApp → Claude | Main Process | — | Direct call into `makeClient()` / `ai:chat` handler logic |
| Agent status display | Browser (Renderer) | — | Receives push events via preload bridge |
| Agent lifecycle control (start/stop) | Main Process (IPC) | Renderer UI trigger | Renderer invokes IPC; main process owns the service |
| Reply sending | Main Process | — | Baileys `sock.sendMessage()` in main process only |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---|---|---|---|
| `@whiskeysockets/baileys` | `6.7.x` | WhatsApp Web WebSocket client | No Puppeteer dependency; pure Node.js WebSockets; actively maintained (last release May 2026) [ASSUMED: stable channel — 6.7.x vs 7.0.0-rc13 selection needs confirmation] |
| React + Zustand | existing | Homepage UI + state | Already in codebase |
| `electron` IPC (ipcMain / webContents.send) | existing | Agent lifecycle + status push | Existing push pattern in `terminal.ts`, `ai.ts` |

### Supporting

| Library | Version | Purpose | When to Use |
|---|---|---|---|
| `@anthropic-ai/sdk` | existing (`^0.27.0`) | Drive Claude turns inside the WhatsApp handler | Reuse `makeClient()` from `electron/ipc/ai.ts` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| `@whiskeysockets/baileys` | `whatsapp-web.js` v1.34.7 | wwebjs uses Puppeteer which downloads a separate Chromium; conflicts with Electron, large binary, memory overhead — avoid |
| `@whiskeysockets/baileys` | Meta Cloud API (official) | Cloud API requires a verified Facebook Business Account and a registered phone number through Meta — requires user configuration outside the app; suitable for production deployments but high setup friction |
| Inline render in `MainPane.tsx` | New registered view type | A registered view type would appear in "Add view" list, be closeable, need a `createConfig`, and carry unnecessary per-instance overhead. The homepage is workspace-level, not user-created. |

### Installation (when executing)

```bash
npm install @whiskeysockets/baileys
```

No native rebuild required (no native addons in baileys 6.x).

---

## Package Legitimacy Audit

*slopcheck was unavailable at research time — all packages below are tagged [ASSUMED] and the planner must gate each install behind a `checkpoint:human-verify` task.*

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---|---|---|---|---|---|---|
| `@whiskeysockets/baileys` | npm | ~3 yrs | N/A checked | github.com/WhiskeySockets/Baileys | [ASSUMED] | Flagged — planner must add checkpoint:human-verify before install |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `@whiskeysockets/baileys` — [ASSUMED]; see checkpoint note above.

*If slopcheck was unavailable at research time, all packages above are tagged `[ASSUMED]` and the planner must gate each install behind a `checkpoint:human-verify` task.*

---

## Architecture Patterns

### System Architecture Diagram

```
[Renderer: HomepageView]
    |-- reads: Zustand store (workspaces, activeViewId, views[])
    |-- reads: whatsapp agent status (from store slice, seeded by IPC push)
    |-- invokes: whatsapp:start / whatsapp:stop (IPC invoke → main)
    |-- listens: 'whatsapp:status' push events from main via preload bridge

[MainPane.tsx]
    |-- when activeViewId === null → render <HomepageView />
    |-- when activeViewId !== null → existing view layer logic (unchanged)

[Main Process: electron/ipc/whatsapp.ts]
    |-- WhatsApp service state (singleton: socket, status, qrCode)
    |-- whatsapp:start → connect Baileys, emit QR/status events
    |-- whatsapp:stop  → graceful disconnect
    |-- whatsapp:getStatus → returns { status, qrCode? }
    |-- on incomingMessage:
          → call runAgentTurn(messageText, conversationId)
          → BrowserWindow.getAllWindows()[0].webContents.send('whatsapp:message', ...)
    |-- runAgentTurn():
          → direct Anthropic client.messages.stream() (reuse makeClient() pattern)
          → on reply: sock.sendMessage(jid, { text: reply })
          → push 'whatsapp:reply' event to renderer

[electron/ipc/index.ts]
    |-- registerWhatsAppHandlers() added to withLogging() block
    |-- 'whatsapp:status' push channel registered outside withLogging
         (same pattern as 'shell:openSettings' and 'ai:chunk')

[electron/preload.ts]
    |-- whatsappStart() / whatsappStop() / whatsappGetStatus() invoke bridges
    |-- onWhatsAppStatus(cb) / offWhatsAppStatus(cb) push listeners
    |-- onWhatsAppMessage(cb) / offWhatsAppMessage(cb) push listeners

[electron/main.ts]
    |-- disposeWhatsApp() added to before-quit and window-all-closed handlers
         (same cleanup pattern as disposeTerminals / disposeCodeServers)
```

### Recommended Project Structure

```
electron/ipc/
├── ai.ts             (existing — reuse makeClient())
├── whatsapp.ts       (NEW — Baileys service + IPC handlers)
└── index.ts          (modified — register whatsapp handlers + push channels)

electron/preload.ts   (modified — add whatsapp IPC bridges)

src/ipc/client.ts     (modified — add whatsapp typed client methods)
src/shell/
├── MainPane.tsx      (modified — render HomepageView when !active)
└── HomepageView.tsx  (NEW — homepage dashboard component)
src/state/
├── types.ts          (modified — add WhatsAppAgentState to AppStore if persisted, or keep transient)
└── store.ts          (modified — add whatsapp agent status slice; not persisted)
src/shell/__tests__/
└── HomepageView.test.ts   (NEW)
electron/ipc/__tests__/    (if unit tests for whatsapp service are feasible without live WA)
```

### Pattern 1: Main-process push event (existing pattern)

**What:** Main process calls `BrowserWindow.getAllWindows()[0]?.webContents.send(channel, payload)` to push unsolicited events to the renderer.
**When to use:** Any time the main process has information the renderer needs but didn't request (status changes, incoming messages).
**Example (from `electron/main.ts:130`):**
```typescript
// Source: electron/main.ts
BrowserWindow.getAllWindows()[0]?.webContents.send('shell:openSettings');
```

The preload registers the listener:
```typescript
// Source: electron/preload.ts
ipcRenderer.on('shell:openSettings', cb);
```

The client bridge exposes it as `onOpenSettings(cb)` / `offOpenSettings(cb)`.

Apply the same pattern for `'whatsapp:status'` and `'whatsapp:message'` channels.

### Pattern 2: IPC handler registration (existing pattern)

**What:** New IPC domain is a single `register*Handlers()` function in a new file under `electron/ipc/`, then imported and called inside the `withLogging(() => { ... })` block in `electron/ipc/index.ts`.
**Example:** See `registerMemoryHandlers()` in `electron/ipc/memory.ts` and its import in `electron/ipc/index.ts`.

### Pattern 3: Homepage as conditional render (NOT a registered view type)

**What:** `MainPane.tsx` already renders a `<div className="placeholder">` when `active === null`. Replace the placeholder JSX with `<HomepageView />` which gets workspace state and agent status from the Zustand store.
**Why not a registered view type:** Registered types appear in "Add view" list, need `createConfig()`, and are per-user-created instances. The homepage is a single workspace-level screen.

### Pattern 4: Reuse makeClient() for the WhatsApp agent loop

The WhatsApp message handler in `electron/ipc/whatsapp.ts` calls `makeClient()` directly from `electron/ipc/ai.ts` (exported for this purpose). The agent loop is simpler than the renderer ChatPanel loop: single-turn, no streaming UI feedback, no tool calls in MVP.

```typescript
// electron/ipc/whatsapp.ts — sketch
import { makeClient } from './ai';

async function runAgentTurn(userText: string): Promise<string> {
  const client = makeClient();
  if (!client) return '(No API key configured)';
  const result = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: userText }],
  });
  const block = result.content.find((b) => b.type === 'text');
  return block?.type === 'text' ? block.text : '';
}
```

Note: `makeClient()` is currently not exported from `ai.ts` — it must be exported as part of this phase.

### Anti-Patterns to Avoid

- **Running Baileys in the renderer process:** Baileys requires Node.js modules (`ws`, crypto, `Buffer`) unavailable in the sandboxed renderer. The agent MUST run in the main process.
- **Registering the homepage as a view type:** Would pollute the "Add view" modal and add unnecessary complexity. Use the existing `active === null` branch in `MainPane.tsx`.
- **Storing Baileys session files inside `node_modules`:** Baileys auth state must be stored in a stable location, not inside the project directory. Use `app.getPath('userData')` or the active workspace `homeFolder`.
- **Tight coupling of WhatsApp conversation state to Zustand workspace state:** The agent maintains its own conversation history per WhatsApp JID in the main process map. Workspace Zustand state only receives display metadata (status, last message).
- **Streaming `ai:chunk` events for WhatsApp replies:** The ChatPanel streaming pattern uses `event.sender` which is the originating renderer. The WhatsApp agent has no originating sender — use `client.messages.create()` (non-streaming) and push the final reply to the renderer via `webContents.send`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| WhatsApp connection + auth | Custom WebSocket protocol to WA | `@whiskeysockets/baileys` | WA uses multi-device protocol with signal encryption — implementing from scratch is months of work |
| QR code pairing | Custom QR render logic | Baileys emits QR string; render with existing HTML/canvas in renderer | Baileys handles the WA auth handshake |
| Per-conversation history | Custom message buffer | `Map<jid, Anthropic.MessageParam[]>` in main process | Trivial given single-user scope |

---

## Common Pitfalls

### Pitfall 1: whatsapp-web.js Puppeteer conflicts with Electron

**What goes wrong:** `whatsapp-web.js` depends on `puppeteer` v24 which downloads a separate Chromium binary (~300 MB) and spawns it as a child process. Electron already bundles Chromium; running two simultaneous Chromium instances causes resource conflicts and may fail on macOS sandboxing.
**Why it happens:** `whatsapp-web.js` was designed for standalone Node.js scripts, not embedded environments.
**How to avoid:** Use `@whiskeysockets/baileys` which is pure WebSocket — no browser download, no subprocess.

### Pitfall 2: Baileys auth state location

**What goes wrong:** If Baileys auth state is stored inside the project's working directory, Vite's file watcher triggers hot-reloads on every message.
**Why it happens:** Electron-vite watches the source tree; Baileys writes auth files frequently.
**How to avoid:** Store Baileys auth in `app.getPath('userData')/whatsapp-auth/` or in `{workspace.homeFolder}/whatsapp-auth/`.

### Pitfall 3: makeClient() not exported

**What goes wrong:** `makeClient()` in `electron/ipc/ai.ts` is currently a module-private function. The WhatsApp handler needs it to create an Anthropic client without duplicating key-resolution logic.
**How to avoid:** Export `makeClient()` in the same plan that creates `whatsapp.ts`.

### Pitfall 4: Agent cleanup on app quit

**What goes wrong:** If the Baileys WebSocket connection is not closed on app quit, the process may hang waiting for WebSocket to drain.
**How to avoid:** Add `disposeWhatsApp()` call in `main.ts`'s `before-quit` and `window-all-closed` handlers — exactly as done for `disposeTerminals()` and `disposeCodeServers()`.

### Pitfall 5: CSP blocks WhatsApp push notification images

**What goes wrong:** WhatsApp messages can include media (images). If the renderer tries to render these, the current `img-src 'self' data: blob: doc:` CSP will block external WA CDN URLs.
**How to avoid:** For MVP, surface only text messages. Media handling (downloading via main process, serving via `doc:` protocol) is out of scope for this phase.

### Pitfall 6: Baileys 7.0.0-rc13 vs 6.7.x instability

**What goes wrong:** v7 RC has a `whatsapp-rust-bridge` native addon that requires compilation. It may not build cleanly with the app's existing `electron-rebuild` pipeline.
**How to avoid:** Pin to the `6.7.x` stable channel initially. The 6.x branch uses pure JS dependencies.

---

## Code Examples

### Registering a push-event channel in the preload (existing pattern)

```typescript
// Source: electron/preload.ts — existing pattern for 'shell:openSettings'
onOpenSettings: (cb: () => void): void => {
  ipcRenderer.on('shell:openSettings', cb);
},
offOpenSettings: (cb: () => void): void => {
  ipcRenderer.removeListener('shell:openSettings', cb);
},
```

Apply same pattern for `whatsapp:status` and `whatsapp:message`.

### Using IPC push from main (existing pattern)

```typescript
// Source: electron/main.ts:130
BrowserWindow.getAllWindows()[0]?.webContents.send('shell:openSettings');
```

For WhatsApp:
```typescript
// electron/ipc/whatsapp.ts
function pushStatus(payload: WhatsAppStatusEvent): void {
  BrowserWindow.getAllWindows()[0]?.webContents.send('whatsapp:status', payload);
}
```

### Registering handler in ipc/index.ts (existing pattern)

```typescript
// Source: electron/ipc/index.ts
withLogging(() => {
  // ...existing handlers...
  registerWhatsAppHandlers();   // NEW
});

// Outside withLogging (push channels, not invoke channels):
ipcMain.on('whatsapp:status', ...);  // No — this goes in preload only
```

### HomepageView render branch in MainPane (existing code to modify)

```typescript
// Source: src/shell/MainPane.tsx — line 81-85 (existing placeholder to replace)
{!active && (
  <div className="placeholder">
    <div className="placeholder-title">No view selected</div>
    ...
  </div>
)}
// Replace with:
{!active && <HomepageView />}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Baileys v5 (single-device) | Baileys v6 (multi-device, stable) | 2022 | Multi-device required by WA; v5 no longer works |
| wwebjs using stock Puppeteer | wwebjs using puppeteer-core + chrome-aws-lambda for serverless | Ongoing | Not relevant for Electron; still downloads Chromium |
| QR code pairing only | WA now supports phone-number-based pairing (`requestPairingCode`) | 2023 | Better UX: user can pair by entering code on WA app instead of scanning QR |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | `@whiskeysockets/baileys` v6.7.x is the correct stable pinning (not v7 RC) | Standard Stack | v7 may have breaking API changes; v6.7.x may have its own issues |
| A2 | Baileys 6.x has no native addons and does not require `electron-rebuild` | Standard Stack | If it does have native addons, build pipeline needs updating |
| A3 | Homepage should be a conditional render, not a registered view type | Architecture | If the product wants a pinnable/addable "home" view in the sidebar, this changes significantly |
| A4 | WhatsApp agent runs single-turn (no agentic tool loop) in MVP | Architecture | If tools are needed (read/write workspace files), the loop must be extended |
| A5 | Agent conversation history is per-JID Map in main process (not persisted across restarts) | Architecture | If restart-persistent conversation context is needed, a file-based store is required |

---

## Open Questions (RESOLVED)

1. **WhatsApp account type: personal vs Business API**
   - What we know: Baileys supports personal WhatsApp accounts (Web QR auth); Meta Cloud API supports registered business numbers.
   - What's unclear: Which the user intends.
   - Resolution: **Personal account (Baileys QR auth).** MVP uses Baileys QR pairing displayed in the homepage. Business API (Meta Cloud) is documented as a future option but is not built in this phase.

2. **Agent conversation scope: per-JID or per-workspace**
   - What we know: Different WhatsApp senders would otherwise share a single Claude context.
   - What's unclear: Whether the user wants each sender to have their own conversation history.
   - Resolution: **Per-JID conversation history.** Main process maintains a `Map<jid, MessageParam[]>` keyed by sender JID. History is capped at the last 20 turns per JID. History is not persisted across app restarts (in-memory only for MVP).

3. **Agent tools in WhatsApp context**
   - What we know: The ChatPanel supports full tool calling with approval prompts. The WhatsApp agent has no UI for approval.
   - What's unclear: Whether the user wants tools (file reads, memory writes) enabled for WhatsApp messages.
   - Resolution: **No tools in MVP.** WhatsApp agent runs single-turn text-only responses. Tool calling requires an approval UI that does not exist in this context; defer to a later phase. This is authoritative for Plan 03-03 — do NOT enable tool use in the agent loop.

4. **Homepage content scope**
   - What we know: ROADMAP says "recent sessions, pinned agents, quick actions".
   - What's unclear: "Pinned agents" is undefined — no agent concept exists yet.
   - Resolution: **MVP homepage shows: workspace name + last 3 views (from store) + WhatsApp agent status card.** "Pinned agents" and "quick actions" are deferred until an agent concept is defined. This is authoritative for Plan 03-04 — do NOT implement pinned agents or quick-action buttons.
---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node.js | Baileys / main process | ✓ | 26.2.0 | — |
| npm | Package install | ✓ | (installed) | — |
| Electron | App runtime | ✓ | 31.7.7 | — |
| WhatsApp account | QR auth pairing | user-provided | — | Warn in UI if not configured |
| Anthropic API key | Claude agent replies | user-configured | — | Return error message to WA sender |

**Missing dependencies with no fallback:**
- WhatsApp account (personal phone number) — user must pair during first use via QR code displayed on homepage.

**Missing dependencies with fallback:**
- Anthropic API key — if absent, agent replies with an error message to the WhatsApp sender instead of crashing.

---

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework | Vitest 4.x |
| Config file | `vitest.config.ts` (root) — `environment: 'node'`, `include: src/**/*.{test,spec}.ts` |
| Quick run command | `npm test -- src/shell/__tests__/HomepageView.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| HP-01 | `HomepageView` renders workspace name from store | unit | `npm test -- src/shell/__tests__/HomepageView.test.ts` | Wave 0 |
| HP-02 | `HomepageView` lists recent views (last 3) | unit | same | Wave 0 |
| HP-03 | `HomepageView` shows agent status from store | unit | same | Wave 0 |
| WA-01 | `whatsapp.ts` — `disposeWhatsApp` clears state cleanly | unit | `npm test -- electron/ipc/__tests__/whatsapp.test.ts` | Wave 0 |
| WA-02 | `whatsapp.ts` — agent conversation history is per-JID | unit | same | Wave 0 |
| WA-03 | `makeClient()` exported and reused (no key duplication) | unit | `npm test -- electron/ipc/__tests__/ai.test.ts` (or existing) | Wave 0 |
| ST-01 | Store: `whatsappAgentStatus` slice updates correctly | unit | `npm test -- src/state/__tests__/store.test.ts` | Existing file — add tests |
| BR-01 | Preload: `onWhatsAppStatus` / `offWhatsAppStatus` wiring | manual smoke | — | Manual — no node Electron env in vitest |

**Manual-only items with justification:**
- QR code display and pairing: requires live WhatsApp connection — cannot be automated in unit tests.
- End-to-end message round-trip (WA → Claude → WA reply): requires live credentials.
- Baileys WebSocket reconnect behavior: integration test, too heavy for vitest node environment.

### Sampling Rate

- **Per task commit:** Run the specific test file for that task.
- **Per wave merge:** `npm test` (full suite).
- **Phase gate:** Full suite green before marking phase complete.

### Wave 0 Gaps

- [ ] `src/shell/__tests__/HomepageView.test.ts` — covers HP-01, HP-02, HP-03 (new file, Wave 0 task)
- [ ] `electron/ipc/__tests__/whatsapp.test.ts` — covers WA-01, WA-02, WA-03 (new file, Wave 0 task)
- [ ] No vitest framework install needed — already present (`vitest ^4.1.7`)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | yes (WhatsApp pairing) | QR/pairingCode via Baileys; never store WA credentials in plaintext in app state |
| V3 Session Management | yes | Baileys auth state files stored in `userData` (not project dir); cleared on explicit disconnect |
| V4 Access Control | yes | WhatsApp agent replies ONLY to the JID that sent the message; no broadcasting |
| V5 Input Validation | yes | Incoming WA message text is passed verbatim to Claude — no shell execution, no file writes in MVP |
| V6 Cryptography | yes (Baileys handles) | Baileys uses libsignal for E2E encryption; app never handles raw signal keys |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| WhatsApp prompt injection via incoming message | Tampering | System prompt instructs agent not to follow instructions that override its role; no tool use in MVP |
| Auth state file exfiltration | Information Disclosure | Store in `app.getPath('userData')/whatsapp-auth/` — not in project dir or homeFolder where user code runs |
| Runaway agent loop | Denial of Service | Cap agent turns at 1 for MVP; rate-limit replies (e.g. 1 reply per 5 seconds per JID) |
| QR code interception | Spoofing | QR is displayed inside the Electron window only; never transmitted over network |

---

## Sources

### Primary (HIGH confidence)

- Codebase: `/Users/matanw/projects/workspace/workspaceai/electron/ipc/ai.ts` — `makeClient()`, streaming loop, `disposeStreams()`
- Codebase: `/Users/matanw/projects/workspace/workspaceai/electron/ipc/terminal.ts` — push event pattern, lifecycle dispose
- Codebase: `/Users/matanw/projects/workspace/workspaceai/electron/ipc/index.ts` — `withLogging` handler registration pattern
- Codebase: `/Users/matanw/projects/workspace/workspaceai/src/shell/MainPane.tsx` — `active === null` placeholder branch
- Codebase: `/Users/matanw/projects/workspace/workspaceai/electron/preload.ts` — push listener bridging pattern
- npm registry: `whatsapp-web.js@1.34.7` dependencies confirmed via `npm view` — puppeteer v24 dep confirmed
- npm registry: `@whiskeysockets/baileys@7.0.0-rc13` / `6.7.23` — confirmed via `npm view`; last publish May 2026

### Secondary (MEDIUM confidence)

- npm registry publish dates for both libraries cross-referenced (both actively maintained as of 2026-06).
- Baileys 6.x dependency list confirmed no native addons in listed top-level deps (`ws`, `pino`, `protobufjs` — all pure JS or pre-compiled).

### Tertiary (LOW confidence)

- [ASSUMED] Baileys 6.7.x has no `electron-rebuild` requirements — not verified by official Baileys docs for Electron specifically.
- [ASSUMED] Baileys 7.x `whatsapp-rust-bridge` requires native compilation — inferred from package name; not verified against Electron build docs.

---

## Metadata

**Confidence breakdown:**
- Codebase patterns (IPC, view registration, homepage slot): HIGH — read directly from source
- WhatsApp library selection: MEDIUM — npm registry verified, but Electron-specific integration untested
- Baileys API surface (socket events, sendMessage): ASSUMED — based on training knowledge of Baileys v6 API; should be confirmed against Baileys README during execution

**Research date:** 2026-06-03
**Valid until:** 2026-07-03 (stable tech; Baileys version pin should be re-checked at execution time)
