import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import type { JsonAutopilotStore } from './store.js';
import { detectDrift, DriftError } from './drift-detector.js';
import { nextRunAt } from './types.js';
import type {
  AutopilotRun,
  AutopilotRunDriftSummary,
  AutopilotRunStatus,
  AutopilotSchedule,
  AutopilotTrigger,
} from './types.js';

export interface RunOptions {
  trigger: AutopilotTrigger;
  /** Inject a clock for tests; defaults to system time. */
  now?: () => Date;
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
  store: JsonAutopilotStore,
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
  await store.updateSchedule(schedule.id, {
    lastRunAt: completedAt.toISOString(),
    nextRunAt: nextRunAt(schedule.cadence, completedAt).toISOString(),
  });

  // Suppress unused-variable warning while keeping perf metric live for
  // future telemetry hookup.
  void (performance.now() - t0);

  return run;
}
