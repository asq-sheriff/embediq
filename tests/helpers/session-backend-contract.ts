import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type {
  SessionBackend,
  WizardSession,
} from '../../src/web/sessions/index.js';

/**
 * Factory returned by each backend's test file. Creates a fresh backend
 * isolated from other tests (new tempdir, new redis namespace, new DB
 * connection), and returns a teardown to release resources.
 */
export type BackendFactory = () => Promise<{
  backend: SessionBackend;
  teardown: () => Promise<void>;
}>;

export interface ContractOptions {
  /** Skip the TTL-expiry test (backends without read-time expiry enforcement). */
  skipExpiry?: boolean;
  /**
   * Number of milliseconds to sleep between concurrent puts. Some backends
   * need a tick for the filesystem or network I/O to settle.
   */
  concurrencySettleMs?: number;
}

function makeSession(partial: Partial<WizardSession> = {}): WizardSession {
  const now = new Date();
  const iso = now.toISOString();
  const future = new Date(now.getTime() + 60_000).toISOString();
  return {
    sessionId: partial.sessionId ?? crypto.randomUUID(),
    userId: partial.userId,
    ownerToken: partial.ownerToken,
    templateId: partial.templateId,
    domainPackId: partial.domainPackId,
    phase: partial.phase ?? 'discovery',
    currentDimension: partial.currentDimension,
    answers: partial.answers ?? {},
    profile: partial.profile,
    priorities: partial.priorities,
    generationHistory: partial.generationHistory ?? [],
    createdAt: partial.createdAt ?? iso,
    updatedAt: partial.updatedAt ?? iso,
    expiresAt: partial.expiresAt ?? future,
    version: partial.version ?? 0,
  };
}

/**
 * Shared contract tests that every SessionBackend must satisfy. Backend
 * implementations import this helper from their own test file:
 *
 *   contractTest('json-file', async () => {
 *     const dir = await fs.mkdtemp(...);
 *     return { backend: new JsonFileBackend({ dir }), teardown: () => fs.rm(dir, ...) };
 *   });
 *
 * The NullBackend intentionally does not conform — it is excluded by design.
 */
