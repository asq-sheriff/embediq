import type { NextFunction, Request, Response } from 'express';
import { getRequestContext } from '../../context/request-context.js';
import type { SessionBackend } from './session-backend.js';
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
        if (ctx.userId && session.userId) {
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

    res.on('finish', () => {
      if (!store.isDirty()) return;
      if (res.statusCode >= 500) return;
      const snap = store.snapshot();
      if (!snap) return;
      const write = backend.put(snap).catch((err) => {
        console.error('Session persist failed:', err);
      });
      pendingWrites.add(write);
      write.finally(() => pendingWrites.delete(write));
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
