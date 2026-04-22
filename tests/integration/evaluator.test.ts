import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, writeFile, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Evaluator } from '../../src/evaluation/evaluator.js';
import { Benchmark } from '../../src/evaluation/benchmark.js';
import { renderText, renderJson } from '../../src/evaluation/reporter.js';
import type { ProgressEvent } from '../../src/evaluation/types.js';

const GOLDEN_ROOT = resolve(__dirname, '../fixtures/golden-configs');

describe('Evaluator end-to-end', () => {
  it('scores built-in archetypes at 100% against their own golden output', async () => {
    const evaluator = new Evaluator();
    const report = await evaluator.evaluateRoot({ archetypesRoot: GOLDEN_ROOT });

    expect(report.passed).toBe(true);
    expect(report.archetypes.length).toBeGreaterThanOrEqual(2);
    for (const archetype of report.archetypes) {
      expect(archetype.overallScore).toBe(1);
      expect(archetype.validatorResult?.failCount ?? 0).toBe(0);
    }
  });

  it('respects the --archetype filter', async () => {
    const evaluator = new Evaluator();
    const report = await evaluator.evaluateRoot({
      archetypesRoot: GOLDEN_ROOT,
      archetypes: ['minimal-developer'],
    });
    expect(report.archetypes).toHaveLength(1);
    expect(report.archetypes[0].archetypeId).toBe('minimal-developer');
  });

  it('records efficiency data in engine-driven mode', async () => {
    const evaluator = new Evaluator();
    const report = await evaluator.evaluateRoot({
      archetypesRoot: GOLDEN_ROOT,
      archetypes: ['minimal-developer'],
    });
    const eff = report.archetypes[0].efficiency;
    expect(eff).toBeDefined();
    expect(eff!.questionsAnswered).toBeGreaterThan(0);
    expect(eff!.questionsPresented).toBeGreaterThanOrEqual(eff!.questionsAnswered);
    expect(eff!.ratio).toBeGreaterThan(0);
    expect(eff!.ratio).toBeLessThanOrEqual(1);
    expect(eff!.efficiencyScore).toBeCloseTo(report.archetypes[0].overallScore * eff!.ratio);
  });

  it('emits progress events in archetype start/score/complete order', async () => {
    const events: ProgressEvent[] = [];
    const evaluator = new Evaluator();
    await evaluator.evaluateRoot({
      archetypesRoot: GOLDEN_ROOT,
      archetypes: ['minimal-developer'],
      onProgress: (event) => events.push(event),
    });
    expect(events.map(e => e.kind)).toEqual([
      'archetype:started',
      'archetype:scored',
      'run:complete',
    ]);
  });

  it('swallows progress-handler exceptions rather than failing the run', async () => {
    const evaluator = new Evaluator();
    const handler = vi.fn().mockImplementation(() => {
      throw new Error('bad handler');
    });
    const report = await evaluator.evaluateRoot({
      archetypesRoot: GOLDEN_ROOT,
      archetypes: ['minimal-developer'],
      onProgress: handler,
    });
    expect(handler).toHaveBeenCalled();
    expect(report.passed).toBe(true);
  });

  it('marks the run as failed when threshold is raised above actual score', async () => {
    // Build a stub archetype that will fail: expected file that will not be generated.
    const root = await mkdtemp(join(tmpdir(), 'embediq-eval-fail-'));
    try {
      const dir = join(root, 'will-fail');
      await mkdir(join(dir, 'expected'), { recursive: true });
      await writeFile(
        join(dir, 'archetype.yaml'),
        'id: will-fail\ntitle: Will Fail\nminimumFloor: 1\n',
        'utf-8',
      );
      await writeFile(
        join(dir, 'answers.yaml'),
        'STRAT_000: developer\nSTRAT_000a: intermediate\nSTRAT_001: test\nSTRAT_002: saas\nOPS_001: solo\nTECH_001:\n  - typescript\nFIN_001: moderate\nREG_001: false\n',
        'utf-8',
      );
      // Expected file that the orchestrator does not produce.
      await writeFile(
        join(dir, 'expected', 'synthetic.md'),
        '# Synthetic file that the orchestrator never emits',
        'utf-8',
      );

      const evaluator = new Evaluator();
      const report = await evaluator.evaluateRoot({ archetypesRoot: root });
      expect(report.passed).toBe(false);
      expect(report.archetypes[0].overallScore).toBeLessThan(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('Benchmark mode', () => {
  it('scores candidate output against the golden configs', async () => {
    // Candidate tree is the golden itself → score should be 1.0.
    const candidateRoot = await mkdtemp(join(tmpdir(), 'embediq-bench-'));
    try {
      await copyTreeToCandidate(
        join(GOLDEN_ROOT, 'minimal-developer', 'expected'),
        join(candidateRoot, 'minimal-developer'),
      );

      const benchmark = new Benchmark();
      const report = await benchmark.run({
        archetypesRoot: GOLDEN_ROOT,
        archetypes: ['minimal-developer'],
        candidateRoot,
        candidateLabel: 'self-as-candidate',
      });

      expect(report.archetypes).toHaveLength(1);
      expect(report.archetypes[0].mode).toBe('benchmark');
      expect(report.archetypes[0].overallScore).toBe(1);
      expect(report.archetypes[0].generatorVersion).toBe('self-as-candidate');
    } finally {
      await rm(candidateRoot, { recursive: true, force: true });
    }
  });

  it('assigns zero score when candidate directory is empty', async () => {
    const candidateRoot = await mkdtemp(join(tmpdir(), 'embediq-bench-empty-'));
    try {
      const benchmark = new Benchmark();
      const report = await benchmark.run({
        archetypesRoot: GOLDEN_ROOT,
        archetypes: ['minimal-developer'],
        candidateRoot,
        candidateLabel: 'empty',
      });
      expect(report.archetypes[0].overallScore).toBe(0);
      expect(report.passed).toBe(false);
    } finally {
      await rm(candidateRoot, { recursive: true, force: true });
    }
  });

  it('supports flat layout when all archetypes share one candidate tree', async () => {
    const candidateRoot = await mkdtemp(join(tmpdir(), 'embediq-bench-flat-'));
    try {
      // Only the minimal-developer golden in a single flat tree.
      await copyTreeToCandidate(
        join(GOLDEN_ROOT, 'minimal-developer', 'expected'),
        candidateRoot,
      );
      const benchmark = new Benchmark();
      const report = await benchmark.run({
        archetypesRoot: GOLDEN_ROOT,
        archetypes: ['minimal-developer'],
        candidateRoot,
        candidateLabel: 'flat-mode',
        candidateLayout: 'flat',
      });
      expect(report.archetypes[0].overallScore).toBe(1);
    } finally {
      await rm(candidateRoot, { recursive: true, force: true });
    }
  });
});

describe('Reporter output', () => {
  it('produces parseable JSON output', async () => {
    const evaluator = new Evaluator();
    const report = await evaluator.evaluateRoot({
      archetypesRoot: GOLDEN_ROOT,
      archetypes: ['minimal-developer'],
    });
    const text = renderJson(report);
    expect(() => JSON.parse(text)).not.toThrow();
    const parsed = JSON.parse(text);
    expect(parsed.reportVersion).toBe(1);
    expect(parsed.archetypes).toHaveLength(1);
  });

  it('renders text output with archetype results', async () => {
    const evaluator = new Evaluator();
    const report = await evaluator.evaluateRoot({
      archetypesRoot: GOLDEN_ROOT,
      archetypes: ['minimal-developer'],
    });
    const text = renderText(report, { noColor: true });
    expect(text).toContain('EmbedIQ Evaluation Report');
    expect(text).toContain('minimal-developer');
    expect(text).toContain('100.00%');
  });
});

describe('Baseline comparison', () => {
  it('reports a negative delta when current overallScore drops below baseline', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'embediq-baseline-'));
    try {
      const baselinePath = join(dir, 'baseline.json');
      // Invent a baseline with a higher overall score for the same archetype.
      const fakeBaseline = {
        reportVersion: 1,
        runId: 'baseline',
        startedAt: '2026-01-01T00:00:00Z',
        durationMs: 0,
        threshold: 0.75,
        overallScore: 1,
        passed: true,
        archetypes: [
          {
            archetypeId: 'minimal-developer',
            mode: 'engine-driven',
            overallScore: 1.1, // impossible in practice, forces a regression
            passed: true,
            threshold: 0.75,
            checks: [],
            fileScores: [],
            dimensionScores: [],
            generatorScores: [],
            durationMs: 0,
            startedAt: '2026-01-01T00:00:00Z',
            generatorVersion: 'baseline',
          },
        ],
        meta: { node: 'v20', platform: 'test' },
      };
      await writeFile(baselinePath, JSON.stringify(fakeBaseline), 'utf-8');

      const evaluator = new Evaluator();
      const report = await evaluator.evaluateRoot({
        archetypesRoot: GOLDEN_ROOT,
        archetypes: ['minimal-developer'],
        baselinePath,
      });
      expect(report.baseline).toBeDefined();
      expect(report.baseline!.regressions).toHaveLength(1);
      expect(report.baseline!.regressions[0].archetypeId).toBe('minimal-developer');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('ignores a missing baseline file', async () => {
    const evaluator = new Evaluator();
    const report = await evaluator.evaluateRoot({
      archetypesRoot: GOLDEN_ROOT,
      archetypes: ['minimal-developer'],
      baselinePath: '/tmp/does-not-exist-embediq-baseline.json',
    });
    expect(report.baseline).toBeUndefined();
  });
});

async function copyTreeToCandidate(src: string, dst: string): Promise<void> {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = join(src, entry.name);
    const to = join(dst, entry.name);
    if (entry.isDirectory()) {
      await mkdir(to, { recursive: true });
      await copyTreeToCandidate(from, to);
      continue;
    }
    if (entry.isFile()) {
      await mkdir(dirname(to), { recursive: true });
      const contents = await readFile(from);
      await writeFile(to, contents);
    }
  }
}
