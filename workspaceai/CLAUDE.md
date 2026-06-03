# WorkspaceAI — Development Guide

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
