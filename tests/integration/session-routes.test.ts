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

describe('Session CRUD routes (JsonFile backend, auth off)', () => {
  let dir: string;
  let backend: JsonFileBackend;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    process.env.EMBEDIQ_SESSION_COOKIE_SECRET = COOKIE_SECRET;
    dir = await mkdtemp(join(tmpdir(), 'embediq-routes-'));
    backend = new JsonFileBackend({ dir });
    app = createApp({ backend });
  });

  afterEach(async () => {
    await flushSessionWrites();
    await rm(dir, { recursive: true, force: true });
    delete process.env.EMBEDIQ_SESSION_COOKIE_SECRET;
    delete process.env.EMBEDIQ_SESSION_COOKIE_SECRET_PREV;
  });

  it('POST /api/sessions mints a session and sets an owner cookie', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .send({ templateId: 'hipaa-healthcare' });

    expect(res.status).toBe(201);
    expect(res.body.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(res.body.resumeUrl).toBe(`/?session=${res.body.sessionId}`);
    expect(res.body.version).toBeGreaterThan(0);

    const cookie = extractSetCookie(res);
    expect(cookie).toBeDefined();
    expect(cookie).toContain('embediq_session_owner=');

    await flushSessionWrites();
    const persisted = await backend.get(res.body.sessionId);
    expect(persisted?.templateId).toBe('hipaa-healthcare');
    expect(persisted?.phase).toBe('discovery');
    expect(persisted?.ownerToken).toBeDefined();
  });

  it('GET /api/sessions/:id returns the session when the cookie matches', async () => {
    const create = await request(app).post('/api/sessions').send({});
    const cookie = extractSetCookie(create)!;

    const read = await request(app)
      .get(`/api/sessions/${create.body.sessionId}`)
      .set('Cookie', cookie);
    expect(read.status).toBe(200);
    expect(read.body.sessionId).toBe(create.body.sessionId);
    expect(read.body.phase).toBe('discovery');
  });

  it('GET /api/sessions/:id returns 403 when the cookie is missing', async () => {
    const create = await request(app).post('/api/sessions').send({});

    const read = await request(app).get(`/api/sessions/${create.body.sessionId}`);
    expect(read.status).toBe(403);
  });

  it('GET /api/sessions/:id returns 403 when the cookie is forged', async () => {
    const create = await request(app).post('/api/sessions').send({});

    const read = await request(app)
      .get(`/api/sessions/${create.body.sessionId}`)
      .set('Cookie', 'embediq_session_owner=totally.fake');
    expect(read.status).toBe(403);
  });

  it('GET /api/sessions/:id returns 404 for an unknown sessionId', async () => {
    const res = await request(app).get(`/api/sessions/${crypto.randomUUID()}`);
    expect(res.status).toBe(404);
  });

  it('PATCH /api/sessions/:id merges answers and updates phase', async () => {
    const create = await request(app).post('/api/sessions').send({});
    const cookie = extractSetCookie(create)!;

    const patch = await request(app)
      .patch(`/api/sessions/${create.body.sessionId}`)
      .set('Cookie', cookie)
      .send({
        phase: 'playback',
        currentDimension: 'Strategic Intent',
        answers: {
          STRAT_000: {
            questionId: 'STRAT_000',
            value: 'developer',
            timestamp: '2026-04-18T12:00:00.000Z',
          },
        },
      });
    expect(patch.status).toBe(200);
    expect(patch.body.phase).toBe('playback');

    await flushSessionWrites();

    const read = await request(app)
      .get(`/api/sessions/${create.body.sessionId}`)
      .set('Cookie', cookie);
    expect(read.body.phase).toBe('playback');
    expect(read.body.answers.STRAT_000.value).toBe('developer');
    expect(read.body.version).toBeGreaterThan(create.body.version);
  });

  it('DELETE /api/sessions/:id removes the record', async () => {
    const create = await request(app).post('/api/sessions').send({});
    const cookie = extractSetCookie(create)!;

    const del = await request(app)
      .delete(`/api/sessions/${create.body.sessionId}`)
      .set('Cookie', cookie);
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(true);

    const after = await backend.get(create.body.sessionId);
    expect(after).toBeNull();
  });

  it('rejects cross-browser access — cookie from one session cannot read another', async () => {
    const a = await request(app).post('/api/sessions').send({});
    const b = await request(app).post('/api/sessions').send({});
    const cookieA = extractSetCookie(a)!;

    const readB = await request(app)
      .get(`/api/sessions/${b.body.sessionId}`)
      .set('Cookie', cookieA);
    expect(readB.status).toBe(403);
  });

  it('honors two-key rotation — PREV secret verifies cookies signed with it', async () => {
    // Mint a session with a specific secret
    process.env.EMBEDIQ_SESSION_COOKIE_SECRET = 'old-secret';
    const oldApp = createApp({ backend });
    const create = await request(oldApp).post('/api/sessions').send({});
    const cookie = extractSetCookie(create)!;

    // Rotate: old becomes PREV, new becomes CURRENT
    process.env.EMBEDIQ_SESSION_COOKIE_SECRET = 'new-secret';
    process.env.EMBEDIQ_SESSION_COOKIE_SECRET_PREV = 'old-secret';
    const rotatedApp = createApp({ backend });

    const read = await request(rotatedApp)
      .get(`/api/sessions/${create.body.sessionId}`)
      .set('Cookie', cookie);
    expect(read.status).toBe(200);
  });
});

