import { describe, it, expect } from 'vitest';
import { healthcarePack } from '../../src/domain-packs/built-in/healthcare.js';
import { financePack } from '../../src/domain-packs/built-in/finance.js';
import { educationPack } from '../../src/domain-packs/built-in/education.js';
import { DomainPackRegistry } from '../../src/domain-packs/registry.js';
import { SynthesizerOrchestrator } from '../../src/synthesizer/orchestrator.js';
import { ProfileBuilder } from '../../src/engine/profile-builder.js';
import { PriorityAnalyzer } from '../../src/engine/priority-analyzer.js';
import { QuestionBank } from '../../src/bank/question-bank.js';
import { buildAnswerMap, HEALTHCARE_DEVELOPER_ANSWERS } from '../helpers/test-utils.js';
import type { SetupConfig } from '../../src/types/index.js';

describe('Healthcare Domain Pack', () => {
  it('has correct identity', () => {
    expect(healthcarePack.id).toBe('healthcare');
    expect(healthcarePack.version).toBe('1.0.0');
  });

  it('has 6 questions', () => {
    expect(healthcarePack.questions).toHaveLength(6);
    expect(healthcarePack.questions[0].id).toBe('HC_001');
    expect(healthcarePack.questions[5].id).toBe('HC_006');
  });

  it('has compliance frameworks including hitech', () => {
    expect(healthcarePack.complianceFrameworks.length).toBeGreaterThanOrEqual(2);
    expect(healthcarePack.complianceFrameworks.map(f => f.key)).toContain('hitech');
  });

  it('has 6 DLP patterns', () => {
    expect(healthcarePack.dlpPatterns).toHaveLength(6);
    expect(healthcarePack.dlpPatterns.find(p => p.name.includes('MRN'))).toBeDefined();
  });

  it('has 3 rule templates', () => {
    expect(healthcarePack.ruleTemplates).toHaveLength(3);
  });

  it('has 5 validation checks', () => {
    expect(healthcarePack.validationChecks).toHaveLength(5);
  });

  it('integrates with full generation pipeline', () => {
    const answers = buildAnswerMap(HEALTHCARE_DEVELOPER_ANSWERS);
    const pb = new ProfileBuilder();
    const bank = new QuestionBank(healthcarePack);
    const analyzer = new PriorityAnalyzer(healthcarePack.priorityCategories);
    const profile = pb.build(answers);
    profile.priorities = analyzer.analyze(answers, bank.getAll());

    const config: SetupConfig = { profile, targetDir: '/tmp/test', domainPack: healthcarePack };
    const { files, validation } = new SynthesizerOrchestrator().generateWithValidation(config);

    // Healthcare-specific DLP patterns should be in the scanner
    const dlp = files.find(f => f.relativePath.includes('dlp-scanner'));
    expect(dlp!.content).toContain('MRN');
    // DEA pattern should be present (check pattern or description)
    expect(dlp!.content).toContain('Enforcement Administration');

    // Healthcare rule templates should be generated
    expect(files.find(f => f.relativePath.includes('hipaa-phi-handling'))).toBeDefined();
    expect(files.find(f => f.relativePath.includes('healthcare-interop'))).toBeDefined();

    // Validation should pass
    expect(validation.passed).toBe(true);
  });
});

describe('Finance Domain Pack', () => {
  it('has correct identity', () => {
    expect(financePack.id).toBe('finance');
  });

  it('has 5 questions', () => {
    expect(financePack.questions).toHaveLength(5);
    expect(financePack.questions[0].id).toBe('FIN_D001');
  });

  it('has 4 compliance frameworks', () => {
    expect(financePack.complianceFrameworks).toHaveLength(4);
    expect(financePack.complianceFrameworks.map(f => f.key)).toContain('sox');
    expect(financePack.complianceFrameworks.map(f => f.key)).toContain('glba');
  });

  it('has 6 DLP patterns', () => {
    expect(financePack.dlpPatterns).toHaveLength(6);
  });

  it('has 3 rule templates', () => {
    expect(financePack.ruleTemplates).toHaveLength(3);
  });

  it('has 3 validation checks', () => {
    expect(financePack.validationChecks).toHaveLength(3);
  });
});

describe('Education Domain Pack', () => {
  it('has correct identity', () => {
    expect(educationPack.id).toBe('education');
  });

  it('has 6 questions', () => {
    expect(educationPack.questions).toHaveLength(6);
    expect(educationPack.questions[0].id).toBe('EDU_001');
  });

  it('has 3 compliance frameworks', () => {
    expect(educationPack.complianceFrameworks).toHaveLength(3);
    expect(educationPack.complianceFrameworks.map(f => f.key)).toContain('ferpa');
    expect(educationPack.complianceFrameworks.map(f => f.key)).toContain('coppa');
  });

  it('has 6 DLP patterns', () => {
    expect(educationPack.dlpPatterns).toHaveLength(6);
  });

  it('has 2 rule templates', () => {
    expect(educationPack.ruleTemplates).toHaveLength(2);
  });

  it('has 5 validation checks', () => {
    expect(educationPack.validationChecks).toHaveLength(5);
  });
});

describe('DomainPackRegistry with built-in packs', () => {
  it('registers all 3 built-in packs', () => {
    const registry = new DomainPackRegistry();
    registry.register(healthcarePack);
    registry.register(financePack);
    registry.register(educationPack);
    expect(registry.getAll()).toHaveLength(3);
  });

  it('resolves healthcare from industry', () => {
    const registry = new DomainPackRegistry();
    registry.register(healthcarePack);
    expect(registry.getForIndustry('healthcare')?.id).toBe('healthcare');
    expect(registry.getForIndustry('health_tech')?.id).toBe('healthcare');
    expect(registry.getForIndustry('pharma')?.id).toBe('healthcare');
  });

  it('resolves finance from industry', () => {
    const registry = new DomainPackRegistry();
    registry.register(financePack);
    expect(registry.getForIndustry('finance')?.id).toBe('finance');
    expect(registry.getForIndustry('fintech')?.id).toBe('finance');
    expect(registry.getForIndustry('banking')?.id).toBe('finance');
  });

  it('resolves education from industry', () => {
    const registry = new DomainPackRegistry();
    registry.register(educationPack);
    expect(registry.getForIndustry('education')?.id).toBe('education');
    expect(registry.getForIndustry('edtech')?.id).toBe('education');
    expect(registry.getForIndustry('k12')?.id).toBe('education');
  });
});
