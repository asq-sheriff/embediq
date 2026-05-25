import type { AutopilotRun } from './types.js';

/**
 * Default consecutive-failure count above which the runner emits an
 * `autopilot:alerting` event. Overridable per-schedule via
 * `AutopilotSchedule.alertOnFailureStreak`, or globally via
 * `EMBEDIQ_AUTOPILOT_ALERT_FAILURE_STREAK`.
 */
export const DEFAULT_FAILURE_STREAK_THRESHOLD = 3;

export interface FailureStreakAlert {
  scheduleId: string;
  /** Number of consecutive failures (equals the threshold at crossing time). */
  failureCount: number;
  /** Error message from the most recent failure, if any. */
  mostRecentError?: string;
  /** ISO timestamp of the most recent non-failure run, if any. */
  lastSuccessAt?: string;
}

/**
 * Pure, side-effect-free streak detector. Given the runs for a schedule in
 * most-recent-first order and a threshold, return alert metadata IFF the
 * streak just crossed the threshold — i.e., the top `threshold` runs are
 * all failures AND the run before that window is NOT a failure (or does
 * not exist). This "exact crossing" semantics ensures one emit per streak
 * rather than re-firing on every subsequent failure.
 *
 * Returns null when:
 *   - threshold ≤ 0 (alerting disabled),
 *   - fewer than `threshold` runs exist,
 *   - any of the top `threshold` runs is not a failure,
 *   - the run just before the window is also a failure (i.e., already
 *     alerting — the previous tick crossed the threshold).
 */
export function detectFailureStreak(
  runsMostRecentFirst: readonly AutopilotRun[],
  threshold: number,
): FailureStreakAlert | null {
  if (threshold <= 0) return null;
  if (runsMostRecentFirst.length < threshold) return null;

  const window = runsMostRecentFirst.slice(0, threshold);
  if (!window.every((r) => r.status === 'failure')) return null;

  const before = runsMostRecentFirst[threshold];
  if (before && before.status === 'failure') return null;

  const mostRecent = window[0]!;
  const lastSuccess = runsMostRecentFirst.find((r) => r.status !== 'failure');

  return {
    scheduleId: mostRecent.scheduleId,
    failureCount: threshold,
    mostRecentError: mostRecent.error,
    lastSuccessAt: lastSuccess?.completedAt,
  };
}

/**
 * Resolve the effective threshold for a schedule. Per-schedule value wins
 * over the global env-var setting, which wins over the default.
 */
export function resolveFailureStreakThreshold(
  perSchedule: number | undefined,
  envValue: string | undefined = process.env.EMBEDIQ_AUTOPILOT_ALERT_FAILURE_STREAK,
): number {
  if (typeof perSchedule === 'number' && Number.isFinite(perSchedule) && perSchedule >= 0) {
    return Math.floor(perSchedule);
  }
  if (envValue !== undefined) {
    const parsed = Number.parseInt(envValue, 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return DEFAULT_FAILURE_STREAK_THRESHOLD;
}
