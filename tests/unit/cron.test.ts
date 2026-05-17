import { describe, it, expect } from 'vitest';
import {
  parseCron,
  nextCronRun,
  looksLikeCron,
  CronParseError,
} from '../../src/autopilot/cron.js';

describe('parseCron — valid expressions', () => {
  it('parses every-minute wildcard form', () => {
    const spec = parseCron('* * * * *');
    expect(spec.minute.size).toBe(60);
    expect(spec.hour.size).toBe(24);
    expect(spec.dayOfMonth.size).toBe(31);
    expect(spec.month.size).toBe(12);
    expect(spec.dayOfWeek.size).toBe(7);
    expect(spec.dayOfMonthAllStar).toBe(true);
    expect(spec.dayOfWeekAllStar).toBe(true);
  });

  it('parses a specific daily fire time', () => {
    const spec = parseCron('30 9 * * *');
    expect(spec.minute.has(30)).toBe(true);
    expect(spec.minute.size).toBe(1);
    expect(spec.hour.has(9)).toBe(true);
    expect(spec.hour.size).toBe(1);
  });

  it('parses comma-separated lists', () => {
    const spec = parseCron('0 0,12 * * *');
    expect([...spec.hour].sort((a, b) => a - b)).toEqual([0, 12]);
  });

  it('parses ranges', () => {
    const spec = parseCron('0 9-17 * * *');
    expect([...spec.hour].sort((a, b) => a - b)).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
  });

  it('parses step values on the whole field', () => {
    const spec = parseCron('*/15 * * * *');
    expect([...spec.minute].sort((a, b) => a - b)).toEqual([0, 15, 30, 45]);
  });

  it('parses step values within a range', () => {
    const spec = parseCron('0 0-12/3 * * *');
    expect([...spec.hour].sort((a, b) => a - b)).toEqual([0, 3, 6, 9, 12]);
  });

  it('parses month aliases case-insensitively', () => {
    const spec = parseCron('0 0 1 jan,jul *');
    expect([...spec.month].sort((a, b) => a - b)).toEqual([1, 7]);
  });

  it('parses day-of-week aliases', () => {
    const spec = parseCron('0 9 * * MON-FRI');
    expect([...spec.dayOfWeek].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('normalizes Sunday alias 7 → 0', () => {
    const spec = parseCron('0 9 * * 7');
    expect(spec.dayOfWeek.has(0)).toBe(true);
    expect(spec.dayOfWeek.has(7)).toBe(false);
  });
});

describe('parseCron — invalid input rejected', () => {
  it('rejects wrong field count', () => {
    expect(() => parseCron('* * *')).toThrow(CronParseError);
    expect(() => parseCron('* * * * * *')).toThrow(CronParseError);
  });

  it('rejects out-of-range minute', () => {
    expect(() => parseCron('60 * * * *')).toThrow(CronParseError);
  });

  it('rejects out-of-range hour', () => {
    expect(() => parseCron('0 24 * * *')).toThrow(CronParseError);
  });

  it('rejects reversed range', () => {
    expect(() => parseCron('0 17-9 * * *')).toThrow(CronParseError);
  });

  it('rejects zero step', () => {
    expect(() => parseCron('*/0 * * * *')).toThrow(CronParseError);
  });

  it('rejects unparseable token', () => {
    expect(() => parseCron('0 0 banana * *')).toThrow(CronParseError);
  });

  it('rejects empty string', () => {
    expect(() => parseCron('')).toThrow(CronParseError);
  });
});

describe('looksLikeCron', () => {
  it('matches a five-field expression', () => {
    expect(looksLikeCron('0 9 * * *')).toBe(true);
    expect(looksLikeCron('  0   9   *  *  *  ')).toBe(true);
  });

  it('rejects presets', () => {
    expect(looksLikeCron('@daily')).toBe(false);
    expect(looksLikeCron('@hourly')).toBe(false);
  });

  it('rejects shorter / longer strings', () => {
    expect(looksLikeCron('* * *')).toBe(false);
    expect(looksLikeCron('* * * * * *')).toBe(false);
  });
});

describe('nextCronRun — UTC firing', () => {
  it('fires at the next matching minute when the field is constrained', () => {
    const spec = parseCron('30 * * * *');
    const from = new Date('2026-05-17T10:00:00Z');
    const next = nextCronRun(spec, from);
    expect(next.toISOString()).toBe('2026-05-17T10:30:00.000Z');
  });

  it('rolls to the next hour when current minute already past', () => {
    const spec = parseCron('30 * * * *');
    const from = new Date('2026-05-17T10:31:00Z');
    const next = nextCronRun(spec, from);
    expect(next.toISOString()).toBe('2026-05-17T11:30:00.000Z');
  });

  it('rolls to the next day for a daily 9am schedule', () => {
    const spec = parseCron('0 9 * * *');
    const from = new Date('2026-05-17T15:00:00Z');
    const next = nextCronRun(spec, from);
    expect(next.toISOString()).toBe('2026-05-18T09:00:00.000Z');
  });

  it('respects month constraints', () => {
    const spec = parseCron('0 0 1 1 *');  // every Jan 1 at midnight
    const from = new Date('2026-05-17T00:00:00Z');
    const next = nextCronRun(spec, from);
    expect(next.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('respects day-of-week constraints (weekdays only)', () => {
    const spec = parseCron('0 9 * * MON-FRI');
    // 2026-05-16 is a Saturday — first matching firing is Mon 2026-05-18 09:00
    const from = new Date('2026-05-16T12:00:00Z');
    const next = nextCronRun(spec, from);
    expect(next.toISOString()).toBe('2026-05-18T09:00:00.000Z');
  });

  it('honors DOM OR DOW when both are restricted (POSIX cron)', () => {
    // Fire on the 1st of the month OR any Monday — whichever comes first.
    const spec = parseCron('0 0 1 * 1');
    const from = new Date('2026-05-26T12:00:00Z');  // Tuesday
    const next = nextCronRun(spec, from);
    // Next Monday is 2026-06-01 (which is also the 1st — both match).
    expect(next.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });
});

describe('nextCronRun — timezone-aware', () => {
  it('fires daily 9am in America/Los_Angeles (PDT, summer)', () => {
    const spec = parseCron('0 9 * * *');
    // June is unambiguously PDT (UTC-7).
    const from = new Date('2026-06-15T00:00:00Z');
    const next = nextCronRun(spec, from, 'America/Los_Angeles');
    // 9am PDT = 16:00 UTC, on 2026-06-15 (since 'from' is well before).
    expect(next.toISOString()).toBe('2026-06-15T16:00:00.000Z');
  });

  it('fires daily 9am in America/Los_Angeles (PST, winter)', () => {
    const spec = parseCron('0 9 * * *');
    // January is unambiguously PST (UTC-8).
    const from = new Date('2026-01-15T00:00:00Z');
    const next = nextCronRun(spec, from, 'America/Los_Angeles');
    // 9am PST = 17:00 UTC.
    expect(next.toISOString()).toBe('2026-01-15T17:00:00.000Z');
  });

  it('crosses spring-forward correctly (LA, March 2026)', () => {
    // DST forward: 2026-03-08 02:00 PST → 03:00 PDT. After the jump,
    // 9am LA = 16:00 UTC, no longer 17:00 UTC.
    const spec = parseCron('0 9 * * *');
    const before = new Date('2026-03-07T15:00:00Z'); // before the transition
    const next = nextCronRun(spec, before, 'America/Los_Angeles');
    // Sat 2026-03-07: 9am PST = 17:00 UTC; before's wall clock is already 7am PST, so 9am PST same day.
    expect(next.toISOString()).toBe('2026-03-07T17:00:00.000Z');

    // Now from 09:00 UTC on the spring-forward day, the next 9am LA
    // is PDT — 16:00 UTC.
    const onTransition = new Date('2026-03-08T18:00:00Z'); // after 9am PDT already passed
    const after = nextCronRun(spec, onTransition, 'America/Los_Angeles');
    expect(after.toISOString()).toBe('2026-03-09T16:00:00.000Z');
  });

  it('falls back to UTC when timezone is omitted', () => {
    const spec = parseCron('0 9 * * *');
    const from = new Date('2026-05-17T00:00:00Z');
    expect(nextCronRun(spec, from).toISOString()).toBe('2026-05-17T09:00:00.000Z');
  });
});
