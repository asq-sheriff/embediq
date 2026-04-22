import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * AES-256-GCM wrapper used to encrypt session payload columns at rest.
 * Opt-in via `EMBEDIQ_SESSION_DATA_KEY` (64-character hex string).
 *
 * Format: `base64(iv || ciphertext || authTag)` — one opaque string column
 * the backend stores without any schema change.
 */
export class PayloadCipher {
  constructor(private readonly key: Buffer) {}

  /**
   * Build a cipher from `EMBEDIQ_SESSION_DATA_KEY` when set; returns
   * undefined otherwise so callers fall back to plaintext storage.
   */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): PayloadCipher | undefined {
    const hex = env.EMBEDIQ_SESSION_DATA_KEY?.trim();
    if (!hex) return undefined;
    return PayloadCipher.fromHexKey(hex);
  }

  static fromHexKey(hex: string): PayloadCipher {
    if (!/^[0-9a-fA-F]+$/.test(hex)) {
      throw new Error('EMBEDIQ_SESSION_DATA_KEY must be a hex string');
    }
    const key = Buffer.from(hex, 'hex');
    if (key.length !== KEY_BYTES) {
      throw new Error(
        `EMBEDIQ_SESSION_DATA_KEY must decode to ${KEY_BYTES} bytes (got ${key.length})`,
      );
    }
    return new PayloadCipher(key);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
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
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf-8');
  }
}
