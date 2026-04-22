import type { JsonAutopilotStore } from './store.js';
import { runAutopilot } from './runner.js';
import { isDue } from './types.js';

const DEFAULT_TICK_MS = 60_000;

export interface SchedulerOptions {
  store: JsonAutopilotStore;
  /** Override the tick interval; honored over EMBEDIQ_AUTOPILOT_TICK_MS. */
  tickMs?: number;
  /** Inject a clock for tests. */
  now?: () => Date;
}

/**
 * Periodic ticker that scans the autopilot store for schedules whose
 * `nextRunAt` is in the past and fires them via `runAutopilot`. Designed
 * to run in-process inside the web server — Node's setInterval is enough
 * for a single-node v1.
 */
export class AutopilotScheduler {
  private readonly store: JsonAutopilotStore;
  private readonly tickMs: number;
  private readonly now: () => Date;
  private timer: NodeJS.Timeout | null = null;
  private tickInFlight: Promise<void> | null = null;

  constructor(options: SchedulerOptions) {
    this.store = options.store;
    this.tickMs = options.tickMs ?? envTickMs() ?? DEFAULT_TICK_MS;
    this.now = options.now ?? (() => new Date());
  }

  start(): void {
    if (this.timer) return;
    // Use unref so the scheduler does not hold the event loop open for
    // graceful shutdown — the web server controls process lifetime.
    this.timer = setInterval(() => {
      void this.runTick();
    }, this.tickMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Single tick — exposed for tests so a fake clock can drive iterations
   * without waiting for the real interval. Serialized to prevent two
   * overlapping ticks if a long run blocks the next interval.
   */
  async runTick(): Promise<void> {
    if (this.tickInFlight) return this.tickInFlight;
    const tick = (async () => {
      const now = this.now();
      const schedules = await this.store.listSchedules();
      const due = schedules.filter((s) => isDue(s, now));
      // Run sequentially — concurrency would race on the JSON store. v1 has
      // no parallelism requirement; v2 SQL-backed store can lift this.
      for (const schedule of due) {
        try {
          await runAutopilot(schedule, this.store, { trigger: 'cron', now: this.now });
        } catch (err) {
          // runAutopilot already swallows DriftError into a failure run;
          // anything thrown out is a bug we want surfaced in stderr.
          console.error(`Autopilot tick failed for schedule ${schedule.id}:`, err);
        }
      }
    })();
    this.tickInFlight = tick;
    try {
      await tick;
    } finally {
      this.tickInFlight = null;
    }
  }
}

function envTickMs(): number | undefined {
  const raw = process.env.EMBEDIQ_AUTOPILOT_TICK_MS;
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
