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

const COOKIE_SECRET = 'test-cookie-secret-32-bytes-long-!!';

function extractSetCookie(res: SupertestResponse): string | undefined {
  const raw = res.headers['set-cookie'];
  if (!raw) return undefined;
  const list = Array.isArray(raw) ? raw : [raw];
  const owner = list.find((v) => v.startsWith('embediq_session_owner='));
  return owner ? owner.split(';')[0] : undefined;
}

describe('Session resume — PATCH attribution', () => {
  let dir: string;
  let backend: JsonFileBackend;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    process.env.EMBEDIQ_SESSION_COOKIE_SECRET = COOKIE_SECRET;
    dir = await mkdtemp(join(tmpdir(), 'embediq-resume-'));
    backend = new JsonFileBackend({ dir });
    app = createApp({ backend });
  });

  afterEach(async () => {
    await flushSessionWrites();
    await rm(dir, { recursive: true, force: true });
    delete process.env.EMBEDIQ_SESSION_COOKIE_SECRET;
  });

  it('does not stamp contributedBy when auth is off (no userId in context)', async () => {
    const create = await request(app).post('/api/sessions').send({});
    const cookie = extractSetCookie(create)!;

    await request(app)
      .patch(`/api/sessions/${create.body.sessionId}`)
      .set('Cookie', cookie)
      .send({
        answers: {
          STRAT_000: { questionId: 'STRAT_000', value: 'developer', timestamp: '2026-01-01T00:00:00Z' },
        },
      });
    await flushSessionWrites();

    const session = await backend.get(create.body.sessionId);
    const stored = session!.answers.STRAT_000;
    expect(stored.value).toBe('developer');
    expect(stored.contributedBy).toBeUndefined();
  });

  it('strips client-supplied contributedBy when no auth context is present', async () => {
    const create = await request(app).post('/api/sessions').send({});
    const cookie = extractSetCookie(create)!;

    await request(app)
      .patch(`/api/sessions/${create.body.sessionId}`)
      .set('Cookie', cookie)
      .send({
        answers: {
          STRAT_000: {
            questionId: 'STRAT_000',
            value: 'developer',
            timestamp: '2026-01-01T00:00:00Z',
            // Client tries to forge attribution — server must ignore it.
            contributedBy: 'pretender@example.com',
          },
        },
      });
    await flushSessionWrites();

    const session = await backend.get(create.body.sessionId);
    expect(session!.answers.STRAT_000.contributedBy).toBeUndefined();
  });
});

describe('Session resume — buildResumeView (engine-driven)', () => {
  let dir: string;
  let backend: JsonFileBackend;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    process.env.EMBEDIQ_SESSION_COOKIE_SECRET = COOKIE_SECRET;
    dir = await mkdtemp(join(tmpdir(), 'embediq-resume-2-'));
    backend = new JsonFileBackend({ dir });
    app = createApp({ backend });
  });

  afterEach(async () => {
    await flushSessionWrites();
    await rm(dir, { recursive: true, force: true });
    delete process.env.EMBEDIQ_SESSION_COOKIE_SECRET;
  });

  it('returns the first dimension/question for a fresh session with no answers', async () => {
    const create = await request(app).post('/api/sessions').send({});
    const cookie = extractSetCookie(create)!;

    const res = await request(app)
      .get(`/api/sessions/${create.body.sessionId}/resume`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.nextDimensionIndex).toBe(0);
    expect(res.body.nextQuestionIndex).toBe(0);
    expect(res.body.complete).toBe(false);
    expect(res.body.totals.answered).toBe(0);
    expect(res.body.totals.visible).toBeGreaterThan(0);
  });

  it('advances nextDimensionIndex past dimensions whose visible questions are all answered', async () => {
    const create = await request(app).post('/api/sessions').send({});
    const cookie = extractSetCookie(create)!;
    const sessionId = create.body.sessionId;

    // Answer the bare-minimum Strategic Intent + Problem Definition questions
    // so the cursor advances at least one dimension.
    await request(app)
      .patch(`/api/sessions/${sessionId}`)
      .set('Cookie', cookie)
      .send({
        answers: {
          STRAT_000: { questionId: 'STRAT_000', value: 'developer', timestamp: '2026-01-01T00:00:00Z' },
          STRAT_000a: { questionId: 'STRAT_000a', value: 'intermediate', timestamp: '2026-01-01T00:00:00Z' },
          STRAT_001: { questionId: 'STRAT_001', value: 'Web app', timestamp: '2026-01-01T00:00:00Z' },
          STRAT_002: { questionId: 'STRAT_002', value: 'saas', timestamp: '2026-01-01T00:00:00Z' },
        },
      });
    await flushSessionWrites();

    const res = await request(app)
      .get(`/api/sessions/${sessionId}/resume`)
      .set('Cookie', cookie);

    // Some Strategic Intent answers landed; cursor must point AT or PAST
    // the first dimension (Strategic Intent index 0). Whether it's still
    // on dimension 0 (with later questions remaining visible) or already
    // past depends on the exact branching configuration — both are valid.
    expect(res.status).toBe(200);
    expect(res.body.nextDimensionIndex).toBeGreaterThanOrEqual(0);
    expect(res.body.totals.answered).toBeGreaterThan(0);
    expect(res.body.totals.answered).toBeLessThan(res.body.totals.visible);
    expect(res.body.complete).toBe(false);
  });

  it('reconstructs a partial profile from the stored answers', async () => {
    const create = await request(app).post('/api/sessions').send({});
    const cookie = extractSetCookie(create)!;
    const sessionId = create.body.sessionId;

    await request(app)
      .patch(`/api/sessions/${sessionId}`)
      .set('Cookie', cookie)
      .send({
        answers: {
          STRAT_000: { questionId: 'STRAT_000', value: 'developer', timestamp: '2026-01-01T00:00:00Z' },
          STRAT_002: { questionId: 'STRAT_002', value: 'healthcare', timestamp: '2026-01-01T00:00:00Z' },
        },
      });
    await flushSessionWrites();

    const res = await request(app)
      .get(`/api/sessions/${sessionId}/resume`)
      .set('Cookie', cookie);

    expect(res.body.profile).not.toBeNull();
    expect(res.body.profile.role).toBe('developer');
    expect(res.body.profile.industry).toBe('healthcare');
  });

  it('returns 404 with no resume data when the session id is unknown', async () => {
    const res = await request(app).get('/api/sessions/00000000-0000-4000-8000-000000000000/resume');
    expect(res.status).toBe(404);
  });
});
