import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/web/server.js';

const app = createApp();

describe('GET /api/skills', () => {
  it('returns the list of registered skill summaries', async () => {
    const res = await request(app).get('/api/skills');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const ids = res.body.map((s: { id: string }) => s.id).sort();
    expect(ids).toContain('healthcare.full');
    expect(ids).toContain('finance.full');
    expect(ids).toContain('education.full');
  });

  it('returns counts per skill (no function bodies leaked)', async () => {
    const res = await request(app).get('/api/skills');
    const healthcare = res.body.find((s: { id: string }) => s.id === 'healthcare.full');
    expect(healthcare.counts.questions).toBeGreaterThan(0);
    expect(healthcare.counts.dlpPatterns).toBeGreaterThan(0);
    // Roundtrip through JSON to confirm no functions sneak through.
    expect(JSON.parse(JSON.stringify(healthcare))).toEqual(healthcare);
  });
});

describe('GET /api/skills/:id', () => {
  it('returns a single skill summary by id', async () => {
    const res = await request(app).get('/api/skills/healthcare.full');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('healthcare.full');
    expect(res.body.tags).toContain('hipaa');
  });

  it('404s on unknown skill id', async () => {
    const res = await request(app).get('/api/skills/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});
