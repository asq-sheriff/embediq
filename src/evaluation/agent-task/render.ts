import type { AgentEvalReport } from './types.js';

function signed(fraction: number): string {
  return `${fraction >= 0 ? '+' : ''}${(fraction * 100).toFixed(1)}`;
}

export function renderAgentEvalReport(r: AgentEvalReport): string {
  const lines: string[] = [];
  lines.push(`Agent-effectiveness eval — ${r.overall.verdict.toUpperCase()}  (trials/arm: ${r.trialsPerArm})`);
  if (r.overall.directionalOnly) {
    lines.push(`  ⚠ directional only — ${r.trialsPerArm} trials/arm is below the conclusive threshold; add trials for signal.`);
  }
  const tok = r.overall.meanTokenDeltaPct;
  lines.push(`  overall: success Δ ${signed(r.overall.meanSuccessDelta)} pts   tokens Δ ${tok == null ? 'n/a' : signed(tok) + '%'}`);
  lines.push('');
  for (const t of r.tasks) {
    lines.push(`  ${t.taskId} [${t.archetype}] → ${t.verdict}`);
    lines.push(
      `      baseline ${t.baseline.successes}/${t.baseline.trials}` +
      `  treatment ${t.treatment.successes}/${t.treatment.trials}` +
      `  |  success Δ ${signed(t.successDelta)} pts` +
      `  tokens Δ ${t.tokenDeltaPct == null ? 'n/a' : signed(t.tokenDeltaPct) + '%'}`,
    );
  }
  return lines.join('\n') + '\n';
}
