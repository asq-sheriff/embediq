import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type {
  AutopilotRun,
  AutopilotStore,
  ScheduleCreateInput,
} from '../../src/autopilot/index.js';

export type StoreFactory = () => Promise<{
  store: AutopilotStore;
  teardown: () => Promise<void>;
}>;

function makeRun(scheduleId: string, partial: Partial<AutopilotRun> = {}): AutopilotRun {
  return {
    id: randomUUID(),
    scheduleId,
    trigger: 'cron',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    status: 'success-clean',
    ...partial,
  };
}

function makeInput(overrides: Partial<ScheduleCreateInput> = {}): ScheduleCreateInput {
  return {
    name: 'test',
    cadence: '@daily',
    answerSourcePath: '/tmp/a.yaml',
    targetDir: '/tmp/project',
    ...overrides,
  };
}

/**
 * Shared contract suite for AutopilotStore implementations. Mirrors the
 * SessionBackend approach — every store passes the same tests, so a new
 * dialect proves itself by running this suite green.
 */
export function autopilotStoreContract(label: string, factory: StoreFactory) {
  describe(`AutopilotStore contract — ${label}`, () => {
    let store: AutopilotStore;
    let teardown: () => Promise<void>;

    beforeEach(async () => {
      const created = await factory();
      store = created.store;
      teardown = created.teardown;
    });

    afterEach(async () => {
      await teardown();
    });

    describe('schedule CRUD', () => {
      it('starts empty', async () => {
        expect(await store.listSchedules()).toEqual([]);
      });

      it('adds, retrieves, lists, and deletes a schedule', async () => {
        const created = await store.addSchedule(makeInput({ name: 'nightly' }));
        expect(created.id).toBeDefined();
        expect(created.name).toBe('nightly');
        expect(created.enabled).toBe(true);
        expect(created.nextRunAt).toBeDefined();

        const list = await store.listSchedules();
        expect(list).toHaveLength(1);

        const fetched = await store.getSchedule(created.id);
        expect(fetched?.name).toBe('nightly');

        const deleted = await store.deleteSchedule(created.id);
        expect(deleted).toBe(true);
        expect(await store.deleteSchedule(created.id)).toBe(false);
        expect(await store.listSchedules()).toEqual([]);
      });

      it('persists optional fields (timezone, targets, frameworks, alert streak)', async () => {
        const created = await store.addSchedule(makeInput({
          name: 'with-options',
          cadence: '0 9 * * MON-FRI',
          timezone: 'America/Los_Angeles',
          targets: ['claude' as const],
          driftAlertThreshold: 3,
          complianceFrameworks: ['hipaa', 'soc2'],
          alertOnFailureStreak: 5,
        }));
        const refetched = await store.getSchedule(created.id);
        expect(refetched?.timezone).toBe('America/Los_Angeles');
        expect(refetched?.targets).toEqual(['claude']);
        expect(refetched?.driftAlertThreshold).toBe(3);
        expect(refetched?.complianceFrameworks).toEqual(['hipaa', 'soc2']);
        expect(refetched?.alertOnFailureStreak).toBe(5);
      });

      it('round-trips alertOnFailureStreak=0 (alerting disabled) distinctly from undefined', async () => {
        // 0 is a meaningful value (disables alerting for the schedule);
        // it must survive a write/read cycle and not coerce to null/undefined.
        const created = await store.addSchedule(makeInput({
          name: 'no-alerts',
          alertOnFailureStreak: 0,
        }));
        const refetched = await store.getSchedule(created.id);
        expect(refetched?.alertOnFailureStreak).toBe(0);
      });

      it('updateSchedule can change alertOnFailureStreak', async () => {
        const created = await store.addSchedule(makeInput({ alertOnFailureStreak: 3 }));
        const updated = await store.updateSchedule(created.id, { alertOnFailureStreak: 7 });
        expect(updated?.alertOnFailureStreak).toBe(7);
        const refetched = await store.getSchedule(created.id);
        expect(refetched?.alertOnFailureStreak).toBe(7);
      });

      it('updateSchedule patches mutable fields', async () => {
        const created = await store.addSchedule(makeInput());
        const updated = await store.updateSchedule(created.id, { enabled: false });
        expect(updated?.enabled).toBe(false);
        expect((await store.getSchedule(created.id))?.enabled).toBe(false);
      });

      it('updateSchedule returns undefined for an unknown id', async () => {
        expect(await store.updateSchedule('nope', { enabled: false })).toBeUndefined();
      });
    });

    describe('claim-and-advance', () => {
      it('returns the updated schedule when the CAS matches', async () => {
        const created = await store.addSchedule(makeInput());
        const newNext = new Date(Date.now() + 60_000).toISOString();
        const claimed = await store.claimSchedule(
          created.id,
          created.nextRunAt,
          newNext,
          new Date().toISOString(),
        );
        expect(claimed).not.toBeNull();
        expect(claimed?.nextRunAt).toBe(newNext);

        const refetched = await store.getSchedule(created.id);
        expect(refetched?.nextRunAt).toBe(newNext);
      });

      it('returns null when the expected nextRunAt no longer matches', async () => {
        const created = await store.addSchedule(makeInput());
        const newNext = new Date(Date.now() + 60_000).toISOString();
        await store.claimSchedule(
          created.id,
          created.nextRunAt,
          newNext,
          new Date().toISOString(),
        );
        // Second claim attempt with the *original* expected value loses
        // the race — another replica got there first.
        const loser = await store.claimSchedule(
          created.id,
          created.nextRunAt,
          new Date(Date.now() + 120_000).toISOString(),
          new Date().toISOString(),
        );
        expect(loser).toBeNull();
      });

      it('returns null for an unknown schedule id', async () => {
        const result = await store.claimSchedule(
          'no-such-id',
          new Date().toISOString(),
          new Date().toISOString(),
          new Date().toISOString(),
        );
        expect(result).toBeNull();
      });

      it('multi-replica race — only one of N parallel claims succeeds', async () => {
        const created = await store.addSchedule(makeInput());
        const next = new Date(Date.now() + 60_000).toISOString();
        const now = new Date().toISOString();
        const claims = await Promise.all(
          [0, 1, 2, 3, 4].map(() =>
            store.claimSchedule(created.id, created.nextRunAt, next, now),
          ),
        );
        const winners = claims.filter((c) => c !== null);
        expect(winners).toHaveLength(1);
      });
    });

    describe('runs', () => {
      it('records and lists runs in descending startedAt order', async () => {
        const schedule = await store.addSchedule(makeInput());
        await store.recordRun(makeRun(schedule.id, { startedAt: '2026-05-01T00:00:00.000Z' }));
        await store.recordRun(makeRun(schedule.id, { startedAt: '2026-05-03T00:00:00.000Z' }));
        await store.recordRun(makeRun(schedule.id, { startedAt: '2026-05-02T00:00:00.000Z' }));

        const runs = await store.listRuns({ scheduleId: schedule.id });
        expect(runs.map((r) => r.startedAt)).toEqual([
          '2026-05-03T00:00:00.000Z',
          '2026-05-02T00:00:00.000Z',
          '2026-05-01T00:00:00.000Z',
        ]);
      });

      it('listRuns filters by scheduleId', async () => {
        const a = await store.addSchedule(makeInput({ name: 'a' }));
        const b = await store.addSchedule(makeInput({ name: 'b' }));
        await store.recordRun(makeRun(a.id));
        await store.recordRun(makeRun(b.id));

        const aOnly = await store.listRuns({ scheduleId: a.id });
        expect(aOnly).toHaveLength(1);
        expect(aOnly[0].scheduleId).toBe(a.id);
      });

      it('listRuns respects limit', async () => {
        const schedule = await store.addSchedule(makeInput());
        for (let i = 0; i < 5; i++) {
          await store.recordRun(makeRun(schedule.id));
        }
        const limited = await store.listRuns({ scheduleId: schedule.id, limit: 2 });
        expect(limited).toHaveLength(2);
      });

      it('round-trips driftSummary and error fields', async () => {
        const schedule = await store.addSchedule(makeInput());
        await store.recordRun(makeRun(schedule.id, {
          status: 'success-drifted',
          driftSummary: {
            match: 10,
            missing: 1,
            modifiedByUser: 0,
            modifiedStaleStamp: 0,
            versionMismatch: 0,
            extra: 0,
            totalDrift: 1,
          },
        }));
        await store.recordRun(makeRun(schedule.id, {
          status: 'failure',
          error: 'something broke',
        }));

        const runs = await store.listRuns({ scheduleId: schedule.id });
        expect(runs).toHaveLength(2);
        const drifted = runs.find((r) => r.status === 'success-drifted');
        expect(drifted?.driftSummary?.totalDrift).toBe(1);
        expect(drifted?.driftSummary?.missing).toBe(1);
        const failed = runs.find((r) => r.status === 'failure');
        expect(failed?.error).toBe('something broke');
      });
    });
  });
}
