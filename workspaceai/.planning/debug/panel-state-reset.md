---
status: investigating
trigger: "workspace panels keep resetting (losing their state/configuration). The user says 'it happened again', implying this is a recurring issue."
created: 2026-06-03T00:00:00Z
updated: 2026-06-03T00:01:00Z
symptoms_prefilled: true
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

reasoning_checkpoint:
  hypothesis: "Two independent bugs cause panel state loss: (1) snapshot() omits viewTypeUsage from persisted writes, meaning that field resets to {} on every load even though migrate() reads it correctly; (2) onLayout fires on initial mount with chatSize=0 when panel is collapsed, overwriting the stored sizePct with 0 for the active view — so chat panel size is erased whenever the app initialises or the active view changes."
  confirming_evidence:
    - "migrate() (line 46-49) reads viewTypeUsage from persisted data and returns it in PersistedAppState"
    - "snapshot() (line 103-114) constructs the write payload without viewTypeUsage — it only includes {schemaVersion, workspaces, activeWorkspaceId, settings} — so viewTypeUsage is silently dropped on every persist"
    - "PersistedAppState type (types.ts line 55) declares viewTypeUsage as required on the type, but snapshot() satisfies it without including the field (TypeScript doesn't catch this because the return value is structurally typed)"
    - "MainPane.tsx line 62-69: onLayout fires with sizes[1]=0 (collapsed) on initial render; the guard only checks chatSize > 0, but when collapsed the panel fires with 0, overwriting the stored sizePct to... wait, guard IS chatSize > 0, so 0 IS filtered. Let me re-examine."
    - "onLayout guard: `if (typeof chatSize === 'number' && chatSize > 0)` — this DOES protect against 0. But defaultSize={active && !collapsed ? sizePct : 0} means on initial render the panel defaults to 0 when collapsed, and onLayout fires with 0 for that, which IS blocked by the guard. The sizePct overwrite bug therefore ONLY applies when the panel is NOT collapsed on initial render — then onLayout fires with sizePct (correct value) and writes it back, which is fine."
    - "ROOT CAUSE CONFIRMED: snapshot() is the definitive bug — it omits viewTypeUsage, causing that field to be reset to {} on every session. If panel/view state depends on viewTypeUsage (e.g. for recently-used view types), that state is lost."
    - "SECOND VECTOR: The snapshot() function also does NOT include the viewTypeUsage field from AppStore in its output. The AppStore has no viewTypeUsage in its interface at all — migrate() returns it but store.ts never stores it into the Zustand state. So viewTypeUsage is read from disk by migrate() but then DISCARDED by hydrate() (which only sets workspaces, activeWorkspaceId, settings, apiKeySet, hydrated). This means viewTypeUsage is always {} in memory AND always {} persisted."
  falsification_test: "If snapshot() did include viewTypeUsage, then migrating a blob that had viewTypeUsage populated would round-trip it correctly. Currently it cannot because snapshot() drops it."
  fix_rationale: "Add viewTypeUsage to: (a) AppStore interface and state, (b) hydrate() to read it from migrated state, (c) snapshot() to write it. This closes the read-migrate-write cycle for this field."
  blind_spots: "Whether viewTypeUsage is actually the field that causes visible panel resets, or if there are other fields being dropped."

next_action: complete root cause report

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: workspace panels retain their state/configuration across sessions and interactions
actual: workspace panels reset (lose state/configuration) — recurring issue
errors: none reported by user
reproduction: unclear — user says "it happened again" implying recurring/intermittent
started: recurring issue (not a regression from a single commit)

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: "State is lost because the debounced persist timer fires after quit"
  evidence: "before-quit handler uses event.preventDefault() + await Promise.race([executeJavaScript(__flushAppState), 3s timeout]), so the IPC flush completes before app.exit(0). The beforeunload also cancels the debounce timer and calls flush()."
  timestamp: 2026-06-03T00:05:00Z

