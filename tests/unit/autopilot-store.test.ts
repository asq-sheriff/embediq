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
