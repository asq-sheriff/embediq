import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * AES-256-GCM wrapper used to encrypt session payload columns at rest.
 * Opt-in via `EMBEDIQ_SESSION_DATA_KEY` (64-character hex string).
 *
 * Format: `base64(iv || ciphertext || authTag)` — one opaque string
 * column the backend stores without any schema change. The blob does
 * not carry a key identifier, so rotation works by **try-each-key on
 * decrypt**: the active key is attempted first; on auth-tag failure
 * the cipher walks the configured previous keys in order. Sessions
 * encrypted with old keys are re-encrypted with the active key on
 * their next `put()` — natural rotation completes as sessions are
 * touched or expire via TTL.
 *
 * Multi-step rotation: `EMBEDIQ_SESSION_DATA_KEY_PREV` accepts a
 * comma-separated list of previous keys so multiple rotations can be
 * in flight simultaneously (e.g. for a longer drain window in
 * regulated environments).
 */
export class PayloadCipher {
  /**
   * @param activeKey - The key used for *all* new encryption.
   * @param previousKeys - Decrypt-only fallback keys, tried in order
   *   after the active key fails. Each must also be a 32-byte AES key.
   */
  constructor(
    private readonly activeKey: Buffer,
    private readonly previousKeys: readonly Buffer[] = [],
  ) {}

  /**
   * Build a cipher from `EMBEDIQ_SESSION_DATA_KEY` (+ optional
   * `EMBEDIQ_SESSION_DATA_KEY_PREV`) when set; returns undefined
   * otherwise so callers fall back to plaintext storage.
   *
   * `EMBEDIQ_SESSION_DATA_KEY_PREV` accepts a single hex string or a
   * comma-separated list. Whitespace around each entry is trimmed.
   */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): PayloadCipher | undefined {
    const hex = env.EMBEDIQ_SESSION_DATA_KEY?.trim();
    if (!hex) return undefined;
    const previous = parsePreviousKeys(env.EMBEDIQ_SESSION_DATA_KEY_PREV);
    return PayloadCipher.fromHexKeys(hex, previous);
  }

  /**
   * Build a cipher from explicit hex strings. `previousHex` is an
   * optional list of decrypt-only fallback keys.
   */
  static fromHexKeys(
    activeHex: string,
    previousHex: readonly string[] = [],
  ): PayloadCipher {
    const activeKey = parseHexKey(activeHex, 'EMBEDIQ_SESSION_DATA_KEY');
    const previousKeys = previousHex.map((hex, idx) =>
      parseHexKey(hex, `EMBEDIQ_SESSION_DATA_KEY_PREV[${idx}]`),
    );
    return new PayloadCipher(activeKey, previousKeys);
  }

  /** Back-compat: single-key construction. */
  static fromHexKey(hex: string): PayloadCipher {
    return PayloadCipher.fromHexKeys(hex);
  }

  /** Number of decrypt-only fallback keys configured (for diagnostics). */
  get previousKeyCount(): number {
    return this.previousKeys.length;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.activeKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf-8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, ciphertext, tag]).toString('base64');
  }

  decrypt(encoded: string): string {
    const buf = Buffer.from(encoded, 'base64');
    if (buf.length < IV_BYTES + TAG_BYTES) {
      throw new Error('Encrypted payload is shorter than IV + tag');
    }
    const iv = buf.subarray(0, IV_BYTES);
    const tag = buf.subarray(buf.length - TAG_BYTES);
    const ciphertext = buf.subarray(IV_BYTES, buf.length - TAG_BYTES);

    let lastErr: Error | undefined;
    for (const key of [this.activeKey, ...this.previousKeys]) {
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf-8');
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        // Continue to next key — auth-tag mismatch is expected during
        // rotation when the blob was encrypted with a previous key.
      }
    }
    throw new Error(
      `Session payload decrypt failed against ${1 + this.previousKeys.length} ` +
      `key(s) — rotation may have removed the encrypting key prematurely. ` +
      `Last error: ${lastErr?.message ?? 'unknown'}`,
    );
  }
}

function parseHexKey(hex: string, label: string): Buffer {
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(`${label} must be a hex string`);
  }
  const key = Buffer.from(hex, 'hex');
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `${label} must decode to ${KEY_BYTES} bytes (got ${key.length})`,
    );
  }
  return key;
}

function parsePreviousKeys(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
