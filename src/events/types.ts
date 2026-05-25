import type { Answer, Dimension, ValidationCheck } from '../types/index.js';

/**
 * Compact profile projection safe for JSON serialization and transmission
 * over the WebSocket boundary. Mirrors the shape already used by the
 * audit log's profileSummary field.
 */
export interface ProfileSummary {
  role: string;
  industry: string;
  teamSize: string;
  complianceFrameworks: string[];
  securityLevel: string;
  fileCount: number;
}

/**
 * Typed event map: the single source of truth for event names and payloads.
 * Keys use `resource:action` naming convention.
 */
export interface WizardEvents {
  'question:presented': { questionId: string; dimension: Dimension };
  'answer:received': { questionId: string; answerValue: Answer['value'] };
  'dimension:completed': { dimension: Dimension; questionsAnswered: number };
  'profile:built': { profileSummary: ProfileSummary };
  'generation:started': { generatorCount: number };
  'file:generated': { relativePath: string; size: number };
  'validation:completed': { passCount: number; failCount: number; checks: ValidationCheck[] };
  'session:started': { sessionId: string; templateId?: string };
  'session:completed': { sessionId: string; fileCount: number };
  /**
   * Emitted exactly once when an autopilot schedule's consecutive-failure
   * count first crosses its alert threshold. Suppressed on subsequent
   * failures until a success resets the streak. The webhook subscriber
   * picks it up by default (chat-worthy).
   */
  'autopilot:alerting': {
    scheduleId: string;
    scheduleName: string;
    failureCount: number;
    mostRecentError?: string;
    lastSuccessAt?: string;
  };
}

export type EventName = keyof WizardEvents;

export type EventPayload<K extends EventName> = WizardEvents[K];

/**
 * Full event object delivered to subscribers. Wraps the payload with
 * metadata populated by the bus at emit time. Declared as a distributive
 * conditional type so `EventEnvelope` (unparameterized) is a discriminated
 * union on `name`, giving control-flow narrowing inside `switch (env.name)`.
 */
export type EventEnvelope<K extends EventName = EventName> = K extends EventName
  ? {
      name: K;
      payload: WizardEvents[K];
      requestId?: string;
      userId?: string;
      sessionId?: string;
      emittedAt: string;
      seq: number;
    }
  : never;
