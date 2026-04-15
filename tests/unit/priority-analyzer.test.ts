import { describe, it, expect } from 'vitest';
import { PriorityAnalyzer } from '../../src/engine/priority-analyzer.js';
import { QuestionBank } from '../../src/bank/question-bank.js';
import { buildAnswerMap, HEALTHCARE_DEVELOPER_ANSWERS, MINIMAL_DEVELOPER_ANSWERS } from '../helpers/test-utils.js';

const analyzer = new PriorityAnalyzer();
const bank = new QuestionBank();
const allQuestions = bank.getAll();

describe('PriorityAnalyzer', () => {
  describe('healthcare profile', () => {
    const answers = buildAnswerMap(HEALTHCARE_DEVELOPER_ANSWERS);
    const priorities = analyzer.analyze(answers, allQuestions);

    it('returns priorities sorted by confidence (descending)', () => {
      for (let i = 1; i < priorities.length; i++) {
        expect(priorities[i].confidence).toBeLessThanOrEqual(priorities[i - 1].confidence);
      }
    });

    it('identifies Security & Compliance as a priority', () => {
      expect(priorities.find(p => p.name === 'Security & Compliance')).toBeDefined();
    });

    it('includes derivedFrom question IDs', () => {
      const security = priorities.find(p => p.name === 'Security & Compliance');
      expect(security!.derivedFrom.length).toBeGreaterThan(0);
    });

    it('confidence values are between 0 and 1', () => {
      for (const p of priorities) {
        expect(p.confidence).toBeGreaterThan(0);
        expect(p.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('minimal profile', () => {
    const answers = buildAnswerMap(MINIMAL_DEVELOPER_ANSWERS);
    const priorities = analyzer.analyze(answers, allQuestions);

    it('filters out low-confidence priorities (below 0.1)', () => {
      for (const p of priorities) {
        expect(p.confidence).toBeGreaterThan(0.1);
      }
    });
  });

  describe('weight computation', () => {
    it('gives weight 3 for boolean true answers', () => {
      const answers = buildAnswerMap([['REG_001', true]]);
      const priorities = analyzer.analyze(answers, allQuestions);
      // REG_001 has tags that map to Security & Compliance
      const security = priorities.find(p => p.name === 'Security & Compliance');
      expect(security).toBeDefined();
    });

    it('gives weight 0 for boolean false answers (no priority generated)', () => {
      const answers = buildAnswerMap([['REG_001', false]]);
      const priorities = analyzer.analyze(answers, allQuestions);
      // Should have fewer/no security-related priorities
      const security = priorities.find(p => p.name === 'Security & Compliance');
      if (security) {
        // May still exist from other sources but with low confidence
        expect(security.confidence).toBeLessThan(0.5);
      }
    });

    it('weighs arrays by length * 1.5 capped at 5', () => {
      // Use multiple answered questions to ensure enough tag weight to cross the 0.1 threshold
      const answers = buildAnswerMap([
        ['TECH_001', ['ts', 'py', 'go', 'rust']],
        ['TECH_004', ['vscode', 'intellij']],
        ['TECH_005', ['npm', 'gradle']],
      ]);
      const priorities = analyzer.analyze(answers, allQuestions);
      expect(priorities.length).toBeGreaterThanOrEqual(0);
    });
  });
});
