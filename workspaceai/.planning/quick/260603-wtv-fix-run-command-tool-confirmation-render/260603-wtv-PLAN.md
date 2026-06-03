---
phase: quick-260603-wtv
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - electron/ipc/terminal.ts
  - src/views/terminal/index.tsx
  - src/shell/toolDisplay.ts
  - src/shell/ChatPanel.tsx
  - src/shell/__tests__/toolDisplay.test.ts
autonomous: true
requirements: [QUICK-RUNCMD-RENDER]

must_haves:
  truths:
    - "run_command renders as a tool-call card showing the actual command, not a bare 'Run command' placeholder"
    - "No native OS dialog titled 'Run shell command?' appears when the AI invokes run_command"
    - "run_command approval happens via the in-app approval card (approve / reject / always allow)"
  artifacts:
    - path: "src/shell/toolDisplay.ts"
      provides: "Pure, testable tool-label/detail helpers (TOOL_LABELS, toolLabel, toolVerb, toolDetail) with run_command support"
      contains: "run_command"
    - path: "src/shell/__tests__/toolDisplay.test.ts"
      provides: "Unit tests for run_command label + command detail extraction"
    - path: "electron/ipc/terminal.ts"
      provides: "terminal:exec handler with the native confirmation dialog removed"
  key_links:
    - from: "src/shell/ChatPanel.tsx"
      to: "src/shell/toolDisplay.ts"
      via: "import of toolLabel/toolVerb/toolDetail"
      pattern: "from './toolDisplay'"
    - from: "src/views/terminal/index.tsx"
      to: "in-app approval (ChatPanel requestApproval)"
      via: "run_command tool WITHOUT alwaysAllow so the in-app card gates it"
      pattern: "name: 'run_command'"
---

<objective>
Fix two defects in the AI chat view's rendering of the `run_command` shell tool:

1. The `run_command` tool-call card shows a bare "Run command" / "Run command…" label with no command text, because `TOOL_LABELS` has no `run_command` entry and `toolDetail` does not surface the `command` field. It reads as empty placeholder text leaking into the message body.
2. A native OS dialog titled "Run shell command?" (Electron `dialog.showMessageBox` in `terminal:exec`) blocks every command. The expected approval surface is the existing in-app approval card, not a native dialog.

Purpose: Make AI-invoked shell commands render as proper, informative in-app tool-call cards and be approved through the in-app UI — eliminating the leaked placeholder text and the native blocking dialog.

Output: A new pure helper module `src/shell/toolDisplay.ts` (with `run_command` label + `command` detail support), ChatPanel rewired to import it, the native dialog removed from `terminal:exec`, `run_command` reverted to in-app approval (drop `alwaysAllow`), and a unit test covering the new label/detail behavior.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@src/shell/ChatPanel.tsx
@src/views/terminal/index.tsx
@electron/ipc/terminal.ts
@src/state/types.ts
@src/shell/memory.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extract testable tool-display helpers with run_command support</name>
  <files>src/shell/toolDisplay.ts, src/shell/ChatPanel.tsx, src/shell/__tests__/toolDisplay.test.ts</files>
  <behavior>
    - toolLabel('run_command') active returns "Running command…"; status 'done' returns "Ran command".
    - toolLabel for an unknown tool keeps the existing humanized fallback: 'append_to_note' active returns "Append to note…", done returns "Append to note".
    - toolVerb('run_command') returns "run a shell command".
    - toolDetail of an object with a command field returns that command trimmed. The existing path/file/query detail extraction still works. toolDetail with no recognizable field returns null.
  </behavior>
  <action>
    Create `src/shell/toolDisplay.ts` as a pure module (no React, no Electron, no node:* imports — mirror the constraint style of `src/shell/memory.ts`). Move the `TOOL_LABELS` record and the `toolLabel`, `toolVerb`, and `toolDetail` functions out of `ChatPanel.tsx` into this module and export them. Import the `ChatToolCall` type from `../state/types` for the `status` parameter type used by `toolLabel`.

    Add a `run_command` entry to `TOOL_LABELS` with active "Running command…", done "Ran command", verb "run a shell command". Extend `toolDetail` so that, in addition to the existing path/file/query lookup, it also recognizes a `command` string field — add `command` to the same coalescing chain so any of path/file/query/command surfaces. Preserve the existing trim plus non-empty guard and the null fallback.

    In `ChatPanel.tsx`: delete the now-moved `TOOL_LABELS`, `toolLabel`, `toolVerb`, and `toolDetail` definitions (and the explanatory comment block above `TOOL_LABELS`) and import the three functions from `./toolDisplay` instead. Do not change any call sites — the function signatures are unchanged. Leave the existing `ChatToolCall` import in ChatPanel untouched if it is still otherwise referenced; if it becomes unused after the move, remove it to avoid an unused-import error.

    Create `src/shell/__tests__/toolDisplay.test.ts` covering the behaviors above: run_command active and done label, run_command verb, command detail extraction, the unknown-tool humanized fallback for both active and done, and the null fallback for empty or unrecognized input. Follow the style of `src/shell/__tests__/memoryTools.test.ts` using vitest describe/it/expect in the node environment.
  </action>
  <verify>
    <automated>npm test -- src/shell/__tests__/toolDisplay.test.ts</automated>
  </verify>
  <done>toolDisplay.ts exports TOOL_LABELS/toolLabel/toolVerb/toolDetail with a run_command entry and command-field detail support; ChatPanel imports them from './toolDisplay' and no longer defines them locally; the new test file passes.</done>
