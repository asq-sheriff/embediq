import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from '../../src/web/server.js';
import { getEventBus, registerDefaultSubscribers } from '../../src/events/index.js';
import type { WizardAuditEntry } from '../../src/util/wizard-audit.js';

const app = createApp();

describe('Web API', () => {
  describe('GET /health', () => {
    it('returns status ok with version and uptime', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body).toHaveProperty('version');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /ready', () => {
    it('returns ready with question count', async () => {
      const res = await request(app).get('/ready');
      expect(res.status).toBe(200);
      expect(res.body.ready).toBe(true);
      expect(res.body.questionCount).toBe(71);
    });
  });

  describe('GET /api/templates', () => {
    it('returns available templates', async () => {
      const res = await request(app).get('/api/templates');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(3);
      expect(res.body[0]).toHaveProperty('id');
      expect(res.body[0]).toHaveProperty('name');
      expect(res.body[0]).toHaveProperty('prefilledAnswers');
    });
  });

  describe('GET /api/dimensions', () => {
    it('returns 7 dimensions', async () => {
      const res = await request(app).get('/api/dimensions');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(7);
      expect(res.body[0]).toHaveProperty('id');
      expect(res.body[0]).toHaveProperty('name');
    });

    it('first dimension is Strategic Intent', async () => {
      const res = await request(app).get('/api/dimensions');
      expect(res.body[0].name).toBe('Strategic Intent');
    });
  });

  describe('POST /api/questions', () => {
    it('returns questions for a valid dimension', async () => {
      const res = await request(app)
        .post('/api/questions')
        .send({ dimension: 'Strategic Intent', answers: {} });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('returns 400 for invalid dimension', async () => {
      const res = await request(app)
        .post('/api/questions')
        .send({ dimension: 'Invalid', answers: {} });
      expect(res.status).toBe(400);
    });

    it('filters questions based on branching conditions', async () => {
      // STRAT_003 should only show when STRAT_002 = 'other'
      const withOther = await request(app)
        .post('/api/questions')
        .send({
          dimension: 'Strategic Intent',
          answers: { STRAT_002: { value: 'other', timestamp: '2026-01-01T00:00:00Z' } },
        });
      const withoutOther = await request(app)
        .post('/api/questions')
        .send({
          dimension: 'Strategic Intent',
          answers: { STRAT_002: { value: 'healthcare', timestamp: '2026-01-01T00:00:00Z' } },
        });

      const hasQ003With = withOther.body.some((q: { id: string }) => q.id === 'STRAT_003');
      const hasQ003Without = withoutOther.body.some((q: { id: string }) => q.id === 'STRAT_003');

      expect(hasQ003With).toBe(true);
      expect(hasQ003Without).toBe(false);
    });
  });

  describe('POST /api/profile', () => {
    it('builds a profile from answers', async () => {
      const res = await request(app)
        .post('/api/profile')
        .send({
          answers: {
            STRAT_000: { value: 'developer', timestamp: '2026-01-01T00:00:00Z' },
            STRAT_001: { value: 'Web app', timestamp: '2026-01-01T00:00:00Z' },
            STRAT_002: { value: 'saas', timestamp: '2026-01-01T00:00:00Z' },
            OPS_001: { value: 'solo', timestamp: '2026-01-01T00:00:00Z' },
            TECH_001: { value: ['typescript'], timestamp: '2026-01-01T00:00:00Z' },
            FIN_001: { value: 'moderate', timestamp: '2026-01-01T00:00:00Z' },
            REG_001: { value: false, timestamp: '2026-01-01T00:00:00Z' },
          },
        });
      expect(res.status).toBe(200);
      expect(res.body.role).toBe('developer');
      expect(res.body.industry).toBe('saas');
      expect(res.body.teamSize).toBe('solo');
      expect(Array.isArray(res.body.priorities)).toBe(true);
    });
  });

  describe('POST /api/preview', () => {
    it('returns generated file previews without writing', async () => {
      const res = await request(app)
        .post('/api/preview')
        .send({
          answers: {
            STRAT_000: { value: 'developer', timestamp: '2026-01-01T00:00:00Z' },
            STRAT_002: { value: 'saas', timestamp: '2026-01-01T00:00:00Z' },
            TECH_001: { value: ['typescript'], timestamp: '2026-01-01T00:00:00Z' },
            FIN_001: { value: 'moderate', timestamp: '2026-01-01T00:00:00Z' },
            REG_001: { value: false, timestamp: '2026-01-01T00:00:00Z' },
          },
        });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.files)).toBe(true);
      expect(res.body.files.length).toBeGreaterThan(0);
      expect(res.body.files[0]).toHaveProperty('path');
      expect(res.body.files[0]).toHaveProperty('content');
      expect(res.body).toHaveProperty('validation');
      expect(res.body.validation.passed).toBe(true);
    });
  });

  describe('POST /api/generate', () => {
    it('returns 400 when targetDir is missing', async () => {
      const res = await request(app)
        .post('/api/generate')
        .send({ answers: {} });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('targetDir');
    });
  });

  describe('POST /api/generate audit stream (event-driven)', () => {
    const TMP_BASE = join(process.cwd(), 'tests', '.tmp-web-audit');
    const LOG_PATH = join(TMP_BASE, 'audit.jsonl');
    const TARGET_DIR = join(TMP_BASE, 'target');
    let teardown: () => void = () => {};

    const minimalAnswers = {
      STRAT_000: { value: 'developer', timestamp: '2026-01-01T00:00:00Z' },
      STRAT_002: { value: 'saas', timestamp: '2026-01-01T00:00:00Z' },
      TECH_001: { value: ['typescript'], timestamp: '2026-01-01T00:00:00Z' },
      FIN_001: { value: 'moderate', timestamp: '2026-01-01T00:00:00Z' },
      REG_001: { value: false, timestamp: '2026-01-01T00:00:00Z' },
    };

    function readEntries(): WizardAuditEntry[] {
      if (!existsSync(LOG_PATH)) return [];
      return readFileSync(LOG_PATH, 'utf-8')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as WizardAuditEntry);
    }

    beforeEach(() => {
      if (existsSync(TMP_BASE)) rmSync(TMP_BASE, { recursive: true });
      mkdirSync(TARGET_DIR, { recursive: true });
      process.env.EMBEDIQ_AUDIT_LOG = LOG_PATH;
      ({ teardown } = registerDefaultSubscribers(getEventBus(), { enableAudit: true }));
    });

    afterEach(() => {
      teardown();
      delete process.env.EMBEDIQ_AUDIT_LOG;
      if (existsSync(TMP_BASE)) rmSync(TMP_BASE, { recursive: true });
    });

    it('emits session/profile/generation/validation/file/session events via the bus', async () => {
      const res = await request(app)
        .post('/api/generate')
        .send({ answers: minimalAnswers, targetDir: TARGET_DIR });

      expect(res.status).toBe(200);
      expect(res.body.totalWritten).toBeGreaterThan(0);

      // The event bus dispatches on queueMicrotask; flush before reading.
      await new Promise((r) => setImmediate(r));

      const entries = readEntries();
      const types = entries.map((e) => e.eventType);

      // Expected sequence: session_start, profile_built, generation_started,
      // N × file_written (emitted by orchestrator as each generator completes),
      // validation_result, session_complete.
      expect(types[0]).toBe('session_start');
      expect(types[1]).toBe('profile_built');
      expect(types[2]).toBe('generation_started');
      expect(types[types.length - 1]).toBe('session_complete');
      expect(types[types.length - 2]).toBe('validation_result');
      expect(types.filter((t) => t === 'file_written').length).toBeGreaterThan(0);

      // All file_written entries fall between generation_started and validation_result
      const generationIdx = types.indexOf('generation_started');
      const validationIdx = types.indexOf('validation_result');
      expect(validationIdx).toBeGreaterThan(generationIdx);
      for (let i = generationIdx + 1; i < validationIdx; i++) {
        expect(types[i]).toBe('file_written');
      }
    });

    it('auto-enriches audit entries with requestId from context', async () => {
      await request(app)
        .post('/api/generate')
        .send({ answers: minimalAnswers, targetDir: TARGET_DIR });
      await new Promise((r) => setImmediate(r));

      const entries = readEntries();
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.requestId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
      }
    });

    it('profile_built entry carries the profileSummary payload', async () => {
      await request(app)
        .post('/api/generate')
        .send({ answers: minimalAnswers, targetDir: TARGET_DIR });
      await new Promise((r) => setImmediate(r));

      const entries = readEntries();
      const profileBuilt = entries.find((e) => e.eventType === 'profile_built');
      expect(profileBuilt?.profileSummary).toMatchObject({
        role: 'developer',
        industry: 'saas',
      });
    });

    it('file_written entries carry relativePath and size', async () => {
      await request(app)
        .post('/api/generate')
        .send({ answers: minimalAnswers, targetDir: TARGET_DIR });
      await new Promise((r) => setImmediate(r));

      const fileEntries = readEntries().filter((e) => e.eventType === 'file_written');
      for (const entry of fileEntries) {
        expect(entry.filePath).toBeTruthy();
        expect(entry.fileSize).toBeGreaterThan(0);
      }
    });

    it('does not write audit entries when EMBEDIQ_AUDIT_LOG is unset', async () => {
      delete process.env.EMBEDIQ_AUDIT_LOG;

      await request(app)
        .post('/api/generate')
        .send({ answers: minimalAnswers, targetDir: TARGET_DIR });
      await new Promise((r) => setImmediate(r));

      expect(existsSync(LOG_PATH)).toBe(false);
    });
  });
});
