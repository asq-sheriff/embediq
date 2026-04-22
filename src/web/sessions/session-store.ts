import type { WizardSession } from './types.js';

/**
 * Per-request handle for the active server-side session. Created by the
 * session middleware and attached to the request context; handlers read
 * and mutate through it rather than talking to the backend directly.
 *
 * `hydrate` installs a session loaded from the backend without flipping
 * the dirty flag. `set` and `mutate` both mark the store dirty so the
 * response-finish hook writes the snapshot back.
 */
export interface SessionStore {
  /** Current session in the store, or null if none is loaded. */
  current(): WizardSession | null;
  /** Install a session loaded from the backend. Does NOT mark dirty. */
  hydrate(session: WizardSession): void;
  /** Replace the current session and mark the store dirty. */
  set(session: WizardSession): void;
  /** Apply an in-place mutation and mark the store dirty. */
  mutate(fn: (session: WizardSession) => void): void;
  /** True when the session was created or modified during this request. */
  isDirty(): boolean;
  /** Snapshot reference. The finish hook passes this to `backend.put`. */
  snapshot(): WizardSession | null;
}

export class RequestSessionStore implements SessionStore {
  private session: WizardSession | null = null;
  private dirty = false;

  current(): WizardSession | null {
    return this.session;
  }

  hydrate(session: WizardSession): void {
    this.session = session;
    this.dirty = false;
  }

  set(session: WizardSession): void {
    this.session = session;
    this.dirty = true;
  }

  mutate(fn: (session: WizardSession) => void): void {
    if (!this.session) {
      throw new Error('SessionStore.mutate called without a loaded session');
    }
    fn(this.session);
    this.dirty = true;
  }

  isDirty(): boolean {
    return this.dirty;
  }

  snapshot(): WizardSession | null {
    return this.session;
  }
}