- hypothesis: "PanelGroup resets to defaultSize on every render"
  evidence: "PanelGroup has no key prop, so it never remounts. defaultSize only applies on first mount. Panel sizes are preserved imperatively via chatPanelRef."
  timestamp: 2026-06-03T00:06:00Z

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-06-03T00:02:00Z
  checked: "src/state/migrate.ts snapshot() vs migrate() return types"
  found: "migrate() (line 46-49) reads viewTypeUsage from persisted data and returns it in PersistedAppState. snapshot() (lines 103-114) constructs the write payload WITHOUT viewTypeUsage -- only {schemaVersion, workspaces, activeWorkspaceId, settings}. The PersistedAppState type at types.ts:55 declares viewTypeUsage as required, but snapshot() does not satisfy it (TypeScript silent because viewTypeUsage is not in the AppStore interface either, so it compiles)."
  implication: "viewTypeUsage is read from disk by migrate() and returned, but store.ts hydrate() never stores it into Zustand state, and snapshot() never writes it back. It resets to {} every session."

- timestamp: 2026-06-03T00:03:00Z
  checked: "AppStore interface in store.ts"
  found: "AppStore has no viewTypeUsage field. hydrate() does: set({workspaces, activeWorkspaceId, settings, apiKeySet, hydrated}) -- viewTypeUsage from migrate() is discarded."
  implication: "viewTypeUsage is a dead field: read from disk, discarded, not stored in memory, not written back. However, this field does not appear to be used anywhere in the UI -- so it is a data integrity bug but may not cause visible panel resets."

- timestamp: 2026-06-03T00:04:00Z
  checked: "MainPane.tsx onLayout callback (lines 62-69) and the collapse/expand useEffect (lines 44-52)"
  found: "When the user switches active views (activeViewId changes), the useEffect re-runs. If the new view has collapsed=false but the panel is currently collapsed (from previous view), panel.expand() is called. panel.expand() synchronously triggers onLayout. At that moment, sizes[1] is the current physical panel size -- which is the PREVIOUS view's size (or 0 if collapsed). setChatSizePct(activeViewId, currentSize) is called with the NEW viewId but the OLD panel size, overwriting the new view's stored sizePct."
  implication: "This is the primary cause of chat panel size resetting. Every time you switch between views where one has the chat panel at a different size, the sizes bleed across views."

- timestamp: 2026-06-03T00:05:00Z
  checked: "session logs store:get result at startup"
  found: "store:get:ok shows the persisted data has correct schemaVersion:2, workspaces, activeWorkspaceId, settings -- views are persisted. No viewTypeUsage key in the logged payload (it was never saved)."
  implication: "Confirms snapshot() omits viewTypeUsage. The workspace.views array and chatStateByViewId ARE being persisted correctly."

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: |
  Two bugs found:

  BUG 1 (Primary - chat panel size reset across view switches):
  In MainPane.tsx, the useEffect that syncs the panel's collapsed state (lines 44-52) calls
  panel.expand() when switching to a view with collapsed=false. This triggers onLayout
  synchronously with the CURRENT physical panel percentage (from the previous view or 0).
  The onLayout callback then calls setChatSizePct(activeViewId, currentSize) where activeViewId
  is already the NEW view's ID but currentSize is the OLD panel's size. This overwrites the new
  view's stored chat panel size with the previous view's size on every tab switch.

  BUG 2 (Secondary - viewTypeUsage never persisted):
  snapshot() in migrate.ts omits viewTypeUsage from the persisted payload, and AppStore never
  stores it from migrate() output. The field resets to {} on every launch. This is a data
  integrity bug but viewTypeUsage is not currently used in any UI, so it causes no visible reset.

fix: |
  FIX 1 (MainPane.tsx):
  The onLayout callback must not update sizePct when the layout change was caused by a
  programmatic expand/collapse triggered by a view switch. Solution: use a ref flag to skip
  the onLayout write during the transition period, OR resize the panel to the target sizePct
  AFTER expanding (not relying on onLayout to capture the expand event as a save).

  Concrete fix: Add an `isProgrammaticRef = useRef(false)` flag. Set it to true before
  calling panel.collapse() or panel.expand() in the useEffect. In onLayout, skip the
  setChatSizePct call when the flag is true, then reset the flag.

  FIX 2 (migrate.ts + store.ts):
  Add viewTypeUsage to AppStore interface and state, read it in hydrate(), and include it in
  snapshot(). This closes the read-write cycle for this field.

verification:
files_changed:
  - src/shell/MainPane.tsx
  - src/state/store.ts
  - src/state/migrate.ts
