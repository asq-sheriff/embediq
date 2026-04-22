import { createHmac, timingSafeEqual } from 'node:crypto';

export const OWNER_COOKIE_NAME = 'embediq_session_owner';

export interface CookieSecrets {
  /** Current signing secret. Required to sign any new cookies. */
  current?: string;
  /** Previous signing secret. Used only to verify cookies during a rotation window. */
  previous?: string;
}

export function getCookieSecrets(env: NodeJS.ProcessEnv = process.env): CookieSecrets {
  const current = env.EMBEDIQ_SESSION_COOKIE_SECRET?.trim();
  const previous = env.EMBEDIQ_SESSION_COOKIE_SECRET_PREV?.trim();
  return {
    current: current && current.length > 0 ? current : undefined,
    previous: previous && previous.length > 0 ? previous : undefined,
  };
}

/**
 * Sign an owner token with HMAC-SHA256. Returns `<token>.<signature>`.
 * The token itself is plain so a leaked cookie reveals nothing the server
 * cannot regenerate; the signature prevents forgery by a client that only
 * knows another session's sessionId.
 */
export function signOwnerToken(token: string, secret: string): string {
  const signature = createHmac('sha256', secret).update(token).digest('base64url');
  return `${token}.${signature}`;
}

/**
 * Verify a signed owner-token cookie against the current and previous
 * secrets. Returns the original token on success, or null when the cookie
 * is malformed, signed with neither secret, or both secrets are unset.
 *
 * Uses `timingSafeEqual` so signature checks do not leak timing data.
 */
export function verifyOwnerToken(
  signed: string,
  secrets: CookieSecrets,
): string | null {
  if (!secrets.current && !secrets.previous) return null;
  const lastDot = signed.lastIndexOf('.');
  if (lastDot <= 0) return null;
  const token = signed.slice(0, lastDot);
  const signature = signed.slice(lastDot + 1);
  const candidateSecrets = [secrets.current, secrets.previous].filter(
    (s): s is string => typeof s === 'string' && s.length > 0,
  );

  for (const secret of candidateSecrets) {
    const expected = createHmac('sha256', secret).update(token).digest('base64url');
    const received = Buffer.from(signature);
    const computed = Buffer.from(expected);
    if (received.length !== computed.length) continue;
    if (timingSafeEqual(received, computed)) return token;
  }
  return null;
}

/** Parse a cookie header into a name → value map. */
export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const pair of header.split(';')) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!name) continue;
    out[name] = decodeURIComponent(value);
  }
  return out;
}
