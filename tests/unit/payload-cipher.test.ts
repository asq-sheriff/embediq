import { describe, it, expect } from 'vitest';
import { PayloadCipher } from '../../src/web/sessions/encryption.js';

const KEY_A = 'a'.repeat(64); // 32 bytes
const KEY_B = 'b'.repeat(64);
const KEY_C = 'c'.repeat(64);

describe('PayloadCipher — single key (back-compat)', () => {
  it('round-trips a UTF-8 string', () => {
    const cipher = PayloadCipher.fromHexKey(KEY_A);
    const blob = cipher.encrypt('hello world');
    expect(blob).not.toContain('hello'); // base64-encoded ciphertext, not plain
    expect(cipher.decrypt(blob)).toBe('hello world');
  });

  it('produces a distinct ciphertext each call (random IV)', () => {
    const cipher = PayloadCipher.fromHexKey(KEY_A);
    const a = cipher.encrypt('same input');
    const b = cipher.encrypt('same input');
    expect(a).not.toBe(b);
    expect(cipher.decrypt(a)).toBe('same input');
    expect(cipher.decrypt(b)).toBe('same input');
  });

  it('rejects a non-hex key', () => {
    expect(() => PayloadCipher.fromHexKey('xyz')).toThrow(/hex string/);
  });

  it('rejects a wrong-length key', () => {
    // 63 hex chars → Buffer truncates to 31 bytes → fails length check.
    expect(() => PayloadCipher.fromHexKey('a'.repeat(63))).toThrow(/32 bytes/);
    // 62 hex chars → exactly 31 bytes → also fails length check.
    expect(() => PayloadCipher.fromHexKey('ab'.repeat(31))).toThrow(/32 bytes/);
  });
});

describe('PayloadCipher — rotation', () => {
  it('decrypts an old-key blob when the old key is configured as previous', () => {
    const oldCipher = PayloadCipher.fromHexKey(KEY_A);
    const blob = oldCipher.encrypt('legacy session payload');

    // Operator rotates: new active key is B, old A goes to _PREV.
    const newCipher = PayloadCipher.fromHexKeys(KEY_B, [KEY_A]);
    expect(newCipher.decrypt(blob)).toBe('legacy session payload');
  });

  it('encrypts with the active key — a fresh ciphertext fails the old-only cipher', () => {
    const newCipher = PayloadCipher.fromHexKeys(KEY_B, [KEY_A]);
    const blob = newCipher.encrypt('post-rotation payload');

    // An operator who reverted to the old key alone cannot decrypt the new blob.
    const oldOnly = PayloadCipher.fromHexKey(KEY_A);
    expect(() => oldOnly.decrypt(blob)).toThrow(/decrypt failed/);
  });

  it('supports multi-step rotation across three keys', () => {
    const c1 = PayloadCipher.fromHexKey(KEY_A);
    const blob1 = c1.encrypt('age-A session');

    // First rotation A → B
    const c2 = PayloadCipher.fromHexKeys(KEY_B, [KEY_A]);
    const blob2 = c2.encrypt('age-B session');

    // Second rotation B → C, with both A and B kept as previous
    const c3 = PayloadCipher.fromHexKeys(KEY_C, [KEY_B, KEY_A]);
    expect(c3.decrypt(blob1)).toBe('age-A session');
    expect(c3.decrypt(blob2)).toBe('age-B session');

    const blob3 = c3.encrypt('age-C session');
    expect(c3.decrypt(blob3)).toBe('age-C session');
  });

  it('throws a clear error when no configured key can decrypt the blob', () => {
    const oldCipher = PayloadCipher.fromHexKey(KEY_A);
    const blob = oldCipher.encrypt('orphaned payload');

    const newCipherWithoutOldAsPrev = PayloadCipher.fromHexKey(KEY_B);
    expect(() => newCipherWithoutOldAsPrev.decrypt(blob)).toThrow(/rotation may have removed/);
  });

  it('previousKeyCount reflects the configured fallback list', () => {
    expect(PayloadCipher.fromHexKey(KEY_A).previousKeyCount).toBe(0);
    expect(PayloadCipher.fromHexKeys(KEY_A, [KEY_B]).previousKeyCount).toBe(1);
    expect(PayloadCipher.fromHexKeys(KEY_A, [KEY_B, KEY_C]).previousKeyCount).toBe(2);
  });
});

