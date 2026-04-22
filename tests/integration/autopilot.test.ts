import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtemp, rm, writeFile, mkdir, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../../src/web/server.js';
import {
  AutopilotScheduler,
  JsonAutopilotStore,
  runAutopilot,
} from '../../src/autopilot/index.js';

const FIXTURE_ROOT = resolve(__dirname, '../fixtures/golden-configs/minimal-developer');
const FIXTURE_ANSWERS = join(FIXTURE_ROOT, 'answers.yaml');
const FIXTURE_EXPECTED = join(FIXTURE_ROOT, 'expected');

describe('runAutopilot', () => {
  let storeDir: string;
  let projectDir: string;
  let store: JsonAutopilotStore;

  beforeEach(async () => {
    storeDir = await mkdtemp(join(tmpdir(), 'embediq-ap-store-'));
    projectDir = await mkdtemp(join(tmpdir(), 'embediq-ap-project-'));
    await cp(FIXTURE_EXPECTED, projectDir, { recursive: true });
    store = new JsonAutopilotStore(storeDir);
  });

  afterEach(async () => {
    await rm(storeDir, { recursive: true, force: true });
    await rm(projectDir, { recursive: true, force: true });
  });

  it('records a success-clean run when the project matches the expected golden', async () => {
    const schedule = await store.addSchedule({
      name: 'clean',
      cadence: '@daily',
      answerSourcePath: FIXTURE_ANSWERS,
      targetDir: projectDir,
    });

    const run = await runAutopilot(schedule, store, { trigger: 'manual' });
    expect(run.status).toBe('success-clean');
    expect(run.driftSummary?.totalDrift).toBe(0);

    const runs = await store.listRuns({ scheduleId: schedule.id });
    expect(runs).toHaveLength(1);

    // lastRunAt and nextRunAt advance as a side-effect of running.
    const updated = await store.getSchedule(schedule.id);
    expect(updated?.lastRunAt).toBeDefined();
    expect(new Date(updated!.nextRunAt).getTime()).toBeGreaterThanOrEqual(
      new Date(schedule.nextRunAt).getTime(),
    );
  });

  it('records success-drifted when drift is below the alert threshold', async () => {
    await writeFile(join(projectDir, '.claude/rules/extra.md'), '# extra', 'utf-8');
    const schedule = await store.addSchedule({
      name: 'tolerant',
      cadence: '@daily',
      answerSourcePath: FIXTURE_ANSWERS,
      targetDir: projectDir,
      driftAlertThreshold: 5, // 1 extra file is well below 5
    });

    const run = await runAutopilot(schedule, store, { trigger: 'cron' });
    expect(run.status).toBe('success-drifted');
    expect(run.driftSummary?.extra).toBe(1);
  });

  it('records success-alerting when drift exceeds the alert threshold', async () => {
    await writeFile(join(projectDir, '.claude/rules/extra.md'), '# extra', 'utf-8');
    const schedule = await store.addSchedule({
      name: 'strict',
      cadence: '@daily',
      answerSourcePath: FIXTURE_ANSWERS,
      targetDir: projectDir,
      driftAlertThreshold: 0, // any drift triggers alert
    });

    const run = await runAutopilot(schedule, store, { trigger: 'cron' });
    expect(run.status).toBe('success-alerting');
  });

  it('records failure when the answer file does not exist', async () => {
    const schedule = await store.addSchedule({
      name: 'missing-answers',
      cadence: '@daily',
      answerSourcePath: '/tmp/embediq-nonexistent-answers.yaml',
      targetDir: projectDir,
    });

    const run = await runAutopilot(schedule, store, { trigger: 'cron' });
    expect(run.status).toBe('failure');
    expect(run.error).toMatch(/Answer source/);
  });
});

describe('AutopilotScheduler', () => {
  let storeDir: string;
  let projectDir: string;
  let store: JsonAutopilotStore;

  beforeEach(async () => {
    storeDir = await mkdtemp(join(tmpdir(), 'embediq-ap-store-'));
    projectDir = await mkdtemp(join(tmpdir(), 'embediq-ap-project-'));
    await cp(FIXTURE_EXPECTED, projectDir, { recursive: true });
    store = new JsonAutopilotStore(storeDir);
  });

  afterEach(async () => {
    await rm(storeDir, { recursive: true, force: true });
    await rm(projectDir, { recursive: true, force: true });
  });

  it('fires due schedules on a single tick and skips not-yet-due ones', async () => {
    const due = await store.addSchedule({
      name: 'due',
      cadence: '@hourly',
      answerSourcePath: FIXTURE_ANSWERS,
      targetDir: projectDir,
    });
    const notDue = await store.addSchedule({
      name: 'not-due',
      cadence: '@hourly',
      answerSourcePath: FIXTURE_ANSWERS,
      targetDir: projectDir,
    });
    // Force the second schedule's nextRunAt into the future.
    await store.updateSchedule(notDue.id, { nextRunAt: '2099-01-01T00:00:00.000Z' });
    // Force the first schedule into the past so it's due.
    await store.updateSchedule(due.id, { nextRunAt: '2026-01-01T00:00:00.000Z' });

    const fixedNow = () => new Date('2026-04-21T12:00:00.000Z');
    const scheduler = new AutopilotScheduler({ store, now: fixedNow });
    await scheduler.runTick();

    const runs = await store.listRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0].scheduleId).toBe(due.id);
    expect(runs[0].trigger).toBe('cron');
  });

  it('serializes overlapping ticks (second tick is a no-op while the first runs)', async () => {
    const schedule = await store.addSchedule({
      name: 's',
      cadence: '@hourly',
      answerSourcePath: FIXTURE_ANSWERS,
      targetDir: projectDir,
    });
    await store.updateSchedule(schedule.id, { nextRunAt: '2026-01-01T00:00:00.000Z' });

    const fixedNow = () => new Date('2026-04-21T12:00:00.000Z');
    const scheduler = new AutopilotScheduler({ store, now: fixedNow });
    const first = scheduler.runTick();
    const second = scheduler.runTick();
    await Promise.all([first, second]);

    const runs = await store.listRuns();
    expect(runs).toHaveLength(1);
  });
});

