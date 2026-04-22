import { describe, it, expect } from 'vitest';
import { AdaptiveEngine } from '../../src/engine/adaptive-engine.js';
import { InMemoryEventBus } from '../../src/events/index.js';
import type { Answer, Question } from '../../src/types/index.js';

class StubUI {
  dimensionHeader(): void {}
  progressBar(): void {}
  async askQuestion(question: Question): Promise<Answer> {
    return { questionId: question.id, value: 'x', timestamp: new Date() };
  }
}

describe('AdaptiveEngine.serialize / restore', () => {
  it('serializes the answers map with ISO timestamps', () => {
    const engine = new AdaptiveEngine(new StubUI() as unknown as never, new InMemoryEventBus());
    const answers = engine.getAnswers();
    answers.set('STRAT_000', {
      questionId: 'STRAT_000',
      value: 'developer',
      timestamp: new Date('2026-04-01T12:00:00Z'),
    });
    answers.set('TECH_001', {
      questionId: 'TECH_001',
      value: ['typescript', 'python'],
      timestamp: new Date('2026-04-01T12:01:00Z'),
    });

    const snapshot = engine.serialize();
    expect(snapshot.answers).toHaveLength(2);
    const strat = snapshot.answers.find(([id]) => id === 'STRAT_000')![1];
    expect(strat.timestamp).toBe('2026-04-01T12:00:00.000Z');
    expect(strat.value).toBe('developer');
    expect(JSON.stringify(snapshot)).toBeTruthy();
  });

  it('restore replaces in-memory answers with the snapshot', () => {
    const engine = new AdaptiveEngine(new StubUI() as unknown as never, new InMemoryEventBus());
    engine.getAnswers().set('SHOULD_BE_REPLACED', {
      questionId: 'SHOULD_BE_REPLACED',
      value: 'old',
      timestamp: new Date(),
    });

    engine.restore({
      answers: [
        ['STRAT_000', { questionId: 'STRAT_000', value: 'developer', timestamp: '2026-04-01T12:00:00.000Z' }],
        ['REG_001', { questionId: 'REG_001', value: true, timestamp: '2026-04-01T12:01:00.000Z' }],
      ],
    });

    const restored = engine.getAnswers();
    expect(restored.size).toBe(2);
    expect(restored.get('STRAT_000')?.value).toBe('developer');
    expect(restored.get('REG_001')?.value).toBe(true);
    expect(restored.get('REG_001')?.timestamp.toISOString()).toBe('2026-04-01T12:01:00.000Z');
    expect(restored.has('SHOULD_BE_REPLACED')).toBe(false);
  });

  it('serialize → restore is a round-trip', () => {
    const engine1 = new AdaptiveEngine(new StubUI() as unknown as never, new InMemoryEventBus());
    engine1.getAnswers().set('STRAT_000', {
      questionId: 'STRAT_000',
      value: 'developer',
      timestamp: new Date('2026-04-01T12:00:00Z'),
    });
    engine1.getAnswers().set('TECH_001', {
      questionId: 'TECH_001',
      value: ['typescript'],
      timestamp: new Date('2026-04-01T12:01:00Z'),
    });

    const engine2 = new AdaptiveEngine(new StubUI() as unknown as never, new InMemoryEventBus());
    engine2.restore(engine1.serialize());

    expect(engine2.getAnswers().get('STRAT_000')?.value).toBe('developer');
    expect(engine2.getAnswers().get('TECH_001')?.value).toEqual(['typescript']);
  });
});
