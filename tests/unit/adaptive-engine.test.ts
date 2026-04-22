import { describe, it, expect } from 'vitest';
import { AdaptiveEngine } from '../../src/engine/adaptive-engine.js';
import { InMemoryEventBus, type EventEnvelope } from '../../src/events/index.js';
import type { ConsoleUI } from '../../src/ui/console.js';
import { Dimension, DIMENSION_ORDER, type Answer, type Question } from '../../src/types/index.js';

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * Scripted UI that answers each question with a sensible default matching
 * its type. Avoids terminal I/O and keeps the question bank on its default
 * branching path.
 */
class ScriptedUI {
  dimensionHeader(): void {}
  progressBar(): void {}
  async askQuestion(question: Question): Promise<Answer> {
    let value: string | string[] | number | boolean;
    switch (question.type) {
      case 'yes_no':
        value = false;
        break;
      case 'multi_choice':
        value = [];
        break;
      case 'scale':
        value = 3;
        break;
      case 'single_choice':
        value = question.options?.[0]?.key ?? '';
        break;
      case 'free_text':
      default:
        value = '';
    }
    return { questionId: question.id, value, timestamp: new Date() };
  }
}

describe('AdaptiveEngine event emission', () => {
  it('emits question:presented before each askQuestion and answer:received after', async () => {
    const bus = new InMemoryEventBus();
    const presented: string[] = [];
    const received: string[] = [];

    bus.on('question:presented', (env) => presented.push(env.payload.questionId));
    bus.on('answer:received', (env) => received.push(env.payload.questionId));

    const ui = new ScriptedUI() as unknown as ConsoleUI;
    const engine = new AdaptiveEngine(ui, bus);
    await engine.run();
    await flushMicrotasks();

    expect(presented.length).toBeGreaterThan(0);
    expect(presented.length).toBe(received.length);
    expect(presented).toEqual(received);
  });

  it('emits dimension:completed once per dimension in DIMENSION_ORDER', async () => {
    const bus = new InMemoryEventBus();
    const completed: Dimension[] = [];
    bus.on('dimension:completed', (env) => completed.push(env.payload.dimension));

    const ui = new ScriptedUI() as unknown as ConsoleUI;
    const engine = new AdaptiveEngine(ui, bus);
    await engine.run();
    await flushMicrotasks();

    expect(completed).toEqual(DIMENSION_ORDER);
  });

  it('emits profile:built exactly once at the end of run()', async () => {
    const bus = new InMemoryEventBus();
    const profiles: EventEnvelope<'profile:built'>[] = [];
    bus.on('profile:built', (env) => profiles.push(env));

    const ui = new ScriptedUI() as unknown as ConsoleUI;
    const engine = new AdaptiveEngine(ui, bus);
    await engine.run();
    await flushMicrotasks();

    expect(profiles).toHaveLength(1);
    expect(profiles[0].payload.profileSummary).toHaveProperty('role');
    expect(profiles[0].payload.profileSummary).toHaveProperty('industry');
  });

  it('dimension:completed payload carries the correct questionsAnswered count', async () => {
    const bus = new InMemoryEventBus();
    const byDimension = new Map<Dimension, number>();
    bus.on('dimension:completed', (env) => {
      byDimension.set(env.payload.dimension, env.payload.questionsAnswered);
    });
    const presentedPerDim = new Map<Dimension, number>();
    bus.on('question:presented', (env) => {
      presentedPerDim.set(
        env.payload.dimension,
        (presentedPerDim.get(env.payload.dimension) ?? 0) + 1,
      );
    });

    const ui = new ScriptedUI() as unknown as ConsoleUI;
    const engine = new AdaptiveEngine(ui, bus);
    await engine.run();
    await flushMicrotasks();

    for (const dim of DIMENSION_ORDER) {
      expect(byDimension.get(dim)).toBe(presentedPerDim.get(dim) ?? 0);
    }
  });

  it('ordering: all question:presented/answer:received for a dimension fire before dimension:completed', async () => {
    const bus = new InMemoryEventBus();
    const timeline: string[] = [];
    bus.onAny((env) => {
      if (env.name === 'question:presented') {
        timeline.push(`Q:${env.payload.dimension}`);
      } else if (env.name === 'dimension:completed') {
        timeline.push(`D:${env.payload.dimension}`);
      }
    });

    const ui = new ScriptedUI() as unknown as ConsoleUI;
    const engine = new AdaptiveEngine(ui, bus);
    await engine.run();
    await flushMicrotasks();

    for (let i = 0; i < timeline.length; i++) {
      const entry = timeline[i];
      if (entry.startsWith('D:')) {
        const dim = entry.slice(2);
        // No subsequent entry should be a Q for the same dimension
        for (let j = i + 1; j < timeline.length; j++) {
          expect(timeline[j]).not.toBe(`Q:${dim}`);
        }
      }
    }
  });
});
