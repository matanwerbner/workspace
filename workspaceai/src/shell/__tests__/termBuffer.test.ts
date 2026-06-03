import { describe, expect, it } from 'vitest';
import { TERM_BUFFER_CAP, appendCapped } from '../termBuffer';

describe('TERM_BUFFER_CAP', () => {
  it('is 50000', () => {
    expect(TERM_BUFFER_CAP).toBe(50000);
  });
});

describe('appendCapped', () => {
  it('appends a chunk to an empty buffer', () => {
    expect(appendCapped('', 'hello')).toBe('hello');
  });

  it('appends a chunk to an existing buffer', () => {
    expect(appendCapped('abc', 'def')).toBe('abcdef');
  });

  it('handles two empty strings', () => {
    expect(appendCapped('', '')).toBe('');
  });

  it('drops the oldest char when buffer is at cap and one char is added', () => {
    const buf = 'x'.repeat(50000);
    const result = appendCapped(buf, 'y');
    expect(result).toHaveLength(50000);
    expect(result.endsWith('y')).toBe(true);
  });

  it('keeps the tail when a chunk larger than the cap is appended to empty buffer', () => {
    const result = appendCapped('', 'z'.repeat(50001));
    expect(result).toHaveLength(50000);
    expect(result.split('').every((c) => c === 'z')).toBe(true);
  });

  it('keeps the tail when combined length exceeds cap by exactly one from head', () => {
    const result = appendCapped('a'.repeat(49998), 'bcd');
    expect(result).toHaveLength(50000);
    expect(result.startsWith('a')).toBe(true);
    expect(result.endsWith('bcd')).toBe(true);
  });

  it('result is always at most TERM_BUFFER_CAP characters long', () => {
    const large = 'x'.repeat(100000);
    const result = appendCapped(large, 'y'.repeat(100000));
    expect(result.length).toBeLessThanOrEqual(TERM_BUFFER_CAP);
  });
});