describe('Autopilot REST + webhook', () => {
  let storeDir: string;
  let projectDir: string;
  let store: JsonAutopilotStore;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    storeDir = await mkdtemp(join(tmpdir(), 'embediq-ap-store-'));
    projectDir = await mkdtemp(join(tmpdir(), 'embediq-ap-project-'));
    await cp(FIXTURE_EXPECTED, projectDir, { recursive: true });
    store = new JsonAutopilotStore(storeDir);
    // Inject a stopped scheduler so tests don't rely on a real interval
    // firing during execution.
    const scheduler = new AutopilotScheduler({ store });
    app = createApp({ autopilotStore: store, autopilotScheduler: scheduler });
  });

  afterEach(async () => {
    await rm(storeDir, { recursive: true, force: true });
    await rm(projectDir, { recursive: true, force: true });
    delete process.env.EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET;
  });

  it('GET /api/autopilot/schedules returns an empty list initially', async () => {
    const res = await request(app).get('/api/autopilot/schedules');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('POST /api/autopilot/schedules creates a schedule', async () => {
    const res = await request(app).post('/api/autopilot/schedules').send({
      name: 'nightly',
      cadence: '@daily',
      answerSourcePath: FIXTURE_ANSWERS,
      targetDir: projectDir,
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.cadence).toBe('@daily');
  });

  it('POST rejects an invalid cadence with 400', async () => {
    const res = await request(app).post('/api/autopilot/schedules').send({
      name: 'bad',
      cadence: '@yearly',
      answerSourcePath: FIXTURE_ANSWERS,
      targetDir: projectDir,
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('DELETE /api/autopilot/schedules/:id removes the schedule', async () => {
    const create = await request(app).post('/api/autopilot/schedules').send({
      name: 'doomed',
      cadence: '@hourly',
      answerSourcePath: FIXTURE_ANSWERS,
      targetDir: projectDir,
    });
    const id = create.body.id;

    const del = await request(app).delete(`/api/autopilot/schedules/${id}`);
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(true);

    const after = await request(app).get('/api/autopilot/schedules');
    expect(after.body).toEqual([]);
  });

  it('POST webhook triggers a run and returns the run record', async () => {
    const create = await request(app).post('/api/autopilot/schedules').send({
      name: 'webhook',
      cadence: '@daily',
      answerSourcePath: FIXTURE_ANSWERS,
      targetDir: projectDir,
    });
    const id = create.body.id;

    const fire = await request(app).post(`/api/autopilot/webhook/${id}`);
    expect(fire.status).toBe(202);
    expect(fire.body.trigger).toBe('webhook');
    expect(fire.body.scheduleId).toBe(id);
    expect(fire.body.status).toBe('success-clean');
  });

  it('POST webhook returns 401 when secret is required and not supplied', async () => {
    process.env.EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET = 'shared-secret';
    const create = await request(app).post('/api/autopilot/schedules').send({
      name: 'guarded',
      cadence: '@daily',
      answerSourcePath: FIXTURE_ANSWERS,
      targetDir: projectDir,
    });
    const fire = await request(app).post(`/api/autopilot/webhook/${create.body.id}`);
    expect(fire.status).toBe(401);
  });

  it('POST webhook accepts the supplied secret when configured', async () => {
    process.env.EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET = 'shared-secret';
    const create = await request(app).post('/api/autopilot/schedules').send({
      name: 'guarded',
      cadence: '@daily',
      answerSourcePath: FIXTURE_ANSWERS,
      targetDir: projectDir,
    });
    const fire = await request(app)
      .post(`/api/autopilot/webhook/${create.body.id}`)
      .set('X-EmbedIQ-Autopilot-Secret', 'shared-secret');
    expect(fire.status).toBe(202);
  });

  it('POST webhook 404s on unknown schedule id', async () => {
    const fire = await request(app).post('/api/autopilot/webhook/00000000-0000-4000-8000-000000000000');
    expect(fire.status).toBe(404);
  });

  it('GET /api/autopilot/runs filters by scheduleId', async () => {
    const a = await request(app).post('/api/autopilot/schedules').send({
      name: 'A',
      cadence: '@daily',
      answerSourcePath: FIXTURE_ANSWERS,
      targetDir: projectDir,
    });
    const b = await request(app).post('/api/autopilot/schedules').send({
      name: 'B',
      cadence: '@daily',
      answerSourcePath: FIXTURE_ANSWERS,
      targetDir: projectDir,
    });
    await request(app).post(`/api/autopilot/webhook/${a.body.id}`);
    await request(app).post(`/api/autopilot/webhook/${b.body.id}`);

    const onlyA = await request(app).get(`/api/autopilot/runs?scheduleId=${a.body.id}`);
    expect(onlyA.body).toHaveLength(1);
    expect(onlyA.body[0].scheduleId).toBe(a.body.id);
  });

  it('returns 503-equivalent (route not present) when autopilot is disabled', async () => {
    const plain = createApp(); // no autopilotStore
    const res = await request(plain).get('/api/autopilot/schedules');
    expect(res.status).toBe(404); // route is not mounted at all
  });
});
