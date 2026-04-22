import type { GeneratedFile } from '../types/index.js';
import {
  UNCATEGORIZED_DIMENSION,
  detectFileType,
  getDimensionForFile,
  getGeneratorForFile,
} from './archetype-registry.js';
import { getComparatorFor } from './file-comparators.js';
import { NormalizationError, normalize } from './normalizers.js';
import { effectiveWeight } from './weights.js';
import type {
  DimensionScore,
  FileScore,
  FileType,
  GeneratorScore,
  ScoredCheck,
  Weights,
} from './types.js';

export interface ScoreInput {
  generated: GeneratedFile[];
  expected: GeneratedFile[];
  weights: Weights;
}

export interface ScoreResult {
  checks: ScoredCheck[];
  fileScores: FileScore[];
  dimensionScores: DimensionScore[];
  generatorScores: GeneratorScore[];
  /** Weighted mean across all checks. 1.0 when there are no checks (vacuously passing). */
  overallScore: number;
}

const UNKNOWN_GENERATOR = 'uncategorized';

export class Scorer {
  constructor(private readonly getComparator = getComparatorFor) {}

  score(input: ScoreInput): ScoreResult {
    const fileScores = this.scoreFiles(input);
    const checks = fileScores.flatMap((fs) => fs.checks);
    return {
      checks,
      fileScores,
      dimensionScores: aggregateByDimension(checks),
      generatorScores: aggregateByGenerator(fileScores),
      overallScore: weightedMean(checks),
    };
  }

  private scoreFiles(input: ScoreInput): FileScore[] {
    const { generated, expected, weights } = input;
    const generatedByPath = indexByPath(generated);
    const expectedByPath = indexByPath(expected);
    const allPaths = new Set([...generatedByPath.keys(), ...expectedByPath.keys()]);

    const fileScores: FileScore[] = [];
    for (const path of allPaths) {
      const exp = expectedByPath.get(path);
      const act = generatedByPath.get(path);
      if (exp && act) {
        fileScores.push(this.scoreMatched(path, exp, act, weights));
      } else if (exp && !act) {
        fileScores.push(scoreMissing(path, weights));
      } else if (!exp && act) {
        fileScores.push(scoreExtra(path, weights));
      }
    }
    return fileScores;
  }

  private scoreMatched(
    path: string,
    expected: GeneratedFile,
    actual: GeneratedFile,
    weights: Weights,
  ): FileScore {
    let expectedPayload: unknown;
    let actualPayload: unknown;
    try {
      expectedPayload = normalize(expected).payload;
      actualPayload = normalize(actual).payload;
    } catch (err) {
      const message =
        err instanceof NormalizationError
          ? err.message
          : `Normalization failed for ${path}`;
      const check: ScoredCheck = {
        id: `${path}#structural.unparseable`,
        category: 'structural',
        severity: 'critical',
        filePath: path,
        description: message,
        score: 0,
        weight: effectiveWeight({
          weights,
          category: 'structural',
          severity: 'critical',
          filePath: path,
        }),
      };
      return {
        filePath: path,
        status: 'matched',
        fileType: detectFileType(path),
        checks: [check],
        score: 0,
        weightTotal: check.weight,
      };
    }

    const comparator = this.getComparator(path);
    const checks = comparator.compare({
      filePath: path,
      expected: expectedPayload,
      actual: actualPayload,
      weights,
    });
    return toFileScore(path, 'matched', comparator.fileType, checks);
  }
}

function indexByPath(files: GeneratedFile[]): Map<string, GeneratedFile> {
  const map = new Map<string, GeneratedFile>();
  for (const f of files) map.set(f.relativePath, f);
  return map;
}

function scoreMissing(path: string, weights: Weights): FileScore {
  const check: ScoredCheck = {
    id: `${path}#structural.missing`,
    category: 'structural',
    severity: 'critical',
    filePath: path,
    description: `Expected file ${path} is missing from the generated set`,
    score: weights.missingFilePenalty,
    weight: effectiveWeight({
      weights,
      category: 'structural',
      severity: 'critical',
      filePath: path,
    }),
  };
  return {
    filePath: path,
    status: 'missing',
    fileType: detectFileType(path),
    checks: [check],
    score: check.score,
    weightTotal: check.weight,
  };
}

function scoreExtra(path: string, weights: Weights): FileScore {
  const penalty = weights.extraFilePenalty;
  const hasPenalty = penalty > 0;
  const check: ScoredCheck = {
    id: `${path}#structural.extra`,
    category: 'structural',
    severity: 'minor',
    filePath: path,
    description: `Generated file ${path} is not in the expected set`,
    score: 1 - penalty,
    // Extra files carry zero weight by default so they never move the aggregate
    // unless the user explicitly raises `extraFilePenalty`.
    weight: hasPenalty
      ? effectiveWeight({
          weights,
          category: 'structural',
          severity: 'minor',
          filePath: path,
        })
      : 0,
  };
  return {
    filePath: path,
    status: 'extra',
    fileType: detectFileType(path),
    checks: [check],
    score: check.score,
    weightTotal: check.weight,
  };
}

function toFileScore(
  path: string,
  status: FileScore['status'],
  fileType: FileType,
  checks: ScoredCheck[],
): FileScore {
  return {
    filePath: path,
    status,
    fileType,
    checks,
    score: weightedMean(checks),
    weightTotal: checks.reduce((sum, c) => sum + c.weight, 0),
  };
}

function weightedMean(checks: ScoredCheck[]): number {
  if (checks.length === 0) return 1;
  let numerator = 0;
  let denominator = 0;
  for (const c of checks) {
    numerator += c.score * c.weight;
    denominator += c.weight;
  }
  if (denominator === 0) return 1;
  return numerator / denominator;
}

function aggregateByDimension(checks: ScoredCheck[]): DimensionScore[] {
  const buckets = new Map<string, ScoredCheck[]>();
  for (const c of checks) {
    const dim = getDimensionForFile(c.filePath) ?? UNCATEGORIZED_DIMENSION;
    const list = buckets.get(dim);
    if (list) list.push(c);
    else buckets.set(dim, [c]);
  }
  const out: DimensionScore[] = [];
  for (const [dimension, list] of buckets) {
    out.push({
      dimension,
      score: weightedMean(list),
      weightTotal: list.reduce((s, c) => s + c.weight, 0),
      checkCount: list.length,
    });
  }
  return out.sort((a, b) => a.dimension.localeCompare(b.dimension));
}

function aggregateByGenerator(fileScores: FileScore[]): GeneratorScore[] {
  const buckets = new Map<string, FileScore[]>();
  for (const fs of fileScores) {
    const gen = getGeneratorForFile(fs.filePath) ?? UNKNOWN_GENERATOR;
    const list = buckets.get(gen);
    if (list) list.push(fs);
    else buckets.set(gen, [fs]);
  }
  const out: GeneratorScore[] = [];
  for (const [generatorName, fileList] of buckets) {
    const allChecks = fileList.flatMap((f) => f.checks);
    out.push({
      generatorName,
      score: weightedMean(allChecks),
      fileScores: fileList,
    });
  }
  return out.sort((a, b) => a.generatorName.localeCompare(b.generatorName));
}
