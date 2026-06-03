import { describe, expect, it, vi } from 'vitest';

// Mock xterm and its addon so the module can load in a node environment.
vi.mock('@xterm/xterm', () => ({ Terminal: vi.fn() }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: vi.fn() }));
vi.mock('../../ipc/client', () => ({ api: {} }));
vi.mock('../../state/store', () => ({ useAppStore: { getState: vi.fn(() => ({ setViewContext: vi.fn() })) } }));

import { fitIfVisible } from '../terminal/sessionCache';
import type { TermSession } from '../terminal/sessionCache';

function makeSession(offsetWidth: number, offsetHeight: number): { session: TermSession; fit: ReturnType<typeof vi.fn> } {
  const fit = vi.fn();
  const session = {
    host: { offsetWidth, offsetHeight } as unknown as HTMLDivElement,
    fitAddon: { fit } as never,
    terminal: {} as never,
    termId: null,
  } satisfies TermSession;
  return { session, fit };
}

describe('fitIfVisible', () => {
  it('calls fit() when the host has real dimensions', () => {
    const { session, fit } = makeSession(800, 600);
    fitIfVisible(session);
    expect(fit).toHaveBeenCalledOnce();
  });

  it('skips fit() when host is zero-width (display:none)', () => {
    const { session, fit } = makeSession(0, 600);
    fitIfVisible(session);
    expect(fit).not.toHaveBeenCalled();
  });

  it('skips fit() when host is zero-height (display:none)', () => {
    const { session, fit } = makeSession(800, 0);
    fitIfVisible(session);
    expect(fit).not.toHaveBeenCalled();
  });
});
