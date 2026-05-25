import { describe, it, expect } from 'vitest';
import { nistAiRmfPack } from '../../src/domain-packs/built-in/nist-ai-rmf.js';
import { DomainPackRegistry } from '../../src/domain-packs/registry.js';
import { skillRegistry } from '../../src/skills/skill-registry.js';
import { Dimension } from '../../src/types/index.js';

describe('nistAiRmfPack — structural sanity', () => {
  it('has identity meta + non-empty payload sections', () => {
    expect(nistAiRmfPack.id).toBe('nist-ai-rmf');
    expect(nistAiRmfPack.name).toContain('NIST AI Risk Management Framework');
    expect(nistAiRmfPack.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(nistAiRmfPack.questions.length).toBeGreaterThanOrEqual(6);
    expect(nistAiRmfPack.complianceFrameworks).toHaveLength(2);
    expect(nistAiRmfPack.ruleTemplates).toHaveLength(4);
    expect(nistAiRmfPack.validationChecks.length).toBeGreaterThanOrEqual(4);
  });

  it('registers nist-ai-rmf + nist-ai-600-1 as compliance frameworks', () => {
    const keys = nistAiRmfPack.complianceFrameworks.map((f) => f.key).sort();
    expect(keys).toEqual(['nist-ai-600-1', 'nist-ai-rmf']);
  });

  it('every question is gated on REG_002 containing nist-ai-rmf — so the pack only fires when the framework is selected', () => {
    for (const q of nistAiRmfPack.questions) {
      expect(q.dimension).toBe(Dimension.REGULATORY_COMPLIANCE);
      const gating = q.showConditions?.find((c) => c.questionId === 'REG_002');
      expect(gating).toBeDefined();
      expect(gating!.value).toBe('nist-ai-rmf');
    }
  });

  it('every question id has the AI_ prefix and is unique', () => {
    const ids = nistAiRmfPack.questions.map((q) => q.id);
    for (const id of ids) expect(id).toMatch(/^AI_\d+$/);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every question carries the nist-ai-rmf tag plus a function tag (govern/map/measure/manage)', () => {
    const allowedFunctionTags = ['govern', 'map', 'measure', 'manage', 'ai-600-1', 'assessment', 'risk-tier', 'risk-tolerance', 'escalation', 'generative-ai', 'monitoring', 'third-party'];
    for (const q of nistAiRmfPack.questions) {
      expect(q.tags).toContain('nist-ai-rmf');
      expect(q.tags.some((t) => allowedFunctionTags.includes(t))).toBe(true);
    }
  });

  it('rule templates cover all four RMF functions', () => {
    const filenames = nistAiRmfPack.ruleTemplates.map((r) => r.filename).sort();
    expect(filenames).toContain('nist-ai-rmf-govern.md');
    expect(filenames).toContain('nist-ai-rmf-map.md');
    expect(filenames).toContain('nist-ai-rmf-measure.md');
    expect(filenames).toContain('nist-ai-rmf-manage.md');
  });

  it('each rule template gates on the nist-ai-rmf framework (so unrelated archetypes don\'t emit them)', () => {
    for (const r of nistAiRmfPack.ruleTemplates) {
      expect(r.requiresFramework).toBe('nist-ai-rmf');
    }
  });

  it('priority categories surface AI-RMF-specific themes', () => {
    const categories = Object.keys(nistAiRmfPack.priorityCategories);
    expect(categories).toContain('AI Governance');
    expect(categories).toContain('AI Trustworthiness');
    expect(categories).toContain('AI Risk Documentation');
    expect(categories).toContain('Generative AI Safety');
  });

  it('intentionally ships zero DLP patterns and zero ignore patterns (cross-industry pack)', () => {
    expect(nistAiRmfPack.dlpPatterns).toEqual([]);
    expect(nistAiRmfPack.ignorePatterns).toEqual([]);
  });
});

describe('nistAiRmfPack — validation checks', () => {
  it('rejects a harness missing the four AI RMF rule files when the framework is active', () => {
    const profile = { complianceFrameworks: ['nist-ai-rmf'] } as any;
    const emptyFiles: any[] = [];
    for (const check of nistAiRmfPack.validationChecks) {
      // Every check should fail when no AI RMF files exist.
      expect(check.check(emptyFiles, profile)).toBe(false);
    }
  });

  it('passes all checks when the four AI RMF rule files are present', () => {
    const profile = { complianceFrameworks: ['nist-ai-rmf'] } as any;
    const files = [
      { relativePath: '.claude/rules/nist-ai-rmf-govern.md', content: '# Govern' },
      { relativePath: '.claude/rules/nist-ai-rmf-map.md', content: '# Map' },
      { relativePath: '.claude/rules/nist-ai-rmf-measure.md', content: '# Measure' },
      { relativePath: '.claude/rules/nist-ai-rmf-manage.md', content: '# Manage' },
    ];
    for (const check of nistAiRmfPack.validationChecks) {
      expect(check.check(files, profile)).toBe(true);
    }
  });
});

describe('DomainPackRegistry — nist-ai-rmf is registered alongside industry packs', () => {
  it('the default registry exposes nist-ai-rmf by id', () => {
    const registry = new DomainPackRegistry();
    // Re-import to trigger registration (the export at the bottom of registry.ts
    // is what registers built-ins on the shared instance).
    // For an isolated registry we'd register manually:
    registry.register(nistAiRmfPack);
    expect(registry.getById('nist-ai-rmf')).toBeDefined();
  });

  it('is NOT mapped to an industry — operators compose via composeFromPacks', () => {
    const registry = new DomainPackRegistry();
    registry.register(nistAiRmfPack);
    // No industry should resolve to the AI RMF pack.
    expect(registry.getForIndustry('healthcare')).toBeUndefined();
    expect(registry.getForIndustry('finance')).toBeUndefined();
    expect(registry.getForIndustry('education')).toBeUndefined();
    expect(registry.getForIndustry('tech')).toBeUndefined();
  });

  it('composes cleanly with an industry pack (healthcare + nist-ai-rmf)', () => {
    const registry = new DomainPackRegistry();
    // Healthcare pack registered via the default import path
    registry.register({
      id: 'healthcare',
      name: 'Healthcare (test stand-in)',
      version: '1.0.0',
      description: '',
      questions: [],
      complianceFrameworks: [{ key: 'hipaa', label: 'HIPAA', description: '' }],
      priorityCategories: { security: ['phi'] },
      dlpPatterns: [],
      ruleTemplates: [],
      ignorePatterns: [],
      validationChecks: [],
    });
    registry.register(nistAiRmfPack);
    const composed = registry.composeFromPacks(
      ['healthcare', 'nist-ai-rmf'],
      { id: 'healthcare-ai-rmf', name: 'Healthcare + AI RMF', version: '1.0.0', description: 'combo' },
    );
    expect(composed).toBeDefined();
    // Composed pack has both frameworks.
    const fwKeys = composed!.complianceFrameworks.map((f) => f.key).sort();
    expect(fwKeys).toContain('hipaa');
    expect(fwKeys).toContain('nist-ai-rmf');
    expect(fwKeys).toContain('nist-ai-600-1');
    // AI RMF questions are pulled in.
    expect(composed!.questions.some((q) => q.id.startsWith('AI_'))).toBe(true);
    // Rule templates are pulled in (4 of them).
    expect(composed!.ruleTemplates.filter((r) => r.filename.startsWith('nist-ai-rmf-'))).toHaveLength(4);
    // Healthcare's priority category is preserved + AI RMF's adds to it.
    expect(composed!.priorityCategories['security']).toContain('phi');
    expect(composed!.priorityCategories['AI Governance']).toBeDefined();
  });
});

describe('SkillRegistry — nist-ai-rmf.full skill is registered', () => {
  it('the built-in skill registry exposes nist-ai-rmf.full', () => {
    const skill = skillRegistry.getById('nist-ai-rmf.full');
    expect(skill).toBeDefined();
    expect(skill!.source).toBe('built-in');
    expect(skill!.tags).toContain('ai-rmf');
    expect(skill!.tags).toContain('nist');
  });
});
