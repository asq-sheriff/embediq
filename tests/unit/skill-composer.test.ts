import { describe, it, expect } from 'vitest';
import { composeSkills } from '../../src/skills/skill-composer.js';
import { SkillCompositionError, type Skill } from '../../src/skills/skill.js';
import { Dimension, QuestionType } from '../../src/types/index.js';
import type {
  ComplianceFrameworkDef,
  DlpPatternDef,
  DomainValidationCheck,
  RuleTemplateDef,
} from '../../src/domain-packs/index.js';

function skill(overrides: Partial<Skill> & Pick<Skill, 'id'>): Skill {
  return {
    name: overrides.id,
    version: '1.0.0',
    description: '',
    tags: [],
    ...overrides,
  };
}

const FRAMEWORK_HIPAA: ComplianceFrameworkDef = {
  key: 'hipaa',
  label: 'HIPAA',
  description: 'HIPAA',
};

const FRAMEWORK_PCI: ComplianceFrameworkDef = {
  key: 'pci',
  label: 'PCI',
  description: 'PCI',
};

const DLP_MRN: DlpPatternDef = {
  name: 'MRN',
  pattern: '\\bMRN\\d+\\b',
  severity: 'CRITICAL',
  description: 'MRN',
};

const RULE_PHI: RuleTemplateDef = {
  filename: 'phi.md',
  pathScope: ['src/'],
  content: 'PHI rule',
};

const VALIDATION_PHI: DomainValidationCheck = {
  name: 'PHI rule present',
  severity: 'error',
  failureMessage: 'PHI rule must be generated',
  check: () => true,
};

describe('composeSkills — payload merging', () => {
  it('returns an empty payload for an empty skill list', () => {
    const out = composeSkills([]);
    expect(out.questions).toEqual([]);
    expect(out.complianceFrameworks).toEqual([]);
    expect(out.priorityCategories).toEqual({});
    expect(out.dlpPatterns).toEqual([]);
    expect(out.ruleTemplates).toEqual([]);
    expect(out.ignorePatterns).toEqual([]);
    expect(out.validationChecks).toEqual([]);
    expect(out.skillIds).toEqual([]);
    expect(out.warnings).toEqual([]);
  });

  it('passes through a single skill unchanged', () => {
    const s = skill({
      id: 'a',
      questions: [{
        id: 'Q1',
        dimension: Dimension.STRATEGIC_INTENT,
        text: 'Q1',
        type: QuestionType.YES_NO,
        required: true,
        order: 1,
        showConditions: [],
        tags: [],
      }],
      complianceFrameworks: [FRAMEWORK_HIPAA],
      dlpPatterns: [DLP_MRN],
      ruleTemplates: [RULE_PHI],
      ignorePatterns: ['phi/'],
      validationChecks: [VALIDATION_PHI],
      priorityCategories: { 'Compliance': ['hipaa', 'phi'] },
    });

    const out = composeSkills([s]);
    expect(out.questions).toHaveLength(1);
    expect(out.complianceFrameworks).toEqual([FRAMEWORK_HIPAA]);
    expect(out.dlpPatterns).toEqual([DLP_MRN]);
    expect(out.ruleTemplates).toEqual([RULE_PHI]);
    expect(out.ignorePatterns).toEqual(['phi/']);
    expect(out.validationChecks).toEqual([VALIDATION_PHI]);
    expect(out.priorityCategories.Compliance).toEqual(['hipaa', 'phi']);
    expect(out.skillIds).toEqual(['a']);
  });

  it('concatenates payloads from multiple skills', () => {
    const a = skill({ id: 'a', complianceFrameworks: [FRAMEWORK_HIPAA] });
    const b = skill({ id: 'b', complianceFrameworks: [FRAMEWORK_PCI] });
    const out = composeSkills([a, b]);
    expect(out.complianceFrameworks.map(f => f.key)).toEqual(['hipaa', 'pci']);
    expect(out.skillIds).toEqual(['a', 'b']);
  });

  it('merges priorityCategories key-wise as a set union', () => {
    const a = skill({ id: 'a', priorityCategories: { 'Compliance': ['hipaa', 'phi'] } });
    const b = skill({ id: 'b', priorityCategories: { 'Compliance': ['pci'], 'Security': ['dlp'] } });
    const out = composeSkills([a, b]);
    expect(out.priorityCategories.Compliance.sort()).toEqual(['hipaa', 'pci', 'phi']);
    expect(out.priorityCategories.Security).toEqual(['dlp']);
  });

  it('silently dedupes identical ignore lines', () => {
    const a = skill({ id: 'a', ignorePatterns: ['phi/', 'audit/'] });
    const b = skill({ id: 'b', ignorePatterns: ['phi/', 'logs/'] });
    const out = composeSkills([a, b]);
    expect(out.ignorePatterns).toEqual(['phi/', 'audit/', 'logs/']);
    expect(out.warnings).toEqual([]); // ignore dedup is silent
  });
});

describe('composeSkills — collisions', () => {
  it('first-wins on colliding question IDs and records a warning', () => {
    const q = (id: string, text: string) => ({
      id,
      dimension: Dimension.STRATEGIC_INTENT,
      text,
      type: QuestionType.YES_NO,
      required: true,
      order: 1,
      showConditions: [],
      tags: [],
    });
    const a = skill({ id: 'a', questions: [q('Q1', 'first')] });
    const b = skill({ id: 'b', questions: [q('Q1', 'second')] });
    const out = composeSkills([a, b]);
    expect(out.questions).toHaveLength(1);
    expect(out.questions[0].text).toBe('first');
    expect(out.warnings.some(w => w.includes('question id "Q1"'))).toBe(true);
  });

  it('first-wins on colliding rule template filenames', () => {
    const a = skill({ id: 'a', ruleTemplates: [{ ...RULE_PHI, content: 'first' }] });
    const b = skill({ id: 'b', ruleTemplates: [{ ...RULE_PHI, content: 'second' }] });
    const out = composeSkills([a, b]);
    expect(out.ruleTemplates).toHaveLength(1);
    expect(out.ruleTemplates[0].content).toBe('first');
  });

  it('throws SkillCompositionError on collision when allowFirstWins=false', () => {
    const a = skill({ id: 'a', dlpPatterns: [DLP_MRN] });
    const b = skill({ id: 'b', dlpPatterns: [DLP_MRN] });
    expect(() => composeSkills([a, b], { allowFirstWins: false })).toThrow(
      SkillCompositionError,
    );
  });
});

describe('composeSkills — requires/conflicts', () => {
  it('throws when a required skill is missing from the composition', () => {
    const dependent = skill({ id: 'a', requires: ['missing'] });
    expect(() => composeSkills([dependent])).toThrow(/requires "missing"/);
  });

  it('passes when the required skill is present', () => {
    const base = skill({ id: 'base' });
    const dependent = skill({ id: 'a', requires: ['base'] });
    expect(() => composeSkills([base, dependent])).not.toThrow();
  });

  it('throws when two skills declare a conflict and both are present', () => {
    const a = skill({ id: 'a', conflicts: ['b'] });
    const b = skill({ id: 'b' });
    expect(() => composeSkills([a, b])).toThrow(/conflicts with "b"/);
  });

  it('passes when conflicting skill is not in the composition', () => {
    const a = skill({ id: 'a', conflicts: ['b'] });
    expect(() => composeSkills([a])).not.toThrow();
  });
});
