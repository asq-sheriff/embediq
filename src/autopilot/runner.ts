import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import type { AutopilotStore } from './autopilot-store.js';
import { detectDrift, DriftError } from './drift-detector.js';
import { nextRunAt } from './types.js';
import type {
  AutopilotRun,
  AutopilotRunDriftSummary,
  AutopilotRunStatus,
  AutopilotSchedule,
  AutopilotTrigger,
} from './types.js';
import { detectFailureStreak, resolveFailureStreakThreshold } from './failure-monitor.js';
import { getEventBus } from '../events/bus.js';

export interface RunOptions {
  trigger: AutopilotTrigger;
  /** Inject a clock for tests; defaults to system time. */
  now?: () => Date;
  /**
   * When true (the default), the runner advances the schedule's
   * `nextRunAt` after recording the run. The scheduler tick path
   * already advanced `nextRunAt` via `claimSchedule()` before
   * calling the runner, so it passes `false` to avoid stomping the
   * claimed value. Webhook / manual triggers leave the default in
   * place — they do not participate in claim-and-advance.
   */
  advanceNextRun?: boolean;
}

/**
 * Execute an autopilot schedule once. Runs the drift detector against
 * the schedule's target directory using the schedule's stored answer
 * source, classifies the outcome relative to the alert threshold, and
 * persists both the run record and the schedule's lastRunAt/nextRunAt
 * pointers.
 *
 * Failures are caught and recorded as `failure` runs — autopilot must
 * never throw to its caller (the scheduler tick or webhook handler).
 */
export async function runAutopilot(
  schedule: AutopilotSchedule,
  store: AutopilotStore,
  options: RunOptions,
): Promise<AutopilotRun> {
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const t0 = performance.now();

  let status: AutopilotRunStatus;
  let driftSummary: AutopilotRunDriftSummary | undefined;
  let error: string | undefined;

  try {
    const report = await detectDrift({
      targetDir: schedule.targetDir,
      answers: schedule.answerSourcePath,
      targets: schedule.targets,
      answerSourceLabel: `autopilot:${schedule.id}`,
    });

    const totalDrift =
      report.totals.missing
      + report.totals.modifiedByUser
      + report.totals.modifiedStaleStamp
      + report.totals.versionMismatch
      + report.totals.extra;
    driftSummary = { ...report.totals, totalDrift };

    if (totalDrift === 0) {
      status = 'success-clean';
    } else {
      const threshold = schedule.driftAlertThreshold ?? 0;
      status = totalDrift > threshold ? 'success-alerting' : 'success-drifted';
    }
  } catch (err) {
    status = 'failure';
    error = err instanceof DriftError
      ? err.message
      : err instanceof Error
        ? err.message
        : String(err);
  }

  const completedAt = now();
  const run: AutopilotRun = {
    id: randomUUID(),
    scheduleId: schedule.id,
    trigger: options.trigger,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    status,
    driftSummary,
    error,
  };

  await store.recordRun(run);
  const advance = options.advanceNextRun !== false;
  const patch: Partial<AutopilotSchedule> = { lastRunAt: completedAt.toISOString() };
  if (advance) {
    patch.nextRunAt = nextRunAt(schedule.cadence, completedAt, schedule.timezone).toISOString();
  }
  await store.updateSchedule(schedule.id, patch);

  if (status === 'failure') {
    await maybeEmitFailureAlert(schedule, store);
  }

  // Suppress unused-variable warning while keeping perf metric live for
  // future telemetry hookup.
  void (performance.now() - t0);

  return run;
}

/**
 * After recording a failure run, query recent runs and fire
 * `autopilot:alerting` if (and only if) the consecutive-failure streak
 * just crossed the schedule's effective threshold. Suppression rules and
 * exact-crossing semantics live in `detectFailureStreak`.
 */
async function maybeEmitFailureAlert(
  schedule: AutopilotSchedule,
  store: AutopilotStore,
): Promise<void> {
  const threshold = resolveFailureStreakThreshold(schedule.alertOnFailureStreak);
  if (threshold <= 0) return;

  // Pull one extra so detectFailureStreak can inspect the run just before
  // the window and avoid re-emitting on a streak that was already alerting.
  const recent = await store.listRuns({
    scheduleId: schedule.id,
    limit: threshold + 1,
  });
  const alert = detectFailureStreak(recent, threshold);
  if (!alert) return;

  getEventBus().emit('autopilot:alerting', {
    scheduleId: alert.scheduleId,
    scheduleName: schedule.name,
    failureCount: alert.failureCount,
    mostRecentError: alert.mostRecentError,
    lastSuccessAt: alert.lastSuccessAt,
  });
}
