import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonAutopilotStore } from '../../src/autopilot/store.js';

describe('JsonAutopilotStore — schedule CRUD', () => {
  let dir: string;
  let store: JsonAutopilotStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'embediq-ap-'));
    store = new JsonAutopilotStore(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('starts empty when no schedules.json exists', async () => {
    expect(await store.listSchedules()).toEqual([]);
  });

  it('adds, lists, gets, and deletes schedules', async () => {
    const created = await store.addSchedule({
      name: 'nightly drift scan',
      cadence: '@daily',
      answerSourcePath: '/tmp/a.yaml',
      targetDir: '/tmp/project',
    });
    expect(created.id).toBeDefined();
    expect(created.enabled).toBe(true);
    expect(created.nextRunAt).toBeDefined();

    const list = await store.listSchedules();
    expect(list).toHaveLength(1);

    const fetched = await store.getSchedule(created.id);
    expect(fetched?.name).toBe('nightly drift scan');

    expect(await store.deleteSchedule(created.id)).toBe(true);
    expect(await store.listSchedules()).toEqual([]);
    expect(await store.deleteSchedule(created.id)).toBe(false);
  });

  it('accepts a 5-field cron expression as cadence and computes nextRunAt accordingly', async () => {
    const created = await store.addSchedule({
      name: 'business hours daily',
      cadence: '0 9 * * *',
      answerSourcePath: '/tmp/a.yaml',
      targetDir: '/tmp/project',
    });
    expect(created.cadence).toBe('0 9 * * *');
    // nextRunAt should land at HH:00 UTC with HH=09 (no timezone supplied).
    const next = new Date(created.nextRunAt);
    expect(next.getUTCHours()).toBe(9);
    expect(next.getUTCMinutes()).toBe(0);
  });

  it('persists the timezone field and uses it to compute nextRunAt', async () => {
    const created = await store.addSchedule({
      name: 'daily 9am LA',
      cadence: '0 9 * * *',
      timezone: 'America/Los_Angeles',
      answerSourcePath: '/tmp/a.yaml',
      targetDir: '/tmp/project',
    });
    expect(created.timezone).toBe('America/Los_Angeles');
    // 9am LA is either 16:00 UTC (PDT) or 17:00 UTC (PST) depending on
    // the season. Either is acceptable; both are non-09.
    const next = new Date(created.nextRunAt);
    expect([16, 17]).toContain(next.getUTCHours());
    expect(next.getUTCMinutes()).toBe(0);
  });

  it('persists schedules across a fresh store instance (round-trip)', async () => {
    await store.addSchedule({
      name: 'persisted',
      cadence: '@hourly',
      answerSourcePath: '/tmp/a.yaml',
      targetDir: '/tmp/project',
    });
    const reloaded = new JsonAutopilotStore(dir);
    const list = await reloaded.listSchedules();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('persisted');
  });

  it('updateSchedule patches mutable fields and bumps updatedAt', async () => {
    const created = await store.addSchedule({
      name: 'before',
      cadence: '@daily',
      answerSourcePath: '/tmp/a.yaml',
      targetDir: '/tmp/project',
    });
    // Allow at least a millisecond between create and update so the ISO
    // timestamps can demonstrably differ on fast machines.
    await new Promise((r) => setTimeout(r, 2));
    const updated = await store.updateSchedule(created.id, { name: 'after', enabled: false });
    expect(updated?.name).toBe('after');
    expect(updated?.enabled).toBe(false);
    expect(updated?.id).toBe(created.id);
    expect(updated?.createdAt).toBe(created.createdAt);
    expect(new Date(updated!.updatedAt).getTime()).toBeGreaterThan(
      new Date(created.updatedAt).getTime(),
    );
  });

  it('records and lists runs, sorted by startedAt descending', async () => {
    const created = await store.addSchedule({
      name: 's',
      cadence: '@daily',
      answerSourcePath: '/tmp/a.yaml',
      targetDir: '/tmp/project',
    });
    await store.recordRun({
      id: 'run-1',
      scheduleId: created.id,
      trigger: 'cron',
      startedAt: '2026-04-20T00:00:00.000Z',
      completedAt: '2026-04-20T00:00:01.000Z',
      status: 'success-clean',
    });
    await store.recordRun({
      id: 'run-2',
      scheduleId: created.id,
      trigger: 'webhook',
      startedAt: '2026-04-21T00:00:00.000Z',
      completedAt: '2026-04-21T00:00:01.000Z',
      status: 'success-drifted',
    });
    const runs = await store.listRuns({ scheduleId: created.id });
    expect(runs.map((r) => r.id)).toEqual(['run-2', 'run-1']);
  });

  it('caps run history at 500 entries (keeps the newest)', async () => {
    const s = await store.addSchedule({
      name: 's',
      cadence: '@hourly',
      answerSourcePath: '/tmp/a.yaml',
      targetDir: '/tmp/project',
    });
    for (let i = 0; i < 510; i++) {
      await store.recordRun({
        id: `run-${i}`,
        scheduleId: s.id,
        trigger: 'cron',
        startedAt: `2026-04-21T00:${String(i % 60).padStart(2, '0')}:00.000Z`,
        completedAt: `2026-04-21T00:${String(i % 60).padStart(2, '0')}:01.000Z`,
        status: 'success-clean',
      });
    }
    const runs = await store.listRuns();
    expect(runs.length).toBeLessThanOrEqual(500);
    // The very first inserted run should have been evicted.
    expect(runs.find((r) => r.id === 'run-0')).toBeUndefined();
    expect(runs.find((r) => r.id === 'run-509')).toBeDefined();
  });

  it('listRuns honors the limit filter', async () => {
    const s = await store.addSchedule({
      name: 's',
      cadence: '@daily',
      answerSourcePath: '/tmp/a.yaml',
      targetDir: '/tmp/project',
    });
    for (let i = 0; i < 5; i++) {
      await store.recordRun({
        id: `run-${i}`,
        scheduleId: s.id,
        trigger: 'cron',
        startedAt: `2026-04-2${i}T00:00:00.000Z`,
        completedAt: `2026-04-2${i}T00:00:01.000Z`,
        status: 'success-clean',
      });
    }
    const runs = await store.listRuns({ limit: 3 });
    expect(runs).toHaveLength(3);
  });
});

