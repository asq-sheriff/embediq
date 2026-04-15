import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/web/server.js';

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
});
