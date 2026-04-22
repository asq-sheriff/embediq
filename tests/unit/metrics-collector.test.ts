import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryEventBus, MetricsCollector } from '../../src/events/index.js';
import { Dimension } from '../../src/types/index.js';

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('MetricsCollector', () => {
  let bus: InMemoryEventBus;
  let metrics: MetricsCollector;

  beforeEach(() => {
    bus = new InMemoryEventBus();
    metrics = new MetricsCollector();
    metrics.register(bus);
  });

  it('starts with zeroed counters', () => {
    const snapshot = metrics.getSnapshot();
    expect(snapshot).toEqual({
      sessionsStarted: 0,
      sessionsCompleted: 0,
      profilesBuilt: 0,
      generationRuns: 0,
      filesGenerated: 0,
      totalFileBytes: 0,
      questionsPresented: 0,
      answersReceived: 0,
      dimensionsCompleted: 0,
      validationsPassed: 0,
      validationsFailed: 0,
    });
  });

  it('increments sessionsStarted / sessionsCompleted on session events', async () => {
    bus.emit('session:started', { sessionId: 's1' });
    bus.emit('session:started', { sessionId: 's2' });
    bus.emit('session:completed', { sessionId: 's1', fileCount: 5 });
    await flushMicrotasks();

    const snapshot = metrics.getSnapshot();
    expect(snapshot.sessionsStarted).toBe(2);
    expect(snapshot.sessionsCompleted).toBe(1);
  });

  it('accumulates total file bytes across file:generated events', async () => {
    bus.emit('file:generated', { relativePath: 'a.md', size: 100 });
    bus.emit('file:generated', { relativePath: 'b.md', size: 250 });
    bus.emit('file:generated', { relativePath: 'c.md', size: 50 });
    await flushMicrotasks();

    const snapshot = metrics.getSnapshot();
    expect(snapshot.filesGenerated).toBe(3);
    expect(snapshot.totalFileBytes).toBe(400);
  });

  it('splits validations into pass/fail counters', async () => {
    bus.emit('validation:completed', { passCount: 5, failCount: 0, checks: [] });
    bus.emit('validation:completed', { passCount: 3, failCount: 2, checks: [] });
    bus.emit('validation:completed', { passCount: 1, failCount: 0, checks: [] });
    await flushMicrotasks();

    const snapshot = metrics.getSnapshot();
    expect(snapshot.validationsPassed).toBe(2);
    expect(snapshot.validationsFailed).toBe(1);
  });

  it('counts questions, answers, and dimensions independently', async () => {
    bus.emit('question:presented', {
      questionId: 'STRAT_001',
      dimension: Dimension.STRATEGIC_INTENT,
    });
    bus.emit('question:presented', {
      questionId: 'STRAT_002',
      dimension: Dimension.STRATEGIC_INTENT,
    });
    bus.emit('answer:received', { questionId: 'STRAT_001', answerValue: 'yes' });
    bus.emit('dimension:completed', {
      dimension: Dimension.STRATEGIC_INTENT,
      questionsAnswered: 2,
    });
    await flushMicrotasks();

    const snapshot = metrics.getSnapshot();
    expect(snapshot.questionsPresented).toBe(2);
    expect(snapshot.answersReceived).toBe(1);
    expect(snapshot.dimensionsCompleted).toBe(1);
  });

  it('getSnapshot returns a copy — mutations do not leak into state', async () => {
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
    await flushMicrotasks();

    const snap = metrics.getSnapshot();
    snap.profilesBuilt = 999;
    expect(metrics.getSnapshot().profilesBuilt).toBe(1);
  });

  it('reset zeroes every counter', async () => {
    bus.emit('session:started', { sessionId: 's1' });
    bus.emit('file:generated', { relativePath: 'a.md', size: 100 });
    await flushMicrotasks();

    metrics.reset();

    const snap = metrics.getSnapshot();
    expect(snap.sessionsStarted).toBe(0);
    expect(snap.filesGenerated).toBe(0);
    expect(snap.totalFileBytes).toBe(0);
  });

  it('stops counting after unregister', async () => {
    const moreMetrics = new MetricsCollector();
    const unsubs = moreMetrics.register(bus);

    bus.emit('session:started', { sessionId: 's1' });
    await flushMicrotasks();
    expect(moreMetrics.getSnapshot().sessionsStarted).toBe(1);

    unsubs.forEach((u) => u());

    bus.emit('session:started', { sessionId: 's2' });
    await flushMicrotasks();
    expect(moreMetrics.getSnapshot().sessionsStarted).toBe(1);
  });
});
