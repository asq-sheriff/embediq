import { describe, it, expect } from 'vitest';
import { SynthesizerOrchestrator } from '../../src/synthesizer/orchestrator.js';
import { ProfileBuilder } from '../../src/engine/profile-builder.js';
import { PriorityAnalyzer } from '../../src/engine/priority-analyzer.js';
import { QuestionBank } from '../../src/bank/question-bank.js';
import { buildAnswerMap, MINIMAL_DEVELOPER_ANSWERS, HEALTHCARE_DEVELOPER_ANSWERS, PM_ANSWERS } from '../helpers/test-utils.js';
import type { SetupConfig } from '../../src/types/index.js';

const profileBuilder = new ProfileBuilder();
const priorityAnalyzer = new PriorityAnalyzer();
const bank = new QuestionBank();

function buildConfig(answerEntries: Array<[string, string | string[] | number | boolean]>): SetupConfig {
  const answers = buildAnswerMap(answerEntries);
  const profile = profileBuilder.build(answers);
  profile.priorities = priorityAnalyzer.analyze(answers, bank.getAll());
  return { profile, targetDir: '/tmp/embediq-test' };
}

describe('SynthesizerOrchestrator', () => {
  describe('minimal developer profile', () => {
    const config = buildConfig(MINIMAL_DEVELOPER_ANSWERS);
    const orchestrator = new SynthesizerOrchestrator();
    const files = orchestrator.generate(config);

    it('generates CLAUDE.md', () => {
      expect(files.find(f => f.relativePath === 'CLAUDE.md')).toBeDefined();
    });

    it('generates settings.json', () => {
      expect(files.find(f => f.relativePath === '.claude/settings.json')).toBeDefined();
    });

    it('generates settings.local.json', () => {
      expect(files.find(f => f.relativePath === '.claude/settings.local.json')).toBeDefined();
    });

    it('generates .claudeignore', () => {
      expect(files.find(f => f.relativePath === '.claudeignore')).toBeDefined();
    });

    it('generates command-guard.py', () => {
      expect(files.find(f => f.relativePath.includes('command-guard'))).toBeDefined();
    });

    it('generates testing rules', () => {
      expect(files.find(f => f.relativePath === '.claude/rules/testing.md')).toBeDefined();
    });

    it('does not generate HIPAA rules for non-healthcare', () => {
      expect(files.find(f => f.relativePath.includes('hipaa'))).toBeUndefined();
    });

    it('does not generate DLP scanner without security concerns', () => {
      expect(files.find(f => f.relativePath.includes('dlp-scanner'))).toBeUndefined();
    });

    it('all files have content', () => {
      for (const f of files) {
        expect(f.content.length).toBeGreaterThan(0);
      }
    });

    it('all files have descriptions', () => {
      for (const f of files) {
        expect(f.description).toBeTruthy();
      }
    });

    it('snapshot: file list', () => {
      const paths = files.map(f => f.relativePath).sort();
      expect(paths).toMatchSnapshot();
    });
  });

  describe('healthcare HIPAA profile', () => {
    const config = buildConfig(HEALTHCARE_DEVELOPER_ANSWERS);
    const orchestrator = new SynthesizerOrchestrator();
    const files = orchestrator.generate(config);

    it('generates more files than minimal profile', () => {
      const minimalFiles = new SynthesizerOrchestrator().generate(buildConfig(MINIMAL_DEVELOPER_ANSWERS));
      expect(files.length).toBeGreaterThan(minimalFiles.length);
    });

    it('generates HIPAA compliance rules', () => {
      expect(files.find(f => f.relativePath.includes('hipaa-compliance'))).toBeDefined();
    });

    it('generates DLP scanner', () => {
      const dlp = files.find(f => f.relativePath.includes('dlp-scanner'));
      expect(dlp).toBeDefined();
    });

    it('DLP scanner contains SSN pattern', () => {
      const dlp = files.find(f => f.relativePath.includes('dlp-scanner'));
      expect(dlp!.content).toContain('\\\\d{3}-\\\\d{2}-\\\\d{4}');
    });

    it('DLP scanner contains MRN pattern', () => {
      const dlp = files.find(f => f.relativePath.includes('dlp-scanner'));
      expect(dlp!.content).toContain('MRN');
    });

    it('generates audit logger', () => {
      expect(files.find(f => f.relativePath.includes('audit-logger'))).toBeDefined();
    });

    it('generates security rules', () => {
      expect(files.find(f => f.relativePath === '.claude/rules/security.md')).toBeDefined();
    });

    it('.claudeignore includes PHI directories', () => {
      const ignore = files.find(f => f.relativePath === '.claudeignore');
      expect(ignore!.content).toContain('phi');
    });

    it('snapshot: file list', () => {
      const paths = files.map(f => f.relativePath).sort();
      expect(paths).toMatchSnapshot();
    });
  });

  describe('PM (non-technical) profile', () => {
    const config = buildConfig(PM_ANSWERS);
    const orchestrator = new SynthesizerOrchestrator();
    const files = orchestrator.generate(config);

    it('generates CLAUDE.md with coworker setup', () => {
      const claudeMd = files.find(f => f.relativePath === 'CLAUDE.md');
      expect(claudeMd).toBeDefined();
      expect(claudeMd!.content).toContain('Product Manager');
    });

    it('does not generate hooks for non-technical roles', () => {
      const hooks = files.filter(f => f.relativePath.includes('/hooks/'));
      expect(hooks).toHaveLength(0);
    });

    it('does not generate association map for non-technical roles', () => {
      expect(files.find(f => f.relativePath.includes('association_map'))).toBeUndefined();
    });

    it('snapshot: file list', () => {
      const paths = files.map(f => f.relativePath).sort();
      expect(paths).toMatchSnapshot();
    });
  });
});
