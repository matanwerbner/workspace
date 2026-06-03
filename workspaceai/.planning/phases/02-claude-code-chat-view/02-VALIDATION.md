# Phase 02: Claude Code Chat View — Validation Plan

**Phase:** 02-claude-code-chat-view
**Framework:** Vitest 4.1.7
**Environment:** node (no JSDOM)
**Generated:** 2026-06-03

---

## Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.7 |
| Config file | `vitest.config.ts` (root) |
| Quick run (markdown) | `npm test -- src/lib/__tests__/markdown.test.ts` |
| Quick run (registry) | `npm test -- src/views/__tests__/registry.test.ts` |
| Full suite | `npm test` |
| Environment | `node` (no JSDOM — pure logic only) |

---

## Phase Deliverables → Test Map

| Deliverable | Behavior to Test | Test Type | Test File | Action |
|-------------|------------------|-----------|-----------|--------|
| `claude-code` view registration | `getViewType('claude-code')` returns entry with `typeId='claude-code'`, `label='Claude Code'` | unit | `src/views/__tests__/registry.test.ts` | Extend existing |
| `claude-code` createConfig | `await createConfig()` returns `{ name: 'Claude Chat', config: {} }` | unit | `src/views/__tests__/registry.test.ts` | Extend existing |
| `renderMarkdown` code highlight | Fenced block with `lang=typescript` produces `<code class="hljs language-typescript">` | unit | `src/lib/__tests__/markdown.test.ts` | Extend existing |
| `renderMarkdown` no-lang fallback | Fenced block without language tag produces `<pre><code>` with no hljs class | unit | `src/lib/__tests__/markdown.test.ts` | Extend existing |
| highlight.js XSS safety | HTML entities in code (`<script>`) are not present raw in the rendered output | unit | `src/lib/__tests__/markdown.test.ts` | Extend existing |

---

## Test Cases

### src/lib/__tests__/markdown.test.ts (extend — 3 new cases)

```
describe('renderMarkdown — code highlighting')
  ✓ typescript fenced block → output contains class="hljs language-typescript"
  ✓ anonymous fenced block → output contains <pre><code> but NOT "hljs"
  ✓ XSS safety → <script>evil()</script> in typescript block does NOT appear raw in output
```

### src/views/__tests__/registry.test.ts (extend — 3 new cases)

```
describe('claude-code view registration')
  ✓ getViewType('claude-code')?.typeId === 'claude-code'
  ✓ getViewType('claude-code')?.label === 'Claude Code'
  ✓ await getViewType('claude-code')?.createConfig() deep-equals { name: 'Claude Chat', config: {} }
```

---

## Sampling Rate

| Gate | Command | When |
|------|---------|------|
| Per task | `npm test -- <changed-test-file>` | After each task in a plan |
| Per wave merge | `npm test` | After all plans in a wave complete |
| Phase gate | `npm test` (full suite green) | Before marking phase complete |

---

## Wave 0 Gaps (pre-execution checklist)

- [ ] New test cases appended to `src/lib/__tests__/markdown.test.ts` for highlight.js (Plan 02-01, Task 2)
- [ ] New test cases appended to `src/views/__tests__/registry.test.ts` for `claude-code` (Plan 02-02, Task 1)

No new test files are needed — all new cases extend the two existing test files.

---

## Notes

- Tests use the `node` Vitest environment. Do not use `document.*`, `window.*`, or React DOM render in any test added for this phase.
- The view registration tests import `'../../views/claude-code'` as a side effect to trigger `registerView()`, then call `getViewType('claude-code')` from the registry. No component rendering required.
- highlight.js unit tests operate on the string output of `renderMarkdown()` — pure function, no DOM.
