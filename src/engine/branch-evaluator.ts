import { ConditionOperator, type Condition, type Answer } from '../types/index.js';

export class BranchEvaluator {
  shouldShow(conditions: Condition[], answers: Map<string, Answer>): boolean {
    if (conditions.length === 0) return true;
    return conditions.every(c => this.evaluate(c, answers));
  }

  private evaluate(condition: Condition, answers: Map<string, Answer>): boolean {
    const answer = answers.get(condition.questionId);

    if (condition.operator === ConditionOperator.ANSWERED) {
      return answer !== undefined;
    }
    if (condition.operator === ConditionOperator.NOT_ANSWERED) {
      return answer === undefined;
    }
    if (!answer) return false;

    const actual = answer.value;
    const expected = condition.value;

    switch (condition.operator) {
      case ConditionOperator.EQUALS:
        return this.normalizeString(actual) === this.normalizeString(expected);

      case ConditionOperator.NOT_EQUALS:
        return this.normalizeString(actual) !== this.normalizeString(expected);

      case ConditionOperator.CONTAINS: {
        const actualStr = this.normalizeString(actual);
        const expectedStr = this.normalizeString(expected);
        if (Array.isArray(actual)) {
          return actual.some(v => this.normalizeString(v) === expectedStr);
        }
        return actualStr.includes(expectedStr);
      }

      case ConditionOperator.NOT_CONTAINS: {
        const actualStr = this.normalizeString(actual);
        const expectedStr = this.normalizeString(expected);
        if (Array.isArray(actual)) {
          return !actual.some(v => this.normalizeString(v) === expectedStr);
        }
        return !actualStr.includes(expectedStr);
      }

      case ConditionOperator.ANY_OF: {
        const expectedArr = Array.isArray(expected) ? expected : [expected];
        if (Array.isArray(actual)) {
          return actual.some(v =>
            expectedArr.some(e => this.normalizeString(v) === this.normalizeString(e))
          );
        }
        return expectedArr.some(e => this.normalizeString(actual) === this.normalizeString(e));
      }

      case ConditionOperator.NONE_OF: {
        const expectedArr = Array.isArray(expected) ? expected : [expected];
        if (Array.isArray(actual)) {
          return !actual.some(v =>
            expectedArr.some(e => this.normalizeString(v) === this.normalizeString(e))
          );
        }
        return !expectedArr.some(e => this.normalizeString(actual) === this.normalizeString(e));
      }

      case ConditionOperator.GT:
        return Number(actual) > Number(expected);

      case ConditionOperator.LT:
        return Number(actual) < Number(expected);

      default:
        return false;
    }
  }

  private normalizeString(value: unknown): string {
    if (value === undefined || value === null) return '';
    return String(value).toLowerCase().trim();
  }
}
