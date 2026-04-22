import type { EventBus, Unsubscribe } from '../bus.js';
import type { Subscriber } from '../subscriber.js';

/**
 * Point-in-time snapshot of aggregate counters. Returned by
 * `MetricsCollector.getSnapshot()` and intended for later consumption by
 * the evaluation framework (6D) and optional metrics export endpoints.
 */
export interface MetricsSnapshot {
  sessionsStarted: number;
  sessionsCompleted: number;
  profilesBuilt: number;
  generationRuns: number;
  filesGenerated: number;
  totalFileBytes: number;
  questionsPresented: number;
  answersReceived: number;
  dimensionsCompleted: number;
  validationsPassed: number;
  validationsFailed: number;
}

/**
 * Aggregates bus events into in-memory counters. Zero persistence — state
 * lives only for the lifetime of the process. Used as an observability
 * surface for the wizard and as a feed for the future evaluation framework.
 */
export class MetricsCollector implements Subscriber {
  readonly name = 'metrics';

  private snapshot: MetricsSnapshot = {
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
  };

  register(bus: EventBus): Unsubscribe[] {
    return [
      bus.on('session:started', () => {
        this.snapshot.sessionsStarted++;
      }),
      bus.on('session:completed', () => {
        this.snapshot.sessionsCompleted++;
      }),
      bus.on('profile:built', () => {
        this.snapshot.profilesBuilt++;
      }),
      bus.on('generation:started', () => {
        this.snapshot.generationRuns++;
      }),
      bus.on('file:generated', (env) => {
        this.snapshot.filesGenerated++;
        this.snapshot.totalFileBytes += env.payload.size;
      }),
      bus.on('question:presented', () => {
        this.snapshot.questionsPresented++;
      }),
      bus.on('answer:received', () => {
        this.snapshot.answersReceived++;
      }),
      bus.on('dimension:completed', () => {
        this.snapshot.dimensionsCompleted++;
      }),
      bus.on('validation:completed', (env) => {
        if (env.payload.failCount === 0) {
          this.snapshot.validationsPassed++;
        } else {
          this.snapshot.validationsFailed++;
        }
      }),
    ];
  }

  getSnapshot(): MetricsSnapshot {
    return { ...this.snapshot };
  }

  reset(): void {
    for (const key of Object.keys(this.snapshot) as Array<keyof MetricsSnapshot>) {
      this.snapshot[key] = 0;
    }
  }
}
