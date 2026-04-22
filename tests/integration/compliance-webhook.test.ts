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
import { hmacSha256Hex } from '../../src/integrations/compliance/hmac.js';

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
    delete process.env.EMBEDIQ_COMPLIANCE_SECRET_DRATA;
    delete process.env.EMBEDIQ_COMPLIANCE_SECRET_VANTA;
    delete process.env.EMBEDIQ_COMPLIANCE_SECRET_GENERIC;
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

  // ─── HMAC signature verification ───────────────────────────────────

  describe('HMAC signature verification', () => {
    const drataPayload = {
      event: 'monitor.failed',
      data: { control: { id: 'CTRL-7', name: 'PHI', frameworks: ['hipaa'] } },
    };
    const drataBody = JSON.stringify(drataPayload);

    it('skips verification when no per-adapter secret is configured (backwards compat)', async () => {
      const res = await request(app)
        .post('/api/autopilot/compliance/drata')
        .set('Content-Type', 'application/json')
        .send(drataPayload);
      expect(res.status).toBe(200);
      expect(res.body.skipped).toBe(true);
    });

    it('rejects with 401 when secret is set but no signature header is presented', async () => {
      process.env.EMBEDIQ_COMPLIANCE_SECRET_DRATA = 'topsecret';
      const res = await request(app)
        .post('/api/autopilot/compliance/drata')
        .set('Content-Type', 'application/json')
        .send(drataPayload);
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/signature/i);
    });

    it('rejects with 401 when the signature does not match', async () => {
      process.env.EMBEDIQ_COMPLIANCE_SECRET_DRATA = 'topsecret';
      const wrong = hmacSha256Hex('wrong-secret', drataBody);
      const res = await request(app)
        .post('/api/autopilot/compliance/drata')
        .set('Content-Type', 'application/json')
        .set('X-Drata-Signature', wrong)
        .send(drataPayload);
      expect(res.status).toBe(401);
    });

    it('accepts a valid Drata HMAC-SHA256 signature', async () => {
      process.env.EMBEDIQ_COMPLIANCE_SECRET_DRATA = 'topsecret';
      const expected = hmacSha256Hex('topsecret', drataBody);
      const res = await request(app)
        .post('/api/autopilot/compliance/drata')
        .set('Content-Type', 'application/json')
        .set('X-Drata-Signature', expected)
        .send(drataPayload);
      expect(res.status).toBe(200);
      expect(res.body.skipped).toBe(true);
    });

    it('verifies Vanta signatures via X-Vanta-Signature', async () => {
      process.env.EMBEDIQ_COMPLIANCE_SECRET_VANTA = 'vanta-secret';
      const payload = {
        type: 'test.failing',
        data: { test: { frameworks: [{ slug: 'hipaa' }] } },
      };
      const body = JSON.stringify(payload);
      const expected = hmacSha256Hex('vanta-secret', body);

      const bad = await request(app)
        .post('/api/autopilot/compliance/vanta')
        .set('Content-Type', 'application/json')
        .set('X-Vanta-Signature', 'beef'.repeat(16))
        .send(payload);
      expect(bad.status).toBe(401);

      const ok = await request(app)
        .post('/api/autopilot/compliance/vanta')
        .set('Content-Type', 'application/json')
        .set('X-Vanta-Signature', expected)
        .send(payload);
      expect(ok.status).toBe(200);
      expect(ok.body.skipped).toBe(true);
    });

    it('accepts the generic adapter signature with optional sha256= prefix', async () => {
      process.env.EMBEDIQ_COMPLIANCE_SECRET_GENERIC = 'generic-secret';
      const payload = { framework: 'hipaa', action: 'gap_opened' };
      const body = JSON.stringify(payload);
      const expected = hmacSha256Hex('generic-secret', body);

      const bare = await request(app)
        .post('/api/autopilot/compliance/generic')
        .set('Content-Type', 'application/json')
        .set('X-EmbedIQ-Signature', expected)
        .send(payload);
      expect(bare.status).toBe(200);

      const prefixed = await request(app)
        .post('/api/autopilot/compliance/generic')
        .set('Content-Type', 'application/json')
        .set('X-EmbedIQ-Signature', `sha256=${expected}`)
        .send(payload);
      expect(prefixed.status).toBe(200);
    });

    it('still enforces the shared-secret header guard alongside HMAC', async () => {
      process.env.EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET = 'gateway';
      process.env.EMBEDIQ_COMPLIANCE_SECRET_DRATA = 'topsecret';
      const expected = hmacSha256Hex('topsecret', drataBody);

      const noGateway = await request(app)
        .post('/api/autopilot/compliance/drata')
        .set('Content-Type', 'application/json')
        .set('X-Drata-Signature', expected)
        .send(drataPayload);
      expect(noGateway.status).toBe(401);

      const both = await request(app)
        .post('/api/autopilot/compliance/drata')
        .set('Content-Type', 'application/json')
        .set('X-EmbedIQ-Autopilot-Secret', 'gateway')
        .set('X-Drata-Signature', expected)
        .send(drataPayload);
      expect(both.status).toBe(200);
    });
  });
});
