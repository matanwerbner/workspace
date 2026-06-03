import { describe, it, expect, vi } from 'vitest';
import { attachSession } from '../attachSession';
import type { AttachDeps } from '../attachSession';

function makeDeps(overrides: Partial<AttachDeps> = {}): AttachDeps {
  return {
    viewId: 'view-1',
    cwd: '/home/user',
    isDisposed: vi.fn(() => false),
    reconnect: vi.fn(async () => null),
    create: vi.fn(async () => ({ termId: 't-default' })),
    kill: vi.fn(),
    writeToTerminal: vi.fn(),
    onResolved: vi.fn(),
    wireListeners: vi.fn(),
    ...overrides,
  };
}

describe('attachSession', () => {
  describe('reconnect hit', () => {
    it('does not call create when reconnect returns a live session', async () => {
      const deps = makeDeps({
        reconnect: vi.fn(async () => ({ termId: 't1', outputBuf: 'PREV OUTPUT' })),
      });
      await attachSession(deps);
      expect(deps.create).not.toHaveBeenCalled();
    });

    it('replays a non-empty outputBuf via writeToTerminal', async () => {
      const deps = makeDeps({
        reconnect: vi.fn(async () => ({ termId: 't1', outputBuf: 'PREV OUTPUT' })),
      });
      await attachSession(deps);
      expect(deps.writeToTerminal).toHaveBeenCalledWith('PREV OUTPUT');
    });

    it('calls onResolved with the reconnected termId', async () => {
      const deps = makeDeps({
        reconnect: vi.fn(async () => ({ termId: 't1', outputBuf: 'PREV OUTPUT' })),
      });
      await attachSession(deps);
      expect(deps.onResolved).toHaveBeenCalledWith('t1');
    });

    it('calls wireListeners with the reconnected termId', async () => {
      const deps = makeDeps({
        reconnect: vi.fn(async () => ({ termId: 't1', outputBuf: 'PREV OUTPUT' })),
      });
      await attachSession(deps);
      expect(deps.wireListeners).toHaveBeenCalledWith('t1');
    });

    it('does not call writeToTerminal when outputBuf is empty', async () => {
      const deps = makeDeps({
        reconnect: vi.fn(async () => ({ termId: 't5', outputBuf: '' })),
      });
      await attachSession(deps);
      expect(deps.writeToTerminal).not.toHaveBeenCalled();
      expect(deps.onResolved).toHaveBeenCalledWith('t5');
      expect(deps.wireListeners).toHaveBeenCalledWith('t5');
    });
  });

  describe('reconnect miss → create fallback', () => {
    it('calls create with viewId and cwd when reconnect returns null', async () => {
      const deps = makeDeps({
        reconnect: vi.fn(async () => null),
        create: vi.fn(async () => ({ termId: 't2' })),
      });
      await attachSession(deps);
      expect(deps.create).toHaveBeenCalledExactlyOnceWith({
        viewId: 'view-1',
        cwd: '/home/user',
      });
    });

    it('does not call writeToTerminal on the create path', async () => {
      const deps = makeDeps({
        reconnect: vi.fn(async () => null),
        create: vi.fn(async () => ({ termId: 't2' })),
      });
      await attachSession(deps);
      expect(deps.writeToTerminal).not.toHaveBeenCalled();
    });

    it('calls onResolved with the newly created termId', async () => {
      const deps = makeDeps({
        reconnect: vi.fn(async () => null),
        create: vi.fn(async () => ({ termId: 't2' })),
      });
      await attachSession(deps);
      expect(deps.onResolved).toHaveBeenCalledWith('t2');
    });

    it('calls wireListeners with the newly created termId', async () => {
      const deps = makeDeps({
        reconnect: vi.fn(async () => null),
        create: vi.fn(async () => ({ termId: 't2' })),
      });
      await attachSession(deps);
      expect(deps.wireListeners).toHaveBeenCalledWith('t2');
    });
  });

  describe('disposed before reconnect resolves', () => {
    it('does not call wireListeners, onResolved, or writeToTerminal when disposed after reconnect hit', async () => {
      const deps = makeDeps({
        reconnect: vi.fn(async () => ({ termId: 't3', outputBuf: 'x' })),
        isDisposed: vi.fn(() => true),
      });
      await attachSession(deps);
      expect(deps.wireListeners).not.toHaveBeenCalled();
      expect(deps.onResolved).not.toHaveBeenCalled();
      expect(deps.writeToTerminal).not.toHaveBeenCalled();
    });

    it('does NOT kill the reconnect target when disposed (registry owns its lifecycle)', async () => {
      const deps = makeDeps({
        reconnect: vi.fn(async () => ({ termId: 't3', outputBuf: 'x' })),
        isDisposed: vi.fn(() => true),
      });
      await attachSession(deps);
      expect(deps.kill).not.toHaveBeenCalled();
    });
  });

  describe('disposed before create resolves', () => {
    it('calls kill with the freshly created termId when disposed after create', async () => {
      const isDisposed = vi.fn();
      // isDisposed returns false during reconnect (so we fall through to create),
      // then true after create resolves.
      isDisposed.mockResolvedValueOnce(false);
      isDisposed.mockReturnValue(true);
      const deps = makeDeps({
        reconnect: vi.fn(async () => null),
        create: vi.fn(async () => ({ termId: 't4' })),
        isDisposed,
      });
      await attachSession(deps);
      expect(deps.kill).toHaveBeenCalledWith('t4');
    });

    it('does not call wireListeners or onResolved when disposed after create', async () => {
      const isDisposed = vi.fn().mockReturnValue(true);
      const deps = makeDeps({
        reconnect: vi.fn(async () => null),
        create: vi.fn(async () => ({ termId: 't4' })),
        isDisposed,
      });
      await attachSession(deps);
      expect(deps.wireListeners).not.toHaveBeenCalled();
      expect(deps.onResolved).not.toHaveBeenCalled();
    });
  });
});
