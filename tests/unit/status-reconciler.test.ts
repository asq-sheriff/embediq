import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryEventBus, StatusReconciler } from '../../src/events/index.js';
import {
  runWithContext,
  createRequestContext,
} from '../../src/context/request-context.js';

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** Emit an event inside a context scope so events pick up sessionId from ALS. */
function emitInSession<K extends 'session:started' | 'session:completed' | 'profile:built' | 'generation:started'>(
  bus: InMemoryEventBus,
  sessionId: string,
  name: K,
  payload: unknown,
): void {
  const ctx = createRequestContext({ sessionId });
  runWithContext(ctx, () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bus.emit(name, payload as any);
  });
}

describe('StatusReconciler', () => {
  let bus: InMemoryEventBus;
  let status: StatusReconciler;

  beforeEach(() => {
    bus = new InMemoryEventBus();
    status = new StatusReconciler();
    status.register(bus);
  });

  it('session:started places a session in discovery phase', async () => {
    bus.emit('session:started', { sessionId: 's1' });
    await flushMicrotasks();

    expect(status.getPhase('s1')).toBe('discovery');
    expect(status.getStatus('s1')?.lastEvent).toBe('session:started');
  });

  it('transitions through discovery → playback → generate → complete', async () => {
    emitInSession(bus, 's1', 'session:started', { sessionId: 's1' });
    await flushMicrotasks();
    expect(status.getPhase('s1')).toBe('discovery');

    emitInSession(bus, 's1', 'profile:built', {
      profileSummary: {
        role: 'developer',
        industry: 'saas',
        teamSize: 'solo',
        complianceFrameworks: [],
        securityLevel: 'standard',
        fileCount: 0,
      },
    });
    await flushMicrotasks();
    expect(status.getPhase('s1')).toBe('playback');

    emitInSession(bus, 's1', 'generation:started', { generatorCount: 12 });
    await flushMicrotasks();
    expect(status.getPhase('s1')).toBe('generate');

    emitInSession(bus, 's1', 'session:completed', { sessionId: 's1', fileCount: 12 });
    await flushMicrotasks();
    expect(status.getPhase('s1')).toBe('complete');
  });

  it('ignores profile:built and generation:started without a sessionId on the envelope', async () => {
    // No context scope — envelope.sessionId is undefined
    bus.emit('profile:built', {
      profileSummary: {
        role: 'developer',
        industry: 'saas',
        teamSize: 'solo',
        complianceFrameworks: [],
        securityLevel: 'standard',
        fileCount: 0,
      },
    });
    bus.emit('generation:started', { generatorCount: 3 });
    await flushMicrotasks();

    expect(status.getAll()).toHaveLength(0);
  });

  it('does not regress phase on duplicate or out-of-order events', async () => {
    emitInSession(bus, 's1', 'session:started', { sessionId: 's1' });
    emitInSession(bus, 's1', 'profile:built', {
      profileSummary: {
        role: 'developer',
        industry: 'saas',
        teamSize: 'solo',
        complianceFrameworks: [],
        securityLevel: 'standard',
        fileCount: 0,
      },
    });
    emitInSession(bus, 's1', 'generation:started', { generatorCount: 5 });
    await flushMicrotasks();
    expect(status.getPhase('s1')).toBe('generate');

    // Replay earlier events — phase must not roll back
    emitInSession(bus, 's1', 'session:started', { sessionId: 's1' });
    emitInSession(bus, 's1', 'profile:built', {
      profileSummary: {
        role: 'developer',
        industry: 'saas',
        teamSize: 'solo',
        complianceFrameworks: [],
        securityLevel: 'standard',
        fileCount: 0,
      },
    });
    await flushMicrotasks();
    expect(status.getPhase('s1')).toBe('generate');
  });

  it('isolates sessions — one session does not affect another', async () => {
    emitInSession(bus, 's1', 'session:started', { sessionId: 's1' });
    emitInSession(bus, 's2', 'session:started', { sessionId: 's2' });
    emitInSession(bus, 's1', 'profile:built', {
      profileSummary: {
        role: 'developer',
        industry: 'saas',
        teamSize: 'solo',
        complianceFrameworks: [],
        securityLevel: 'standard',
        fileCount: 0,
      },
    });
    await flushMicrotasks();

    expect(status.getPhase('s1')).toBe('playback');
    expect(status.getPhase('s2')).toBe('discovery');
  });

  it('getAll returns every tracked session', async () => {
    bus.emit('session:started', { sessionId: 's1' });
    bus.emit('session:started', { sessionId: 's2' });
    bus.emit('session:started', { sessionId: 's3' });
    await flushMicrotasks();

    const all = status.getAll();
    expect(all).toHaveLength(3);
    expect(new Set(all.map((s) => s.sessionId))).toEqual(new Set(['s1', 's2', 's3']));
  });

  it('getStatus returns a copy — external mutation does not leak', async () => {
    bus.emit('session:started', { sessionId: 's1' });
    await flushMicrotasks();

    const snap = status.getStatus('s1')!;
    snap.phase = 'complete';

    expect(status.getPhase('s1')).toBe('discovery');
  });

  it('updatedAt reflects the last event timestamp', async () => {
    bus.emit('session:started', { sessionId: 's1' });
    await flushMicrotasks();

    const beforeUpdate = status.getStatus('s1')!.updatedAt;
    expect(beforeUpdate).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Give the clock a chance to advance to a different ISO millisecond
    await new Promise((r) => setTimeout(r, 5));

    emitInSession(bus, 's1', 'profile:built', {
      profileSummary: {
        role: 'developer',
        industry: 'saas',
        teamSize: 'solo',
        complianceFrameworks: [],
        securityLevel: 'standard',
        fileCount: 0,
      },
    });
    await flushMicrotasks();

    const afterUpdate = status.getStatus('s1')!.updatedAt;
    expect(afterUpdate >= beforeUpdate).toBe(true);
    expect(status.getStatus('s1')!.lastEvent).toBe('profile:built');
  });
});

