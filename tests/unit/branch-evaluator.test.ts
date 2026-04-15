import { describe, it, expect } from 'vitest';
import { BranchEvaluator } from '../../src/engine/branch-evaluator.js';
import { ConditionOperator } from '../../src/types/index.js';
import { createAnswer } from '../helpers/test-utils.js';

const evaluator = new BranchEvaluator();

function answers(entries: Array<[string, string | string[] | number | boolean]>) {
  const map = new Map();
  for (const [id, value] of entries) map.set(id, createAnswer(id, value));
  return map;
}

describe('BranchEvaluator', () => {
  describe('shouldShow', () => {
    it('returns true when conditions array is empty', () => {
      expect(evaluator.shouldShow([], new Map())).toBe(true);
    });

    it('requires ALL conditions to pass (AND logic)', () => {
      const result = evaluator.shouldShow(
        [
          { questionId: 'Q1', operator: ConditionOperator.EQUALS, value: 'yes' },
          { questionId: 'Q2', operator: ConditionOperator.EQUALS, value: 'no' },
        ],
        answers([['Q1', 'yes'], ['Q2', 'yes']]),
      );
      expect(result).toBe(false);
    });
  });

  describe('EQUALS', () => {
    it('matches string values (case-insensitive)', () => {
      const a = answers([['Q1', 'Healthcare']]);
      expect(evaluator.shouldShow(
        [{ questionId: 'Q1', operator: ConditionOperator.EQUALS, value: 'healthcare' }],
        a,
      )).toBe(true);
    });

    it('matches boolean values', () => {
      const a = answers([['Q1', true]]);
      expect(evaluator.shouldShow(
        [{ questionId: 'Q1', operator: ConditionOperator.EQUALS, value: true }],
        a,
      )).toBe(true);
    });

    it('fails when answer is missing', () => {
      expect(evaluator.shouldShow(
        [{ questionId: 'Q1', operator: ConditionOperator.EQUALS, value: 'x' }],
        new Map(),
      )).toBe(false);
    });
  });

  describe('NOT_EQUALS', () => {
    it('returns true when values differ', () => {
      const a = answers([['Q1', 'finance']]);
      expect(evaluator.shouldShow(
        [{ questionId: 'Q1', operator: ConditionOperator.NOT_EQUALS, value: 'healthcare' }],
        a,
      )).toBe(true);
    });

    it('returns false when values match', () => {
      const a = answers([['Q1', 'healthcare']]);
      expect(evaluator.shouldShow(
        [{ questionId: 'Q1', operator: ConditionOperator.NOT_EQUALS, value: 'healthcare' }],
        a,
      )).toBe(false);
    });
  });

  describe('CONTAINS', () => {
    it('checks array membership', () => {
      const a = answers([['Q1', ['typescript', 'python']]]);
      expect(evaluator.shouldShow(
        [{ questionId: 'Q1', operator: ConditionOperator.CONTAINS, value: 'python' }],
        a,
      )).toBe(true);
    });

    it('checks substring for strings', () => {
      const a = answers([['Q1', 'healthcare system']]);
      expect(evaluator.shouldShow(
        [{ questionId: 'Q1', operator: ConditionOperator.CONTAINS, value: 'health' }],
        a,
      )).toBe(true);
    });

    it('is case-insensitive', () => {
      const a = answers([['Q1', ['TypeScript']]]);
      expect(evaluator.shouldShow(
        [{ questionId: 'Q1', operator: ConditionOperator.CONTAINS, value: 'typescript' }],
        a,
      )).toBe(true);
    });
  });

  describe('NOT_CONTAINS', () => {
    it('returns true when array does not contain value', () => {
      const a = answers([['Q1', ['typescript']]]);
      expect(evaluator.shouldShow(
        [{ questionId: 'Q1', operator: ConditionOperator.NOT_CONTAINS, value: 'python' }],
        a,
      )).toBe(true);
    });

    it('returns false when array contains value', () => {
      const a = answers([['Q1', ['typescript', 'python']]]);
      expect(evaluator.shouldShow(
        [{ questionId: 'Q1', operator: ConditionOperator.NOT_CONTAINS, value: 'python' }],
        a,
      )).toBe(false);
    });
  });

  describe('ANY_OF', () => {
    it('matches when string value is in expected array', () => {
      const a = answers([['Q1', 'healthcare']]);
      expect(evaluator.shouldShow(
        [{ questionId: 'Q1', operator: ConditionOperator.ANY_OF, value: ['healthcare', 'finance'] }],
        a,
      )).toBe(true);
    });

    it('fails when string value is not in expected array', () => {
      const a = answers([['Q1', 'education']]);
      expect(evaluator.shouldShow(
        [{ questionId: 'Q1', operator: ConditionOperator.ANY_OF, value: ['healthcare', 'finance'] }],
        a,
      )).toBe(false);
    });

    it('matches when actual array has overlap with expected array', () => {
      const a = answers([['Q1', ['go', 'python']]]);
      expect(evaluator.shouldShow(
        [{ questionId: 'Q1', operator: ConditionOperator.ANY_OF, value: ['python', 'rust'] }],
        a,
      )).toBe(true);
    });
  });

  describe('NONE_OF', () => {
    it('returns true when no overlap', () => {
      const a = answers([['Q1', 'education']]);
      expect(evaluator.shouldShow(
        [{ questionId: 'Q1', operator: ConditionOperator.NONE_OF, value: ['healthcare', 'finance'] }],
        a,
      )).toBe(true);
    });

    it('returns false when there is overlap', () => {
      const a = answers([['Q1', ['typescript', 'python']]]);
      expect(evaluator.shouldShow(
        [{ questionId: 'Q1', operator: ConditionOperator.NONE_OF, value: ['python', 'rust'] }],
        a,
      )).toBe(false);
    });
  });

  describe('ANSWERED', () => {
    it('returns true when answer exists', () => {
      const a = answers([['Q1', '']]);
      expect(evaluator.shouldShow(
        [{ questionId: 'Q1', operator: ConditionOperator.ANSWERED }],
        a,
      )).toBe(true);
    });

    it('returns false when answer is missing', () => {
      expect(evaluator.shouldShow(
        [{ questionId: 'Q1', operator: ConditionOperator.ANSWERED }],
        new Map(),
      )).toBe(false);
    });
  });

  describe('NOT_ANSWERED', () => {
    it('returns true when answer is missing', () => {
      expect(evaluator.shouldShow(
        [{ questionId: 'Q1', operator: ConditionOperator.NOT_ANSWERED }],
        new Map(),
      )).toBe(true);
    });

    it('returns false when answer exists', () => {
      const a = answers([['Q1', 'something']]);
      expect(evaluator.shouldShow(
        [{ questionId: 'Q1', operator: ConditionOperator.NOT_ANSWERED }],
        a,
      )).toBe(false);
    });
  });

  describe('GT', () => {
    it('returns true when actual > expected', () => {
      const a = answers([['Q1', 5]]);
      expect(evaluator.shouldShow(
        [{ questionId: 'Q1', operator: ConditionOperator.GT, value: 3 }],
        a,
      )).toBe(true);
    });

    it('returns false when actual <= expected', () => {
      const a = answers([['Q1', 3]]);
      expect(evaluator.shouldShow(
        [{ questionId: 'Q1', operator: ConditionOperator.GT, value: 3 }],
        a,
      )).toBe(false);
    });
  });

  describe('LT', () => {
    it('returns true when actual < expected', () => {
      const a = answers([['Q1', 2]]);
      expect(evaluator.shouldShow(
        [{ questionId: 'Q1', operator: ConditionOperator.LT, value: 5 }],
        a,
      )).toBe(true);
    });

    it('returns false when actual >= expected', () => {
      const a = answers([['Q1', 5]]);
      expect(evaluator.shouldShow(
        [{ questionId: 'Q1', operator: ConditionOperator.LT, value: 5 }],
        a,
      )).toBe(false);
    });
  });
});
