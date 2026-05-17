/**
 * Standard 5-field cron parser + `nextCronRun()` evaluator.
 *
 *   ┌─── minute       (0-59)
 *   │ ┌─ hour         (0-23)
 *   │ │ ┌─ day-of-month (1-31)
 *   │ │ │ ┌─ month     (1-12 or JAN-DEC)
 *   │ │ │ │ ┌─ day-of-week (0-6 or 7 = Sunday; SUN-SAT)
 *   │ │ │ │ │
 *   *  *  *  *  *
 *
 * Each field accepts:
 *   - `*`              every value
 *   - `5`              literal value
 *   - `1-5`            inclusive range
 *   - `1,3,5`          list
 *   - `* / 15`         step from min (e.g. `*\/15` = 0,15,30,45)
 *   - `0-30/5`         step within a range
 *
 * Day-of-month and day-of-week obey the OR convention when both are
 * constrained (POSIX cron — see crontab(5)). When *both* are wildcard
 * or *both* are restricted, AND-semantics fall out naturally.
 *
 * Pure function — no Node-only globals beyond `Intl.DateTimeFormat`
 * (Node 18+ ships with full-ICU).
 */

import { computeUtcInstant, getZonedParts } from './timezone.js';

export interface CronSpec {
  minute: ReadonlySet<number>;
  hour: ReadonlySet<number>;
  dayOfMonth: ReadonlySet<number>;
  month: ReadonlySet<number>;
  dayOfWeek: ReadonlySet<number>; // 0 = Sunday
  /** True when the day-of-month field was a wildcard `*`. */
  dayOfMonthAllStar: boolean;
  /** True when the day-of-week field was a wildcard `*`. */
  dayOfWeekAllStar: boolean;
  /** The original normalized string (for round-trip diagnostics). */
  source: string;
}

export class CronParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CronParseError';
  }
}

const FIELDS = [
  { name: 'minute', min: 0, max: 59, aliases: undefined as Record<string, number> | undefined },
  { name: 'hour', min: 0, max: 23, aliases: undefined },
  { name: 'dayOfMonth', min: 1, max: 31, aliases: undefined },
  {
    name: 'month',
    min: 1,
    max: 12,
    aliases: {
      JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
      JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
    } as Record<string, number>,
  },
  {
    name: 'dayOfWeek',
    min: 0,
    max: 7,
    aliases: { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 } as Record<string, number>,
  },
] as const;

/**
 * Parse a 5-field cron expression. Throws `CronParseError` on malformed
 * input. Accepts whitespace-separated fields with case-insensitive
 * month / day-of-week aliases.
 */
export function parseCron(input: string): CronSpec {
  const trimmed = input.trim();
  const fields = trimmed.split(/\s+/);
  if (fields.length !== 5) {
    throw new CronParseError(
      `cron expression must have exactly 5 fields, got ${fields.length}: "${trimmed}"`,
    );
  }

  const parsed = fields.map((field, idx) => parseField(field, FIELDS[idx]));
  // Normalize day-of-week 7 (Sunday alias) down to 0 so we compare uniformly.
  const dow = new Set<number>();
  for (const d of parsed[4]) dow.add(d === 7 ? 0 : d);

  return {
    minute: parsed[0],
    hour: parsed[1],
    dayOfMonth: parsed[2],
    month: parsed[3],
    dayOfWeek: dow,
    dayOfMonthAllStar: fields[2] === '*',
    dayOfWeekAllStar: fields[4] === '*',
    source: trimmed,
  };
}

function parseField(
  raw: string,
  spec: typeof FIELDS[number],
): Set<number> {
  const out = new Set<number>();
  for (const token of raw.split(',')) {
    addToken(token, spec, out);
  }
  if (out.size === 0) {
    throw new CronParseError(`empty field after parsing "${raw}" in ${spec.name}`);
  }
  return out;
}

function addToken(
  token: string,
  spec: typeof FIELDS[number],
  out: Set<number>,
): void {
  let body = token;
  let step = 1;

  const slashIdx = body.indexOf('/');
  if (slashIdx >= 0) {
    const stepStr = body.slice(slashIdx + 1);
    body = body.slice(0, slashIdx);
    step = Number.parseInt(stepStr, 10);
    if (!Number.isFinite(step) || step <= 0) {
      throw new CronParseError(`invalid step "${stepStr}" in ${spec.name} field`);
    }
  }

  let start: number;
  let end: number;

  if (body === '*' || body === '') {
    start = spec.min;
    end = spec.max;
  } else if (body.includes('-')) {
    const [s, e] = body.split('-', 2);
    start = resolveValue(s, spec);
    end = resolveValue(e, spec);
    if (start > end) {
      throw new CronParseError(
        `range start ${start} > end ${end} in ${spec.name} field`,
      );
    }
  } else {
    start = end = resolveValue(body, spec);
  }

  if (start < spec.min || end > spec.max) {
    throw new CronParseError(
      `${spec.name} value out of range [${spec.min}..${spec.max}]: "${token}"`,
    );
  }

  for (let v = start; v <= end; v += step) out.add(v);
}

