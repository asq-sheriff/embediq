import { describe, it, expect } from 'vitest';
import { validateOutput } from '../../src/synthesizer/output-validator.js';
import { ProfileBuilder } from '../../src/engine/profile-builder.js';
import { SynthesizerOrchestrator } from '../../src/synthesizer/orchestrator.js';
import { PriorityAnalyzer } from '../../src/engine/priority-analyzer.js';
import { QuestionBank } from '../../src/bank/question-bank.js';
import { buildAnswerMap, MINIMAL_DEVELOPER_ANSWERS, HEALTHCARE_DEVELOPER_ANSWERS, PM_ANSWERS } from '../helpers/test-utils.js';
import type { GeneratedFile, SetupConfig } from '../../src/types/index.js';

const profileBuilder = new ProfileBuilder();
const priorityAnalyzer = new PriorityAnalyzer();
const bank = new QuestionBank();

function buildConfig(answerEntries: Array<[string, string | string[] | number | boolean]>): SetupConfig {
  const answers = buildAnswerMap(answerEntries);
  const profile = profileBuilder.build(answers);
  profile.priorities = priorityAnalyzer.analyze(answers, bank.getAll());
  return { profile, targetDir: '/tmp/test' };
}

describe('validateOutput', () => {
  describe('universal checks', () => {
    it('passes when CLAUDE.md and settings.json are present', async () => {
      const config = buildConfig(MINIMAL_DEVELOPER_ANSWERS);
      const files = await new SynthesizerOrchestrator().generate(config);
      const result = validateOutput(files, config.profile);
      expect(result.passed).toBe(true);
    });

    it('fails when CLAUDE.md is missing', () => {
      const config = buildConfig(MINIMAL_DEVELOPER_ANSWERS);
      const files: GeneratedFile[] = [
        { relativePath: '.claude/settings.json', content: '{}', description: 'settings' },
      ];
      const result = validateOutput(files, config.profile);
      expect(result.passed).toBe(false);
      expect(result.checks.find(c => c.name === 'Core: CLAUDE.md present')?.passed).toBe(false);
    });

    it('fails when settings.json is missing', () => {
      const config = buildConfig(MINIMAL_DEVELOPER_ANSWERS);
      const files: GeneratedFile[] = [
        { relativePath: 'CLAUDE.md', content: '# Test', description: 'claude md' },
      ];
      const result = validateOutput(files, config.profile);
      expect(result.passed).toBe(false);
    });

    it('requires command-guard for technical roles', () => {
      const config = buildConfig(MINIMAL_DEVELOPER_ANSWERS);
      const files: GeneratedFile[] = [
        { relativePath: 'CLAUDE.md', content: '# Test', description: 'claude md' },
        { relativePath: '.claude/settings.json', content: '{}', description: 'settings' },
      ];
      const result = validateOutput(files, config.profile);
      const guardCheck = result.checks.find(c => c.name === 'Core: command-guard.py present');
      expect(guardCheck).toBeDefined();
      expect(guardCheck!.passed).toBe(false);
    });

    it('does not require command-guard for non-technical roles', () => {
      const config = buildConfig(PM_ANSWERS);
      const files: GeneratedFile[] = [
        { relativePath: 'CLAUDE.md', content: '# Test', description: 'claude md' },
        { relativePath: '.claude/settings.json', content: '{}', description: 'settings' },
      ];
      const result = validateOutput(files, config.profile);
      const guardCheck = result.checks.find(c => c.name === 'Core: command-guard.py present');
      expect(guardCheck).toBeUndefined();
    });
  });

  describe('HIPAA checks', () => {
    it('validates all HIPAA requirements for healthcare profile', async () => {
      const config = buildConfig(HEALTHCARE_DEVELOPER_ANSWERS);
      const files = await new SynthesizerOrchestrator().generate(config);
      const result = validateOutput(files, config.profile);
      const hipaaChecks = result.checks.filter(c => c.name.startsWith('HIPAA:'));
      expect(hipaaChecks.length).toBeGreaterThanOrEqual(4);
      // All error-severity HIPAA checks should pass with full generation
      const hipaaErrors = hipaaChecks.filter(c => c.severity === 'error' && !c.passed);
      expect(hipaaErrors).toHaveLength(0);
    });

    it('fails HIPAA DLP check when DLP scanner is missing', () => {
      const config = buildConfig(HEALTHCARE_DEVELOPER_ANSWERS);
      const files: GeneratedFile[] = [
        { relativePath: 'CLAUDE.md', content: '# Test', description: '' },
        { relativePath: '.claude/settings.json', content: '{}', description: '' },
        { relativePath: '.claude/hooks/command-guard.py', content: '', description: '' },
        { relativePath: '.claude/rules/hipaa-compliance.md', content: '', description: '' },
      ];
      const result = validateOutput(files, config.profile);
      expect(result.passed).toBe(false);
      expect(result.checks.find(c => c.name === 'HIPAA: DLP scanner present')?.passed).toBe(false);
    });

    it('does not run HIPAA checks for non-healthcare profiles', async () => {
      const config = buildConfig(MINIMAL_DEVELOPER_ANSWERS);
      const files = await new SynthesizerOrchestrator().generate(config);
      const result = validateOutput(files, config.profile);
      const hipaaChecks = result.checks.filter(c => c.name.startsWith('HIPAA:'));
      expect(hipaaChecks).toHaveLength(0);
    });
  });

  describe('full generation validation', () => {
    it('passes for healthcare profile with full generation', async () => {
      const config = buildConfig(HEALTHCARE_DEVELOPER_ANSWERS);
      const orchestrator = new SynthesizerOrchestrator();
      const { validation } = await orchestrator.generateWithValidation(config);
      expect(validation.passed).toBe(true);
    });

    it('passes for minimal developer profile with full generation', async () => {
      const config = buildConfig(MINIMAL_DEVELOPER_ANSWERS);
      const orchestrator = new SynthesizerOrchestrator();
      const { validation } = await orchestrator.generateWithValidation(config);
      expect(validation.passed).toBe(true);
    });

    it('passes for PM profile with full generation', async () => {
      const config = buildConfig(PM_ANSWERS);
      const orchestrator = new SynthesizerOrchestrator();
      const { validation } = await orchestrator.generateWithValidation(config);
      expect(validation.passed).toBe(true);
    });
  });

  describe('summary', () => {
    it('reports all checks passed when valid', async () => {
      const config = buildConfig(MINIMAL_DEVELOPER_ANSWERS);
      const files = await new SynthesizerOrchestrator().generate(config);
      const result = validateOutput(files, config.profile);
      expect(result.summary).toContain('passed');
    });

    it('reports error count when invalid', () => {
      const config = buildConfig(HEALTHCARE_DEVELOPER_ANSWERS);
      const result = validateOutput([], config.profile);
      expect(result.summary).toContain('critical errors');
    });
  });
});