describe('PayloadCipher.fromEnv — multi-key env parsing', () => {
  it('returns undefined when EMBEDIQ_SESSION_DATA_KEY is unset', () => {
    expect(PayloadCipher.fromEnv({})).toBeUndefined();
  });

  it('reads a single previous key', () => {
    const cipher = PayloadCipher.fromEnv({
      EMBEDIQ_SESSION_DATA_KEY: KEY_B,
      EMBEDIQ_SESSION_DATA_KEY_PREV: KEY_A,
    });
    expect(cipher?.previousKeyCount).toBe(1);

    const oldBlob = PayloadCipher.fromHexKey(KEY_A).encrypt('legacy');
    expect(cipher?.decrypt(oldBlob)).toBe('legacy');
  });

  it('parses comma-separated previous keys with whitespace tolerance', () => {
    const cipher = PayloadCipher.fromEnv({
      EMBEDIQ_SESSION_DATA_KEY: KEY_C,
      EMBEDIQ_SESSION_DATA_KEY_PREV: `${KEY_B}, ${KEY_A}`,
    });
    expect(cipher?.previousKeyCount).toBe(2);

    const oldestBlob = PayloadCipher.fromHexKey(KEY_A).encrypt('oldest');
    const olderBlob = PayloadCipher.fromHexKey(KEY_B).encrypt('older');
    expect(cipher?.decrypt(oldestBlob)).toBe('oldest');
    expect(cipher?.decrypt(olderBlob)).toBe('older');
  });

  it('ignores empty previous-key entries', () => {
    const cipher = PayloadCipher.fromEnv({
      EMBEDIQ_SESSION_DATA_KEY: KEY_B,
      EMBEDIQ_SESSION_DATA_KEY_PREV: ` , , ${KEY_A} , `,
    });
    expect(cipher?.previousKeyCount).toBe(1);
  });

  it('rejects a malformed previous key with a labeled error', () => {
    expect(() =>
      PayloadCipher.fromEnv({
        EMBEDIQ_SESSION_DATA_KEY: KEY_B,
        EMBEDIQ_SESSION_DATA_KEY_PREV: 'xyz-not-hex',
      }),
    ).toThrow(/EMBEDIQ_SESSION_DATA_KEY_PREV\[0\]/);
  });
});

describe('Rotation completes naturally as sessions are re-written', () => {
  it('a put() after rotation produces a blob that decrypts under the new cipher *without* the old key as fallback', () => {
    // Phase 1: write under old key.
    const phase1 = PayloadCipher.fromHexKey(KEY_A);
    const oldBlob = phase1.encrypt('user data');

    // Phase 2: rotate. Old blob still readable.
    const phase2 = PayloadCipher.fromHexKeys(KEY_B, [KEY_A]);
    const decrypted = phase2.decrypt(oldBlob);
    // Simulate `DatabaseBackend.put()` re-encrypting on write.
    const rewritten = phase2.encrypt(decrypted);

    // Phase 3: rotation complete — operator removes the previous key.
    // The freshly-rewritten blob still decrypts because it was
    // encrypted under the active (now sole) key.
    const phase3 = PayloadCipher.fromHexKey(KEY_B);
    expect(phase3.decrypt(rewritten)).toBe('user data');

    // Sanity check: the original blob no longer decrypts (which is
    // the operator's signal that any session NOT touched between
    // phase 2 and phase 3 was orphaned by TTL — expected behavior).
    expect(() => phase3.decrypt(oldBlob)).toThrow();
  });
});
