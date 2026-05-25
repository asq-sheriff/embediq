import { describe, it, expect } from 'vitest';
import {
  detectFailureStreak,
  resolveFailureStreakThreshold,
  DEFAULT_FAILURE_STREAK_THRESHOLD,
} from '../../src/autopilot/failure-monitor.js';
import type { AutopilotRun, AutopilotRunStatus } from '../../src/autopilot/types.js';

function run(
  status: AutopilotRunStatus,
  overrides: Partial<AutopilotRun> = {},
): AutopilotRun {
  return {
    id: overrides.id ?? `run-${Math.random().toString(36).slice(2, 8)}`,
    scheduleId: overrides.scheduleId ?? 'sched-1',
    trigger: overrides.trigger ?? 'cron',
    startedAt: overrides.startedAt ?? '2026-05-25T12:00:00.000Z',
    completedAt: overrides.completedAt ?? '2026-05-25T12:00:30.000Z',
    status,
    driftSummary: overrides.driftSummary,
    error: overrides.error,
  };
}

describe('detectFailureStreak', () => {
  it('returns null when threshold is zero or negative', () => {
    const runs = [run('failure'), run('failure'), run('failure')];
    expect(detectFailureStreak(runs, 0)).toBeNull();
    expect(detectFailureStreak(runs, -1)).toBeNull();
  });

  it('returns null when fewer runs exist than the threshold', () => {
    expect(detectFailureStreak([run('failure'), run('failure')], 3)).toBeNull();
    expect(detectFailureStreak([], 3)).toBeNull();
  });

  it('returns null when the top runs are not all failures', () => {
    const runs = [run('failure'), run('success-clean'), run('failure'), run('failure')];
    expect(detectFailureStreak(runs, 3)).toBeNull();
  });

  it('emits alert metadata on the exact crossing — 3 failures with success behind them', () => {
    const runs = [
      run('failure', { id: 'a', error: 'connection refused' }),
      run('failure', { id: 'b' }),
      run('failure', { id: 'c' }),
      run('success-clean', { id: 'd', completedAt: '2026-05-25T08:00:00.000Z' }),
    ];
    const alert = detectFailureStreak(runs, 3);
    expect(alert).not.toBeNull();
    expect(alert!.scheduleId).toBe('sched-1');
    expect(alert!.failureCount).toBe(3);
    expect(alert!.mostRecentError).toBe('connection refused');
    expect(alert!.lastSuccessAt).toBe('2026-05-25T08:00:00.000Z');
  });

  it('does not re-emit when the streak was already alerting at the prior tick', () => {
    // Four failures in a row — at the *previous* tick we would have emitted
    // (top three were all failures with no failure-before-window). At the
    // current tick, the run before the threshold window is itself a
    // failure, so we suppress.
    const runs = [
      run('failure'),
      run('failure'),
      run('failure'),
      run('failure'),
    ];
    expect(detectFailureStreak(runs, 3)).toBeNull();
  });

  it('emits when there is no run before the window (first N runs are all failures)', () => {
    const runs = [run('failure'), run('failure'), run('failure')];
    const alert = detectFailureStreak(runs, 3);
    expect(alert).not.toBeNull();
    expect(alert!.lastSuccessAt).toBeUndefined();
  });

  it('treats every non-failure status as a streak break (drifted / alerting / clean)', () => {
    for (const s of ['success-clean', 'success-drifted', 'success-alerting'] as const) {
      const runs = [run('failure'), run('failure'), run('failure'), run(s)];
      const alert = detectFailureStreak(runs, 3);
      expect(alert, `expected emit when status before window is ${s}`).not.toBeNull();
    }
  });

  it('works for threshold of 1 (every fresh failure alerts, but not re-fires)', () => {
    expect(detectFailureStreak([run('failure'), run('success-clean')], 1)).not.toBeNull();
    expect(detectFailureStreak([run('failure'), run('failure')], 1)).toBeNull();
    expect(detectFailureStreak([run('success-clean'), run('failure')], 1)).toBeNull();
  });
});

describe('resolveFailureStreakThreshold', () => {
  it('uses the per-schedule value when present and valid', () => {
    expect(resolveFailureStreakThreshold(5, '10')).toBe(5);
    expect(resolveFailureStreakThreshold(0, '10')).toBe(0);
  });

  it('falls back to the env-var value when per-schedule is undefined', () => {
    expect(resolveFailureStreakThreshold(undefined, '7')).toBe(7);
    expect(resolveFailureStreakThreshold(undefined, '0')).toBe(0);
  });

  it('falls back to the default when both inputs are missing or invalid', () => {
    expect(resolveFailureStreakThreshold(undefined, undefined)).toBe(DEFAULT_FAILURE_STREAK_THRESHOLD);
    expect(resolveFailureStreakThreshold(undefined, 'not-a-number')).toBe(DEFAULT_FAILURE_STREAK_THRESHOLD);
    expect(resolveFailureStreakThreshold(NaN as unknown as number, '')).toBe(DEFAULT_FAILURE_STREAK_THRESHOLD);
  });

  it('rejects negative per-schedule values and uses the env fallback', () => {
    expect(resolveFailureStreakThreshold(-2, '4')).toBe(4);
  });
});
