// Pure tool-display helpers — no React, no Electron, no node:* imports.
// All logic is string-only so it can be unit-tested under Vitest (src/**).

import type { ChatToolCall } from '../state/types';

// Human-friendly labels for tool calls, keyed by tool name. `active` shows
// while the call is pending/approved; `done` is the past-tense form once it has
// run; `verb` is the infinitive used in the approval prompt ("wants to …").
// Unknown tools fall back to a humanized version of the raw name.
export const TOOL_LABELS: Record<string, { active: string; done: string; verb: string }> = {
  read_note: { active: 'Reading note…', done: 'Read note', verb: 'read the note' },
  write_note: { active: 'Rewriting note…', done: 'Rewrote note', verb: 'rewrite the note' },
  append_to_note: { active: 'Updating note…', done: 'Updated note', verb: 'update the note' },
  read_file: { active: 'Reading file…', done: 'Read file', verb: 'read the file' },
  write_file: { active: 'Saving file…', done: 'Saved file', verb: 'save the file' },
  create_file: { active: 'Creating file…', done: 'Created file', verb: 'create the file' },
  search: { active: 'Searching…', done: 'Searched', verb: 'run a search' },
  run_command: { active: 'Running command…', done: 'Ran command', verb: 'run a shell command' },
};

export function toolLabel(name: string, status?: ChatToolCall['status']): string {
  const entry = TOOL_LABELS[name];
  if (entry) return status === 'done' ? entry.done : entry.active;
  // Fallback: "append_to_note" -> "Append to note" (+ ellipsis while active).
  const human = name.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  return status === 'done' ? human : `${human}…`;
}

export function toolVerb(name: string): string {
  return TOOL_LABELS[name]?.verb ?? `run ${name.replace(/_/g, ' ')}`;
}

// Pull a short, human-meaningful target out of a tool's input (e.g. the file
// path, search query, or shell command) to show alongside the label. Returns
// null when there's nothing useful to surface.
export function toolDetail(input: unknown): string | null {
  if (input && typeof input === 'object') {
    const o = input as Record<string, unknown>;
    const target = o.path ?? o.file ?? o.query ?? o.command;
    if (typeof target === 'string' && target.trim()) return target.trim();
  }
  return null;
}
