import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { WebSocket, WebSocketServer } from 'ws';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from '../../src/web/server.js';
import {
  getEventBus,
  registerDefaultSubscribers,
  resetEventBus,
  type EventEnvelope,
} from '../../src/events/index.js';
import {
  JsonFileBackend,
  type WizardSession,
} from '../../src/web/sessions/index.js';

const TMP_BASE = join(process.cwd(), 'tests', '.tmp-ws-hub');
const TARGET_DIR = join(TMP_BASE, 'target');

const minimalAnswers = {
  STRAT_000: { value: 'developer', timestamp: '2026-01-01T00:00:00Z' },
  STRAT_002: { value: 'saas', timestamp: '2026-01-01T00:00:00Z' },
  TECH_001: { value: ['typescript'], timestamp: '2026-01-01T00:00:00Z' },
  FIN_001: { value: 'moderate', timestamp: '2026-01-01T00:00:00Z' },
  REG_001: { value: false, timestamp: '2026-01-01T00:00:00Z' },
};

function collectMessages(ws: WebSocket): EventEnvelope[] {
  const received: EventEnvelope[] = [];
  ws.on('message', (raw) => {
    received.push(JSON.parse(raw.toString()));
  });
  return received;
}

function waitUntil(pred: () => boolean, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (pred()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('timeout'));
      setTimeout(tick, 10);
    };
    tick();
  });
}

describe('WebSocketHub integration', () => {
  let server: Server;
  let wss: WebSocketServer;
  let teardown: () => void;
  let port: number;

  beforeAll(async () => {
    if (existsSync(TMP_BASE)) rmSync(TMP_BASE, { recursive: true });
    mkdirSync(TARGET_DIR, { recursive: true });

    const app = createApp();
    server = createServer(app);
    wss = new WebSocketServer({ noServer: true });
    ({ teardown } = registerDefaultSubscribers(getEventBus(), { wsServer: wss }));

    server.on('upgrade', (req, socket, head) => {
      if (req.url !== '/ws/events') {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') port = addr.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    teardown();
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (existsSync(TMP_BASE)) rmSync(TMP_BASE, { recursive: true });
  });

  async function openClient(sessionId: string): Promise<{
    ws: WebSocket;
    messages: EventEnvelope[];
  }> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/events`);
    const messages = collectMessages(ws);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', (err) => reject(err));
    });
    ws.send(JSON.stringify({ type: 'subscribe', sessionId }));
    // Give the server a moment to register the subscription before emits land.
    await new Promise((r) => setTimeout(r, 20));
    return { ws, messages };
  }

  it('forwards the full event sequence for a generate run', async () => {
    const sessionId = randomUUID();
    const { ws, messages } = await openClient(sessionId);

    const response = await fetch(`http://127.0.0.1:${port}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        answers: minimalAnswers,
        targetDir: TARGET_DIR,
        sessionId,
      }),
    });
    expect(response.status).toBe(200);

    await waitUntil(() => messages.some((m) => m.name === 'session:completed'));
    ws.close();

    const names = messages.map((m) => m.name);
    expect(names[0]).toBe('session:started');
    expect(names[names.length - 1]).toBe('session:completed');

    const generationIdx = names.indexOf('generation:started');
    const validationIdx = names.indexOf('validation:completed');
    expect(generationIdx).toBeGreaterThan(-1);
    expect(validationIdx).toBeGreaterThan(generationIdx);

    const fileCount = names.filter((n) => n === 'file:generated').length;
    expect(fileCount).toBeGreaterThan(0);

    // Every envelope carries the subscribed sessionId
    for (const env of messages) {
      expect(env.sessionId).toBe(sessionId);
    }
  });

  it('isolates two concurrent sessions — each client only sees its own events', async () => {
    const sessionA = randomUUID();
    const sessionB = randomUUID();
    const [{ ws: wsA, messages: msgsA }, { ws: wsB, messages: msgsB }] = await Promise.all([
      openClient(sessionA),
      openClient(sessionB),
    ]);

    await fetch(`http://127.0.0.1:${port}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        answers: minimalAnswers,
        targetDir: TARGET_DIR,
        sessionId: sessionA,
      }),
    });

    await waitUntil(() => msgsA.some((m) => m.name === 'session:completed'));
    wsA.close();
    wsB.close();

    expect(msgsA.length).toBeGreaterThan(0);
    expect(msgsA.every((m) => m.sessionId === sessionA)).toBe(true);
    // sessionB should have received nothing from sessionA's run
    expect(msgsB.every((m) => m.sessionId === sessionB)).toBe(true);
    expect(msgsB.filter((m) => m.sessionId === sessionA)).toHaveLength(0);
  });

  it('clients that never send a subscribe frame receive nothing', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/events`);
    const messages = collectMessages(ws);
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));

    const sessionId = randomUUID();
    await fetch(`http://127.0.0.1:${port}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        answers: minimalAnswers,
        targetDir: TARGET_DIR,
        sessionId,
      }),
    });

    // Let emits flush
    await new Promise((r) => setTimeout(r, 100));
    ws.close();

    expect(messages).toHaveLength(0);
  });

  it('rejects upgrades on paths other than /ws/events', async () => {
    await expect(
      new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/wrongpath`);
        ws.once('open', () => {
          ws.close();
          resolve('opened');
        });
        ws.once('error', (err) => reject(err));
      }),
    ).rejects.toBeDefined();
  });
});

