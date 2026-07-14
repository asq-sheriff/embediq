/**
 * Agent-effectiveness eval — the "does our output help or hurt?" arbiter.
 *
 * This is NOT 6D. 6D (`evaluate` / `benchmark`) scores generated config against
 * golden references — config-vs-golden *similarity*. It cannot tell you whether
 * that config makes an agent more or less effective. This harness answers the
 * different, empirical question: on real coding tasks, does a bare agent or an
 * agent with EmbedIQ's generated config complete more tasks, at what cost?
 *
 * The result is EMPIRICAL and NON-DETERMINISTIC — it runs a real agent, costs
 * money, and needs enough trials for signal. It therefore lives outside the
 * byte-identical golden suite; only its pure aggregation/verdict logic is
 * unit-tested (against a mock runner). See docs/evaluators/agent-effectiveness-eval.md.
 */

/** One coding task with an objective, machine-checkable success criterion. */
export interface AgentTask {
  id: string;
  /** Human description of the task. */
  description: string;
  /** The instruction handed to the agent. */
  prompt: string;
  /**
   * Path to the starting workspace fixture (copied fresh for each trial). The
   * fixture contains the broken/unimplemented code plus the verification the
   * `verify` step runs.
   */
  workspaceFixture: string;
  /**
   * The EmbedIQ archetype whose generated config the TREATMENT arm injects.
   * Must match the task's stack/domain for a fair comparison — a HIPAA config
   * on a non-healthcare task is not a fair test.
   */
  archetype: string;
  /**
   * Shell command run in the workspace after the agent finishes. Exit 0 = the
   * task's success criterion is met (e.g. `node verify.mjs`). This is the
   * objective, machine-checkable outcome — never a model's self-assessment.
   */
  verifyCommand: string;
  /**
   * Path to the HIDDEN verifier tree, copied into the workspace only AFTER the
   * agent finishes. Keeping it out of the agent's view is essential for
   * compliance-discriminating tasks: the requirement must live in the config
   * (the project rules), not in a test the agent can read and satisfy directly.
   */
  verifyFixture: string;
}

export type Arm = 'baseline' | 'treatment';

/** What the real runner reports back after driving the agent over a workspace. */
export interface AgentRunResult {
  /** Total tokens consumed (input + output) for the run. */
  tokens: number;
  /** Provider-reported cost in USD, when available. */
  costUsd?: number;
  /** Wall-clock of the run in ms. */
  wallMs?: number;
}

/** Drives an agent over a prepared workspace. The expensive, external piece. */
export interface AgentRunner {
  run(input: { workspaceDir: string; prompt: string; arm: Arm }): Promise<AgentRunResult>;
}

/** Checks whether a task's success criterion is met in a workspace. */
export interface TaskVerifier {
  verify(input: { workspaceDir: string; task: AgentTask }): Promise<boolean>;
}

/** Prepares a fresh workspace for one trial (copy fixture; inject config on treatment). */
export interface WorkspacePreparer {
  prepare(input: { task: AgentTask; arm: Arm }): Promise<string>;
  /** Optional cleanup of a prepared workspace. */
  cleanup?(workspaceDir: string): Promise<void>;
}

export interface AgentEvalDeps {
  runner: AgentRunner;
  verifier: TaskVerifier;
  workspace: WorkspacePreparer;
}

/** One trial's result. */
export interface TrialOutcome {
  arm: Arm;
  success: boolean;
  tokens: number;
  costUsd?: number;
  error?: string;
}

/** Aggregated results for one arm of one task. */
export interface ArmResult {
  arm: Arm;
  trials: number;
  successes: number;
  successRate: number;
  meanTokens: number;
  meanCostUsd?: number;
}

export type Verdict = 'helps' | 'hurts' | 'neutral' | 'inconclusive';

/** Baseline-vs-treatment comparison for one task. */
export interface TaskComparison {
  taskId: string;
  archetype: string;
  baseline: ArmResult;
  treatment: ArmResult;
  /** treatment.successRate − baseline.successRate, in [-1, 1]. */
  successDelta: number;
  /** (treatment.meanTokens − baseline.meanTokens) / baseline.meanTokens, or null if baseline is 0. */
  tokenDeltaPct: number | null;
  verdict: Verdict;
}

export interface AgentEvalReport {
  trialsPerArm: number;
  tasks: TaskComparison[];
  overall: {
    meanSuccessDelta: number;
    meanTokenDeltaPct: number | null;
    verdict: Verdict;
    /** True when trial counts are too low for anything but a directional read. */
    directionalOnly: boolean;
  };
}
