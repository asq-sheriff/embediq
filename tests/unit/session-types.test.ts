import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  NullBackend,
  selectSessionBackend,
  resolveTtlMs,
  summarize,
  TTL_DEFAULT_MS,
  TTL_MIN_MS,
  TTL_MAX_MS,
  type WizardSession,
} from '../../src/web/sessions/index.js';

function sampleSession(overrides: Partial<WizardSession> = {}): WizardSession {
  return {
    sessionId: '11111111-1111-1111-1111-111111111111',
    userId: 'alice',
    templateId: 'hipaa-healthcare',
    phase: 'playback',
    currentDimension: 'Strategic Intent',
    answers: {
      STRAT_000: {
        questionId: 'STRAT_000',
        value: 'developer',
        timestamp: '2026-04-18T12:00:00.000Z',
      },
      TECH_001: {
        questionId: 'TECH_001',
        value: ['typescript', 'python'],
        timestamp: '2026-04-18T12:01:15.500Z',
      },
    },
    profile: {
      answers: {},
      role: 'developer',
      technicalProficiency: 'intermediate',
      businessDomain: 'Patient portal',
      industry: 'healthcare',
      problemAreas: [],
      techStack: [],
      languages: ['typescript'],
      teamSize: 'small',
      devOps: {
        ide: [],
        buildTools: [],
        testFrameworks: [],
        cicd: '',
        monitoring: [],
        containerization: [],
      },
      complianceFrameworks: ['hipaa'],
      budgetTier: 'enterprise',
      securityConcerns: ['strict_permissions'],
      hardwareProfile: {},
      priorities: [
        { name: 'Security', confidence: 0.9, derivedFrom: ['REG_001', 'REG_008'] },
      ],
    },
    priorities: [
      { name: 'Security', confidence: 0.9, derivedFrom: ['REG_001', 'REG_008'] },
    ],
    generationHistory: [
      {
        runId: '22222222-2222-2222-2222-222222222222',
        timestamp: '2026-04-18T12:02:00.000Z',
        fileCount: 18,
        validationPassed: true,
        targetDir: '/tmp/embediq-demo',
      },
    ],
    createdAt: '2026-04-18T12:00:00.000Z',
    updatedAt: '2026-04-18T12:02:00.000Z',
    expiresAt: '2026-04-25T12:00:00.000Z',
    version: 3,
    ...overrides,
  };
}

describe('WizardSession round-trip', () => {
  it('survives JSON.stringify → JSON.parse unchanged', () => {
    const original = sampleSession();
    const cloned = JSON.parse(JSON.stringify(original)) as WizardSession;
    expect(cloned).toEqual(original);
  });

  it('preserves nested answers, profile, and generationHistory', () => {
    const session = sampleSession();
    const cloned = JSON.parse(JSON.stringify(session)) as WizardSession;
    expect(cloned.answers.TECH_001.value).toEqual(['typescript', 'python']);
    expect(cloned.profile?.complianceFrameworks).toEqual(['hipaa']);
    expect(cloned.generationHistory[0].fileCount).toBe(18);
  });

  it('minimal session (no profile / priorities / owner) still round-trips', () => {
    const minimal: WizardSession = {
      sessionId: 's-1',
      phase: 'discovery',
      answers: {},
      generationHistory: [],
      createdAt: '2026-04-18T00:00:00.000Z',
      updatedAt: '2026-04-18T00:00:00.000Z',
      expiresAt: '2026-04-25T00:00:00.000Z',
      version: 1,
    };
    expect(JSON.parse(JSON.stringify(minimal))).toEqual(minimal);
  });
});

describe('summarize', () => {
  it('projects a compact summary for listings', () => {
    const s = sampleSession();
    expect(summarize(s)).toEqual({
      sessionId: s.sessionId,
      userId: s.userId,
      phase: s.phase,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      expiresAt: s.expiresAt,
    });
  });
});

describe('NullBackend', () => {
  const backend = new NullBackend();

  it('reports name="none"', () => {
    expect(backend.name).toBe('none');
  });

  it('get returns null for any id', async () => {
    expect(await backend.get('anything')).toBeNull();
  });

  it('put echoes the input without bumping version', async () => {
    const session = sampleSession({ version: 7 });
    const returned = await backend.put(session);
    expect(returned).toBe(session);
    expect(returned.version).toBe(7);
  });

  it('delete returns false', async () => {
    expect(await backend.delete('anything')).toBe(false);
  });

  it('list returns an empty result', async () => {
    expect(await backend.list()).toEqual({ sessions: [] });
  });

  it('touch resolves without side effects', async () => {
    await expect(backend.touch('s1', '2026-05-01T00:00:00.000Z')).resolves.toBeUndefined();
  });
});

