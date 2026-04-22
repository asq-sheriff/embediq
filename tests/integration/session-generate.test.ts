import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request, { type Response as SupertestResponse } from 'supertest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../src/web/server.js';
import {
  JsonFileBackend,
  flushSessionWrites,
} from '../../src/web/sessions/index.js';
import type { WizardSession } from '../../src/web/sessions/index.js';

const COOKIE_SECRET = 'test-cookie-secret-32-bytes-long-!!';

function extractSetCookie(res: SupertestResponse): string | undefined {
  const raw = res.headers['set-cookie'];
  if (!raw) return undefined;
  const list = Array.isArray(raw) ? raw : [raw];
  const owner = list.find((v) => v.startsWith('embediq_session_owner='));
  return owner ? owner.split(';')[0] : undefined;
}

const coreAnswers = {
  STRAT_000: { value: 'developer', timestamp: '2026-04-18T12:00:00.000Z' },
  STRAT_002: { value: 'saas', timestamp: '2026-04-18T12:00:00.000Z' },
  TECH_001: { value: ['typescript'], timestamp: '2026-04-18T12:00:00.000Z' },
  FIN_001: { value: 'moderate', timestamp: '2026-04-18T12:00:00.000Z' },
  REG_001: { value: false, timestamp: '2026-04-18T12:00:00.000Z' },
};

describe('/api/generate with server-side session', () => {
  let sessionsDir: string;
  let targetDir: string;
  let backend: JsonFileBackend;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    process.env.EMBEDIQ_SESSION_COOKIE_SECRET = COOKIE_SECRET;
    sessionsDir = await mkdtemp(join(tmpdir(), 'embediq-gen-'));
    targetDir = await mkdtemp(join(tmpdir(), 'embediq-out-'));
    backend = new JsonFileBackend({ dir: sessionsDir });
    app = createApp({ backend });
  });

  afterEach(async () => {
    await flushSessionWrites();
    await rm(sessionsDir, { recursive: true, force: true });
    await rm(targetDir, { recursive: true, force: true });
    delete process.env.EMBEDIQ_SESSION_COOKIE_SECRET;
  });

  it('end-to-end: POST /api/sessions → PATCH answers → POST /api/generate → phase=complete with history', async () => {
    // 1. Create session
    const created = await request(app).post('/api/sessions').send({});
    const cookie = extractSetCookie(created)!;
    const { sessionId } = created.body;

    // 2. Stash answers on the session
    await request(app)
      .patch(`/api/sessions/${sessionId}`)
      .set('Cookie', cookie)
      .send({ answers: coreAnswers });
    await flushSessionWrites();

    // 3. Generate — client omits answers in body; server should use session's
    const generate = await request(app)
      .post('/api/generate')
      .set('Cookie', cookie)
      .send({ sessionId, targetDir });
    expect(generate.status).toBe(200);
    expect(generate.body.totalWritten).toBeGreaterThan(0);

    await flushSessionWrites();

    // 4. Session record now reflects the run
    const readBack = await request(app)
      .get(`/api/sessions/${sessionId}`)
      .set('Cookie', cookie);
    expect(readBack.status).toBe(200);
    const session = readBack.body as WizardSession;
    expect(session.phase).toBe('complete');
    expect(session.generationHistory).toHaveLength(1);
    expect(session.generationHistory[0].fileCount).toBe(generate.body.totalWritten);
    expect(session.generationHistory[0].validationPassed).toBe(true);
    expect(session.generationHistory[0].targetDir).toBe(targetDir);
    expect(session.generationHistory[0].runId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('body answers win over session answers on overlapping ids', async () => {
    const created = await request(app).post('/api/sessions').send({});
    const cookie = extractSetCookie(created)!;
    const { sessionId } = created.body;

    // Session has STRAT_000=developer
    await request(app)
      .patch(`/api/sessions/${sessionId}`)
      .set('Cookie', cookie)
      .send({ answers: coreAnswers });
    await flushSessionWrites();

    // Body overrides with qa (plus another valid value to still build a profile)
    const overriddenAnswers = {
      ...coreAnswers,
      STRAT_000: { value: 'qa', timestamp: '2026-04-18T12:30:00.000Z' },
    };
    await request(app)
      .post('/api/generate')
      .set('Cookie', cookie)
      .send({ sessionId, targetDir, answers: overriddenAnswers });
    await flushSessionWrites();

    const readBack = await request(app)
      .get(`/api/sessions/${sessionId}`)
      .set('Cookie', cookie);
    const session = readBack.body as WizardSession;
    expect(session.answers.STRAT_000.value).toBe('qa');
    // A non-overlapping session answer is preserved
    expect(session.answers.STRAT_002.value).toBe('saas');
  });

  it('session answers fill in keys the body omits (resume-from-url scenario)', async () => {
    const created = await request(app).post('/api/sessions').send({});
    const cookie = extractSetCookie(created)!;
    const { sessionId } = created.body;

    await request(app)
      .patch(`/api/sessions/${sessionId}`)
      .set('Cookie', cookie)
      .send({ answers: coreAnswers });
    await flushSessionWrites();

    // Body supplies only a single override; session carries the rest
    const generate = await request(app)
      .post('/api/generate')
      .set('Cookie', cookie)
      .send({
        sessionId,
        targetDir,
        answers: {
          STRAT_000: { value: 'developer', timestamp: '2026-04-18T13:00:00.000Z' },
        },
      });
    expect(generate.status).toBe(200);
    expect(generate.body.totalWritten).toBeGreaterThan(0);
  });

  it('appends a new history entry on every successful generate', async () => {
    const created = await request(app).post('/api/sessions').send({});
    const cookie = extractSetCookie(created)!;
    const { sessionId } = created.body;

    await request(app)
      .patch(`/api/sessions/${sessionId}`)
      .set('Cookie', cookie)
      .send({ answers: coreAnswers });
    await flushSessionWrites();

    for (let i = 0; i < 2; i++) {
      await request(app)
        .post('/api/generate')
        .set('Cookie', cookie)
        .send({ sessionId, targetDir });
      await flushSessionWrites();
    }

    const readBack = await request(app)
      .get(`/api/sessions/${sessionId}`)
      .set('Cookie', cookie);
    const session = readBack.body as WizardSession;
    expect(session.generationHistory).toHaveLength(2);
    const ids = session.generationHistory.map((h) => h.runId);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('/api/generate without server-side session (backend=none)', () => {
  it('still accepts body answers and runs generation end-to-end', async () => {
    const app = createApp();
    const targetDir = await mkdtemp(join(tmpdir(), 'embediq-out-'));
    try {
      const res = await request(app)
        .post('/api/generate')
        .send({ answers: coreAnswers, targetDir });
      expect(res.status).toBe(200);
      expect(res.body.totalWritten).toBeGreaterThan(0);
    } finally {
      await rm(targetDir, { recursive: true, force: true });
    }
  });
});
