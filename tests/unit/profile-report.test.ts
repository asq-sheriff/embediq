import { describe, it, expect } from 'vitest';
import { buildProfileReport } from '../../src/engine/profile-report.js';
import { createEmptyProfile, type UserProfile, type Answer } from '../../src/types/index.js';

function profile(): UserProfile {
  const p = createEmptyProfile();
  p.businessDomain = 'Claims adjudication API';
  p.role = 'developer';
  p.industry = 'healthcare';
  p.languages = ['python'];
  p.devOps = { ...p.devOps, buildTools: ['pip'], testFrameworks: ['pytest'], ide: ['vscode'] };
  p.inferredDefaults = { Testing: ['pytest'], IDE: ['vscode'] };
  p.complianceFrameworks = ['hipaa'];
  p.priorities = [{ name: 'Security', confidence: 0.9, derivedFrom: ['REG_002'] }];
  const answers = new Map<string, Answer>();
  answers.set('STRAT_000b', { questionId: 'STRAT_000b', value: 'admin', timestamp: new Date(0) });
  answers.set('TECH_001', { questionId: 'TECH_001', value: ['python'], timestamp: new Date(0) });
  p.answers = answers;
  return p;
}

describe('buildProfileReport', () => {
  it('produces markdown with the key sections and tags inferred fields', () => {
    const { markdown } = buildProfileReport(profile(), {
      generatedAt: '2026-05-31T00:00:00.000Z',
      version: 2,
      targets: ['claude', 'copilot'],
      domainPackName: 'Healthcare',
      warnings: [{ questionId: 'TECH_003', severity: 'warning', message: 'check this', suggestion: 'do that' }],
    });
    expect(markdown).toContain('# Claims adjudication API — EmbedIQ Profile');
    expect(markdown).toContain('version 2');
    expect(markdown).toContain('Coding Agent Admin');
    expect(markdown).toContain('## Determinations EmbedIQ made');
    expect(markdown).toContain('Domain pack resolved: Healthcare');
    expect(markdown).toContain('Output targets: claude, copilot');
    // inferred fields are tagged
    expect(markdown).toMatch(/Testing:.*pytest.*\(inferred\)/);
    expect(markdown).toContain('## Consistency warnings');
    expect(markdown).toContain('## Answer log');
    expect(markdown).toContain('Security — 90% confidence');
  });

  it('produces json with determinations, warnings, and answers', () => {
    const { json } = buildProfileReport(profile(), { generatedAt: '2026-05-31T00:00:00.000Z', targets: ['claude'] });
    expect(json.industry).toBe('healthcare');
    expect((json.determinations as Record<string, unknown>).inferredDefaults).toEqual({ Testing: ['pytest'], IDE: ['vscode'] });
    expect((json.answers as Record<string, unknown>).TECH_001).toEqual(['python']);
  });

  it('attributes answers by role and surfaces contributors', () => {
    // profile() answers STRAT_000b (admin) and TECH_001 (lead).
    const { markdown, json } = buildProfileReport(profile(), {
      generatedAt: '2026-05-31T00:00:00.000Z',
      contributedBy: { STRAT_000b: 'admin@x', TECH_001: 'lead@x' },
    });
    expect(markdown).toContain('## Contributions by role');
    expect(markdown).toMatch(/Admin \(policy\): 1 answer/);
    expect(markdown).toMatch(/Team Lead: 1 answer/);
    expect(markdown).toContain('Contributors: admin@x, lead@x');
    // answer log tags each answer with its owning role + contributor
    expect(markdown).toMatch(/`TECH_001`:.*_\(Team Lead · lead@x\)_/);
    const attr = json.attribution as { byRole: Record<string, number> };
    expect(attr.byRole.admin).toBe(1);
    expect(attr.byRole.lead).toBe(1);
  });
});