describe('StatusReconciler backend rehydration', () => {
  function makeBackendStub(sessionOverrides?: Partial<{
    sessionId: string;
    phase: 'discovery' | 'playback' | 'edit' | 'generate' | 'complete';
    updatedAt: string;
  }>): { getCalls: string[]; backend: { name: 'json-file'; get: (id: string) => Promise<unknown>; put: () => Promise<unknown>; delete: () => Promise<boolean>; list: () => Promise<unknown>; touch: () => Promise<void> } } {
    const getCalls: string[] = [];
    const backend = {
      name: 'json-file' as const,
      get: async (id: string) => {
        getCalls.push(id);
        if (!sessionOverrides) return null;
        return {
          sessionId: sessionOverrides.sessionId ?? id,
          phase: sessionOverrides.phase ?? 'discovery',
          answers: {},
          generationHistory: [],
          createdAt: '2026-04-18T00:00:00.000Z',
          updatedAt: sessionOverrides.updatedAt ?? '2026-04-18T12:00:00.000Z',
          expiresAt: '2030-01-01T00:00:00.000Z',
          version: 1,
        };
      },
      put: async () => ({}),
      delete: async () => false,
      list: async () => ({ sessions: [] }),
      touch: async () => {},
    };
    return { getCalls, backend };
  }

  async function waitForBackendGet(getCalls: string[], timeoutMs = 500): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (getCalls.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setImmediate(r));
    }
  }

  it('advances phase to the backend\'s persisted value on session:started', async () => {
    const { getCalls, backend } = makeBackendStub({ phase: 'generate' });
    const bus = new InMemoryEventBus();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reconciler = new StatusReconciler({ backend: backend as any });
    reconciler.register(bus);

    bus.emit('session:started', { sessionId: 's1' });
    await waitForBackendGet(getCalls);
    await new Promise((r) => setImmediate(r));

    expect(reconciler.getPhase('s1')).toBe('generate');
    expect(reconciler.getStatus('s1')!.lastEvent).toBe('backend:rehydrated');
  });

  it('keeps the in-memory phase when the backend record is earlier', async () => {
    const { backend } = makeBackendStub({ phase: 'discovery' });
    const bus = new InMemoryEventBus();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reconciler = new StatusReconciler({ backend: backend as any });
    reconciler.register(bus);

    emitInSession(bus, 's1', 'session:started', { sessionId: 's1' });
    emitInSession(bus, 's1', 'generation:started', { generatorCount: 1 });
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    expect(reconciler.getPhase('s1')).toBe('generate');
  });

  it('ignores a missing backend record (get returns null)', async () => {
    const { backend } = makeBackendStub();
    const bus = new InMemoryEventBus();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reconciler = new StatusReconciler({ backend: backend as any });
    reconciler.register(bus);

    bus.emit('session:started', { sessionId: 'unknown' });
    await new Promise((r) => setImmediate(r));

    expect(reconciler.getPhase('unknown')).toBe('discovery');
  });

  it('swallows backend errors (fire-and-forget)', async () => {
    const backend = {
      name: 'json-file' as const,
      get: async () => {
        throw new Error('backend down');
      },
      put: async () => ({}),
      delete: async () => false,
      list: async () => ({ sessions: [] }),
      touch: async () => {},
    };
    const bus = new InMemoryEventBus();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reconciler = new StatusReconciler({ backend: backend as any });
    reconciler.register(bus);

    expect(() => bus.emit('session:started', { sessionId: 's1' })).not.toThrow();
    await new Promise((r) => setImmediate(r));
    expect(reconciler.getPhase('s1')).toBe('discovery');
  });

  it('skips backend calls when backend.name === "none"', async () => {
    const calls: string[] = [];
    const backend = {
      name: 'none' as const,
      get: async (id: string) => {
        calls.push(id);
        return null;
      },
      put: async () => ({}),
      delete: async () => false,
      list: async () => ({ sessions: [] }),
      touch: async () => {},
    };
    const bus = new InMemoryEventBus();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reconciler = new StatusReconciler({ backend: backend as any });
    reconciler.register(bus);

    bus.emit('session:started', { sessionId: 's1' });
    await new Promise((r) => setImmediate(r));
    expect(calls).toEqual([]);
  });
});
