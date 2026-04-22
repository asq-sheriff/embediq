import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonFileBackend } from '../../src/web/sessions/index.js';
import type { WizardSession } from '../../src/web/sessions/index.js';
import { contractTest } from '../helpers/session-backend-contract.js';

contractTest('json-file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'embediq-jf-'));
  const backend = new JsonFileBackend({ dir });
  return {
    backend,
    teardown: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
});

describe('JsonFileBackend (backend-specific)', () => {
  let dir: string;
  let backend: JsonFileBackend;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'embediq-jf-'));
    backend = new JsonFileBackend({ dir });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function makeSession(overrides: Partial<WizardSession> = {}): WizardSession {
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

  describe('path safety', () => {
    it('rejects sessionIds containing path separators', async () => {
      await expect(backend.get('../etc/passwd')).rejects.toThrow(/Invalid sessionId/);
      await expect(backend.get('a/b')).rejects.toThrow(/Invalid sessionId/);
    });

    it('rejects an empty sessionId', async () => {
      await expect(backend.get('')).rejects.toThrow(/Invalid sessionId/);
    });
  });

  describe('corrupt files', () => {
    it('treats a malformed JSON file as missing and removes it', async () => {
      const sessionId = crypto.randomUUID();
      const path = join(dir, `${sessionId}.json`);
      await writeFile(path, '{ not-valid-json', 'utf-8');

      expect(await backend.get(sessionId)).toBeNull();
      const entries = await readdir(dir);
      expect(entries).not.toContain(`${sessionId}.json`);
    });
  });

  describe('atomic writes', () => {
    it('does not leave .tmp-* garbage after successful writes', async () => {
      const session = makeSession();
      await backend.put(session);
      await backend.put({ ...session, phase: 'playback' });
      await backend.put({ ...session, phase: 'generate' });

      const entries = await readdir(dir);
      expect(entries.some((e) => e.includes('.tmp-'))).toBe(false);
    });
  });

  describe('list pagination', () => {
    it('returns a cursor when more results are available', async () => {
      for (let i = 0; i < 5; i++) {
        await backend.put(makeSession({ userId: 'alice', updatedAt: `2026-04-${10 + i}T00:00:00.000Z` }));
      }
      const page1 = await backend.list({ userId: 'alice', limit: 2 });
      expect(page1.sessions).toHaveLength(2);
      expect(page1.cursor).toBeDefined();

      const page2 = await backend.list({ userId: 'alice', limit: 2, cursor: page1.cursor });
      expect(page2.sessions).toHaveLength(2);
      expect(page2.sessions.map((s) => s.sessionId)).not.toContain(
        page1.sessions[0].sessionId,
      );
    });

    it('omits the cursor on the final page', async () => {
      await backend.put(makeSession({ userId: 'alice' }));
      const result = await backend.list({ userId: 'alice', limit: 10 });
      expect(result.cursor).toBeUndefined();
    });
  });

  describe('expiry sweep during list', () => {
    it('removes expired records it encounters while enumerating', async () => {
      const fresh = makeSession({ userId: 'alice' });
      const expired = makeSession({
        userId: 'alice',
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
      await backend.put(fresh);
      await backend.put(expired);

      const result = await backend.list({ userId: 'alice' });
      expect(result.sessions.map((s) => s.sessionId)).toEqual([fresh.sessionId]);

      const entries = await readdir(dir);
      expect(entries).not.toContain(`${expired.sessionId}.json`);
    });
  });
});
