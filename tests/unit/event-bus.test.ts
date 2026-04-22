import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  InMemoryEventBus,
  getEventBus,
  setEventBus,
  resetEventBus,
  type EventEnvelope,
} from '../../src/events/index.js';
import {
  runWithContext,
  createRequestContext,
} from '../../src/context/request-context.js';
import { Dimension } from '../../src/types/index.js';

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('InMemoryEventBus', () => {
  let bus: InMemoryEventBus;

  beforeEach(() => {
    bus = new InMemoryEventBus();
  });

  describe('emit / on', () => {
    it('delivers an event to a named subscriber', async () => {
      const received: EventEnvelope<'file:generated'>[] = [];
      bus.on('file:generated', (env) => received.push(env));

      bus.emit('file:generated', { relativePath: 'CLAUDE.md', size: 42 });
      await flushMicrotasks();

      expect(received).toHaveLength(1);
      expect(received[0].name).toBe('file:generated');
      expect(received[0].payload).toEqual({ relativePath: 'CLAUDE.md', size: 42 });
    });

    it('does not deliver events to handlers for other event names', async () => {
      const fileHandler = vi.fn();
      const sessionHandler = vi.fn();
      bus.on('file:generated', fileHandler);
      bus.on('session:started', sessionHandler);

      bus.emit('session:started', { sessionId: 's1', templateId: 't1' });
      await flushMicrotasks();

      expect(fileHandler).not.toHaveBeenCalled();
      expect(sessionHandler).toHaveBeenCalledTimes(1);
    });

    it('supports multiple handlers on the same event', async () => {
      const a = vi.fn();
      const b = vi.fn();
      bus.on('generation:started', a);
      bus.on('generation:started', b);

      bus.emit('generation:started', { generatorCount: 12 });
      await flushMicrotasks();

      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
    });

    it('emit with no subscribers is a no-op', async () => {
      expect(() => bus.emit('file:generated', { relativePath: 'x', size: 1 })).not.toThrow();
      await flushMicrotasks();
    });

    it('returns synchronously even though delivery is on next microtask', () => {
      let delivered = false;
      bus.on('file:generated', () => {
        delivered = true;
      });
      bus.emit('file:generated', { relativePath: 'x', size: 1 });
      expect(delivered).toBe(false);
    });
  });

  describe('off / unsubscribe', () => {
    it('stops delivering to an unsubscribed handler', async () => {
      const handler = vi.fn();
      const unsubscribe = bus.on('file:generated', handler);

      unsubscribe();
      bus.emit('file:generated', { relativePath: 'x', size: 1 });
      await flushMicrotasks();

      expect(handler).not.toHaveBeenCalled();
    });

    it('off() removes a specific handler without affecting others', async () => {
      const a = vi.fn();
      const b = vi.fn();
      bus.on('file:generated', a);
      bus.on('file:generated', b);

      bus.off('file:generated', a);
      bus.emit('file:generated', { relativePath: 'x', size: 1 });
      await flushMicrotasks();

      expect(a).not.toHaveBeenCalled();
      expect(b).toHaveBeenCalledTimes(1);
    });

    it('off() on an unknown handler is safe', () => {
      expect(() => bus.off('file:generated', () => {})).not.toThrow();
    });
  });

  describe('onAny', () => {
    it('receives every event across all names', async () => {
      const received: string[] = [];
      bus.onAny((env) => received.push(env.name));

      bus.emit('session:started', { sessionId: 's1' });
      bus.emit('generation:started', { generatorCount: 3 });
      bus.emit('session:completed', { sessionId: 's1', fileCount: 5 });
      await flushMicrotasks();

      expect(received).toEqual(['session:started', 'generation:started', 'session:completed']);
    });

    it('can be unsubscribed', async () => {
      const handler = vi.fn();
      const unsubscribe = bus.onAny(handler);
      unsubscribe();

      bus.emit('session:started', { sessionId: 's1' });
      await flushMicrotasks();

      expect(handler).not.toHaveBeenCalled();
    });

    it('allows type narrowing via env.name', async () => {
      let captured: number | undefined;
      bus.onAny((env) => {
        if (env.name === 'file:generated') {
          captured = env.payload.size;
        }
      });

      bus.emit('file:generated', { relativePath: 'x', size: 99 });
      await flushMicrotasks();

      expect(captured).toBe(99);
    });
  });

  describe('envelope metadata', () => {
    it('stamps a monotonically increasing seq', async () => {
      const seqs: number[] = [];
      bus.onAny((env) => seqs.push(env.seq));

      bus.emit('session:started', { sessionId: 's1' });
      bus.emit('generation:started', { generatorCount: 1 });
      bus.emit('session:completed', { sessionId: 's1', fileCount: 0 });
      await flushMicrotasks();

      expect(seqs).toEqual([1, 2, 3]);
    });

    it('stamps an ISO timestamp', async () => {
      let emittedAt: string | undefined;
      bus.onAny((env) => {
        emittedAt = env.emittedAt;
      });

      bus.emit('session:started', { sessionId: 's1' });
      await flushMicrotasks();

      expect(emittedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('leaves context fields undefined outside a request scope', async () => {
      let env: EventEnvelope | undefined;
      bus.onAny((e) => {
        env = e;
      });

      bus.emit('session:started', { sessionId: 's1' });
      await flushMicrotasks();

      expect(env?.requestId).toBeUndefined();
      expect(env?.userId).toBeUndefined();
      expect(env?.sessionId).toBeUndefined();
    });

    it('auto-enriches requestId and userId from RequestContext', async () => {
      const ctx = createRequestContext({ userId: 'alice' });
      let env: EventEnvelope | undefined;
      bus.onAny((e) => {
        env = e;
      });

      runWithContext(ctx, () => {
        bus.emit('session:started', { sessionId: 's1' });
      });
      await flushMicrotasks();

      expect(env?.requestId).toBe(ctx.requestId);
      expect(env?.userId).toBe('alice');
    });

    it('auto-enriches sessionId from RequestContext when present', async () => {
      const ctx = createRequestContext({ userId: 'alice', sessionId: 'sess-xyz' });
      let env: EventEnvelope | undefined;
      bus.onAny((e) => {
        env = e;
      });

      runWithContext(ctx, () => {
        bus.emit('generation:started', { generatorCount: 4 });
      });
      await flushMicrotasks();

      expect(env?.sessionId).toBe('sess-xyz');
    });

    it('propagates context through queueMicrotask boundary to handlers', async () => {
      // The handler runs on a microtask. Node's AsyncLocalStorage is preserved
      // across microtasks, so a handler emitting a follow-up event sees the
      // same context the original emitter saw.
      const ctx = createRequestContext({ userId: 'propagated' });
      const inner: EventEnvelope[] = [];
      bus.on('session:started', () => {
        bus.emit('generation:started', { generatorCount: 1 });
      });
      bus.on('generation:started', (env) => inner.push(env));

      runWithContext(ctx, () => {
        bus.emit('session:started', { sessionId: 's1' });
      });
      await flushMicrotasks();
      await flushMicrotasks();

      expect(inner).toHaveLength(1);
      expect(inner[0].userId).toBe('propagated');
      expect(inner[0].requestId).toBe(ctx.requestId);
    });
  });

  describe('subscriber exception isolation', () => {
    it('a throwing handler does not prevent other handlers from running', async () => {
      const good = vi.fn();
      const errors: unknown[] = [];
      bus.setErrorHandler((err) => errors.push(err));
      bus.on('file:generated', () => {
        throw new Error('boom');
      });
      bus.on('file:generated', good);

      bus.emit('file:generated', { relativePath: 'x', size: 1 });
      await flushMicrotasks();

      expect(good).toHaveBeenCalledTimes(1);
      expect(errors).toHaveLength(1);
      expect((errors[0] as Error).message).toBe('boom');
    });

    it('a throwing handler does not break subsequent emits', async () => {
      const received: number[] = [];
      bus.setErrorHandler(() => {});
      bus.on('generation:started', () => {
        throw new Error('boom');
      });
      bus.on('generation:started', (env) => received.push(env.payload.generatorCount));

      bus.emit('generation:started', { generatorCount: 1 });
      bus.emit('generation:started', { generatorCount: 2 });
      await flushMicrotasks();

      expect(received).toEqual([1, 2]);
    });

    it('error handler exceptions are swallowed', async () => {
      bus.setErrorHandler(() => {
        throw new Error('error handler also broken');
      });
      bus.on('session:started', () => {
        throw new Error('boom');
      });

      bus.emit('session:started', { sessionId: 's1' });
      await expect(flushMicrotasks()).resolves.toBeUndefined();
    });

    it('both named and any handlers are isolated from each other', async () => {
      const anyReceived = vi.fn();
      bus.setErrorHandler(() => {});
      bus.on('session:started', () => {
        throw new Error('named broken');
      });
      bus.onAny(anyReceived);

      bus.emit('session:started', { sessionId: 's1' });
      await flushMicrotasks();

      expect(anyReceived).toHaveBeenCalledTimes(1);
    });
  });

  describe('typed payloads', () => {
    it('preserves payload types on named handlers', async () => {
      let dimension: Dimension | undefined;
      bus.on('dimension:completed', (env) => {
        dimension = env.payload.dimension;
      });

      bus.emit('dimension:completed', {
        dimension: Dimension.STRATEGIC_INTENT,
        questionsAnswered: 5,
      });
      await flushMicrotasks();

      expect(dimension).toBe(Dimension.STRATEGIC_INTENT);
    });
  });
});

describe('getEventBus / setEventBus singleton', () => {
  afterEach(() => {
    resetEventBus();
  });

  it('returns the same instance across calls', () => {
    const a = getEventBus();
    const b = getEventBus();
    expect(a).toBe(b);
  });

  it('setEventBus overrides the singleton (for tests/DI)', () => {
    const custom = new InMemoryEventBus();
    setEventBus(custom);
    expect(getEventBus()).toBe(custom);
  });

  it('resetEventBus clears the cached instance', () => {
    const first = getEventBus();
    resetEventBus();
    const second = getEventBus();
    expect(second).not.toBe(first);
  });
});