describe('selectSessionBackend', () => {
  it('defaults to NullBackend when no env var is set', async () => {
    const backend = await selectSessionBackend({});
    expect(backend.name).toBe('none');
  });

  it('returns NullBackend for EMBEDIQ_SESSION_BACKEND=none', async () => {
    const backend = await selectSessionBackend({ EMBEDIQ_SESSION_BACKEND: 'none' });
    expect(backend.name).toBe('none');
  });

  it('falls back to none with a warning for unknown values', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const backend = await selectSessionBackend({ EMBEDIQ_SESSION_BACKEND: 'mongodb' });
      expect(backend.name).toBe('none');
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('throws a clear error naming the dependency when selecting redis', async () => {
    await expect(
      selectSessionBackend({ EMBEDIQ_SESSION_BACKEND: 'redis' }),
    ).rejects.toThrow(/ioredis/);
  });

  it('constructs a DatabaseBackend when EMBEDIQ_SESSION_BACKEND=database (SQLite default)', async () => {
    const backend = await selectSessionBackend({
      EMBEDIQ_SESSION_BACKEND: 'database',
      EMBEDIQ_SESSION_DB_URL: ':memory:',
    });
    expect(backend.name).toBe('database');
    // Release the in-memory connection.
    if ('close' in backend && typeof backend.close === 'function') {
      await backend.close();
    }
  });

  it('throws when the postgres driver is selected before it is wired', async () => {
    await expect(
      selectSessionBackend({
        EMBEDIQ_SESSION_BACKEND: 'database',
        EMBEDIQ_SESSION_DB_DRIVER: 'postgres',
      }),
    ).rejects.toThrow(/Postgres/i);
  });

  it('throws on an unknown db driver', async () => {
    await expect(
      selectSessionBackend({
        EMBEDIQ_SESSION_BACKEND: 'database',
        EMBEDIQ_SESSION_DB_DRIVER: 'mongodb',
      }),
    ).rejects.toThrow(/Unknown EMBEDIQ_SESSION_DB_DRIVER/);
  });

  it('constructs a JsonFileBackend when EMBEDIQ_SESSION_BACKEND=json-file', async () => {
    const dir = await (await import('node:fs/promises')).mkdtemp(
      (await import('node:path')).join((await import('node:os')).tmpdir(), 'embediq-fx-'),
    );
    try {
      const backend = await selectSessionBackend({
        EMBEDIQ_SESSION_BACKEND: 'json-file',
        EMBEDIQ_SESSION_DIR: dir,
      });
      expect(backend.name).toBe('json-file');
    } finally {
      await (await import('node:fs/promises')).rm(dir, { recursive: true, force: true });
    }
  });
});

describe('resolveTtlMs', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns the default when unset', () => {
    expect(resolveTtlMs({})).toBe(TTL_DEFAULT_MS);
  });

  it('accepts a valid value within bounds', () => {
    expect(resolveTtlMs({ EMBEDIQ_SESSION_TTL_MS: String(3600_000) })).toBe(3600_000);
  });

  it('clamps up to the minimum floor', () => {
    expect(resolveTtlMs({ EMBEDIQ_SESSION_TTL_MS: '100' })).toBe(TTL_MIN_MS);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('clamps down to the 30-day ceiling', () => {
    const tooLong = String(TTL_MAX_MS * 2);
    expect(resolveTtlMs({ EMBEDIQ_SESSION_TTL_MS: tooLong })).toBe(TTL_MAX_MS);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('falls back to the default for non-numeric values', () => {
    expect(resolveTtlMs({ EMBEDIQ_SESSION_TTL_MS: 'not-a-number' })).toBe(TTL_DEFAULT_MS);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('falls back to the default for zero or negative values', () => {
    expect(resolveTtlMs({ EMBEDIQ_SESSION_TTL_MS: '0' })).toBe(TTL_DEFAULT_MS);
    expect(resolveTtlMs({ EMBEDIQ_SESSION_TTL_MS: '-100' })).toBe(TTL_DEFAULT_MS);
  });
});
