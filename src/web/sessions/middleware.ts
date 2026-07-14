import type { NextFunction, Request, Response } from 'express';
import { getRequestContext } from '../../context/request-context.js';
import type { SessionBackend } from './session-backend.js';
import type { WizardSession } from './types.js';
import { RequestSessionStore } from './session-store.js';
import {
  OWNER_COOKIE_NAME,
  getCookieSecrets,
  parseCookies,
  verifyOwnerToken,
} from './cookie.js';

/** Tracks in-flight persistence writes so tests (and graceful shutdown) can wait for them. */
const pendingWrites = new Set<Promise<unknown>>();

/**
 * Wait for every in-flight session persistence write to settle. Used by
 * tests that assert backend state immediately after a request resolves,
 * and by server shutdown code that wants to drain pending writes.
 */
export async function flushSessionWrites(): Promise<void> {
  await Promise.allSettled(Array.from(pendingWrites));
}

/**
 * Load and persist wizard sessions around each request.
 *
 *   - Fast-paths to noop when the backend is `none`.
 *   - Resolves sessionId from `x-embediq-session`, request body, then query.
 *   - Hydrates the store when the backend returns a session; ownership
 *     mismatches under authentication short-circuit with 403.
 *   - Installs a `res.on('finish')` hook that writes back the snapshot
 *     only when the store is dirty and the response succeeded (< 500).
 */
export function sessionMiddleware(backend: SessionBackend) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (backend.name === 'none') {
      next();
      return;
    }

    const ctx = getRequestContext();
    if (!ctx) {
      next();
      return;
    }

    const store = new RequestSessionStore();
    ctx.sessionStore = store;

    const sessionId = extractSessionId(req);
    if (sessionId) {
      const session = await backend.get(sessionId);
      if (session) {
        // A non-owner is permitted only as an invited delegate: they present a
        // `?role=` matching an assignment the owner created. The session id +
        // role + an existing assignment is the bearer capability; their role is
        // recorded so writes can be restricted to that slice.
        const delegateRole = delegatedAccess(req, session);

        if (delegateRole) {
          ctx.delegateRole = delegateRole;
        } else if (ctx.userId && session.userId) {
          if (session.userId !== ctx.userId) {
            res.status(403).json({ error: 'Session belongs to a different user' });
            return;
          }
        } else if (session.ownerToken) {
          // Auth off — the owner is bound via a signed cookie.
          const presented = readOwnerCookieToken(req);
          if (presented !== session.ownerToken) {
            res.status(403).json({ error: 'Invalid session owner token' });
            return;
          }
        }
        store.hydrate(session);
        ctx.sessionId = sessionId;
      }
    }

    // Register a settlement promise for THIS request synchronously, before
    // next() runs. The write itself is only known at 'finish' (after the
    // response is sent), which fires on the server *after* the client's request
    // promise resolves — so registering the write inside 'finish' left a race
    // where flushSessionWrites() (tests + graceful shutdown) could run in the
    // gap and miss the just-triggered write. Registering the settlement promise
    // up front closes that race: the flush always sees every in-flight request.
    let settle!: () => void;
    const settled = new Promise<void>((resolve) => { settle = resolve; });
    pendingWrites.add(settled);
    settled.finally(() => pendingWrites.delete(settled));

    let done = false;
    res.on('finish', () => {
      if (done) return;
      done = true;
      if (!store.isDirty() || res.statusCode >= 500) { settle(); return; }
      const snap = store.snapshot();
      if (!snap) { settle(); return; }
      backend.put(snap)
        .catch((err) => { console.error('Session persist failed:', err); })
        .finally(() => settle());
    });
    // A 'close' without a preceding 'finish' means the connection aborted — no
    // write, but the settlement promise must still resolve so the flush can't hang.
    res.on('close', () => {
      if (done) return;
      done = true;
      settle();
    });

    next();
  };
}

function readOwnerCookieToken(req: Request): string | null {
  const cookies = parseCookies(req.headers.cookie);
  const signed = cookies[OWNER_COOKIE_NAME];
  if (!signed) return null;
  return verifyOwnerToken(signed, getCookieSecrets());
}

/**
 * Returns the delegate role when this request is a valid delegated access:
 * a `?role=lead|individual` that matches an assignment the owner created on
 * this session. Returns undefined otherwise (falls through to owner checks).
 */
function delegatedAccess(req: Request, session: WizardSession): 'lead' | 'individual' | undefined {
  const role = req.query.role;
  if (role !== 'lead' && role !== 'individual') return undefined;
  const hasAssignment = (session.assignments ?? []).some((a) => a.role === role);
  return hasAssignment ? role : undefined;
}

/** Matches /api/sessions/<id>[/anything], excluding the `dumps` sub-path. */
const SESSION_PATH_RE = /^\/api\/sessions\/([^/]+)(?:\/|$)/;

function extractSessionId(req: Request): string | undefined {
  const pathMatch = SESSION_PATH_RE.exec(req.path);
  if (pathMatch) {
    const candidate = pathMatch[1];
    if (candidate !== 'dumps' && candidate.length >= 8) return candidate;
  }

  const header = req.header('x-embediq-session');
  if (typeof header === 'string' && header) return header;

  const body = req.body as { sessionId?: unknown } | undefined;
  if (body && typeof body.sessionId === 'string' && body.sessionId) return body.sessionId;

  const query = req.query.sessionId;
  if (typeof query === 'string' && query) return query;

  return undefined;
}
