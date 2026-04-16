import { describe, it, expect } from 'vitest';
import { DomainPackRegistry } from '../../src/domain-packs/registry.js';
import type { DomainPack } from '../../src/domain-packs/index.js';
import { Dimension, QuestionType, ConditionOperator } from '../../src/types/index.js';
import { QuestionBank } from '../../src/bank/question-bank.js';
import { PriorityAnalyzer } from '../../src/engine/priority-analyzer.js';
import { SynthesizerOrchestrator } from '../../src/synthesizer/orchestrator.js';
import { ProfileBuilder } from '../../src/engine/profile-builder.js';
import { buildAnswerMap, HEALTHCARE_DEVELOPER_ANSWERS } from '../helpers/test-utils.js';

const testPack: DomainPack = {
  id: 'test-domain',
  name: 'Test Domain Pack',
  version: '1.0.0',
  description: 'A test domain pack for unit tests',
  questions: [
    {
      id: 'TEST_001',
      dimension: Dimension.REGULATORY_COMPLIANCE,
      text: 'Test domain question?',
      type: QuestionType.YES_NO,
      required: false,
      order: 300,
      showConditions: [
        { questionId: 'STRAT_002', operator: ConditionOperator.EQUALS, value: 'test-industry' },
      ],
      tags: ['test_tag'],
    },
  ],
  complianceFrameworks: [
    { key: 'test-framework', label: 'Test Framework', description: 'A test compliance framework' },
  ],
  priorityCategories: {
    'Test Category': ['test_tag', 'test_compliance'],
  },
  dlpPatterns: [
    {
      name: 'Test Pattern',
      pattern: '\\bTEST-\\d{6}\\b',
      severity: 'HIGH',
      description: 'Test identifier pattern',
    },
    {
      name: 'Conditional Pattern',
      pattern: '\\bCOND-\\d+\\b',
      severity: 'CRITICAL',
      description: 'Pattern requiring framework',
      requiresFramework: 'test-framework',
    },
  ],
  ruleTemplates: [
    {
      filename: 'test-compliance.md',
      pathScope: ['src/**'],
      content: '# Test Compliance Rules\n\nTest rule content.',
    },
  ],
  ignorePatterns: [
    'test_data/',
    'test_records/',
  ],
  validationChecks: [
    {
      name: 'Test: Rule file exists',
      severity: 'warning',
      check: (files) => !!files.find(f => f.relativePath.includes('test-compliance')),
      failureMessage: 'Test compliance rule file should be generated',
    },
  ],
};

describe('DomainPackRegistry', () => {
  it('registers and retrieves a domain pack by ID', () => {
    const registry = new DomainPackRegistry();
    registry.register(testPack);
    expect(registry.getById('test-domain')).toBe(testPack);
  });

  it('returns all registered packs', () => {
    const registry = new DomainPackRegistry();
    registry.register(testPack);
    expect(registry.getAll()).toHaveLength(1);
  });

  it('returns undefined for unregistered ID', () => {
    const registry = new DomainPackRegistry();
    expect(registry.getById('nonexistent')).toBeUndefined();
  });

  it('maps industries to packs', () => {
    const registry = new DomainPackRegistry();
    const healthcarePack = { ...testPack, id: 'healthcare' };
    registry.register(healthcarePack);
    expect(registry.getForIndustry('healthcare')).toBe(healthcarePack);
    expect(registry.getForIndustry('health_tech')).toBe(healthcarePack);
  });

  it('returns undefined for unmapped industries', () => {
    const registry = new DomainPackRegistry();
    expect(registry.getForIndustry('automotive')).toBeUndefined();
  });

  it('prevents duplicate registration', () => {
    const registry = new DomainPackRegistry();
    registry.register(testPack);
    registry.register({ ...testPack, name: 'Duplicate' });
    expect(registry.getById('test-domain')!.name).toBe('Test Domain Pack');
  });
});

describe('QuestionBank with DomainPack', () => {
  it('includes domain pack questions', () => {
    const bank = new QuestionBank(testPack);
    const q = bank.getById('TEST_001');
    expect(q).toBeDefined();
    expect(q!.text).toBe('Test domain question?');
  });

  it('preserves all core questions', () => {
    const bankWithout = new QuestionBank();
    const bankWith = new QuestionBank(testPack);
    expect(bankWith.getAll().length).toBe(bankWithout.getAll().length + 1);
  });

  it('extends REG_002 compliance framework options', () => {
    const bank = new QuestionBank(testPack);
    const reg002 = bank.getById('REG_002');
    expect(reg002!.options!.some(o => o.key === 'test-framework')).toBe(true);
  });

  it('sorts questions by dimension and order', () => {
    const bank = new QuestionBank(testPack);
    const all = bank.getAll();
    for (let i = 1; i < all.length; i++) {
      const prevDim = bank.getDimensions().indexOf(all[i - 1].dimension);
      const currDim = bank.getDimensions().indexOf(all[i].dimension);
      if (prevDim === currDim) {
        expect(all[i].order).toBeGreaterThanOrEqual(all[i - 1].order);
      } else {
        expect(currDim).toBeGreaterThanOrEqual(prevDim);
      }
    }
  });
});

