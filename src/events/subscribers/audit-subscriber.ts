import { auditLog, type WizardAuditEntry } from '../../util/wizard-audit.js';
import type { EventBus, Unsubscribe } from '../bus.js';
import type { EventEnvelope } from '../types.js';
import type { Subscriber } from '../subscriber.js';

/**
 * Translates bus events into WizardAuditEntry rows and writes them via
 * the existing auditLog() function. Preserves the EMBEDIQ_AUDIT_LOG noop
 * gate — if the env var is not set, auditLog() short-circuits.
 *
 * Events without an audit analogue (question:presented, answer:received,
 * dimension:completed) are intentionally ignored.
 */
export class AuditSubscriber implements Subscriber {
  readonly name = 'audit';

  register(bus: EventBus): Unsubscribe[] {
    return [bus.onAny((env) => this.handle(env))];
  }

  private handle(env: EventEnvelope): void {
    const entry = this.toAuditEntry(env);
    if (entry) auditLog(entry);
  }

  private toAuditEntry(env: EventEnvelope): WizardAuditEntry | undefined {
    const base = {
      timestamp: env.emittedAt,
      userId: env.userId,
      requestId: env.requestId,
    };

    switch (env.name) {
      case 'session:started':
        return { ...base, eventType: 'session_start' };

      case 'profile:built':
        return {
          ...base,
          eventType: 'profile_built',
          profileSummary: env.payload.profileSummary,
        };

      case 'generation:started':
        return { ...base, eventType: 'generation_started' };

      case 'validation:completed':
        return {
          ...base,
          eventType: 'validation_result',
          validationPassed: env.payload.failCount === 0,
          validationErrorCount: env.payload.failCount,
        };

      case 'file:generated':
        return {
          ...base,
          eventType: 'file_written',
          filePath: env.payload.relativePath,
          fileSize: env.payload.size,
        };

      case 'session:completed':
        return { ...base, eventType: 'session_complete' };

      // Events without an audit mapping — present for exhaustiveness.
      case 'question:presented':
      case 'answer:received':
      case 'dimension:completed':
        return undefined;
    }
  }
}
