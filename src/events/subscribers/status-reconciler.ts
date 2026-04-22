import type { EventBus, Unsubscribe } from '../bus.js';
import type { EventEnvelope } from '../types.js';
import type { Subscriber } from '../subscriber.js';
// `import type` avoids a runtime cycle: sessions/types.ts references
// WizardPhase from this file.
import type { SessionBackend } from '../../web/sessions/session-backend.js';

export type WizardPhase = 'discovery' | 'playback' | 'edit' | 'generate' | 'complete';

export interface SessionStatus {
  sessionId: string;
  phase: WizardPhase;
  lastEvent: string;
  updatedAt: string;
}

export interface StatusReconcilerOptions {
  /** Optional backend for rehydrating phase from persisted sessions. */
  backend?: SessionBackend;
}

/**
 * Order ladder for phases. Reconciler refuses to move a session backwards
 * so out-of-order events (duplicate emits, replayed subscribers) never
 * regress phase. `edit` is reserved for a future event and has no trigger
 * yet, but is kept in the ladder so its position is stable.
 */
const PHASE_ORDER: Record<WizardPhase, number> = {
  discovery: 0,
  playback: 1,
  edit: 2,
  generate: 3,
  complete: 4,
};

/**
 * Tracks each wizard session's phase based on events. Held in memory —
 * cleared when the process exits.
 *
 * When a SessionBackend is supplied, the reconciler rehydrates phase from
 * the backend on `session:started` so state survives process restarts.
 * Writes still flow through the middleware+handler path; the reconciler
 * remains an observer.
 */
export class StatusReconciler implements Subscriber {
  readonly name = 'status-reconciler';

  private sessions = new Map<string, SessionStatus>();
  private readonly backend?: SessionBackend;

  constructor(opts: StatusReconcilerOptions = {}) {
    this.backend = opts.backend;
  }

  register(bus: EventBus): Unsubscribe[] {
    return [
      bus.on('session:started', (env) => {
        this.transition(env.payload.sessionId, 'discovery', env);
        this.rehydrateFromBackend(env.payload.sessionId);
      }),
      bus.on('profile:built', (env) => {
        if (env.sessionId) this.transition(env.sessionId, 'playback', env);
      }),
      bus.on('generation:started', (env) => {
        if (env.sessionId) this.transition(env.sessionId, 'generate', env);
      }),
      bus.on('session:completed', (env) =>
        this.transition(env.payload.sessionId, 'complete', env),
      ),
    ];
  }

  getPhase(sessionId: string): WizardPhase | undefined {
    return this.sessions.get(sessionId)?.phase;
  }

  getStatus(sessionId: string): SessionStatus | undefined {
    const status = this.sessions.get(sessionId);
    return status ? { ...status } : undefined;
  }

  getAll(): SessionStatus[] {
    return Array.from(this.sessions.values()).map((s) => ({ ...s }));
  }

  private transition(sessionId: string, target: WizardPhase, env: EventEnvelope): void {
    const current = this.sessions.get(sessionId);
    // Refuse to move a session backwards on the phase ladder.
    if (current && PHASE_ORDER[target] < PHASE_ORDER[current.phase]) {
      return;
    }
    this.sessions.set(sessionId, {
      sessionId,
      phase: target,
      lastEvent: env.name,
      updatedAt: env.emittedAt,
    });
  }

  private rehydrateFromBackend(sessionId: string): void {
    const backend = this.backend;
    if (!backend || backend.name === 'none') return;

    backend
      .get(sessionId)
      .then((session) => {
        if (!session) return;
        const current = this.sessions.get(sessionId);
        if (current && PHASE_ORDER[session.phase] <= PHASE_ORDER[current.phase]) {
          return;
        }
        this.sessions.set(sessionId, {
          sessionId,
          phase: session.phase,
          lastEvent: 'backend:rehydrated',
          updatedAt: session.updatedAt,
        });
      })
      .catch(() => {
        // fire-and-forget — backend errors must not break the bus
      });
  }
}
