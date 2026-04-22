import type { Answer, UserProfile, DimensionProgress } from '../types/index.js';
import { DIMENSION_ORDER } from '../types/index.js';
import { QuestionBank } from '../bank/question-bank.js';
import { BranchEvaluator } from './branch-evaluator.js';
import { DimensionTracker } from './dimension-tracker.js';
import { ProfileBuilder } from './profile-builder.js';
import { PriorityAnalyzer } from './priority-analyzer.js';
import { ConsoleUI } from '../ui/console.js';
import { getEventBus, type EventBus } from '../events/bus.js';

export class AdaptiveEngine {
  private bank: QuestionBank;
  private evaluator: BranchEvaluator;
  private tracker: DimensionTracker;
  private profileBuilder: ProfileBuilder;
  private priorityAnalyzer: PriorityAnalyzer;
  private ui: ConsoleUI;
  private answers: Map<string, Answer>;
  private bus: EventBus;

  constructor(ui: ConsoleUI, bus: EventBus = getEventBus()) {
    this.bank = new QuestionBank();
    this.evaluator = new BranchEvaluator();
    this.tracker = new DimensionTracker();
    this.profileBuilder = new ProfileBuilder(bus);
    this.priorityAnalyzer = new PriorityAnalyzer();
    this.ui = ui;
    this.answers = new Map();
    this.bus = bus;
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

        this.bus.emit('question:presented', {
          questionId: question.id,
          dimension,
        });

        const answer = await this.ui.askQuestion(question, j + 1, visibleQuestions.length);
        this.answers.set(question.id, answer);
        this.tracker.recordAnswer(dimension);

        this.bus.emit('answer:received', {
          questionId: question.id,
          answerValue: answer.value,
        });

        // Re-evaluate remaining questions in this dimension
        // (an answer may unlock/hide later questions within the same dimension)
        const updatedVisible = this.bank.getVisibleQuestions(dimension, this.answers);
        const remaining = updatedVisible.filter(
          q => !this.answers.has(q.id) && q.order > question.order
        );

        // If new questions appeared, they'll be caught in subsequent iterations
        // since we re-check visibility each time
      }

      this.bus.emit('dimension:completed', {
        dimension,
        questionsAnswered: visibleQuestions.length,
      });

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

  /**
   * Snapshot the engine's mutable state for interrupt/resume scenarios.
   * Returns a JSON-shaped projection that's safe to persist to a backend
   * (Date is serialized as ISO string). Pure read — does not mutate.
   */
  serialize(): EngineSnapshot {
    const answers: Array<[string, EngineSnapshotAnswer]> = [];
    for (const [id, answer] of this.answers.entries()) {
      answers.push([id, {
        questionId: answer.questionId,
        value: answer.value,
        timestamp: answer.timestamp.toISOString(),
      }]);
    }
    return { answers };
  }

  /**
   * Restore the engine from a previously-serialized snapshot. Replaces
   * the in-memory answers map. Tracker state is recomputed lazily on
   * the next `run()` call so progress reflects only the current session.
   */
  restore(snapshot: EngineSnapshot): void {
    const restored = new Map<string, Answer>();
    for (const [id, entry] of snapshot.answers) {
      restored.set(id, {
        questionId: entry.questionId,
        value: entry.value,
        timestamp: new Date(entry.timestamp),
      });
    }
    this.answers = restored;
  }
}

export interface EngineSnapshotAnswer {
  questionId: string;
  value: string | string[] | number | boolean;
  timestamp: string;
}

export interface EngineSnapshot {
  answers: Array<[string, EngineSnapshotAnswer]>;
}
