import type { TargetFormat } from '../synthesizer/target-format.js';
import { parseCron, nextCronRun, looksLikeCron, CronParseError } from './cron.js';
import { assertValidTimezone, InvalidTimezoneError } from './timezone.js';

/**
 * Cadence accepts either a named preset (`@hourly` / `@daily` /
 * `@weekly` / `@monthly`) or a standard 5-field cron expression.
 * Presets remain the v1 convention and continue to fire on UTC
 * boundaries; cron expressions optionally accept an IANA `timezone`
 * field on the surrounding `AutopilotSchedule` for true wall-clock
 * scheduling (with DST handled).
 */
export type CadencePreset = '@hourly' | '@daily' | '@weekly' | '@monthly';
export type Cadence = CadencePreset | string;

export const CADENCE_PRESETS: readonly CadencePreset[] = ['@hourly', '@daily', '@weekly', '@monthly'];
/** Back-compat alias — the preset list was previously named CADENCE_VALUES. */
export const CADENCE_VALUES = CADENCE_PRESETS;

export function isCadencePreset(value: string): value is CadencePreset {
  return (CADENCE_PRESETS as readonly string[]).includes(value);
}

/**
 * Validate a cadence string. Accepts a preset or a parseable 5-field
 * cron expression. Re-throws the underlying error message so callers
 * can surface it to the user.
 */
export function assertValidCadence(value: string): void {
  if (isCadencePreset(value)) return;
  if (!looksLikeCron(value)) {
    throw new CronParseError(
      `cadence "${value}" is neither a preset (${CADENCE_PRESETS.join(', ')}) nor a 5-field cron expression`,
    );
  }
  parseCron(value);
}

export interface AutopilotSchedule {
  id: string;
  name: string;
  cadence: Cadence;
  /**
   * IANA timezone identifier (e.g. `America/Los_Angeles`) used to
   * interpret cron expressions on this schedule. Ignored for the
   * preset cadences — they always fire on UTC boundaries. When unset,
   * cron expressions are also interpreted in UTC.
   */
  timezone?: string;
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
  timezone?: string;
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
 * Presets:
 *   - `@hourly`  — 60 minutes after `from`.
 *   - `@daily`   — next UTC midnight.
 *   - `@weekly`  — next UTC Monday at 00:00.
 *   - `@monthly` — first of the next UTC month at 00:00.
 *
 * Cron expressions are interpreted in the supplied IANA `timezone` (or
 * UTC when omitted), with DST handled by the underlying cron evaluator.
 */
export function nextRunAt(
  cadence: Cadence,
  from: Date = new Date(),
  timezone?: string,
): Date {
  if (isCadencePreset(cadence)) {
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
  return nextCronRun(parseCron(cadence), from, timezone);
}

/** Re-export so callers can identify parse / timezone errors structurally. */
export { CronParseError, InvalidTimezoneError, assertValidTimezone };

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
