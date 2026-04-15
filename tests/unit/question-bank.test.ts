import { describe, it, expect } from 'vitest';
import { QuestionBank } from '../../src/bank/question-bank.js';
import { Dimension } from '../../src/types/index.js';
import { buildAnswerMap } from '../helpers/test-utils.js';

const bank = new QuestionBank();

describe('QuestionBank', () => {
  describe('getAll', () => {
    it('returns all 71 questions', () => {
      const all = bank.getAll();
      expect(all.length).toBe(71);
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
});
