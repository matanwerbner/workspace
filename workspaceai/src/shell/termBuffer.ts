export const TERM_BUFFER_CAP = 50000;

/**
 * Appends `chunk` to `buf` and returns the combined string. If the combined
 * length exceeds TERM_BUFFER_CAP, the most-recent TERM_BUFFER_CAP characters
 * are kept (the oldest head bytes are dropped) so the buffer never grows
 * beyond 50 KB.
 */
export function appendCapped(buf: string, chunk: string): string {
  const combined = buf + chunk;
  if (combined.length > TERM_BUFFER_CAP) {
    return combined.slice(-TERM_BUFFER_CAP);
  }
  return combined;
}
