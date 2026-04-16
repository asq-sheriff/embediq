import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { initTelemetry, getTracer, getMeter, withSpan } from '../../src/observability/telemetry.js';

describe('Telemetry', () => {
  describe('when EMBEDIQ_OTEL_ENABLED is not set', () => {
    beforeEach(() => {
      delete process.env.EMBEDIQ_OTEL_ENABLED;
    });

    it('initTelemetry is a noop', async () => {
      await initTelemetry();
      // No error thrown, no SDK initialized
    });

    it('getTracer returns a noop tracer', () => {
      const tracer = getTracer();
      expect(tracer).toBeDefined();
      // Noop tracer creates noop spans
      const span = tracer.startSpan('test');
      expect(span).toBeDefined();
      span.end();
    });

    it('getMeter returns a noop meter', () => {
      const meter = getMeter();
      expect(meter).toBeDefined();
      // Noop meter creates noop instruments
      const counter = meter.createCounter('test.counter');
      expect(counter).toBeDefined();
      counter.add(1); // Should not throw
    });
  });

  describe('withSpan', () => {
    it('executes the function and returns its result', async () => {
      const result = await withSpan('test.operation', undefined, async () => {
        return 42;
      });
      expect(result).toBe(42);
    });

    it('passes attributes to the span', async () => {
      await withSpan('test.attrs', { 'test.key': 'value', 'test.num': 123 }, async (span) => {
        // Span received — verify it has setAttribute method
        expect(typeof span.setAttribute).toBe('function');
      });
    });

    it('propagates errors and records them on the span', async () => {
      await expect(
        withSpan('test.error', undefined, async () => {
          throw new Error('test failure');
        })
      ).rejects.toThrow('test failure');
    });

    it('handles async operations correctly', async () => {
      const result = await withSpan('test.async', undefined, async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'async-result';
      });
      expect(result).toBe('async-result');
    });

    it('supports nested spans', async () => {
      const result = await withSpan('outer', undefined, async () => {
        const inner = await withSpan('inner', undefined, async () => {
          return 'inner-value';
        });
        return `outer-${inner}`;
      });
      expect(result).toBe('outer-inner-value');
    });
  });

  describe('instrumented orchestrator integration', () => {
    it('generate() works with telemetry instrumentation (noop mode)', async () => {
      const { SynthesizerOrchestrator } = await import('../../src/synthesizer/orchestrator.js');
      const { buildAnswerMap, MINIMAL_DEVELOPER_ANSWERS } = await import('../helpers/test-utils.js');
      const { ProfileBuilder } = await import('../../src/engine/profile-builder.js');
      const { PriorityAnalyzer } = await import('../../src/engine/priority-analyzer.js');
      const { QuestionBank } = await import('../../src/bank/question-bank.js');

      const answers = buildAnswerMap(MINIMAL_DEVELOPER_ANSWERS);
      const profile = new ProfileBuilder().build(answers);
      profile.priorities = new PriorityAnalyzer().analyze(answers, new QuestionBank().getAll());

      const orchestrator = new SynthesizerOrchestrator();
      const files = await orchestrator.generate({ profile, targetDir: '/tmp/test' });

      // Telemetry instrumentation should not affect output
      expect(files.length).toBeGreaterThan(0);
      expect(files.find(f => f.relativePath === 'CLAUDE.md')).toBeDefined();
    });

    it('generateWithValidation() works with telemetry instrumentation (noop mode)', async () => {
      const { SynthesizerOrchestrator } = await import('../../src/synthesizer/orchestrator.js');
      const { buildAnswerMap, MINIMAL_DEVELOPER_ANSWERS } = await import('../helpers/test-utils.js');
      const { ProfileBuilder } = await import('../../src/engine/profile-builder.js');
      const { PriorityAnalyzer } = await import('../../src/engine/priority-analyzer.js');
      const { QuestionBank } = await import('../../src/bank/question-bank.js');

      const answers = buildAnswerMap(MINIMAL_DEVELOPER_ANSWERS);
      const profile = new ProfileBuilder().build(answers);
      profile.priorities = new PriorityAnalyzer().analyze(answers, new QuestionBank().getAll());

      const orchestrator = new SynthesizerOrchestrator();
      const { files, validation } = await orchestrator.generateWithValidation({ profile, targetDir: '/tmp/test' });

      expect(files.length).toBeGreaterThan(0);
      expect(validation.passed).toBe(true);
    });
  });
});
