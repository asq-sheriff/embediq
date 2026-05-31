import { describe, it, expect } from 'vitest';
import { safeTimestamp } from '../../src/web/server.js';

describe('safeTimestamp', () => {
  it('preserves a valid ISO timestamp', () => {
    expect(safeTimestamp('2026-05-31T00:00:00.000Z').toISOString()).toBe('2026-05-31T00:00:00.000Z');
  });

  it('falls back to a valid Date for unparseable / empty / missing input', () => {
    // Each of these used to produce an Invalid Date that crashed a later
    // `.toISOString()` in the session-bound generate path.
    for (const bad of ['t', '', 'garbage', undefined, null]) {
      const d = safeTimestamp(bad);
      expect(Number.isNaN(d.getTime())).toBe(false);
      expect(() => d.toISOString()).not.toThrow();
    }
  });

  it('accepts epoch millis', () => {
    expect(safeTimestamp(0).toISOString()).toBe('1970-01-01T00:00:00.000Z');
  });
});