describe('PriorityAnalyzer with domain categories', () => {
  it('includes domain-specific priority categories', () => {
    const analyzer = new PriorityAnalyzer({ 'Test Category': ['test_tag'] });
    const answers = buildAnswerMap([
      ['STRAT_000', 'developer'],
      ['STRAT_002', 'test-industry'],
    ]);
    const bankWithPack = new QuestionBank(testPack);

    // Answer the domain question to generate test_tag weights
    answers.set('TEST_001', { questionId: 'TEST_001', value: true, timestamp: new Date() });

    const priorities = analyzer.analyze(answers, bankWithPack.getAll());
    const testCategory = priorities.find(p => p.name === 'Test Category');
    expect(testCategory).toBeDefined();
  });
});

describe('Generator integration with domain packs', () => {
  it('injects domain DLP patterns into DLP scanner', async () => {
    const answers = buildAnswerMap(HEALTHCARE_DEVELOPER_ANSWERS);
    const pb = new ProfileBuilder();
    const profile = pb.build(answers);
    profile.priorities = new PriorityAnalyzer().analyze(answers, new QuestionBank().getAll());

    const config = { profile, targetDir: '/tmp/test', domainPack: testPack };
    const files = await new SynthesizerOrchestrator().generate(config);

    const dlp = files.find(f => f.relativePath.includes('dlp-scanner'));
    expect(dlp).toBeDefined();
    expect(dlp!.content).toContain('TEST-');
    expect(dlp!.content).toContain('Test Domain Pack domain patterns');
  });

  it('does not inject conditional DLP patterns when framework not selected', async () => {
    const answers = buildAnswerMap(HEALTHCARE_DEVELOPER_ANSWERS);
    const pb = new ProfileBuilder();
    const profile = pb.build(answers);
    profile.priorities = new PriorityAnalyzer().analyze(answers, new QuestionBank().getAll());

    const config = { profile, targetDir: '/tmp/test', domainPack: testPack };
    const files = await new SynthesizerOrchestrator().generate(config);
    const dlp = files.find(f => f.relativePath.includes('dlp-scanner'));
    // test-framework is not in the healthcare profile's complianceFrameworks
    expect(dlp!.content).not.toContain('COND-');
  });

  it('adds domain rule templates', async () => {
    const answers = buildAnswerMap(HEALTHCARE_DEVELOPER_ANSWERS);
    const pb = new ProfileBuilder();
    const profile = pb.build(answers);
    profile.priorities = new PriorityAnalyzer().analyze(answers, new QuestionBank().getAll());

    const config = { profile, targetDir: '/tmp/test', domainPack: testPack };
    const files = await new SynthesizerOrchestrator().generate(config);
    const rule = files.find(f => f.relativePath === '.claude/rules/test-compliance.md');
    expect(rule).toBeDefined();
    expect(rule!.content).toContain('Test Compliance Rules');
    expect(rule!.content).toContain('globs:');
  });

  it('adds domain ignore patterns without duplicating', async () => {
    const answers = buildAnswerMap(HEALTHCARE_DEVELOPER_ANSWERS);
    const pb = new ProfileBuilder();
    const profile = pb.build(answers);
    profile.priorities = new PriorityAnalyzer().analyze(answers, new QuestionBank().getAll());

    const config = { profile, targetDir: '/tmp/test', domainPack: testPack };
    const files = await new SynthesizerOrchestrator().generate(config);
    const ignore = files.find(f => f.relativePath === '.claudeignore');
    expect(ignore!.content).toContain('test_data/');
    expect(ignore!.content).toContain('test_records/');
  });

  it('runs domain validation checks', async () => {
    const answers = buildAnswerMap(HEALTHCARE_DEVELOPER_ANSWERS);
    const pb = new ProfileBuilder();
    const profile = pb.build(answers);
    profile.priorities = new PriorityAnalyzer().analyze(answers, new QuestionBank().getAll());

    const config = { profile, targetDir: '/tmp/test', domainPack: testPack };
    const { validation } = await new SynthesizerOrchestrator().generateWithValidation(config);
    const domainCheck = validation.checks.find(c => c.name === 'Test: Rule file exists');
    expect(domainCheck).toBeDefined();
    expect(domainCheck!.passed).toBe(true);
  });
});