describe('JsonAutopilotStore — default directory resolution', () => {
  const originalEngagementId = process.env.EMBEDIQ_ENGAGEMENT_ID;
  const originalAutopilotDir = process.env.EMBEDIQ_AUTOPILOT_DIR;
  let workDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'embediq-ap-default-'));
    originalCwd = process.cwd();
    process.chdir(workDir);
    delete process.env.EMBEDIQ_ENGAGEMENT_ID;
    delete process.env.EMBEDIQ_AUTOPILOT_DIR;
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(workDir, { recursive: true, force: true });
    if (originalEngagementId === undefined) delete process.env.EMBEDIQ_ENGAGEMENT_ID;
    else process.env.EMBEDIQ_ENGAGEMENT_ID = originalEngagementId;
    if (originalAutopilotDir === undefined) delete process.env.EMBEDIQ_AUTOPILOT_DIR;
    else process.env.EMBEDIQ_AUTOPILOT_DIR = originalAutopilotDir;
  });

  it('writes to .embediq/autopilot when neither env var is set', async () => {
    const store = new JsonAutopilotStore();
    await store.addSchedule({
      name: 'baseline',
      cadence: '@daily',
      answerSourcePath: '/tmp/a.yaml',
      targetDir: '/tmp/project',
    });
    const { existsSync } = await import('node:fs');
    expect(existsSync(join(workDir, '.embediq/autopilot/schedules.json'))).toBe(true);
  });

  it('scopes under engagements/<id> when EMBEDIQ_ENGAGEMENT_ID is set', async () => {
    process.env.EMBEDIQ_ENGAGEMENT_ID = 'eng-alpha';
    const store = new JsonAutopilotStore();
    await store.addSchedule({
      name: 'scoped',
      cadence: '@daily',
      answerSourcePath: '/tmp/a.yaml',
      targetDir: '/tmp/project',
    });
    const { existsSync } = await import('node:fs');
    expect(
      existsSync(join(workDir, '.embediq/engagements/eng-alpha/autopilot/schedules.json')),
    ).toBe(true);
    expect(existsSync(join(workDir, '.embediq/autopilot/schedules.json'))).toBe(false);
  });

  it('honors explicit EMBEDIQ_AUTOPILOT_DIR even when engagement id is set', async () => {
    process.env.EMBEDIQ_ENGAGEMENT_ID = 'eng-alpha';
    const explicit = join(workDir, 'custom-autopilot');
    process.env.EMBEDIQ_AUTOPILOT_DIR = explicit;
    const store = new JsonAutopilotStore();
    await store.addSchedule({
      name: 'explicit',
      cadence: '@daily',
      answerSourcePath: '/tmp/a.yaml',
      targetDir: '/tmp/project',
    });
    const { existsSync } = await import('node:fs');
    expect(existsSync(join(explicit, 'schedules.json'))).toBe(true);
    expect(
      existsSync(join(workDir, '.embediq/engagements/eng-alpha/autopilot/schedules.json')),
    ).toBe(false);
  });

  it('isolates two engagement IDs into disjoint directories', async () => {
    process.env.EMBEDIQ_ENGAGEMENT_ID = 'eng-alpha';
    const storeA = new JsonAutopilotStore();
    await storeA.addSchedule({
      name: 'alpha-only',
      cadence: '@daily',
      answerSourcePath: '/tmp/a.yaml',
      targetDir: '/tmp/project',
    });

    process.env.EMBEDIQ_ENGAGEMENT_ID = 'eng-beta';
    const storeB = new JsonAutopilotStore();
    await storeB.addSchedule({
      name: 'beta-only',
      cadence: '@daily',
      answerSourcePath: '/tmp/b.yaml',
      targetDir: '/tmp/project',
    });

    // Re-instantiating against each engagement ID should see only its own schedules
    process.env.EMBEDIQ_ENGAGEMENT_ID = 'eng-alpha';
    const reloadedA = new JsonAutopilotStore();
    const namesA = (await reloadedA.listSchedules()).map((s) => s.name);
    expect(namesA).toEqual(['alpha-only']);

    process.env.EMBEDIQ_ENGAGEMENT_ID = 'eng-beta';
    const reloadedB = new JsonAutopilotStore();
    const namesB = (await reloadedB.listSchedules()).map((s) => s.name);
    expect(namesB).toEqual(['beta-only']);
  });
});
