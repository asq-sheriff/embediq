import { describe, it, expect } from 'vitest';
import { QuestionBank } from '../../src/bank/question-bank.js';
import { Dimension, DIMENSION_ORDER, type Answer } from '../../src/types/index.js';
import { questions, respondentOf } from '../../src/bank/question-registry.js';
import { buildAnswerMap } from '../helpers/test-utils.js';

const bank = new QuestionBank();

describe('QuestionBank', () => {
  describe('getAll', () => {
    it('returns all 93 questions', () => {
      const all = bank.getAll();
      expect(all.length).toBe(93);
    });

    it('every question has an id, dimension, type, and text', () => {
      for (const q of bank.getAll()) {
        expect(q.id).toBeTruthy();
        expect(q.dimension).toBeTruthy();
        expect(q.type).toBeTruthy();
        expect(q.text).toBeTruthy();
      }
    });

    it('every question has a tags array', () => {
      for (const q of bank.getAll()) {
        expect(Array.isArray(q.tags)).toBe(true);
      }
    });
  });

  describe('getById', () => {
    it('finds a question by ID', () => {
      const q = bank.getById('STRAT_000');
      expect(q).toBeDefined();
      expect(q!.id).toBe('STRAT_000');
    });

    it('returns undefined for unknown ID', () => {
      expect(bank.getById('NONEXISTENT')).toBeUndefined();
    });
  });

  describe('getByDimension', () => {
    it('returns questions for each dimension', () => {
      for (const dim of bank.getDimensions()) {
        const questions = bank.getByDimension(dim);
        expect(questions.length).toBeGreaterThan(0);
        for (const q of questions) {
          expect(q.dimension).toBe(dim);
        }
      }
    });

    it('returns questions sorted by order', () => {
      for (const dim of bank.getDimensions()) {
        const questions = bank.getByDimension(dim);
        for (let i = 1; i < questions.length; i++) {
          expect(questions[i].order).toBeGreaterThanOrEqual(questions[i - 1].order);
        }
      }
    });
  });

  describe('getDimensions', () => {
    it('returns all 7 dimensions in order', () => {
      const dims = bank.getDimensions();
      expect(dims).toHaveLength(7);
      expect(dims[0]).toBe(Dimension.STRATEGIC_INTENT);
      expect(dims[6]).toBe(Dimension.INNOVATION_FUTURE);
    });
  });

  describe('getVisibleQuestions', () => {
    it('returns all unconditional questions for a dimension with empty answers', () => {
      const visible = bank.getVisibleQuestions(Dimension.STRATEGIC_INTENT, new Map());
      // Should include STRAT_000 (no conditions) but not STRAT_003 (depends on STRAT_002=other)
      expect(visible.find(q => q.id === 'STRAT_000')).toBeDefined();
    });

    it('shows conditional questions when conditions are met', () => {
      const answers = buildAnswerMap([['STRAT_002', 'other']]);
      const visible = bank.getVisibleQuestions(Dimension.STRATEGIC_INTENT, answers);
      const q003 = visible.find(q => q.id === 'STRAT_003');
      expect(q003).toBeDefined();
    });

    it('hides conditional questions when conditions are not met', () => {
      const answers = buildAnswerMap([['STRAT_002', 'healthcare']]);
      const visible = bank.getVisibleQuestions(Dimension.STRATEGIC_INTENT, answers);
      const q003 = visible.find(q => q.id === 'STRAT_003');
      expect(q003).toBeUndefined();
    });
  });

  describe('role-scoped visibility (three-role delegation)', () => {
    // Gate answers so most downstream questions are visible.
    const ans = (): Map<string, Answer> => buildAnswerMap([
      ['STRAT_000', 'developer'], ['STRAT_000a', 'advanced'], ['STRAT_000b', 'admin'],
      ['STRAT_002', 'healthcare'], ['OPS_001', 'large'], ['TECH_001', ['python']],
      ['REG_001', true], ['REG_002', ['hipaa']], ['REG_012', true],
    ]);

    function visibleAcross(role?: 'admin' | 'lead' | 'individual'): string[] {
      return DIMENSION_ORDER.flatMap(d => bank.getVisibleQuestions(d, ans(), role).map(q => q.id));
    }

    it('every question resolves to a respondent', () => {
      for (const q of questions) {
        expect(['admin', 'lead', 'individual', 'any']).toContain(respondentOf(q));
      }
    });

    it('no role filter returns the full visible set (unchanged behavior)', () => {
      const all = visibleAcross();
      const admin = visibleAcross('admin');
      const lead = visibleAcross('lead');
      const individual = visibleAcross('individual');
      // The three role slices partition the unscoped set (no `any` in this gate set).
      expect(admin.length + lead.length + individual.length).toBe(all.length);
    });

    it('admin slice is the narrow policy/setup set; project questions go to the lead', () => {
      const admin = visibleAcross('admin');
      const lead = visibleAcross('lead');
      // Setup identity + compliance/financial policy belong to admin…
      expect(admin).toContain('STRAT_000b');
      expect(admin).toContain('REG_002');
      expect(admin).toContain('FIN_001');
      // …pain points, the real stack, and innovation belong to the team lead.
      expect(lead).toContain('PROB_001');
      expect(lead).toContain('TECH_007');
      expect(lead).toContain('INNOV_004');
      expect(admin).not.toContain('PROB_001');
    });

    it('stamps the resolved respondent on served questions', () => {
      const prob = bank.getVisibleQuestions(Dimension.PROBLEM_DEFINITION, ans());
      expect(prob.find(q => q.id === 'PROB_001')?.respondent).toBe('lead');
    });
  });
});
