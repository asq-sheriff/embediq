import type { Question, Dimension, Answer } from '../types/index.js';
import { DIMENSION_ORDER } from '../types/index.js';
import { questions } from './question-registry.js';
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

  getVisibleQuestions(dimension: Dimension, answers: Map<string, Answer>): Question[] {
    return this.getByDimension(dimension)
      .filter(q => this.evaluator.shouldShow(q.showConditions, answers));
  }

  getDimensions(): Dimension[] {
    return DIMENSION_ORDER;
  }

  getTotalByDimension(dimension: Dimension): number {
    return this.getByDimension(dimension).length;
  }
}
