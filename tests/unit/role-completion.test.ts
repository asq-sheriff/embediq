import { describe, it, expect } from 'vitest';
import { roleCompletion, parseRole } from '../../src/web/sessions/routes.js';
import type { WizardSession, SerializedAnswer } from '../../src/web/sessions/types.js';

function answer(id: string, value: SerializedAnswer['value'], by?: string): SerializedAnswer {
  return { questionId: id, value, timestamp: '2026-06-03T00:00:00.000Z', ...(by ? { contributedBy: by } : {}) };
}

function session(answers: Record<string, SerializedAnswer>): WizardSession {
  return {
    sessionId: 's1', phase: 'qa', answers,
    generationHistory: [], createdAt: '', updatedAt: '', expiresAt: '', version: 1,
  };
}

describe('parseRole', () => {
  it('accepts the three roles, rejects anything else', () => {
    expect(parseRole('admin')).toBe('admin');
    expect(parseRole('lead')).toBe('lead');
    expect(parseRole('individual')).toBe('individual');
    expect(parseRole('bogus')).toBeUndefined();
    expect(parseRole(undefined)).toBeUndefined();
  });
});

describe('roleCompletion', () => {
  // A minimal answer set that opens the gates so each role has visible questions.
  const base = {
    STRAT_000: answer('STRAT_000', 'developer', 'admin@x'),
    STRAT_000a: answer('STRAT_000a', 'advanced', 'admin@x'),
    STRAT_000b: answer('STRAT_000b', 'admin', 'admin@x'),
  };

  it('reports admin slice in_progress and attributes its contributor', () => {
    const c = roleCompletion(session(base), 'admin');
    expect(c.visible).toBeGreaterThan(0);
    expect(c.answered).toBeGreaterThan(0);
    expect(c.answered).toBeLessThan(c.visible);
    expect(c.status).toBe('in_progress');
    expect(c.contributors).toContain('admin@x');
  });

  it('reports the lead slice pending when untouched, with its own visible set', () => {
    const c = roleCompletion(session(base), 'lead');
    expect(c.answered).toBe(0);
    expect(c.status).toBe('pending');
    expect(c.visible).toBeGreaterThan(0);
    expect(c.contributors).toEqual([]);
  });

  it('attributes lead answers to the delegate, not the admin', () => {
    const withLead = { ...base, PROB_001: answer('PROB_001', ['slow_reviews'], 'lead@x') };
    const c = roleCompletion(session(withLead), 'lead');
    expect(c.answered).toBe(1);
    expect(c.status).toBe('in_progress');
    expect(c.contributors).toEqual(['lead@x']);
  });
});
