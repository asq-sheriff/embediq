import type { TargetFormat } from '../synthesizer/target-format.js';

/**
 * Cadence presets for v1. Real cron strings are deferred to a follow-up
 * iteration; the four named presets cover the common autopilot use cases
 * (hourly drift scans, nightly regen checks, weekly compliance audits).
 * All cadences fire on UTC boundaries — timezone-aware scheduling is
 * also a deliberate v1 deferral, called out in the ROADMAP follow-ups.
 */
export type Cadence = '@hourly' | '@daily' | '@weekly' | '@monthly';

export const CADENCE_VALUES: readonly Cadence[] = ['@hourly', '@daily', '@weekly', '@monthly'];

export interface AutopilotSchedule {
  id: string;
  name: string;
  cadence: Cadence;
  /** Path (relative to CWD or absolute) to a YAML answers file. */
  answerSourcePath: string;
  /** Project directory whose managed subtrees are scanned for drift. */
  targetDir: string;
  /** Optional output target filter — same semantics as SetupConfig.targets. */
  targets?: TargetFormat[];
  /**
   * Threshold above which a run is marked `alerting` rather than `drifted`.
   * Counted against the sum of missing + modified + extra entries. Default:
   * any drift at all triggers an alert (threshold = 0).
   */
  driftAlertThreshold?: number;
  /**
   * Compliance frameworks this schedule covers. Used by the inbound
   * compliance webhook route (6J) to decide which schedule(s) to fire
   * when an external platform (Drata, Vanta, …) reports an event for
   * a specific framework. EmbedIQ's native identifiers: hipaa, pci,
   * soc2, ferpa, sox, gdpr, etc.
   */
  complianceFrameworks?: readonly string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  nextRunAt: string;
}

export type AutopilotTrigger = 'cron' | 'webhook' | 'manual';

export type AutopilotRunStatus =
  | 'success-clean'
  | 'success-drifted'
  | 'success-alerting'
  | 'failure';

export interface AutopilotRunDriftSummary {
  match: number;
  missing: number;
  modifiedByUser: number;
  modifiedStaleStamp: number;
  versionMismatch: number;
  extra: number;
  totalDrift: number;
}

export interface AutopilotRun {
  id: string;
  scheduleId: string;
  trigger: AutopilotTrigger;
  startedAt: string;
  completedAt: string;
  status: AutopilotRunStatus;
  driftSummary?: AutopilotRunDriftSummary;
  error?: string;
}

export interface ScheduleCreateInput {
  name: string;
  cadence: Cadence;
  answerSourcePath: string;
  targetDir: string;
  targets?: TargetFormat[];
  driftAlertThreshold?: number;
  complianceFrameworks?: readonly string[];
  enabled?: boolean;
}

/**
 * Compute the next fire time for a cadence after the supplied reference
 * timestamp. Pure function — used by both the scheduler tick and tests.
 *
 * Hourly: 60 minutes after `from`.
 * Daily/weekly/monthly: snap to the next UTC midnight boundary aligned to
 * the cadence (so all daily schedules fire at 00:00 UTC). This is a
 * conscious simplification for v1 — see the ROADMAP follow-ups for the
 * full timezone + arbitrary-time-of-day story.
 */
export function nextRunAt(cadence: Cadence, from: Date = new Date()): Date {
  const ms = from.getTime();
  switch (cadence) {
    case '@hourly':
      return new Date(ms + 60 * 60 * 1000);
    case '@daily':
      return nextUtcMidnight(from);
    case '@weekly':
      return nextUtcMonday(from);
    case '@monthly':
      return nextUtcMonthStart(from);
  }
}

function nextUtcMidnight(from: Date): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 1));
  return d;
}

function nextUtcMonday(from: Date): Date {
  // 1 = Monday in JS getUTCDay()
  const dayOfWeek = from.getUTCDay() || 7; // treat Sunday (0) as 7
  const daysUntilMonday = ((8 - dayOfWeek) % 7) || 7;
  return new Date(Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate() + daysUntilMonday,
  ));
}

function nextUtcMonthStart(from: Date): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
}

/** True when `now` is at or past the schedule's nextRunAt. */
export function isDue(schedule: AutopilotSchedule, now: Date = new Date()): boolean {
  if (!schedule.enabled) return false;
  return new Date(schedule.nextRunAt).getTime() <= now.getTime();
}

/**
 * JSON-safe view used by the management API. Strips no fields today, but
 * exists as a future-proofing seam for when we start storing secrets
 * (e.g. webhook signing keys) on the schedule object.
 */
export function summarizeSchedule(schedule: AutopilotSchedule): AutopilotSchedule {
  return { ...schedule };
}
