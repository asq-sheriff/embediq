export type {
  CheckCategory,
  Severity,
  FileType,
  EvaluationMode,
  ScoredCheck,
  FileScore,
  DimensionScore,
  GeneratorScore,
  QuestionEfficiency,
  ValidatorSummary,
  ArchetypeScore,
  BaselineRegression,
  EvaluationReport,
  Weights,
  ArchetypeMeta,
  GoldenMeta,
  LoadedArchetype,
  ProgressEvent,
  EvaluatorOptions,
} from './types.js';

export { EvaluationError } from './types.js';

export {
  DEFAULT_WEIGHTS,
  mergeWeights,
  loadWeightsFile,
  effectiveWeight,
} from './weights.js';

export {
  GENERATOR_FILE_PATTERNS,
  DIMENSION_FILE_PATTERNS,
  UNCATEGORIZED_DIMENSION,
  getGeneratorForFile,
  getDimensionForFile,
  detectFileType,
} from './archetype-registry.js';

export {
  normalize,
  normalizeMarkdown,
  normalizeText,
  normalizeJson,
  normalizeYaml,
  NormalizationError,
  type NormalizedFile,
} from './normalizers.js';

export {
  getComparatorFor,
  markdownComparator,
  jsonComparator,
  yamlComparator,
  textComparator,
  binaryComparator,
  type Comparator,
  type ComparatorArgs,
} from './file-comparators.js';

export { Scorer, type ScoreInput, type ScoreResult } from './scorer.js';

export {
  loadArchetype,
  discoverArchetypes,
  type LoadArchetypeOptions,
} from './golden-config.js';

export {
  Evaluator,
  type EvaluateDirectoryOptions,
} from './evaluator.js';

export {
  Benchmark,
  type BenchmarkOptions,
} from './benchmark.js';

export {
  renderText,
  renderJson,
  writeReport,
  type ReporterOptions,
  type RenderOptions,
  type ReportFormat,
} from './reporter.js';
