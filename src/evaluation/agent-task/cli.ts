/**
 * Agent-effectiveness eval CLI — the LIVE, opt-in runner.
 *
 * Requires Claude Code installed + authenticated. Costs real money (each task
 * runs the agent `2 × trials` times). Not part of CI. See
 * docs/evaluators/agent-effectiveness-eval.md.
 *
 *   npx tsx src/evaluation/agent-task/cli.ts --trials 5 [--tasks <dir>] [--model <id>]
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTasks, liveDeps } from './live-runner.js';
import { runAgentEval } from './harness.js';
import { renderAgentEvalReport } from './render.js';

interface Args {
  tasksDir: string;
  archetypesRoot: string;
  trials: number;
  model?: string;
}

function parse(argv: string[]): Args {
  const a: Args = { tasksDir: 'tests/fixtures/agent-tasks', archetypesRoot: 'tests/fixtures/golden-configs', trials: 5 };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--tasks': a.tasksDir = argv[++i]; break;
      case '--archetypes-root': a.archetypesRoot = argv[++i]; break;
      case '--trials': a.trials = Number.parseInt(argv[++i], 10); break;
      case '--model': a.model = argv[++i]; break;
    }
  }
  return a;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const a = parse(argv);
  const tasks = loadTasks(a.tasksDir);
  if (tasks.length === 0) {
    process.stderr.write(`No tasks found under ${a.tasksDir} (each needs a task.yaml).\n`);
    return 2;
  }
  process.stderr.write(
    `Running ${tasks.length} task(s) × ${a.trials} trials/arm × 2 arms (baseline/treatment) via Claude Code…\n`,
  );
  const report = await runAgentEval(
    tasks,
    liveDeps(resolve(a.archetypesRoot), { model: a.model }),
    a.trials,
    (o) => process.stderr.write(
      `  [${o.taskId} ${o.arm} #${o.trial + 1}] ${o.success ? 'PASS' : 'fail'}  tokens=${o.tokens}${o.error ? '  err=' + o.error : ''}\n`,
    ),
  );
  process.stdout.write(renderAgentEvalReport(report));
  // Exit non-zero only when the config demonstrably HURTS — so a regression is loud.
  return report.overall.verdict === 'hurts' ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().then((code) => process.exit(code)).catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exit(2);
  });
}
