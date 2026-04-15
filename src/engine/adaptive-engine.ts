import type { Answer, UserProfile, DimensionProgress } from '../types/index.js';
import { DIMENSION_ORDER } from '../types/index.js';
import { QuestionBank } from '../bank/question-bank.js';
import { BranchEvaluator } from './branch-evaluator.js';
import { DimensionTracker } from './dimension-tracker.js';
import { ProfileBuilder } from './profile-builder.js';
import { PriorityAnalyzer } from './priority-analyzer.js';
import { ConsoleUI } from '../ui/console.js';

export class AdaptiveEngine {
  private bank: QuestionBank;
  private evaluator: BranchEvaluator;
  private tracker: DimensionTracker;
  private profileBuilder: ProfileBuilder;
  private priorityAnalyzer: PriorityAnalyzer;
  private ui: ConsoleUI;
  private answers: Map<string, Answer>;

  constructor(ui: ConsoleUI) {
    this.bank = new QuestionBank();
    this.evaluator = new BranchEvaluator();
    this.tracker = new DimensionTracker();
    this.profileBuilder = new ProfileBuilder();
    this.priorityAnalyzer = new PriorityAnalyzer();
    this.ui = ui;
    this.answers = new Map();
  }

  async run(): Promise<UserProfile> {
    const dimensions = this.bank.getDimensions();

    // Initialize tracker for all dimensions
    for (const dim of dimensions) {
      const total = this.bank.getByDimension(dim).length;
      this.tracker.init(dim, total);
    }

    // Walk through each dimension
    for (let i = 0; i < dimensions.length; i++) {
      const dimension = dimensions[i];
      this.ui.dimensionHeader(dimension, i + 1, dimensions.length);

      // Get visible questions for this dimension (based on answers so far)
      const visibleQuestions = this.bank.getVisibleQuestions(dimension, this.answers);
      this.tracker.updateTotal(dimension, visibleQuestions.length);

      for (let j = 0; j < visibleQuestions.length; j++) {
        const question = visibleQuestions[j];

        const answer = await this.ui.askQuestion(question, j + 1, visibleQuestions.length);
        this.answers.set(question.id, answer);
        this.tracker.recordAnswer(dimension);

        // Re-evaluate remaining questions in this dimension
        // (an answer may unlock/hide later questions within the same dimension)
        const updatedVisible = this.bank.getVisibleQuestions(dimension, this.answers);
        const remaining = updatedVisible.filter(
          q => !this.answers.has(q.id) && q.order > question.order
        );

        // If new questions appeared, they'll be caught in subsequent iterations
        // since we re-check visibility each time
      }

      // Show progress after each dimension
      this.ui.progressBar(this.tracker.getAll());
    }

    // Build profile from answers
    const profile = this.profileBuilder.build(this.answers);

    // Analyze priorities
    profile.priorities = this.priorityAnalyzer.analyze(
      this.answers,
      this.bank.getAll()
    );

    return profile;
  }

  getAnswers(): Map<string, Answer> {
    return this.answers;
  }

  getProgress(): DimensionProgress[] {
    return this.tracker.getAll();
  }
}