describe('WebSocketHub backend ownership enforcement', () => {
  let server: Server;
  let wss: WebSocketServer;
  let teardown: () => void;
  let port: number;
  let sessionsDir: string;
  let backend: JsonFileBackend;

  function freshSession(userId: string): WizardSession {
    const now = new Date().toISOString();
    return {
      sessionId: randomUUID(),
      userId,
      phase: 'discovery',
      answers: {},
      generationHistory: [],
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      version: 0,
    };
  }

  beforeAll(async () => {
    resetEventBus();
    sessionsDir = await mkdtemp(join(tmpdir(), 'embediq-ws-own-'));
    backend = new JsonFileBackend({ dir: sessionsDir });

    const app = createApp({ backend });
    server = createServer(app);
    wss = new WebSocketServer({ noServer: true });
    ({ teardown } = registerDefaultSubscribers(getEventBus(), {
      wsServer: wss,
      sessionBackend: backend,
    }));

    server.on('upgrade', (req, socket, head) => {
      if (req.url !== '/ws/events') {
        socket.destroy();
        return;
      }
      // Test-only auth shim: read userId from a custom header.
      const testUserId = req.headers['x-test-user-id'];
      if (typeof testUserId === 'string' && testUserId) {
        (req as unknown as { embediqUser?: { userId: string } }).embediqUser = {
          userId: testUserId,
        };
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') port = addr.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    teardown();
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(sessionsDir, { recursive: true, force: true });
    resetEventBus();
  });

  async function openWs(userId: string | undefined): Promise<WebSocket> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/events`, {
      headers: userId ? { 'x-test-user-id': userId } : {},
    });
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', (err) => reject(err));
    });
    return ws;
  }

  it('allows the owner to subscribe', async () => {
    const session = freshSession('alice');
    await backend.put(session);

    const ws = await openWs('alice');
    let closed = false;
    ws.on('close', () => {
      closed = true;
    });
    ws.send(JSON.stringify({ type: 'subscribe', sessionId: session.sessionId }));

    await new Promise((r) => setTimeout(r, 50));
    expect(closed).toBe(false);
    ws.close();
  });

  it('closes with 4403 when a different authenticated user subscribes', async () => {
    const session = freshSession('alice');
    await backend.put(session);

    const ws = await openWs('bob');
    const closeInfo = new Promise<{ code: number; reason: string }>((resolve) => {
      ws.once('close', (code, reason) => resolve({ code, reason: reason.toString() }));
    });
    ws.send(JSON.stringify({ type: 'subscribe', sessionId: session.sessionId }));

    const result = await closeInfo;
    expect(result.code).toBe(4403);
    expect(result.reason).toMatch(/different user/i);
  });

  it('allows subscription to a session with no userId (anonymous)', async () => {
    const session = freshSession('');
    delete (session as Partial<WizardSession>).userId;
    await backend.put(session);

    const ws = await openWs('bob');
    let closed = false;
    ws.on('close', () => {
      closed = true;
    });
    ws.send(JSON.stringify({ type: 'subscribe', sessionId: session.sessionId }));

    await new Promise((r) => setTimeout(r, 50));
    expect(closed).toBe(false);
    ws.close();
  });

  it('allows subscribe to a session that has not been persisted yet', async () => {
    const ws = await openWs('alice');
    let closed = false;
    ws.on('close', () => {
      closed = true;
    });
    ws.send(JSON.stringify({ type: 'subscribe', sessionId: randomUUID() }));

    await new Promise((r) => setTimeout(r, 50));
    expect(closed).toBe(false);
    ws.close();
  });
});
