import type { SessionListFilter, SessionListResult, WizardSession } from './types.js';

export type SessionBackendName = 'none' | 'json-file' | 'redis' | 'database';

/**
 * Persistence contract for server-side wizard sessions. Implementations
 * store the canonical WizardSession shape verbatim; they are responsible
 * for enforcing TTL on read (expired records must surface as `null`) and
 * for bumping the `version` field on each successful `put`.
 *
 * Concurrency: last-write-wins in 6B. The `version` field exists so 6C
 * can layer optimistic concurrency without a second interface break.
 */
export interface SessionBackend {
  readonly name: SessionBackendName;

  /** Read a session. Returns null when the id is unknown or expired. */
  get(sessionId: string): Promise<WizardSession | null>;

  /** Upsert a session. Returns the stored record with `version` bumped. */
  put(session: WizardSession): Promise<WizardSession>;

  /** Remove a session. Returns true when a record was deleted. */
  delete(sessionId: string): Promise<boolean>;

  /** Enumerate sessions, optionally filtered. */
  list(filter?: SessionListFilter): Promise<SessionListResult>;

  /** Refresh a session's TTL without rewriting the full record. */
  touch(sessionId: string, expiresAt: string): Promise<void>;

  /** Release any connections or file handles. Optional. */
  close?(): Promise<void>;
}
