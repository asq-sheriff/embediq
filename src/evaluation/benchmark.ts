import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { release, platform } from 'node:os';
import type { GeneratedFile } from '../types/index.js';
import {
  loadArchetype,
  discoverArchetypes,
} from './golden-config.js';
import { Scorer } from './scorer.js';
import { EvaluationError } from './types.js';
import type {
  ArchetypeScore,
  EvaluationReport,
  EvaluatorOptions,
  ProgressEvent,
} from './types.js';

const DEFAULT_THRESHOLD = 0.75;
const REPORT_VERSION = 1 as const;

export interface BenchmarkOptions extends EvaluatorOptions {
  /** Root containing archetype subdirectories. */
  archetypesRoot: string;
  /**
   * Candidate directory layout — either a single file tree (all candidate
   * files live directly under `candidateRoot`) or a per-archetype layout
   * where `candidateRoot/<archetypeId>/` holds each candidate's files.
   */
  candidateRoot: string;
  /** Label embedded in the run metadata (e.g. "claude-init", "manual"). */
  candidateLabel: string;
  /** Optional sub-path template — defaults to the archetype id. */
  candidateLayout?: 'per-archetype' | 'flat';
}

/**
 * Score externally-produced configuration files against the same golden
 * references used in engine-driven evaluation. This is the mode that lets
 * a prospect run EmbedIQ's evaluator against whatever configuration they
 * already have — from `/init`, from a shallow generator, or hand-authored.
 */
export class Benchmark {
  private scorer = new Scorer();

  async run(options: BenchmarkOptions): Promise<EvaluationReport> {
    const startedAt = new Date();
    const t0 = performance.now();
    const runId = randomUUID();
    const threshold = options.threshold ?? DEFAULT_THRESHOLD;
    const layout = options.candidateLayout ?? 'per-archetype';

    if (!existsSync(options.candidateRoot)) {
      throw new EvaluationError(
        `Candidate root does not exist: ${options.candidateRoot}`,
      );
    }

    const archetypeDirs = await discoverArchetypes(options.archetypesRoot);
    const filterSet = options.archetypes && options.archetypes.length > 0
      ? new Set(options.archetypes)
      : undefined;

    const archetypeScores: ArchetypeScore[] = [];
    for (const dir of archetypeDirs) {
      const archetype = await loadArchetype(dir);
      if (filterSet && !filterSet.has(archetype.meta.id)) continue;

      emit(options.onProgress, { kind: 'archetype:started', archetypeId: archetype.meta.id });

      const candidateDir = layout === 'flat'
        ? options.candidateRoot
        : join(options.candidateRoot, archetype.meta.id);

      const candidateFiles = existsSync(candidateDir)
        ? await readFileTree(candidateDir)
        : [];

      const t1 = performance.now();
      const result = this.scorer.score({
        generated: candidateFiles,
        expected: archetype.expectedFiles,
        weights: archetype.weights,
      });

      archetypeScores.push({
        archetypeId: archetype.meta.id,
        mode: 'benchmark',
        overallScore: result.overallScore,
        passed: result.overallScore >= threshold,
        threshold,
        checks: result.checks,
        fileScores: result.fileScores,
        dimensionScores: result.dimensionScores,
        generatorScores: result.generatorScores,
        durationMs: Math.round(performance.now() - t1),
        startedAt: new Date().toISOString(),
        generatorVersion: options.candidateLabel,
      });

      emit(options.onProgress, {
        kind: 'archetype:scored',
        archetypeId: archetype.meta.id,
        score: result.overallScore,
      });
    }

    const overallScore = archetypeScores.length === 0
      ? 0
      : archetypeScores.reduce((s, a) => s + a.overallScore, 0) / archetypeScores.length;
    const passed = archetypeScores.length > 0
      && archetypeScores.every(a => a.overallScore >= threshold);

    const report: EvaluationReport = {
      reportVersion: REPORT_VERSION,
      runId,
      startedAt: startedAt.toISOString(),
      durationMs: Math.round(performance.now() - t0),
      threshold,
      overallScore,
      passed,
      archetypes: archetypeScores,
      meta: {
        node: process.version,
        platform: `${platform()} ${release()}`,
        commitSha: process.env.EMBEDIQ_COMMIT_SHA,
      },
    };

    emit(options.onProgress, { kind: 'run:complete', overallScore });
    return report;
  }
}

async function readFileTree(root: string): Promise<GeneratedFile[]> {
  const out: GeneratedFile[] = [];
  const absRoot = resolve(root);
  await walk(absRoot, absRoot, out);
  out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return out;
}

async function walk(root: string, current: string, out: GeneratedFile[]): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(current, entry.name);
    if (entry.isDirectory()) {
      await walk(root, full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const stats = await stat(full);
    if (stats.size === 0 && entry.name === '.gitkeep') continue;
    const content = await readFile(full, 'utf-8');
    const relativePath = relative(root, full).split(/[\\/]+/).join('/');
    out.push({ relativePath, content, description: `candidate:${relativePath}` });
  }
}

function emit(
  handler: ((event: ProgressEvent) => void) | undefined,
  event: ProgressEvent,
): void {
  if (!handler) return;
  try {
    handler(event);
  } catch {
    // Swallow subscriber errors so benchmarking is robust in hostile environments.
  }
}
