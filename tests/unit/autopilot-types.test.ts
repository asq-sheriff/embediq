import { describe, it, expect } from 'vitest';
import { isDue, nextRunAt, type AutopilotSchedule } from '../../src/autopilot/types.js';

function schedule(overrides: Partial<AutopilotSchedule> = {}): AutopilotSchedule {
  return {
    id: 's',
    name: 'test',
    cadence: '@hourly',
    answerSourcePath: '/tmp/answers.yaml',
    targetDir: '/tmp/target',
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    nextRunAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('nextRunAt', () => {
  it('@hourly fires exactly 60 minutes after the reference time', () => {
    const ref = new Date('2026-04-21T12:34:56.000Z');
    const next = nextRunAt('@hourly', ref);
    expect(next.toISOString()).toBe('2026-04-21T13:34:56.000Z');
  });

  it('@daily snaps to the next UTC midnight', () => {
    const ref = new Date('2026-04-21T12:34:56.000Z');
    const next = nextRunAt('@daily', ref);
    expect(next.toISOString()).toBe('2026-04-22T00:00:00.000Z');
  });

  it('@daily moves to the following day even when the reference is at midnight', () => {
    const ref = new Date('2026-04-21T00:00:00.000Z');
    const next = nextRunAt('@daily', ref);
    expect(next.toISOString()).toBe('2026-04-22T00:00:00.000Z');
  });

  it('@weekly snaps to the next UTC Monday at 00:00', () => {
    // 2026-04-21 is a Tuesday → next Monday is 2026-04-27
    const ref = new Date('2026-04-21T15:00:00.000Z');
    const next = nextRunAt('@weekly', ref);
    expect(next.toISOString()).toBe('2026-04-27T00:00:00.000Z');
  });

  it('@weekly from a Monday rolls forward a full week (no same-day fire)', () => {
    // 2026-04-20 is a Monday
    const ref = new Date('2026-04-20T08:00:00.000Z');
    const next = nextRunAt('@weekly', ref);
    expect(next.toISOString()).toBe('2026-04-27T00:00:00.000Z');
  });

  it('@monthly snaps to the first of the next UTC month', () => {
    const ref = new Date('2026-04-21T12:34:56.000Z');
    const next = nextRunAt('@monthly', ref);
    expect(next.toISOString()).toBe('2026-05-01T00:00:00.000Z');
  });
});

describe('isDue', () => {
  it('returns true when nextRunAt is in the past', () => {
    const s = schedule({ nextRunAt: '2026-01-01T00:00:00.000Z' });
    expect(isDue(s, new Date('2026-04-21T00:00:00.000Z'))).toBe(true);
  });

  it('returns true when nextRunAt is exactly now', () => {
    const now = new Date('2026-04-21T00:00:00.000Z');
    const s = schedule({ nextRunAt: now.toISOString() });
    expect(isDue(s, now)).toBe(true);
  });

  it('returns false when nextRunAt is in the future', () => {
    const s = schedule({ nextRunAt: '2027-01-01T00:00:00.000Z' });
    expect(isDue(s, new Date('2026-04-21T00:00:00.000Z'))).toBe(false);
  });

  it('returns false when the schedule is disabled, even if due', () => {
    const s = schedule({ nextRunAt: '2026-01-01T00:00:00.000Z', enabled: false });
    expect(isDue(s, new Date('2026-04-21T00:00:00.000Z'))).toBe(false);
  });
});
