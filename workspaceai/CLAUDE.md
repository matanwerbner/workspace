# WorkspaceAI — Development Guide

## Development Workflow

Use GSD for all bug fixes, feature requests, and planning work:

- **Bug fix**: `/gsd-debug` to investigate, then `/gsd-execute-phase` to fix
- **Feature request**: `/gsd-plan-phase` to plan, then `/gsd-execute-phase` to implement
- **Planning**: `/gsd-discuss-phase` to align on approach before any implementation

Do not implement bug fixes or features directly — always go through GSD so work is tracked, planned, and verifiable.

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
