import { describe, expect, it } from 'vitest';
import { makeId } from '../uid';

describe('makeId', () => {
  it('uses "id" as the default prefix', () => {
    expect(makeId()).toMatch(/^id_/);
  });

  it('uses the provided prefix', () => {
    expect(makeId('w')).toMatch(/^w_/);
    expect(makeId('view')).toMatch(/^view_/);
  });

  it('produces unique ids on successive calls', () => {
    const ids = Array.from({ length: 50 }, () => makeId('x'));
    expect(new Set(ids).size).toBe(50);
  });

  it('has the expected format: prefix_base36timestamp_randomchars', () => {
    const id = makeId('test');
    const parts = id.split('_');
    // 'test', timestamp-base36, random-chars
    expect(parts.length).toBeGreaterThanOrEqual(3);
    expect(parts[0]).toBe('test');
    expect(parts[1]).toMatch(/^[0-9a-z]+$/);
    expect(parts[2]).toMatch(/^[0-9a-z]+$/);
  });

  it('returns a non-empty string', () => {
    expect(makeId('p').length).toBeGreaterThan(0);
  });
});
