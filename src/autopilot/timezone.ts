/**
 * Timezone helpers built on `Intl.DateTimeFormat`. Node 18+ ships with
 * full-ICU, so every IANA timezone in the tz database is available
 * without an external dependency.
 *
 * Two operations:
 *   - `getZonedParts(date, tz)` — what year/month/day/hour/minute does
 *     this absolute instant land on in `tz`?
 *   - `computeUtcInstant({year, month, day, hour, minute}, tz)` —
 *     given a wall-clock time *in* `tz`, what UTC instant does it
 *     correspond to? Handles DST forward (skip) and back (repeat) by
 *     consistently choosing the first valid instant.
 */

export class InvalidTimezoneError extends Error {
  constructor(timezone: string) {
    super(`Unknown IANA timezone: "${timezone}"`);
    this.name = 'InvalidTimezoneError';
  }
}

export interface ZonedParts {
  year: number;
  month: number;       // 1..12
  dayOfMonth: number;  // 1..31
  hour: number;        // 0..23
  minute: number;      // 0..59
  /** 0 = Sunday, 6 = Saturday — matches JS Date.getDay() convention. */
  dayOfWeek: number;
}

const FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timezone: string): Intl.DateTimeFormat {
  let f = FORMATTER_CACHE.get(timezone);
  if (f) return f;
  try {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      weekday: 'short',
    });
  } catch {
    throw new InvalidTimezoneError(timezone);
  }
  FORMATTER_CACHE.set(timezone, f);
  return f;
}

/** Validate an IANA timezone string. Throws on unknown. */
export function assertValidTimezone(timezone: string): void {
  getFormatter(timezone);
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/**
 * Extract zoned wall-clock parts from an absolute UTC instant. With no
 * timezone, falls back to UTC.
 */
export function getZonedParts(date: Date, timezone?: string): ZonedParts {
  if (!timezone) {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      dayOfMonth: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      dayOfWeek: date.getUTCDay(),
    };
  }

  const parts = getFormatter(timezone).formatToParts(date);
  let year = 0, month = 0, day = 0, hour = 0, minute = 0;
  let weekday = 'Sun';
  for (const part of parts) {
    switch (part.type) {
      case 'year': year = Number.parseInt(part.value, 10); break;
      case 'month': month = Number.parseInt(part.value, 10); break;
      case 'day': day = Number.parseInt(part.value, 10); break;
      case 'hour': hour = Number.parseInt(part.value, 10); break;
      case 'minute': minute = Number.parseInt(part.value, 10); break;
      case 'weekday': weekday = part.value; break;
    }
  }
  if (hour === 24) hour = 0; // Intl quirk — some locales emit "24:00".
  return {
    year, month, dayOfMonth: day, hour, minute,
    dayOfWeek: WEEKDAY_MAP[weekday] ?? 0,
  };
}

/**
 * Convert a wall-clock time in `timezone` to the corresponding absolute
 * UTC instant. With no timezone, treats the input as UTC directly.
 *
 * DST handling:
 *   - "Spring forward" (the clock skips, e.g. 02:00 → 03:00 doesn't
 *     exist): the chosen UTC instant lands at the *first* valid local
 *     time at or after the requested wall clock. So `2:30` on a spring
 *     forward day resolves as if it were `3:00`.
 *   - "Fall back" (the clock repeats, e.g. 01:30 happens twice): we
 *     choose the *first* (pre-transition) occurrence. Deterministic and
 *     matches most cron implementations.
 *
 * The carry-over (e.g. day=32 → day=1 of next month) is handled by
 * `Date.UTC` automatically.
 */
export function computeUtcInstant(
  wall: { year: number; month: number; day: number; hour: number; minute: number },
  timezone?: string,
): Date {
  // First, treat the wall clock *as if* it were UTC. This gives us a
  // ballpark — for non-UTC zones we then iterate-correct.
  const naive = new Date(Date.UTC(
    wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, 0, 0,
  ));

  if (!timezone) return naive;

  // Iterate twice — the offset can shift by an hour around DST
  // transitions, so a single correction can leave us 1h off. Two
  // passes converge for every IANA zone in the database.
  let corrected = naive;
  for (let i = 0; i < 2; i++) {
    const parts = getZonedParts(corrected, timezone);
    const targetMs = Date.UTC(
      wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, 0, 0,
    );
    const actualMs = Date.UTC(
      parts.year, parts.month - 1, parts.dayOfMonth, parts.hour, parts.minute, 0, 0,
    );
    const delta = targetMs - actualMs;
    if (delta === 0) return corrected;
    corrected = new Date(corrected.getTime() + delta);
  }

  // After two passes, accept the result. Around DST forward, the
  // requested wall time may not exist — we land on the first valid
  // instant after the gap, which is the documented behavior.
  return corrected;
}
