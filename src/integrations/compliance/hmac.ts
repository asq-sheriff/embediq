import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Compute the lowercase hex HMAC-SHA256 of `body` under `secret`.
 * Callers compare the result to a header value presented by the
 * platform — always via `timingSafeCompare` to avoid leaking the
 * expected digest through response timing.
 */
export function hmacSha256Hex(secret: string, body: Buffer | string): string {
  const h = createHmac('sha256', secret);
  h.update(typeof body === 'string' ? Buffer.from(body, 'utf-8') : body);
  return h.digest('hex');
}

/**
 * Constant-time comparison of two ASCII strings. Returns `false`
 * immediately on length mismatch (Node's `timingSafeEqual` throws in
 * that case). Strips an optional algorithm prefix like `sha256=` off
 * `presented` so callers need not branch on whether the platform
 * adopts that convention.
 */
export function timingSafeCompare(expected: string, presented: string): boolean {
  const normalizedPresented = stripAlgorithmPrefix(presented);
  if (expected.length !== normalizedPresented.length) return false;
  const a = Buffer.from(expected, 'utf-8');
  const b = Buffer.from(normalizedPresented, 'utf-8');
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function stripAlgorithmPrefix(value: string): string {
  const m = /^sha256=(.*)$/.exec(value);
  return m ? m[1] : value;
}
