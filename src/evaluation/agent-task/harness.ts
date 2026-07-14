/**
 * Agent-effectiveness harness. The trial loop is thin; all I/O (workspace prep,
 * agent invocation, verification) is injected, so the aggregation and verdict
 * logic below is pure and unit-tested against a mock runner.
 */

import type {
  AgentEvalDeps,
  AgentEvalReport,
  AgentTask,
  Arm,
  ArmResult,
  TaskComparison,
  TrialOutcome,
  Verdict,
} from './types.js';

/** Below this many trials per arm, a verdict is directional only, never conclusive. */
export const MIN_CONCLUSIVE_TRIALS = 5;
/** Success-rate delta within ±this is "neutral" rather than helps/hurts. */
export const NEUTRAL_BAND = 0.05;

// ─── Pure aggregation + verdict ──────────────────────────────────────────

export function aggregateArm(arm: Arm, outcomes: readonly TrialOutcome[]): ArmResult {
  const trials = outcomes.length;
  const successes = outcomes.filter((o) => o.success).length;
  const meanTokens = trials > 0 ? outcomes.reduce((s, o) => s + o.tokens, 0) / trials : 0;
  const costs = outcomes.filter((o) => o.costUsd != null).map((o) => o.costUsd as number);
  return {
    arm,
    trials,
    successes,
    successRate: trials > 0 ? successes / trials : 0,
    meanTokens,
    meanCostUsd: costs.length > 0 ? costs.reduce((s, c) => s + c, 0) / costs.length : undefined,
  };
}

export function verdictFor(successDelta: number, trials: number): Verdict {
  if (trials < MIN_CONCLUSIVE_TRIALS) return 'inconclusive';
  if (successDelta > NEUTRAL_BAND) return 'helps';
  if (successDelta < -NEUTRAL_BAND) return 'hurts';
  return 'neutral';
}

export function compareArms(taskId: string, archetype: string, baseline: ArmResult, treatment: ArmResult): TaskComparison {
  const successDelta = treatment.successRate - baseline.successRate;
  const tokenDeltaPct = baseline.meanTokens > 0
    ? (treatment.meanTokens - baseline.meanTokens) / baseline.meanTokens
    : null;
  const trials = Math.min(baseline.trials, treatment.trials);
  return { taskId, archetype, baseline, treatment, successDelta, tokenDeltaPct, verdict: verdictFor(successDelta, trials) };
}

export function summarize(trialsPerArm: number, tasks: readonly TaskComparison[]): AgentEvalReport {
  const meanSuccessDelta = mean(tasks.map((t) => t.successDelta));
  const tokenDeltas = tasks.map((t) => t.tokenDeltaPct).filter((v): v is number => v != null);
  const meanTokenDeltaPct = tokenDeltas.length > 0 ? mean(tokenDeltas) : null;
  const directionalOnly = trialsPerArm < MIN_CONCLUSIVE_TRIALS;
  return {
    trialsPerArm,
    tasks: [...tasks],
    overall: {
      meanSuccessDelta,
      meanTokenDeltaPct,
      verdict: directionalOnly ? 'inconclusive' : verdictFor(meanSuccessDelta, trialsPerArm),
      directionalOnly,
    },
  };
}

function mean(xs: readonly number[]): number {
  return xs.length > 0 ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

// ─── Trial loop (thin; all I/O injected) ─────────────────────────────────

/** Optional progress hook, fired once per trial (for CLI observability). */
export type OnTrial = (o: TrialOutcome & { taskId: string; trial: number }) => void;

async function runArm(task: AgentTask, arm: Arm, deps: AgentEvalDeps, trials: number, onTrial?: OnTrial): Promise<ArmResult> {
  const outcomes: TrialOutcome[] = [];
  for (let k = 0; k < trials; k++) {
    let workspaceDir: string | undefined;
    let outcome: TrialOutcome;
    try {
      workspaceDir = await deps.workspace.prepare({ task, arm });
      const run = await deps.runner.run({ workspaceDir, prompt: task.prompt, arm });
      const success = await deps.verifier.verify({ workspaceDir, task });
      outcome = { arm, success, tokens: run.tokens, costUsd: run.costUsd };
    } catch (err) {
      outcome = { arm, success: false, tokens: 0, error: err instanceof Error ? err.message : String(err) };
    } finally {
      if (workspaceDir && deps.workspace.cleanup) await deps.workspace.cleanup(workspaceDir);
    }
    outcomes.push(outcome);
    onTrial?.({ ...outcome, taskId: task.id, trial: k });
  }
  return aggregateArm(arm, outcomes);
}

export async function evaluateTask(task: AgentTask, deps: AgentEvalDeps, trials: number, onTrial?: OnTrial): Promise<TaskComparison> {
  const baseline = await runArm(task, 'baseline', deps, trials, onTrial);
  const treatment = await runArm(task, 'treatment', deps, trials, onTrial);
  return compareArms(task.id, task.archetype, baseline, treatment);
}

export async function runAgentEval(tasks: readonly AgentTask[], deps: AgentEvalDeps, trials: number, onTrial?: OnTrial): Promise<AgentEvalReport> {
  const comparisons: TaskComparison[] = [];
  for (const task of tasks) {
    comparisons.push(await evaluateTask(task, deps, trials, onTrial));
  }
  return summarize(trials, comparisons);
}
