import { getRequestContext } from '../context/request-context.js';
import type { EventEnvelope, EventName, WizardEvents } from './types.js';

export type EventHandler<K extends EventName> = (env: EventEnvelope<K>) => void;
export type AnyEventHandler = (env: EventEnvelope) => void;
export type Unsubscribe = () => void;
export type ErrorHandler = (err: unknown, env: EventEnvelope) => void;

export interface EventBus {
  emit<K extends EventName>(name: K, payload: WizardEvents[K]): void;
  on<K extends EventName>(name: K, handler: EventHandler<K>): Unsubscribe;
  off<K extends EventName>(name: K, handler: EventHandler<K>): void;
  onAny(handler: AnyEventHandler): Unsubscribe;
  setErrorHandler(handler: ErrorHandler): void;
}

export class InMemoryEventBus implements EventBus {
  private handlers = new Map<EventName, Set<AnyEventHandler>>();
  private anyHandlers = new Set<AnyEventHandler>();
  private seq = 0;
  private errorHandler: ErrorHandler = (err, env) => {
    // eslint-disable-next-line no-console
    console.error(`Event subscriber failed for ${env.name}:`, err);
  };

  emit<K extends EventName>(name: K, payload: WizardEvents[K]): void {
    const ctx = getRequestContext();
    // Construction is correct at runtime; the distributive conditional type
    // of `EventEnvelope<K>` requires a cast for a generic K here.
    const envelope = {
      name,
      payload,
      requestId: ctx?.requestId,
      userId: ctx?.userId,
      sessionId: ctx?.sessionId,
      emittedAt: new Date().toISOString(),
      seq: ++this.seq,
    } as EventEnvelope<K>;

    const named = this.handlers.get(name);
    const anySnapshot = Array.from(this.anyHandlers);
    const namedSnapshot = named ? Array.from(named) : [];

    queueMicrotask(() => {
      for (const handler of namedSnapshot) {
        try {
          handler(envelope);
        } catch (err) {
          this.safeReportError(err, envelope);
        }
      }
      for (const handler of anySnapshot) {
        try {
          handler(envelope);
        } catch (err) {
          this.safeReportError(err, envelope);
        }
      }
    });
  }

  on<K extends EventName>(name: K, handler: EventHandler<K>): Unsubscribe {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(handler as AnyEventHandler);
    return () => this.off(name, handler);
  }

  off<K extends EventName>(name: K, handler: EventHandler<K>): void {
    const set = this.handlers.get(name);
    if (!set) return;
    set.delete(handler as AnyEventHandler);
    if (set.size === 0) this.handlers.delete(name);
  }

  onAny(handler: AnyEventHandler): Unsubscribe {
    this.anyHandlers.add(handler);
    return () => {
      this.anyHandlers.delete(handler);
    };
  }

  setErrorHandler(handler: ErrorHandler): void {
    this.errorHandler = handler;
  }

  private safeReportError(err: unknown, envelope: EventEnvelope): void {
    try {
      this.errorHandler(err, envelope);
    } catch {
      // swallow — a broken error handler must not poison emit
    }
  }
}

let busInstance: EventBus | undefined;

export function getEventBus(): EventBus {
  if (!busInstance) busInstance = new InMemoryEventBus();
  return busInstance;
}

export function setEventBus(bus: EventBus | undefined): void {
  busInstance = bus;
}

export function resetEventBus(): void {
  busInstance = undefined;
}