</task>

<task type="auto">
  <name>Task 2: Remove native confirmation dialog and restore in-app approval for run_command</name>
  <files>electron/ipc/terminal.ts, src/views/terminal/index.tsx</files>
  <action>
    In `electron/ipc/terminal.ts`, within the `terminal:exec` handler: remove the native confirmation gate entirely. Delete the `Electron.MessageBoxOptions` `opts` object, the `dialog.showMessageBox` call (both the win-present and the fallback branch), the `if (response !== 1)` early-return that returns the 'Command cancelled by user' result, and the `const win = BrowserWindow.getFocusedWindow()` line plus its explanatory comment. The handler must proceed directly from computing `workDir` to the `exec(...)` Promise. Then remove the `dialog` and `BrowserWindow` imports from the top-of-file import statement — but first grep the file to confirm neither symbol is referenced elsewhere; only remove an import that has become unused. Leave the rest of the handler unchanged (cwd defaulting to homedir, timeout, maxBuffer, exit-code computation, resolve shape).

    In `src/views/terminal/index.tsx`: remove the `alwaysAllow: true` line from the `run_command` tool definition. Rationale per the bug report: commit 2bc6b3c added `alwaysAllow: true` to suppress in-app approval, but the native dialog remained the actual gate. The bug report requires the in-app approval card to be the approval surface, so `run_command` must NOT bypass it — dropping `alwaysAllow` routes it through the existing `requestApproval` flow in ChatPanel, which now shows the command via the extended `toolDetail`.
  </action>
  <verify>
    <automated>cd /Users/matanw/projects/workspace/workspaceai && grep -vc showMessageBox electron/ipc/terminal.ts >/dev/null && ! grep -q showMessageBox electron/ipc/terminal.ts && ! grep -q alwaysAllow src/views/terminal/index.tsx && npm test -- src/shell/__tests__/toolDisplay.test.ts</automated>
  </verify>
  <done>terminal:exec no longer calls dialog.showMessageBox (no native 'Run shell command?' dialog); run_command no longer carries alwaysAllow so it is gated by the in-app approval card; relevant tests pass.</done>
</task>

</tasks>

<verification>
- `grep -q showMessageBox electron/ipc/terminal.ts` returns no match (native dialog gone).
- `grep -q alwaysAllow src/views/terminal/index.tsx` returns no match (run_command routed through in-app approval).
- `grep -q "from './toolDisplay'" src/shell/ChatPanel.tsx` matches (helpers extracted and imported).
- `grep -q run_command src/shell/toolDisplay.ts` matches (run_command label present).
- `npm test -- src/shell/__tests__/toolDisplay.test.ts` passes.
- Manual smoke (human, optional): in a terminal view, ask the AI to run a shell command — the in-app approval card appears showing the command text, no native OS dialog pops up, and after approval the tool-call card reads "Running command…" then "Ran command".
</verification>

<success_criteria>
- The `run_command` tool-call card displays the actual command and a meaningful label ("Running command…" / "Ran command"), never a bare "Run command" placeholder.
- No native OS dialog titled "Run shell command?" is triggered for command approval.
- Command approval is handled by the in-app approval card (approve / reject / always allow).
- A unit test covers the new run_command label and command-detail behavior and passes.
- No regression in the existing label/detail behavior for other tools (note/file/search).
</success_criteria>

<output>
Create `.planning/quick/260603-wtv-fix-run-command-tool-confirmation-render/260603-wtv-SUMMARY.md` when done.
</output>
