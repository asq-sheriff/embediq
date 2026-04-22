import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtemp, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../../src/web/server.js';
import {
  AutopilotScheduler,
  JsonAutopilotStore,
} from '../../src/autopilot/index.js';

const FIXTURE_ROOT = resolve(__dirname, '../fixtures/golden-configs/minimal-developer');
const FIXTURE_ANSWERS = join(FIXTURE_ROOT, 'answers.yaml');
const FIXTURE_EXPECTED = join(FIXTURE_ROOT, 'expected');

describe('POST /api/autopilot/compliance/:adapterId', () => {
  let storeDir: string;
  let projectDir: string;
  let store: JsonAutopilotStore;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    storeDir = await mkdtemp(join(tmpdir(), 'embediq-comp-'));
    projectDir = await mkdtemp(join(tmpdir(), 'embediq-comp-project-'));
    await cp(FIXTURE_EXPECTED, projectDir, { recursive: true });
    store = new JsonAutopilotStore(storeDir);
    const scheduler = new AutopilotScheduler({ store });
    app = createApp({ autopilotStore: store, autopilotScheduler: scheduler });
  });

  afterEach(async () => {
    await rm(storeDir, { recursive: true, force: true });
    await rm(projectDir, { recursive: true, force: true });
    delete process.env.EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET;
  });

  it('404s on unknown adapter id', async () => {
    const res = await request(app)
      .post('/api/autopilot/compliance/does-not-exist')
      .send({ framework: 'hipaa', action: 'gap_opened' });
    expect(res.status).toBe(404);
  });

  it('returns 200/skipped when the adapter ignores the payload', async () => {
    // Drata adapter ignores anything without a known `event` field.
    const res = await request(app)
      .post('/api/autopilot/compliance/drata')
      .send({ event: 'user.created', data: {} });
    expect(res.status).toBe(200);
    expect(res.body.skipped).toBe(true);
  });

  it('returns 200/skipped when no schedule matches the framework', async () => {
    // Create a schedule for PCI but fire a HIPAA event.
    await request(app).post('/api/autopilot/schedules').send({
      name: 'pci-watcher',
      cadence: '@daily',
      answerSourcePath: FIXTURE_ANSWERS,
      targetDir: projectDir,
      complianceFrameworks: ['pci'],
    });

    const res = await request(app)
      .post('/api/autopilot/compliance/generic')
      .send({ framework: 'hipaa', action: 'gap_opened' });
    expect(res.status).toBe(200);
    expect(res.body.skipped).toBe(true);
    expect(res.body.event.framework).toBe('hipaa');
  });

  it('fires a run for every enabled schedule whose complianceFrameworks include the event framework', async () => {
    const watcher1 = await request(app).post('/api/autopilot/schedules').send({
      name: 'hipaa-watcher',
      cadence: '@daily',
      answerSourcePath: FIXTURE_ANSWERS,
      targetDir: projectDir,
      complianceFrameworks: ['hipaa', 'hitech'],
    });
    await request(app).post('/api/autopilot/schedules').send({
      name: 'pci-watcher',
      cadence: '@daily',
      answerSourcePath: FIXTURE_ANSWERS,
      targetDir: projectDir,
      complianceFrameworks: ['pci'], // non-match
    });
    const watcher2 = await request(app).post('/api/autopilot/schedules').send({
      name: 'hipaa-watcher-2',
      cadence: '@hourly',
      answerSourcePath: FIXTURE_ANSWERS,
      targetDir: projectDir,
      complianceFrameworks: ['hipaa'],
    });

    const res = await request(app)
      .post('/api/autopilot/compliance/drata')
      .send({
        event: 'monitor.failed',
        data: {
          control: { id: 'CTRL-42', name: 'PHI encryption', frameworks: ['hipaa'] },
        },
      });

    expect(res.status).toBe(202);
    expect(res.body.event.framework).toBe('hipaa');
    expect(Array.isArray(res.body.runs)).toBe(true);
    const scheduleIds = (res.body.runs as Array<{ scheduleId: string }>).map((r) => r.scheduleId).sort();
    expect(scheduleIds).toEqual([watcher1.body.id, watcher2.body.id].sort());
  });

  it('skips disabled schedules even when framework matches', async () => {
    // Create and immediately disable the schedule. We can't toggle via
    // the REST API yet (no PATCH), so we reach into the store.
    const created = await request(app).post('/api/autopilot/schedules').send({
      name: 'disabled-hipaa-watcher',
      cadence: '@daily',
      answerSourcePath: FIXTURE_ANSWERS,
      targetDir: projectDir,
      complianceFrameworks: ['hipaa'],
    });
    await store.updateSchedule(created.body.id, { enabled: false });

    const res = await request(app)
      .post('/api/autopilot/compliance/generic')
      .send({ framework: 'hipaa', action: 'gap_opened' });
    expect(res.status).toBe(200);
    expect(res.body.skipped).toBe(true);
  });

  it('enforces the shared secret when EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET is set', async () => {
    process.env.EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET = 'shh';
    const res = await request(app)
      .post('/api/autopilot/compliance/generic')
      .send({ framework: 'hipaa', action: 'gap_opened' });
    expect(res.status).toBe(401);

    const ok = await request(app)
      .post('/api/autopilot/compliance/generic')
      .set('X-EmbedIQ-Autopilot-Secret', 'shh')
      .send({ framework: 'hipaa', action: 'gap_opened' });
    // No matching schedule, but at least the secret passed → 200/skipped.
    expect(ok.status).toBe(200);
  });
});