describe('Admin listing', () => {
  let dir: string;
  let backend: JsonFileBackend;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    process.env.EMBEDIQ_SESSION_COOKIE_SECRET = COOKIE_SECRET;
    dir = await mkdtemp(join(tmpdir(), 'embediq-adm-'));
    backend = new JsonFileBackend({ dir });
    app = createApp({ backend });
  });

  afterEach(async () => {
    await flushSessionWrites();
    await rm(dir, { recursive: true, force: true });
    delete process.env.EMBEDIQ_SESSION_COOKIE_SECRET;
  });

  it('GET /api/sessions returns an array of summaries (no answers/profile)', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/sessions').send({ templateId: `t${i}` });
    }
    await flushSessionWrites();

    const res = await request(app).get('/api/sessions');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sessions)).toBe(true);
    expect(res.body.sessions.length).toBe(3);
    for (const s of res.body.sessions) {
      expect(s).toHaveProperty('sessionId');
      expect(s).toHaveProperty('phase');
      expect(s).toHaveProperty('createdAt');
      expect(s).not.toHaveProperty('answers');
      expect(s).not.toHaveProperty('profile');
    }
  });

  it('honors limit and returns a cursor when more pages exist', async () => {
    for (let i = 0; i < 4; i++) {
      await request(app).post('/api/sessions').send({});
    }
    await flushSessionWrites();

    const page1 = await request(app).get('/api/sessions?limit=2');
    expect(page1.body.sessions.length).toBe(2);
    expect(page1.body.cursor).toBeDefined();

    const page2 = await request(app).get(`/api/sessions?limit=2&cursor=${page1.body.cursor}`);
    expect(page2.body.sessions.length).toBe(2);
  });
});

describe('Backend=none', () => {
  it('POST /api/sessions returns 503 when persistence is disabled', async () => {
    const app = createApp(); // default NullBackend
    const res = await request(app).post('/api/sessions').send({});
    expect(res.status).toBe(503);
  });
});

describe('GET /api/sessions/config', () => {
  it('reports enabled:false when backend=none', async () => {
    const app = createApp();
    const res = await request(app).get('/api/sessions/config');
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
    expect(res.body.backend).toBe('none');
  });

  it('reports enabled:true when JsonFile backend is active', async () => {
    const dir = await (await import('node:fs/promises')).mkdtemp(
      (await import('node:path')).join((await import('node:os')).tmpdir(), 'embediq-cfg-'),
    );
    try {
      const { JsonFileBackend } = await import('../../src/web/sessions/index.js');
      const backend = new JsonFileBackend({ dir });
      const app = createApp({ backend });
      const res = await request(app).get('/api/sessions/config');
      expect(res.status).toBe(200);
      expect(res.body.enabled).toBe(true);
      expect(res.body.backend).toBe('json-file');
    } finally {
      await (await import('node:fs/promises')).rm(dir, { recursive: true, force: true });
    }
  });
});
