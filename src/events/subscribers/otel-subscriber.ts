import { trace, type Counter, type Meter } from '@opentelemetry/api';
import { getMeter } from '../../observability/telemetry.js';
import type { EventBus, Unsubscribe } from '../bus.js';
import type { Subscriber } from '../subscriber.js';

/**
 * Translates bus events into OpenTelemetry metrics and span events.
 *
 * Counter names and labels preserve the surface previously emitted directly
 * from `SynthesizerOrchestrator` so existing dashboards continue to work:
 *   - `embediq.files_generated` — counter, incremented per file:generated
 *   - `embediq.generation_runs` — counter, labeled `generator_count`
 *   - `embediq.validations`     — counter, labeled `passed: 'true'|'false'`
 *
 * Every event is also attached as a span event on the currently-active
 * span (via `trace.getActiveSpan()`). This surfaces event markers on
 * existing span timelines without creating new duplicated spans.
 *
 * The subscriber is safe to register when OTel is disabled — `@opentelemetry/api`
 * returns noop implementations when no SDK is active.
 */
export class OtelSubscriber implements Subscriber {
  readonly name = 'otel';

  private filesGenerated: Counter;
  private generationRuns: Counter;
  private validations: Counter;

  constructor(meter: Meter = getMeter()) {
    this.filesGenerated = meter.createCounter('embediq.files_generated');
    this.generationRuns = meter.createCounter('embediq.generation_runs');
    this.validations = meter.createCounter('embediq.validations');
  }

  register(bus: EventBus): Unsubscribe[] {
    return [
      // Every event surfaces as a span event on the active span timeline.
      bus.onAny((env) => {
        trace.getActiveSpan()?.addEvent(env.name);
      }),

      bus.on('file:generated', () => {
        this.filesGenerated.add(1);
      }),

      bus.on('generation:started', (env) => {
        this.generationRuns.add(1, { generator_count: env.payload.generatorCount });
      }),

      bus.on('validation:completed', (env) => {
        this.validations.add(1, { passed: String(env.payload.failCount === 0) });
      }),
    ];
  }
}
