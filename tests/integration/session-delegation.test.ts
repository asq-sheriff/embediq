import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request, { type Response as SupertestResponse } from 'supertest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../src/web/server.js';
import { JsonFileBackend, flushSessionWrites } from '../../src/web/sessions/index.js';

const COOKIE_SECRET = 'test-cookie-secret-32-bytes-long-!!';

function ownerCookie(res: SupertestResponse): string {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : [raw as string];
  return list.find((v) => v.startsWith('embediq_session_owner='))!.split(';')[0];
}

describe('Session delegation (three-role workflow)', () => {
  let dir: string;
  let backend: JsonFileBackend;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    process.env.EMBEDIQ_SESSION_COOKIE_SECRET = COOKIE_SECRET;
    dir = await mkdtemp(join(tmpdir(), 'embediq-deleg-'));
    backend = new JsonFileBackend({ dir });
    app = await createApp({ backend });
  });

  afterEach(async () => {
    await flushSessionWrites();
    await rm(dir, { recursive: true, force: true });
    delete process.env.EMBEDIQ_SESSION_COOKIE_SECRET;
  });

  async function newSession(): Promise<{ id: string; cookie: string }> {
    const create = await request(app).post('/api/sessions').send({});
    return { id: create.body.sessionId, cookie: ownerCookie(create) };
  }

  it('creates an assignment and returns a role-scoped link', async () => {
    const { id, cookie } = await newSession();
    const res = await request(app)
      .post(`/api/sessions/${id}/assignments`)
      .set('Cookie', cookie)
      .send({ role: 'lead', assigneeLabel: 'lead@x.com' });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('lead');
    expect(res.body.link).toBe(`/?session=${id}&role=lead`);
  });

  it('rejects an invalid role', async () => {
    const { id, cookie } = await newSession();
    const res = await request(app).post(`/api/sessions/${id}/assignments`).set('Cookie', cookie).send({ role: 'boss' });
    expect(res.status).toBe(400);
  });

  it('denies a non-owner without a matching assignment (403)', async () => {
    const { id } = await newSession();
    // No owner cookie, no assignment, no role → ownership check rejects.
    const res = await request(app)
      .patch(`/api/sessions/${id}`)
      .send({ answers: { PROB_001: { questionId: 'PROB_001', value: ['x'], timestamp: '2026-01-01T00:00:00Z' } } });
    expect(res.status).toBe(403);
  });

  it('grants a delegate access when ?role= matches an assignment, and attributes their answers', async () => {
    const { id, cookie } = await newSession();
    await request(app).post(`/api/sessions/${id}/assignments`).set('Cookie', cookie).send({ role: 'lead' });
    await flushSessionWrites(); // assignment must persist before the delegate's request reads the session

    // Delegate: NO owner cookie, but ?role=lead matches the assignment.
    const res = await request(app)
      .patch(`/api/sessions/${id}?role=lead`)
      .send({ answers: { PROB_001: { questionId: 'PROB_001', value: ['slow_reviews'], timestamp: '2026-01-01T00:00:00Z' } } });
    expect(res.status).toBe(200);
    await flushSessionWrites();

    const session = await backend.get(id);
    expect(session!.answers.PROB_001?.value).toEqual(['slow_reviews']);
  });

  it('restricts a delegate to their own slice — admin-owned answers are dropped', async () => {
    const { id, cookie } = await newSession();
    await request(app).post(`/api/sessions/${id}/assignments`).set('Cookie', cookie).send({ role: 'lead' });
    await flushSessionWrites();

    await request(app)
      .patch(`/api/sessions/${id}?role=lead`)
      .send({
        answers: {
          PROB_001: { questionId: 'PROB_001', value: ['slow_reviews'], timestamp: '2026-01-01T00:00:00Z' }, // lead — kept
          REG_008: { questionId: 'REG_008', value: 'lockdown', timestamp: '2026-01-01T00:00:00Z' },        // admin — dropped
        },
      });
    await flushSessionWrites();

    const session = await backend.get(id);
    expect(session!.answers.PROB_001).toBeDefined();
    expect(session!.answers.REG_008).toBeUndefined();
  });

  it('reports live per-role completion on the dashboard', async () => {
    const { id, cookie } = await newSession();
    await request(app).patch(`/api/sessions/${id}`).set('Cookie', cookie).send({
      answers: {
        STRAT_000b: { questionId: 'STRAT_000b', value: 'admin', timestamp: '2026-01-01T00:00:00Z' },
        REG_001: { questionId: 'REG_001', value: true, timestamp: '2026-01-01T00:00:00Z' },
        REG_002: { questionId: 'REG_002', value: ['hipaa'], timestamp: '2026-01-01T00:00:00Z' },
      },
    });
    await flushSessionWrites();
    const res = await request(app).get(`/api/sessions/${id}/assignments`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    const admin = res.body.completion.find((c: { role: string }) => c.role === 'admin');
    expect(admin.answered).toBeGreaterThan(0);
    expect(admin.visible).toBeGreaterThan(admin.answered);
    expect(admin.status).toBe('in_progress');
  });
});
