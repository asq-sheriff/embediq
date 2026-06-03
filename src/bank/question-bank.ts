import type { Question, Dimension, Answer, Respondent } from '../types/index.js';
import { DIMENSION_ORDER } from '../types/index.js';
import { questions, respondentOf } from './question-registry.js';
import { BranchEvaluator } from '../engine/branch-evaluator.js';
import type { DomainPack } from '../domain-packs/index.js';

export class QuestionBank {
  private allQuestions: Question[];
  private evaluator: BranchEvaluator;

  constructor(activePack?: DomainPack) {
    this.allQuestions = [...questions];
    this.evaluator = new BranchEvaluator();

    if (activePack) {
      this.allQuestions.push(...activePack.questions);

      // Extend REG_002 options with domain pack compliance frameworks
      if (activePack.complianceFrameworks.length > 0) {
        const reg002 = this.allQuestions.find(q => q.id === 'REG_002');
        if (reg002 && reg002.options) {
          for (const fw of activePack.complianceFrameworks) {
            if (!reg002.options.some(o => o.key === fw.key)) {
              reg002.options.push({
                key: fw.key,
                label: fw.label,
                description: fw.description,
              });
            }
          }
        }
      }

      // Re-sort: dimension order first, then question order within dimension
      this.allQuestions.sort((a, b) => {
        const dimA = DIMENSION_ORDER.indexOf(a.dimension);
        const dimB = DIMENSION_ORDER.indexOf(b.dimension);
        if (dimA !== dimB) return dimA - dimB;
        return a.order - b.order;
      });
    }
  }

  getAll(): Question[] {
    return this.allQuestions;
  }

  getById(id: string): Question | undefined {
    return this.allQuestions.find(q => q.id === id);
  }

  getByDimension(dimension: Dimension): Question[] {
    return this.allQuestions
      .filter(q => q.dimension === dimension)
      .sort((a, b) => a.order - b.order);
  }

  /**
   * Visible questions for a dimension. When `role` is supplied (delegation /
   * role-scoped view), additionally keep only questions owned by that role
   * (`respondentOf(q) === role`) or shared (`'any'`). Omitting `role`
   * preserves the original behavior — every visible question — so the default
   * single-pass wizard and golden generation are unchanged.
   */
  getVisibleQuestions(dimension: Dimension, answers: Map<string, Answer>, role?: Respondent): Question[] {
    return this.getByDimension(dimension)
      .filter(q => this.evaluator.shouldShow(q.showConditions, answers))
      .filter(q => this.matchesRole(q, role))
      // Stamp the resolved respondent so clients can render proxy framing
      // ("best answered by your Team Lead") without re-deriving the map.
      .map(q => ({ ...this.applyOptionRelevance(q, answers), respondent: respondentOf(q) }));
  }

  /** True when no role filter is active, the question is shared, or it is owned by `role`. */
  private matchesRole(q: Question, role?: Respondent): boolean {
    if (!role || role === 'any') return true;
    const owner = respondentOf(q);
    return owner === 'any' || owner === role;
  }

  /**
   * Filter a question's options by their `relevantFor` tags. Each tag has the
   * shape `<questionId>:<value>`; an option is kept when at least one tag
   * matches the user's upstream answer (or when no tags are declared).
   * Returns the question untouched if no options carry a relevance tag.
   */
  private applyOptionRelevance(q: Question, answers: Map<string, Answer>): Question {
    if (!q.options || q.options.length === 0) return q;
    const anyTagged = q.options.some(o => o.relevantFor && o.relevantFor.length > 0);
    if (!anyTagged) return q;

    const filtered = q.options.filter(o => {
      if (!o.relevantFor || o.relevantFor.length === 0) return true;
      return o.relevantFor.some(tag => {
        const [refQuestionId, refValue] = tag.split(':');
        if (!refQuestionId || refValue === undefined) return true;
        const upstream = answers.get(refQuestionId);
        if (!upstream) return false;
        const actual = upstream.value;
        if (Array.isArray(actual)) {
          return actual.some(v => String(v).toLowerCase() === refValue.toLowerCase());
        }
        return String(actual).toLowerCase() === refValue.toLowerCase();
      });
    });

    return { ...q, options: filtered };
  }

  getDimensions(): Dimension[] {
    return DIMENSION_ORDER;
  }

  getTotalByDimension(dimension: Dimension): number {
    return this.getByDimension(dimension).length;
  }
}
