import { describe, it, expect } from 'vitest';
import {
  aggregateArm,
  verdictFor,
  compareArms,
  evaluateTask,
  runAgentEval,
  MIN_CONCLUSIVE_TRIALS,
} from '../../src/evaluation/agent-task/harness.js';
import type { AgentEvalDeps, AgentTask, TrialOutcome } from '../../src/evaluation/agent-task/types.js';

const TASK: AgentTask = {
  id: 'demo',
  description: 'demo task',
  prompt: 'do the thing',
  workspaceFixture: '/fixtures/demo/workspace',
  verifyFixture: '/fixtures/demo/verify',
  archetype: 'minimal-developer',
  verifyCommand: 'node verify.mjs',
};

/** Mock deps: verifier replays preset success arrays per arm; runner reports arm-based tokens. */
function mkDeps(cfg: {
  baseline: boolean[];
  treatment: boolean[];
  tokens?: { baseline: number; treatment: number };
  throwOn?: 'baseline' | 'treatment';
}): AgentEvalDeps {
  const b = [...cfg.baseline];
  const t = [...cfg.treatment];
  const tok = cfg.tokens ?? { baseline: 1000, treatment: 1000 };
  return {
    workspace: { prepare: async ({ arm }) => `ws://${arm}` },
    runner: {
      run: async ({ arm }) => {
        if (cfg.throwOn === arm) throw new Error('agent crashed');
        return { tokens: arm === 'treatment' ? tok.treatment : tok.baseline };
      },
    },
    verifier: {
      verify: async ({ workspaceDir }) =>
        (workspaceDir.includes('treatment') ? t : b).shift() ?? false,
    },
  };
}

describe('pure aggregation + verdict', () => {
  it('aggregates success rate and mean tokens', () => {
    const outcomes: TrialOutcome[] = [
      { arm: 'baseline', success: true, tokens: 900 },
      { arm: 'baseline', success: false, tokens: 1100 },
    ];
    const r = aggregateArm('baseline', outcomes);
    expect(r.successRate).toBe(0.5);
    expect(r.meanTokens).toBe(1000);
  });

  it('is inconclusive below the minimum trial count regardless of delta', () => {
    expect(verdictFor(1.0, MIN_CONCLUSIVE_TRIALS - 1)).toBe('inconclusive');
    expect(verdictFor(1.0, MIN_CONCLUSIVE_TRIALS)).toBe('helps');
  });

  it('classifies helps / hurts / neutral within the neutral band', () => {
    expect(verdictFor(0.2, 10)).toBe('helps');
    expect(verdictFor(-0.2, 10)).toBe('hurts');
    expect(verdictFor(0.02, 10)).toBe('neutral');
  });

  it('computes token delta as a fraction of baseline', () => {
    const cmp = compareArms('t', 'a',
      aggregateArm('baseline', [{ arm: 'baseline', success: true, tokens: 1000 }]),
      aggregateArm('treatment', [{ arm: 'treatment', success: true, tokens: 1230 }]));
    expect(cmp.tokenDeltaPct).toBeCloseTo(0.23, 5);
  });
});

describe('trial loop (mock runner)', () => {
  it('measures a treatment that helps', async () => {
    const deps = mkDeps({ baseline: [false, false, false, false, false], treatment: [true, true, true, true, true] });
    const cmp = await evaluateTask(TASK, deps, 5);
    expect(cmp.baseline.successRate).toBe(0);
    expect(cmp.treatment.successRate).toBe(1);
    expect(cmp.successDelta).toBe(1);
    expect(cmp.verdict).toBe('helps');
  });

  it('measures a treatment that hurts', async () => {
    const deps = mkDeps({ baseline: [true, true, true, true, true], treatment: [false, false, false, false, false] });
    const cmp = await evaluateTask(TASK, deps, 5);
    expect(cmp.successDelta).toBe(-1);
    expect(cmp.verdict).toBe('hurts');
  });

  it('counts an agent crash as a failed trial, not a thrown eval', async () => {
    const deps = mkDeps({ baseline: [true, true], treatment: [true, true], throwOn: 'treatment' });
    const cmp = await evaluateTask(TASK, deps, 2);
    expect(cmp.treatment.successes).toBe(0); // crashes => failures
    expect(cmp.baseline.successes).toBe(2);
  });

  it('rolls tasks up into an overall verdict, marked directional at low trial counts', async () => {
    const deps = mkDeps({ baseline: [false, false], treatment: [true, true] });
    const report = await runAgentEval([TASK], deps, 2);
    expect(report.overall.directionalOnly).toBe(true);
    expect(report.overall.verdict).toBe('inconclusive'); // 2 < MIN_CONCLUSIVE_TRIALS
    expect(report.overall.meanSuccessDelta).toBe(1);
  });
});
