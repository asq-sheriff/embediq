import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  JsonFileBackend,
  NullBackend,
  flushSessionWrites,
  sessionMiddleware,
  type SessionBackend,
  type WizardSession,
} from '../../src/web/sessions/index.js';
import {
  createRequestContext,
  getRequestContext,
  runWithContext,
} from '../../src/context/request-context.js';

function makeApp(backend: SessionBackend, userId?: string): Express {
  const app = express();
  app.use(express.json());

  // Minimal request-context middleware for tests.
  app.use((_req, _res, next) => {
    const ctx = createRequestContext({ userId });
    runWithContext(ctx, next);
  });

  app.use(sessionMiddleware(backend));

  app.post('/write-phase', (req, res) => {
    const ctx = getRequestContext();
    const store = ctx?.sessionStore;
    if (!store) return res.status(500).json({ error: 'no store' });
    const body = req.body as { phase?: WizardSession['phase'] };
    if (!store.current()) {
      store.set(freshSession({ sessionId: body.phase ?? 'playback' }));
    } else {
      store.mutate((s) => {
        if (body.phase) s.phase = body.phase;
      });
    }
    res.json({ ok: true, sessionId: store.current()?.sessionId });
  });

  app.post('/read', (_req, res) => {
    const ctx = getRequestContext();
    res.json({
      sessionId: ctx?.sessionId,
      session: ctx?.sessionStore?.current() ?? null,
    });
  });

  app.post('/boom', (_req, res) => {
    const ctx = getRequestContext();
    ctx?.sessionStore?.mutate((s) => {
      s.phase = 'generate';
    });
    res.status(500).json({ error: 'boom' });
  });

  return app;
}

function freshSession(overrides: Partial<WizardSession> = {}): WizardSession {
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 60_000).toISOString();
  return {
    sessionId: crypto.randomUUID(),
    phase: 'discovery',
    answers: {},
    generationHistory: [],
    createdAt: now,
    updatedAt: now,
    expiresAt: future,
    version: 0,
    ...overrides,
  };
}

describe('sessionMiddleware', () => {
  describe('backend=none fast path', () => {
    it('does not attach a store to the request context', async () => {
      const app = makeApp(new NullBackend());
      const res = await request(app).post('/read').send({});
      expect(res.status).toBe(200);
      expect(res.body.session).toBeNull();
    });
  });

  describe('with JsonFileBackend', () => {
    let dir: string;
    let backend: JsonFileBackend;

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'embediq-mw-'));
      backend = new JsonFileBackend({ dir });
    });

    afterEach(async () => {
      await flushSessionWrites();
      await rm(dir, { recursive: true, force: true });
    });

    it('installs an empty store when no sessionId is supplied', async () => {
      const app = makeApp(backend);
      const res = await request(app).post('/read').send({});
      expect(res.status).toBe(200);
      expect(res.body.session).toBeNull();
      expect(res.body.sessionId).toBeUndefined();
    });

    it('installs an empty store when the sessionId is unknown', async () => {
      const app = makeApp(backend);
      const res = await request(app)
        .post('/read')
        .send({ sessionId: 'ghost-session' });
      expect(res.status).toBe(200);
      expect(res.body.session).toBeNull();
    });

    it('loads a known session from the backend and stamps ctx.sessionId', async () => {
      const existing = freshSession({ userId: 'alice', phase: 'playback' });
      await backend.put(existing);

      const app = makeApp(backend, 'alice');
      const res = await request(app)
        .post('/read')
        .send({ sessionId: existing.sessionId });
      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBe(existing.sessionId);
      expect(res.body.session?.phase).toBe('playback');
    });

    it('resolves sessionId from the x-embediq-session header', async () => {
      const existing = freshSession();
      await backend.put(existing);

      const app = makeApp(backend);
      const res = await request(app)
        .post('/read')
        .set('x-embediq-session', existing.sessionId)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBe(existing.sessionId);
    });

    it('resolves sessionId from the query string when body is absent', async () => {
      const existing = freshSession();
      await backend.put(existing);

      const app = makeApp(backend);
      const res = await request(app)
        .post(`/read?sessionId=${existing.sessionId}`)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBe(existing.sessionId);
    });

    it('returns 403 when an authenticated user loads another user\'s session', async () => {
      const existing = freshSession({ userId: 'alice' });
      await backend.put(existing);

      const app = makeApp(backend, 'bob');
      const res = await request(app)
        .post('/read')
        .send({ sessionId: existing.sessionId });
      expect(res.status).toBe(403);
    });

    it('allows owners to load their own session', async () => {
      const existing = freshSession({ userId: 'alice' });
      await backend.put(existing);

      const app = makeApp(backend, 'alice');
      const res = await request(app)
        .post('/read')
        .send({ sessionId: existing.sessionId });
      expect(res.status).toBe(200);
      expect(res.body.session?.userId).toBe('alice');
    });

    it('persists a dirty session on response finish', async () => {
      const existing = freshSession({ phase: 'discovery' });
      await backend.put(existing);

      const app = makeApp(backend);
      await request(app)
        .post('/write-phase')
        .send({ sessionId: existing.sessionId, phase: 'edit' });
      await flushSessionWrites();

      const stored = await backend.get(existing.sessionId);
      expect(stored?.phase).toBe('edit');
    });

    it('does not persist a non-dirty session', async () => {
      const existing = freshSession({ phase: 'discovery' });
      const stored = await backend.put(existing);
      const initialVersion = stored.version;

      const app = makeApp(backend);
      await request(app).post('/read').send({ sessionId: existing.sessionId });
      await flushSessionWrites();

      const again = await backend.get(existing.sessionId);
      expect(again?.version).toBe(initialVersion);
    });

    it('does not persist when the handler responds with 5xx', async () => {
      const existing = freshSession({ phase: 'discovery' });
      const stored = await backend.put(existing);
      const initialVersion = stored.version;

      const app = makeApp(backend);
      await request(app)
        .post('/boom')
        .send({ sessionId: existing.sessionId });
      await flushSessionWrites();

      const again = await backend.get(existing.sessionId);
      expect(again?.phase).toBe('discovery');
      expect(again?.version).toBe(initialVersion);
    });
  });
});