export function contractTest(
  label: string,
  createBackend: BackendFactory,
  options: ContractOptions = {},
): void {
  describe(`SessionBackend contract: ${label}`, () => {
    let backend: SessionBackend;
    let teardown: () => Promise<void>;

    beforeEach(async () => {
      ({ backend, teardown } = await createBackend());
    });

    afterEach(async () => {
      await teardown();
    });

    describe('get / put round-trip', () => {
      it('stores a session and reads it back with equal payload', async () => {
        const session = makeSession({
          userId: 'alice',
          answers: {
            STRAT_000: {
              questionId: 'STRAT_000',
              value: 'developer',
              timestamp: '2026-04-18T12:00:00.000Z',
            },
          },
        });
        const stored = await backend.put(session);
        const read = await backend.get(session.sessionId);

        expect(read).not.toBeNull();
        expect(read!.sessionId).toBe(session.sessionId);
        expect(read!.userId).toBe('alice');
        expect(read!.answers.STRAT_000.value).toBe('developer');
        expect(read!.version).toBe(stored.version);
      });

      it('preserves nested generationHistory entries', async () => {
        const session = makeSession({
          generationHistory: [
            {
              runId: '22222222-2222-2222-2222-222222222222',
              timestamp: '2026-04-18T12:02:00.000Z',
              fileCount: 18,
              validationPassed: true,
              targetDir: '/tmp/demo',
            },
          ],
        });
        await backend.put(session);
        const read = await backend.get(session.sessionId);
        expect(read?.generationHistory).toEqual(session.generationHistory);
      });

      it('get returns null for an unknown sessionId', async () => {
        expect(await backend.get(crypto.randomUUID())).toBeNull();
      });
    });

    describe('version', () => {
      it('bumps version on each successful put', async () => {
        const session = makeSession({ version: 0 });
        const first = await backend.put(session);
        expect(first.version).toBeGreaterThan(0);

        const again = await backend.put({ ...first, phase: 'playback' });
        expect(again.version).toBeGreaterThan(first.version);

        const read = await backend.get(session.sessionId);
        expect(read?.version).toBe(again.version);
        expect(read?.phase).toBe('playback');
      });
    });

    describe('delete', () => {
      it('returns true when a record exists and removes it', async () => {
        const session = makeSession();
        await backend.put(session);
        expect(await backend.delete(session.sessionId)).toBe(true);
        expect(await backend.get(session.sessionId)).toBeNull();
      });

      it('returns false for an unknown sessionId', async () => {
        expect(await backend.delete(crypto.randomUUID())).toBe(false);
      });
    });

    describe('list', () => {
      it('returns every session when no filter is supplied', async () => {
        const a = makeSession({ userId: 'alice' });
        const b = makeSession({ userId: 'bob' });
        const c = makeSession({ userId: 'alice' });
        await Promise.all([backend.put(a), backend.put(b), backend.put(c)]);

        const result = await backend.list();
        expect(result.sessions.length).toBeGreaterThanOrEqual(3);
      });

      it('filters by userId', async () => {
        const a = makeSession({ userId: 'alice' });
        const b = makeSession({ userId: 'bob' });
        const c = makeSession({ userId: 'alice' });
        await Promise.all([backend.put(a), backend.put(b), backend.put(c)]);

        const result = await backend.list({ userId: 'alice' });
        expect(result.sessions.every((s) => s.userId === 'alice')).toBe(true);
        expect(result.sessions.map((s) => s.sessionId).sort()).toEqual(
          [a.sessionId, c.sessionId].sort(),
        );
      });

      it('honors the limit cap', async () => {
        for (let i = 0; i < 5; i++) {
          await backend.put(makeSession({ userId: 'alice' }));
        }
        const result = await backend.list({ userId: 'alice', limit: 3 });
        expect(result.sessions.length).toBeLessThanOrEqual(3);
      });

      it('filters by updatedAfter when supplied', async () => {
        const early = makeSession({
          userId: 'alice',
          updatedAt: '2026-01-01T00:00:00.000Z',
        });
        const late = makeSession({
          userId: 'alice',
          updatedAt: '2026-06-01T00:00:00.000Z',
        });
        await backend.put(early);
        await backend.put(late);

        const result = await backend.list({
          userId: 'alice',
          updatedAfter: '2026-03-01T00:00:00.000Z',
        });
        expect(result.sessions.map((s) => s.sessionId)).toContain(late.sessionId);
        expect(result.sessions.map((s) => s.sessionId)).not.toContain(early.sessionId);
      });
    });

    describe('touch', () => {
      it('updates expiresAt without mutating other fields', async () => {
        const session = makeSession({
          userId: 'alice',
          phase: 'generate',
          answers: {
            STRAT_000: {
              questionId: 'STRAT_000',
              value: 'developer',
              timestamp: '2026-04-18T12:00:00.000Z',
            },
          },
        });
        await backend.put(session);

        const nextExpiry = new Date(Date.now() + 300_000).toISOString();
        await backend.touch(session.sessionId, nextExpiry);

        const read = await backend.get(session.sessionId);
        expect(read?.expiresAt).toBe(nextExpiry);
        expect(read?.phase).toBe('generate');
        expect(read?.answers.STRAT_000.value).toBe('developer');
        expect(read?.userId).toBe('alice');
      });

      it('is a safe no-op for an unknown sessionId', async () => {
        await expect(
          backend.touch(crypto.randomUUID(), new Date(Date.now() + 60_000).toISOString()),
        ).resolves.toBeUndefined();
      });
    });

    describe('concurrent writes', () => {
      it('never throws under parallel puts; last-write-wins', async () => {
        const session = makeSession({ version: 0 });
        await backend.put(session);

        const phases = ['discovery', 'playback', 'edit', 'generate'] as const;
        const results = await Promise.allSettled(
          phases.map((phase) => backend.put({ ...session, phase })),
        );
        for (const r of results) {
          expect(r.status).toBe('fulfilled');
        }

        if (options.concurrencySettleMs) {
          await new Promise((r) => setTimeout(r, options.concurrencySettleMs));
        }

        const read = await backend.get(session.sessionId);
        expect(read).not.toBeNull();
        expect(phases).toContain(read!.phase);
      });
    });

    if (!options.skipExpiry) {
      describe('TTL on read', () => {
        it('get returns null when expiresAt is in the past', async () => {
          const expired = makeSession({
            expiresAt: new Date(Date.now() - 60_000).toISOString(),
          });
          await backend.put(expired);

          const read = await backend.get(expired.sessionId);
          expect(read).toBeNull();
        });
      });
    }
  });
}
