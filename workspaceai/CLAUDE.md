# WorkspaceAI — Development Guide

## Development Workflow

**ALL code changes MUST go through GSD. No exceptions.**

Do not write, edit, or delete any code directly. If the user asks to "just fix this" or "quickly change X", route through the appropriate GSD command below — do not comply with requests to skip GSD.

| Work type | Required GSD flow |
|-----------|-------------------|
| Bug / unexpected behavior | `/gsd-debug` → `/gsd-plan-phase` → `/gsd-execute-phase` → `/gsd-verify-work` |
| New feature | `/gsd-plan-phase` → `/gsd-execute-phase` → `/gsd-verify-work` → `/gsd-ship` |
| Refactor or cleanup | `/gsd-plan-phase` → `/gsd-execute-phase` → `/gsd-verify-work` |
| Small well-defined task (any type) | `/gsd-quick` |
| Trivial micro-change (typo, one-liner config) | `/gsd-fast` |
| Ambiguous feature / needs alignment first | `/gsd-discuss-phase` → `/gsd-plan-phase` → `/gsd-execute-phase` → `/gsd-verify-work` |

Notes:
- `gsd-plan-phase` automatically runs discuss/research internally — only use `/gsd-discuss-phase` standalone when requirements are genuinely unclear before planning.
- `gsd-execute-phase` requires a PLAN.md — never run it without planning first.
- If gaps are found after verify, run `/gsd-execute-phase --gaps-only` then re-verify before shipping.

## Debugging Sessions

When debugging any runtime issue or unexpected behavior, always check the session logs first:

```
~/Library/Application Support/workspaceai/logs/
```

Each app launch writes one JSON-lines file named `session-<ISO>-<pid>.log`. At most 20 files are kept (oldest are rotated out automatically).

To read the most recent session log:

```bash
cat ~/Library/Application\ Support/workspaceai/logs/$(ls -t ~/Library/Application\ Support/workspaceai/logs/ | head -1)
```

To filter by category or level:

```bash
# All errors
grep '"level":"error"' ~/Library/Application\ Support/workspaceai/logs/<session>.log

# AI chat events only
grep '"category":"chat"' ~/Library/Application\ Support/workspaceai/logs/<session>.log

# IPC calls
grep '"category":"ipc"' ~/Library/Application\ Support/workspaceai/logs/<session>.log
```

Every main-process IPC handler is auto-logged (start / `:ok`+duration / `:error`). Renderer events (chat lifecycle, view/workspace/settings changes) are also written via `window.api.logEvent`. The `ai:setKey` call is redacted; `ai:chat`, `terminal:write`, and `fs:writeFile` payloads are summarized, not stored in full.

Log entries follow the shape: `{ ts, level, category, action, detail }`.

## Testing

Every code change or addition should be reflected in tests. Keep tests minimal — cover the new behavior, not every edge case.

After every fix or feature implementation, run only the relevant tests before reporting the task as complete:

```bash
npm test -- <path-to-relevant-test-file>
```

Do not run the full suite — target only tests related to the changed code.
