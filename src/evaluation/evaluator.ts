import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { release, platform } from 'node:os';
import { QuestionBank } from '../bank/question-bank.js';
import { ProfileBuilder } from '../engine/profile-builder.js';
import { PriorityAnalyzer } from '../engine/priority-analyzer.js';
import { domainPackRegistry } from '../domain-packs/registry.js';
import { SynthesizerOrchestrator } from '../synthesizer/orchestrator.js';
import { TargetFormat, DEFAULT_TARGETS } from '../synthesizer/target-format.js';
import { validateOutput } from '../synthesizer/output-validator.js';
import { InMemoryEventBus, type EventBus } from '../events/bus.js';
import type { GeneratedFile, SetupConfig, UserProfile, Answer } from '../types/index.js';
import {
  loadArchetype,
  discoverArchetypes,
} from './golden-config.js';
import { Scorer } from './scorer.js';
import { EvaluationError } from './types.js';
import type {
  ArchetypeScore,
  EvaluationMode,
  EvaluationReport,
  EvaluatorOptions,
  LoadedArchetype,
  ProgressEvent,
  QuestionEfficiency,
  ValidatorSummary,
} from './types.js';

const DEFAULT_THRESHOLD = 0.75;
const REPORT_VERSION = 1 as const;

export interface EvaluateDirectoryOptions extends EvaluatorOptions {
  /** Path to the root of archetype directories (tests/fixtures/golden-configs by default). */
  archetypesRoot: string;
  /** Optional path to a previous report for regression detection. */
  baselinePath?: string;
}

/**
 * Walks an archetypes root, scores each archetype against its golden config,
 * and produces an aggregated EvaluationReport.
 */
export class Evaluator {
  private scorer = new Scorer();
  private bus: EventBus;

  constructor(bus: EventBus = new InMemoryEventBus()) {
    this.bus = bus;
  }

  async evaluateRoot(options: EvaluateDirectoryOptions): Promise<EvaluationReport> {
    const startedAt = new Date();
    const t0 = performance.now();
    const runId = randomUUID();
    const threshold = options.threshold ?? DEFAULT_THRESHOLD;
    const mode: EvaluationMode = options.mode ?? 'engine-driven';

    const dirs = await discoverArchetypes(options.archetypesRoot);
    const filterSet = options.archetypes && options.archetypes.length > 0
      ? new Set(options.archetypes)
      : undefined;

    const archetypeScores: ArchetypeScore[] = [];
    for (const dir of dirs) {
      const loaded = await loadArchetype(dir);
      if (filterSet && !filterSet.has(loaded.meta.id)) continue;

      emit(options.onProgress, { kind: 'archetype:started', archetypeId: loaded.meta.id });

      const score = await this.scoreArchetype(loaded, mode, threshold);
      archetypeScores.push(score);

      emit(options.onProgress, {
        kind: 'archetype:scored',
        archetypeId: loaded.meta.id,
        score: score.overallScore,
      });
    }

    const overallScore = archetypeScores.length === 0
      ? 1
      : archetypeScores.reduce((s, a) => s + a.overallScore, 0) / archetypeScores.length;
    const passed = overallScore >= threshold
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

    if (options.baselinePath) {
      report.baseline = await compareToBaseline(report, options.baselinePath);
    }

    emit(options.onProgress, { kind: 'run:complete', overallScore });
    return report;
  }

  /**
   * Score a single archetype: replay answers → build profile → run generators
   * → score against expected files. Efficiency metrics are only populated in
   * engine-driven mode.
   */
  async scoreArchetype(
    archetype: LoadedArchetype,
    mode: EvaluationMode,
    threshold: number,
  ): Promise<ArchetypeScore> {
    const startedAt = new Date();
    const t0 = performance.now();

    const generated = await this.replay(archetype, mode);
    const scoreResult = this.scorer.score({
      generated: generated.files,
      expected: archetype.expectedFiles,
      weights: archetype.weights,
    });

    const efficiency = mode === 'engine-driven'
      ? computeEfficiency(generated.questionsPresented, archetype.answers.size, archetype.meta.minimumFloor, scoreResult.overallScore)
      : undefined;

    const validatorResult = generated.validator;

    return {
      archetypeId: archetype.meta.id,
      mode,
      overallScore: scoreResult.overallScore,
      passed: scoreResult.overallScore >= threshold,
      threshold,
      checks: scoreResult.checks,
      fileScores: scoreResult.fileScores,
      dimensionScores: scoreResult.dimensionScores,
      generatorScores: scoreResult.generatorScores,
      efficiency,
      validatorResult,
      durationMs: Math.round(performance.now() - t0),
      startedAt: startedAt.toISOString(),
      generatorVersion: await resolveGeneratorVersion(),
    };
  }

