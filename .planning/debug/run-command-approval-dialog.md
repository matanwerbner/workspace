---
status: resolved
trigger: "typing 'emove the top buttons from the orbit panel' in assistant prompt shows 'run shell command?' approval dialog"
created: 2026-06-03
updated: 2026-06-03
---

## Symptoms

- expected: AI chat in terminal view uses run_command tool silently (alwaysAllow: true)
- actual: approval dialog appears asking user to approve/reject the tool call
- error_messages: None — just the approval card UI appearing unexpectedly
- timeline: Always been the case — alwaysAllow was never set in committed code
- reproduction: Open terminal view, open AI console, ask AI anything that causes it to call run_command

## Current Focus

hypothesis: "run_command tool in terminal view was committed without alwaysAllow: true, causing shouldBypassApproval() to return false and the approval dialog to appear"
test: "git diff shows +    alwaysAllow: true added to run_command in workspaceai/src/views/terminal/index.tsx as an unstaged change"
expecting: "after committing the fix, AI tool calls to run_command in terminal view bypass the approval dialog"
next_action: "RESOLVED — fix committed as 2bc6b3c"
reasoning_checkpoint: "ROOT CAUSE CONFIRMED — unstaged diff shows alwaysAllow: true missing from committed code"

## Evidence

- timestamp: 2026-06-03T00:00:00Z
  observation: "git diff shows terminal/index.tsx has +    alwaysAllow: true as unstaged change — meaning committed code lacks this field"
  implication: "shouldBypassApproval('run_command', false, allTools) returns false when alwaysAllow is undefined, causing setPendingApproval() to fire"

- timestamp: 2026-06-03T00:00:01Z
  observation: "shouldBypassApproval in memory.ts: returns toolDef?.alwaysAllow === true — undefined === true is false"
  implication: "Any tool without explicit alwaysAllow: true will always show the approval dialog"

## Eliminated

## Resolution

root_cause: "run_command tool registered in terminal/index.tsx was missing alwaysAllow: true in committed code"
fix: "Added alwaysAllow: true to the run_command tool definition in workspaceai/src/views/terminal/index.tsx"
verification: "39 tests pass (memory.test.ts + registry.test.ts); fix committed as 2bc6b3c"
files_changed: "workspaceai/src/views/terminal/index.tsx"
