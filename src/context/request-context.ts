import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface RequestContext {
  /** Unique identifier for this request */
  requestId: string;
  /** Authenticated user ID (undefined if no auth) */
  userId?: string;
  /** Authenticated user display name */
  displayName?: string;
  /** Authenticated user roles */
  roles?: string[];
  /** Request start time (high-resolution) */
  startedAt: number;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Run a callback within a request context. All code executed within the
 * callback (including async continuations) can access the context via
 * `getRequestContext()`.
 */
export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/**
 * Get the current request context, or undefined if called outside a
 * request scope (e.g., CLI mode or startup code).
 */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * Create a new RequestContext with a generated requestId and current timestamp.
 */
export function createRequestContext(opts?: {
  userId?: string;
  displayName?: string;
  roles?: string[];
}): RequestContext {
  return {
    requestId: randomUUID(),
    userId: opts?.userId,
    displayName: opts?.displayName,
    roles: opts?.roles,
    startedAt: performance.now(),
  };
}
