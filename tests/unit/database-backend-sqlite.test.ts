import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  DatabaseBackend,
  PayloadCipher,
  SqliteDialect,
  type WizardSession,
} from '../../src/web/sessions/index.js';
import { contractTest } from '../helpers/session-backend-contract.js';

// Run the shared contract suite against an in-memory SQLite DB.
contractTest('database-sqlite', async () => {
  const db = new Database(':memory:');
  const backend = new DatabaseBackend(new SqliteDialect(db));
  return {
    backend,
    teardown: async () => {
      await backend.close();
    },
  };
});

// Same contract, with at-rest encryption active.
const TEST_KEY_HEX = 'a'.repeat(64);
contractTest('database-sqlite (encrypted)', async () => {
  const db = new Database(':memory:');
  const cipher = PayloadCipher.fromHexKey(TEST_KEY_HEX);
  const backend = new DatabaseBackend(new SqliteDialect(db), { cipher });
  return {
    backend,
    teardown: async () => {
      await backend.close();
    },
  };
});

describe('DatabaseBackend (SQLite-specific)', () => {
  function makeSession(overrides: Partial<WizardSession> = {}): WizardSession {
    const now = new Date().toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();
    return {
      sessionId: crypto.randomUUID(),
      phase: 'discovery',
      answers: {
        STRAT_000: {
          questionId: 'STRAT_000',
          value: 'developer',
          timestamp: '2026-04-18T12:00:00.000Z',
        },
      },
      generationHistory: [],
      createdAt: now,
      updatedAt: now,
      expiresAt: future,
      version: 0,
      ...overrides,
    };
  }

  describe('payload column storage', () => {
    it('stores the payload as plain JSON when no cipher is configured', async () => {
      const db = new Database(':memory:');
      const backend = new DatabaseBackend(new SqliteDialect(db));
      try {
        const session = makeSession({ userId: 'alice' });
        await backend.put(session);

        const row = db
          .prepare('SELECT payload FROM embediq_sessions WHERE session_id = ?')
          .get(session.sessionId) as { payload: string };
        expect(row.payload).toContain('STRAT_000');
        expect(row.payload).toContain('developer');
      } finally {
        await backend.close();
      }
    });

    it('stores the payload as an opaque base64 blob when a cipher is configured', async () => {
      const db = new Database(':memory:');
      const cipher = PayloadCipher.fromHexKey(TEST_KEY_HEX);
      const backend = new DatabaseBackend(new SqliteDialect(db), { cipher });
      try {
        const session = makeSession();
        await backend.put(session);

        const row = db
          .prepare('SELECT payload FROM embediq_sessions WHERE session_id = ?')
          .get(session.sessionId) as { payload: string };
        expect(row.payload).not.toContain('STRAT_000');
        expect(row.payload).not.toContain('developer');
        expect(row.payload).toMatch(/^[A-Za-z0-9+/=]+$/);
      } finally {
        await backend.close();
      }
    });

    it('indexable columns stay in the clear even when the payload is encrypted', async () => {
      const db = new Database(':memory:');
      const cipher = PayloadCipher.fromHexKey(TEST_KEY_HEX);
      const backend = new DatabaseBackend(new SqliteDialect(db), { cipher });
      try {
        const session = makeSession({ userId: 'alice', phase: 'playback' });
        await backend.put(session);

        const row = db
          .prepare(
            'SELECT user_id, phase, expires_at FROM embediq_sessions WHERE session_id = ?',
          )
          .get(session.sessionId) as {
          user_id: string;
          phase: string;
          expires_at: string;
        };
        expect(row.user_id).toBe('alice');
        expect(row.phase).toBe('playback');
        expect(row.expires_at).toBe(session.expiresAt);
      } finally {
        await backend.close();
      }
    });
  });

  describe('file persistence', () => {
    let tempFile: string;

    beforeEach(async () => {
      const { mkdtemp } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const { tmpdir } = await import('node:os');
      const dir = await mkdtemp(join(tmpdir(), 'embediq-db-'));
      tempFile = join(dir, 'sessions.db');
    });

    afterEach(async () => {
      const { rm } = await import('node:fs/promises');
      const { dirname } = await import('node:path');
      await rm(dirname(tempFile), { recursive: true, force: true });
    });

    it('persists across reopens of the same file', async () => {
      const firstDb = new Database(tempFile);
      const firstBackend = new DatabaseBackend(new SqliteDialect(firstDb));
      const session = makeSession({ userId: 'alice' });
      await firstBackend.put(session);
      await firstBackend.close();

      const secondDb = new Database(tempFile);
      const secondBackend = new DatabaseBackend(new SqliteDialect(secondDb));
      try {
        const read = await secondBackend.get(session.sessionId);
        expect(read?.userId).toBe('alice');
        expect(read?.answers.STRAT_000.value).toBe('developer');
      } finally {
        await secondBackend.close();
      }
    });
  });
});

describe('PayloadCipher', () => {
  const key = 'a'.repeat(64);

  it('round-trips an arbitrary JSON payload', () => {
    const cipher = PayloadCipher.fromHexKey(key);
    const plaintext = JSON.stringify({ a: 1, b: 'two', nested: { c: [1, 2, 3] } });
    const encrypted = cipher.encrypt(plaintext);
    expect(encrypted).not.toEqual(plaintext);
    expect(cipher.decrypt(encrypted)).toEqual(plaintext);
  });

  it('produces a fresh IV per encrypt call', () => {
    const cipher = PayloadCipher.fromHexKey(key);
    const a = cipher.encrypt('hello');
    const b = cipher.encrypt('hello');
    expect(a).not.toEqual(b);
  });

  it('rejects a key of the wrong byte length', () => {
    expect(() => PayloadCipher.fromHexKey('aabb')).toThrow(/32 bytes/);
  });

  it('rejects a non-hex key', () => {
    expect(() => PayloadCipher.fromHexKey('not-hex'.repeat(10))).toThrow(/hex/);
  });

  it('decrypt throws on a tampered tag', () => {
    const cipher = PayloadCipher.fromHexKey(key);
    const encrypted = cipher.encrypt('payload');
    const buf = Buffer.from(encrypted, 'base64');
    buf[buf.length - 1] ^= 0xff;
    const tampered = buf.toString('base64');
    expect(() => cipher.decrypt(tampered)).toThrow();
  });

  it('fromEnv returns undefined when the key is unset', () => {
    expect(PayloadCipher.fromEnv({})).toBeUndefined();
    expect(PayloadCipher.fromEnv({ EMBEDIQ_SESSION_DATA_KEY: '' })).toBeUndefined();
  });

  it('fromEnv builds a cipher when the key is set', () => {
    expect(PayloadCipher.fromEnv({ EMBEDIQ_SESSION_DATA_KEY: key })).toBeInstanceOf(
      PayloadCipher,
    );
  });
});
