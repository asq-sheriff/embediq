import type { Answer, GeneratedFile } from '../types/index.js';

/**
 * Orthogonal scoring taxonomy — distinct from `OutputValidator`'s check
 * categories so the scorer can compose different file-content concerns
 * (e.g. a security-severity structural check about a missing permission
 * block in settings.json) without being bound to validator semantics.
 */
export type CheckCategory =
  | 'compliance'
  | 'security'
  | 'structural'
  | 'content'
  | 'configuration'
  | 'style';

export type Severity = 'critical' | 'major' | 'minor';

export type FileType = 'markdown' | 'json' | 'yaml' | 'text' | 'binary';

export type EvaluationMode = 'engine-driven' | 'direct' | 'benchmark';

export interface ScoredCheck {
  id: string;
  category: CheckCategory;
  severity: Severity;
  filePath: string;
  description: string;
  /** Raw similarity, 0 through 1. Effective weight is applied during aggregation. */
  score: number;
  weight: number;
  details?: {
    expected?: string;
    actual?: string;
    diffSummary?: string;
  };
}

export interface FileScore {
  filePath: string;
  status: 'matched' | 'missing' | 'extra';
  fileType: FileType;
  checks: ScoredCheck[];
  /** Weighted mean of this file's checks, 0 through 1. */
  score: number;
  weightTotal: number;
}

export interface DimensionScore {
  dimension: string;
  score: number;
  weightTotal: number;
  checkCount: number;
}

export interface GeneratorScore {
  generatorName: string;
  score: number;
  fileScores: FileScore[];
}

export interface QuestionEfficiency {
  questionsPresented: number;
  questionsAnswered: number;
  /** Hand-declared floor from archetype.yaml — "fewest questions needed for a correct config". */
  minimumFloor: number;
  /** `min(1, floor / max(1, presented))` — saturates at 1 when at-or-below floor. */
  ratio: number;
  /** `qualityScore × ratio`. Collapses if quality collapses. */
  efficiencyScore: number;
}

export interface ValidatorSummary {
  passCount: number;
  failCount: number;
  warningCount: number;
}

export interface ArchetypeScore {
  archetypeId: string;
  mode: EvaluationMode;
  overallScore: number;
  passed: boolean;
  threshold: number;
  checks: ScoredCheck[];
  fileScores: FileScore[];
  dimensionScores: DimensionScore[];
  generatorScores: GeneratorScore[];
  /** Populated only in engine-driven mode. */
  efficiency?: QuestionEfficiency;
  validatorResult?: ValidatorSummary;
  durationMs: number;
  startedAt: string;
  generatorVersion: string;
}

export interface BaselineRegression {
  previousOverallScore: number;
  delta: number;
  regressions: Array<{ archetypeId: string; delta: number }>;
}

export interface EvaluationReport {
  /** Schema version — bumped on breaking output changes. */
  reportVersion: 1;
  runId: string;
  startedAt: string;
  durationMs: number;
  threshold: number;
  overallScore: number;
  passed: boolean;
  archetypes: ArchetypeScore[];
  baseline?: BaselineRegression;
  meta: {
    node: string;
    platform: string;
    commitSha?: string;
  };
}

export interface Weights {
  byCategory: Record<CheckCategory, number>;
  bySeverity: Record<Severity, number>;
  byFile?: Record<string, number>;
  missingFilePenalty: number;
  extraFilePenalty: number;
}

export interface ArchetypeMeta {
  id: string;
  title: string;
  minimumFloor: number;
  answerSetPath: string;
  expectedDir: string;
  description?: string;
  /**
   * Output targets this archetype exercises. Omit to use the default
   * (Claude only). Archetypes that benchmark multi-agent output set this
   * to the target list they want the evaluator to feed the orchestrator.
   */
  targets?: import('../synthesizer/target-format.js').TargetFormat[];
}

export interface GoldenMeta {
  reviewer?: string;
  reviewedAt?: string;
  generatorSha?: string;
  generatorVersion?: string;
  notes?: string;
}

export interface LoadedArchetype {
  meta: ArchetypeMeta;
  answers: Map<string, Answer>;
  expectedFiles: GeneratedFile[];
  weights: Weights;
  goldenMeta: GoldenMeta;
}

export type ProgressEvent =
  | { kind: 'archetype:started'; archetypeId: string }
  | { kind: 'archetype:scored'; archetypeId: string; score: number }
  | { kind: 'run:complete'; overallScore: number };

export interface EvaluatorOptions {
  mode?: EvaluationMode;
  threshold?: number;
  archetypes?: string[];
  baselinePath?: string;
  onProgress?: (event: ProgressEvent) => void;
}

export class EvaluationError extends Error {
  constructor(message: string, readonly archetypeId?: string) {
    super(message);
    this.name = 'EvaluationError';
  }
}