  private async replay(
    archetype: LoadedArchetype,
    mode: EvaluationMode,
  ): Promise<ReplayResult> {
    const profile = buildProfile(archetype.answers);
    const domainPack = domainPackRegistry.getForIndustry(profile.industry);
    const setup: SetupConfig = {
      profile,
      targetDir: '/evaluation',
      domainPack,
      targets: archetype.meta.targets,
    };

    const questionsPresented = mode === 'engine-driven'
      ? countPresentedQuestions(archetype.answers, domainPack)
      : archetype.answers.size;

    const orchestrator = new SynthesizerOrchestrator(this.bus);
    const files = await orchestrator.generate(setup);

    // The output validator is Claude-specific (it checks for CLAUDE.md,
    // settings.json, hooks, etc.) — skip it when the archetype does not
    // include the Claude target, since those artifacts are structurally
    // absent by design rather than missing.
    const effectiveTargets = archetype.meta.targets && archetype.meta.targets.length > 0
      ? archetype.meta.targets
      : DEFAULT_TARGETS;
    const validatorApplies = effectiveTargets.includes(TargetFormat.CLAUDE);
    const validation = validatorApplies
      ? validateOutput(files, profile, domainPack)
      : { passed: true, checks: [], summary: 'skipped — target does not include Claude' };

    return {
      files,
      questionsPresented,
      validator: {
        passCount: validation.checks.filter(c => c.passed).length,
        failCount: validation.checks.filter(c => !c.passed && c.severity === 'error').length,
        warningCount: validation.checks.filter(c => !c.passed && c.severity === 'warning').length,
      },
    };
  }
}

interface ReplayResult {
  files: GeneratedFile[];
  questionsPresented: number;
  validator: ValidatorSummary;
}

/**
 * Walk the QuestionBank with the archetype's answers in hand and count how
 * many questions the adaptive engine would have presented. This is a headless
 * mirror of AdaptiveEngine.run — any divergence is a test failure we want
 * to catch before it masks efficiency regressions.
 */
function countPresentedQuestions(
  answers: Map<string, Answer>,
  domainPack?: ReturnType<typeof domainPackRegistry.getForIndustry>,
): number {
  const bank = new QuestionBank(domainPack);
  let count = 0;
  for (const dim of bank.getDimensions()) {
    const visible = bank.getVisibleQuestions(dim, answers);
    count += visible.length;
  }
  return count;
}

function buildProfile(answers: Map<string, Answer>): UserProfile {
  // Silence the profile:built event during evaluation — fan-out to the global
  // bus would pollute audit and metrics for concurrent real sessions.
  const silentBus: EventBus = new InMemoryEventBus();
  const builder = new ProfileBuilder(silentBus);
  const profile = builder.build(answers);
  const bank = new QuestionBank(domainPackRegistry.getForIndustry(profile.industry));
  profile.priorities = new PriorityAnalyzer().analyze(answers, bank.getAll());
  return profile;
}

function computeEfficiency(
  presented: number,
  answered: number,
  floor: number,
  qualityScore: number,
): QuestionEfficiency {
  const safePresented = Math.max(1, presented);
  const ratio = Math.min(1, floor / safePresented);
  return {
    questionsPresented: presented,
    questionsAnswered: answered,
    minimumFloor: floor,
    ratio,
    efficiencyScore: qualityScore * ratio,
  };
}

async function compareToBaseline(
  current: EvaluationReport,
  baselinePath: string,
): Promise<EvaluationReport['baseline']> {
  if (!existsSync(baselinePath)) return undefined;
  const raw = await readFile(baselinePath, 'utf-8');
  let parsed: EvaluationReport;
  try {
    parsed = JSON.parse(raw) as EvaluationReport;
  } catch {
    return undefined;
  }
  const previousById = new Map(parsed.archetypes.map(a => [a.archetypeId, a.overallScore]));
  const regressions: Array<{ archetypeId: string; delta: number }> = [];
  for (const a of current.archetypes) {
    const prev = previousById.get(a.archetypeId);
    if (prev == null) continue;
    const delta = a.overallScore - prev;
    if (delta < 0) regressions.push({ archetypeId: a.archetypeId, delta });
  }
  return {
    previousOverallScore: parsed.overallScore,
    delta: current.overallScore - parsed.overallScore,
    regressions,
  };
}

let cachedGeneratorVersion: string | null = null;
async function resolveGeneratorVersion(): Promise<string> {
  if (cachedGeneratorVersion != null) return cachedGeneratorVersion;
  try {
    const url = new URL('../../package.json', import.meta.url);
    const raw = await readFile(url, 'utf-8');
    const pkg = JSON.parse(raw) as { version?: string };
    cachedGeneratorVersion = pkg.version ?? 'unknown';
  } catch {
    cachedGeneratorVersion = 'unknown';
  }
  return cachedGeneratorVersion;
}

function emit(
  handler: ((event: ProgressEvent) => void) | undefined,
  event: ProgressEvent,
): void {
  if (!handler) return;
  try {
    handler(event);
  } catch {
    // Progress handler failures must never fail the evaluation run.
  }
}

export { EvaluationError } from './types.js';
