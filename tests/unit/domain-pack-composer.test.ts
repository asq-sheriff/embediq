import { describe, it, expect } from 'vitest';
import { composePacks, PackCompositionError } from '../../src/domain-packs/composer.js';
import type { DomainPack } from '../../src/domain-packs/index.js';

function bare(id: string, overrides: Partial<DomainPack> = {}): DomainPack {
  return {
    id,
    name: id,
    version: '1.0.0',
    description: '',
    questions: [],
    complianceFrameworks: [],
    priorityCategories: {},
    dlpPatterns: [],
    ruleTemplates: [],
    ignorePatterns: [],
    validationChecks: [],
    ...overrides,
  };
}

describe('composePacks', () => {
  it('returns an empty composed payload for an empty input', () => {
    const out = composePacks([]);
    expect(out.packIds).toEqual([]);
    expect(out.questions).toEqual([]);
    expect(out.complianceFrameworks).toEqual([]);
    expect(out.warnings).toEqual([]);
  });

  it('concatenates fields from non-overlapping packs in order', () => {
    const a = bare('a', {
      complianceFrameworks: [{ key: 'hipaa', label: 'HIPAA', description: 'h' }],
      dlpPatterns: [{ name: 'mrn', pattern: '\\d{8}', severity: 'CRITICAL', description: 'MRN' }],
      ignorePatterns: ['.phi/'],
    });
    const b = bare('b', {
      complianceFrameworks: [{ key: 'nist-800-53', label: 'NIST 800-53', description: 'n' }],
      ignorePatterns: ['.audit/'],
    });
    const out = composePacks([a, b]);
    expect(out.packIds).toEqual(['a', 'b']);
    expect(out.complianceFrameworks.map((f) => f.key)).toEqual(['hipaa', 'nist-800-53']);
    expect(out.dlpPatterns.map((d) => d.name)).toEqual(['mrn']);
    expect(out.ignorePatterns).toEqual(['.phi/', '.audit/']);
    expect(out.warnings).toHaveLength(0);
  });

  it('preserves first-wins when two packs declare the same framework key (default mode)', () => {
    const a = bare('a', {
      complianceFrameworks: [{ key: 'hipaa', label: 'HIPAA (a)', description: 'first' }],
    });
    const b = bare('b', {
      complianceFrameworks: [{ key: 'hipaa', label: 'HIPAA (b)', description: 'second' }],
    });
    const out = composePacks([a, b]);
    expect(out.complianceFrameworks).toHaveLength(1);
    expect(out.complianceFrameworks[0].label).toBe('HIPAA (a)');
    expect(out.warnings).toHaveLength(1);
    expect(out.warnings[0]).toContain('hipaa');
    expect(out.warnings[0]).toContain('"b"');
  });

  it('deduplicates ignore patterns silently (not flagged as collision)', () => {
    const a = bare('a', { ignorePatterns: ['.phi/', '.audit/'] });
    const b = bare('b', { ignorePatterns: ['.audit/', '.tmp/'] });
    const out = composePacks([a, b]);
    expect(out.ignorePatterns).toEqual(['.phi/', '.audit/', '.tmp/']);
    expect(out.warnings).toHaveLength(0);
  });

  it('merges priorityCategories with union semantics on tag arrays', () => {
    const a = bare('a', { priorityCategories: { security: ['phi', 'pci'], cost: ['low'] } });
    const b = bare('b', { priorityCategories: { security: ['pci', 'pii'], speed: ['fast'] } });
    const out = composePacks([a, b]);
    expect(new Set(out.priorityCategories.security)).toEqual(new Set(['phi', 'pci', 'pii']));
    expect(out.priorityCategories.cost).toEqual(['low']);
    expect(out.priorityCategories.speed).toEqual(['fast']);
  });

  it('throws PackCompositionError when allowFirstWins is false and a collision occurs', () => {
    const a = bare('a', {
      complianceFrameworks: [{ key: 'hipaa', label: 'HIPAA', description: '' }],
    });
    const b = bare('b', {
      complianceFrameworks: [{ key: 'hipaa', label: 'HIPAA', description: '' }],
    });
    expect(() => composePacks([a, b], { allowFirstWins: false })).toThrow(PackCompositionError);
  });

  it('detects collisions on rule-template filenames, DLP names, validation names, and question ids', () => {
    const a = bare('a', {
      ruleTemplates: [{ filename: 'a.md', pathScope: [], content: 'a' }],
      dlpPatterns: [{ name: 'mrn', pattern: '\\d', severity: 'HIGH', description: '' }],
      validationChecks: [{ name: 'k1', severity: 'error', check: () => true, failureMessage: '' }],
    });
    const b = bare('b', {
      ruleTemplates: [{ filename: 'a.md', pathScope: [], content: 'b' }],
      dlpPatterns: [{ name: 'mrn', pattern: '\\d', severity: 'HIGH', description: '' }],
      validationChecks: [{ name: 'k1', severity: 'error', check: () => false, failureMessage: '' }],
    });
    const out = composePacks([a, b]);
    expect(out.ruleTemplates).toHaveLength(1);
    expect(out.dlpPatterns).toHaveLength(1);
    expect(out.validationChecks).toHaveLength(1);
    expect(out.warnings).toHaveLength(3);
    expect(out.warnings.some((w) => w.includes('rule template'))).toBe(true);
    expect(out.warnings.some((w) => w.includes('DLP pattern'))).toBe(true);
    expect(out.warnings.some((w) => w.includes('validation check'))).toBe(true);
  });
});
