/**
 * attachSession — pure, dependency-injected orchestrator for pty wiring.
 *
 * No imports from @xterm, the store, or the real IPC client. Everything the
 * function needs is provided through AttachDeps so the logic is unit-testable
 * in a plain node environment.
 */

export interface AttachDeps {
  /** The renderer view-instance id used as the registry key. */
  viewId: string;
  /** Working directory to pass to create on a cache miss. */
  cwd: string | undefined;
  /**
   * Returns true once the session has been removed from the cache (e.g. the
   * view was unmounted while the async pty call was in flight).
   */
  isDisposed: () => boolean;
  /**
   * Ask the main process whether a live pty already exists for this viewId.
   * Returns { termId, outputBuf } on a hit, null on a miss or dead pty.
   */
  reconnect: (viewId: string) => Promise<{ termId: string; outputBuf: string } | null>;
  /**
   * Spawn a brand-new pty. Forwarding viewId registers it so the next reload
   * can reconnect to it.
   */
  create: (opts: { cwd?: string; viewId?: string }) => Promise<{ termId: string }>;
  /**
   * Kill an orphaned pty that was spawned but whose session was disposed
   * mid-flight. Only called on the create-then-disposed path; a reconnect
   * target is an already-living pty owned by the registry — do NOT kill it.
   */
  kill: (termId: string) => void;
  /**
   * Write data into xterm. Used to replay the scrollback buffer on reconnect,
   * and also to accumulate live data into the AI context.
   */
  writeToTerminal: (data: string) => void;
  /**
   * Called once the termId is resolved (either via reconnect or create).
   * Implementations set session.termId and call fitIfVisible.
   */
  onResolved: (termId: string) => void;
  /**
   * Register data / exit / input / resize listeners against the resolved
   * termId. Only called when the session is still live.
   */
  wireListeners: (termId: string) => void;
}

/**
 * Reconnect-first-then-create orchestrator.
 *
 * 1. Attempts reconnect — if the main process has a live session for this
 *    viewId, adopts that termId and replays the buffered scrollback.
 * 2. Falls through to create when reconnect returns null, forwarding viewId
 *    so the new pty is registered for future reconnects.
 * 3. In both paths, checks isDisposed() after the async call resolves:
 *    - Reconnect hit + disposed: returns immediately; the live pty is owned by
 *      the registry / disposeSession — do NOT kill it.
 *    - Create + disposed: kills the freshly spawned orphan pty, then returns.
 * 4. On success (not disposed): replays a non-empty outputBuf (reconnect only),
 *    calls onResolved, then wireListeners.
 */
export async function attachSession(deps: AttachDeps): Promise<void> {
  const existing = await deps.reconnect(deps.viewId);

  if (existing !== null) {
    // Reconnect hit.
    if (deps.isDisposed()) {
      // The session was removed while the reconnect call was in flight.
      // The live pty belongs to the main-process registry; do NOT kill it.
      return;
    }
    // Replay non-empty scrollback so the user sees what was on screen.
    if (existing.outputBuf) {
      deps.writeToTerminal(existing.outputBuf);
    }
    deps.onResolved(existing.termId);
    deps.wireListeners(existing.termId);
    return;
  }

  // Reconnect miss — spawn a fresh pty.
  // Forwarding viewId registers it so the next reload can reconnect.
  const result = await deps.create({ cwd: deps.cwd, viewId: deps.viewId });

  if (deps.isDisposed()) {
    // Session was removed while create was in flight — kill the orphan.
    deps.kill(result.termId);
    return;
  }

  deps.onResolved(result.termId);
  deps.wireListeners(result.termId);
}
