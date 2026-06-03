---
phase: 01
slug: workspace-memory
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-03
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run src/shell/__tests__/` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/shell/__tests__/`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-T1 | 01-01 | 1 | MEM-01, MEM-02 | `write_memory` validates name matches `/^[a-z0-9-]+$/` before constructing path | unit | `npx vitest run src/shell/__tests__/memory.test.ts` | ❌ Wave 0 | ⬜ pending |
| 01-01-T2 | 01-01 | 1 | MEM-02, MEM-06 | `memory:writeEntry` calls `assertParentInsideRoots` + lstat symlink check | unit | `npx vitest run src/shell/__tests__/memory.test.ts` | ❌ Wave 0 | ⬜ pending |
| 01-02-T1 | 01-02 | 1 | MEM-07 | `seedRootsFromState` registers `workspace.homeFolder` on startup | unit | `npx vitest run` | ❌ Wave 0 | ⬜ pending |
| 01-02-T2 | 01-02 | 1 | MEM-07 | Active workspace switch registers new `homeFolder` via `registerRoot` | unit | `npx vitest run` | ❌ Wave 0 | ⬜ pending |
| 01-03-T1 | 01-03 | 2 | MEM-05 | `write_memory` tool has `alwaysAllow: true`; approval UI never shown | unit | `npx vitest run src/shell/__tests__/memory-tools.test.ts` | ❌ Wave 0 | ⬜ pending |
| 01-03-T2 | 01-03 | 2 | MEM-01, MEM-03, MEM-04 | Index injected when homeFolder set; both tools absent when homeFolder unset | unit | `npx vitest run src/shell/__tests__/memory-tools.test.ts` | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/shell/__tests__/memory.test.ts` — unit tests for `formatEntry`, `parseIndex`, `upsertIndex` helpers; covers MEM-01, MEM-02, MEM-06
- [ ] `src/shell/__tests__/memory-tools.test.ts` — unit tests for `GLOBAL_TOOLS` definition, `alwaysAllow` flag, index injection, homeFolder fallback; covers MEM-01 through MEM-05

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `write_memory` auto-executes without approval dialog in the running app | MEM-05 | Requires running Electron app + live Claude response | Run app, open a workspace with homeFolder set, ask Claude to "remember that I prefer TypeScript", verify no approval dialog appears and entry file is created in `memory/` |
| Memory index appears in system prompt in DevTools | MEM-03 | Network inspection of Anthropic API request | In DevTools Network tab, inspect the `ai:chat` IPC payload, verify `system` field contains a memory index section when `memory/MEMORY.md` exists |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
