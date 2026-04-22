import type { SessionBackend } from './session-backend.js';
import type { SessionListResult, WizardSession } from './types.js';

/**
 * Structural noop backend. Selected when EMBEDIQ_SESSION_BACKEND is unset
 * or set to `none`. Lets request handlers hold a SessionBackend reference
 * unconditionally without branching on the presence of persistence.
 *
 * Semantic: nothing is stored. `get` always returns null. `put` echoes
 * the input without bumping version — callers that inspect `version`
 * observe that no persistence happened.
 */
export class NullBackend implements SessionBackend {
  readonly name = 'none' as const;

  async get(): Promise<WizardSession | null> {
    return null;
  }

  async put(session: WizardSession): Promise<WizardSession> {
    return session;
  }

  async delete(): Promise<boolean> {
    return false;
  }

  async list(): Promise<SessionListResult> {
    return { sessions: [] };
  }

  async touch(): Promise<void> {
    // noop
  }
}