function resolveValue(token: string, spec: typeof FIELDS[number]): number {
  const alias = spec.aliases?.[token.toUpperCase()];
  if (alias !== undefined) return alias;
  const n = Number.parseInt(token, 10);
  if (!Number.isFinite(n)) {
    throw new CronParseError(`unparseable value "${token}" in ${spec.name} field`);
  }
  return n;
}

/** Lightweight "is this a 5-field cron expression?" detector. */
export function looksLikeCron(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed.startsWith('@')) return false;
  return trimmed.split(/\s+/).length === 5;
}

/**
 * Compute the next firing time for a cron spec after `from`, optionally
 * interpreted in a target IANA timezone. The returned `Date` is always
 * an absolute UTC instant.
 *
 * The algorithm walks the calendar minute-by-minute (capped to the
 * timezone-local field at each step) and skips ahead by whole units
 * when a field fails to match. Worst-case bound: a few thousand
 * iterations even for sparse expressions like `0 4 1 1 *` — finishes
 * in ~1ms.
 */
export function nextCronRun(
  spec: CronSpec,
  from: Date = new Date(),
  timezone?: string,
): Date {
  // Start one minute after `from` — we never want to re-fire on the
  // same instant we just resolved.
  let candidate = new Date(from.getTime() + 60_000);
  // Truncate to the start of the candidate minute for the local zone.
  candidate.setUTCSeconds(0, 0);

  // Safety bound — five years of minutes. A schedule that never fires
  // inside this window is almost certainly a misconfigured expression.
  const MAX_ITER = 5 * 366 * 24 * 60;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    const parts = getZonedParts(candidate, timezone);

    if (!spec.month.has(parts.month)) {
      // Jump to the first day of the next month (zoned), midnight.
      candidate = advanceToNextMonth(parts, timezone);
      continue;
    }

    if (!matchesDay(spec, parts)) {
      candidate = advanceOneDay(parts, timezone);
      continue;
    }

    if (!spec.hour.has(parts.hour)) {
      candidate = advanceOneHour(parts, timezone);
      continue;
    }

    if (!spec.minute.has(parts.minute)) {
      candidate = advanceOneMinute(parts, timezone);
      continue;
    }

    return candidate;
  }

  throw new CronParseError(
    `cron expression "${spec.source}" did not match within ${MAX_ITER} iterations`,
  );
}

function matchesDay(spec: CronSpec, parts: ReturnType<typeof getZonedParts>): boolean {
  // POSIX cron: when both DOM and DOW are restricted, fire when *either*
  // matches. When one is `*`, only the restricted one applies.
  const domMatch = spec.dayOfMonth.has(parts.dayOfMonth);
  const dowMatch = spec.dayOfWeek.has(parts.dayOfWeek);

  if (spec.dayOfMonthAllStar && spec.dayOfWeekAllStar) return true;
  if (spec.dayOfMonthAllStar) return dowMatch;
  if (spec.dayOfWeekAllStar) return domMatch;
  return domMatch || dowMatch;
}

function advanceToNextMonth(
  parts: ReturnType<typeof getZonedParts>,
  timezone?: string,
): Date {
  let year = parts.year;
  let month = parts.month + 1;
  if (month > 12) { month = 1; year += 1; }
  return computeUtcInstant({ year, month, day: 1, hour: 0, minute: 0 }, timezone);
}

function advanceOneDay(
  parts: ReturnType<typeof getZonedParts>,
  timezone?: string,
): Date {
  // Roll the day at zoned midnight. The Intl-roundtrip in
  // computeUtcInstant handles month / year carries automatically.
  return computeUtcInstant(
    {
      year: parts.year,
      month: parts.month,
      day: parts.dayOfMonth + 1,
      hour: 0,
      minute: 0,
    },
    timezone,
  );
}

function advanceOneHour(
  parts: ReturnType<typeof getZonedParts>,
  timezone?: string,
): Date {
  return computeUtcInstant(
    {
      year: parts.year,
      month: parts.month,
      day: parts.dayOfMonth,
      hour: parts.hour + 1,
      minute: 0,
    },
    timezone,
  );
}

function advanceOneMinute(
  parts: ReturnType<typeof getZonedParts>,
  timezone?: string,
): Date {
  return computeUtcInstant(
    {
      year: parts.year,
      month: parts.month,
      day: parts.dayOfMonth,
      hour: parts.hour,
      minute: parts.minute + 1,
    },
    timezone,
  );
}
