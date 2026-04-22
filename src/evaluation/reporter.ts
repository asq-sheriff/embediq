import { writeFile } from 'node:fs/promises';
import chalk from 'chalk';
import type {
  ArchetypeScore,
  EvaluationReport,
  ScoredCheck,
  Severity,
} from './types.js';

export type ReportFormat = 'text' | 'json';

export interface RenderOptions {
  /** When true, list up to `failureLimit` failing checks per archetype. */
  showFailures?: boolean;
  failureLimit?: number;
  /** Suppress ANSI escapes (useful for CI logs or when stdout is piped). */
  noColor?: boolean;
}

export interface ReporterOptions extends RenderOptions {
  format: ReportFormat;
  /** Write JSON output here when format === 'json'. Defaults to stdout. */
  jsonPath?: string;
}

/** Render a human-readable summary suitable for stdout. */
export function renderText(report: EvaluationReport, options: RenderOptions = {}): string {
  const color = options.noColor ? passthroughChalk() : chalk;
  const lines: string[] = [];

  const status = report.passed ? color.green('PASS') : color.red('FAIL');
  lines.push('');
  lines.push(color.bold('EmbedIQ Evaluation Report'));
  lines.push(
    `  Overall: ${status}  ${pct(report.overallScore)}  (threshold ${pct(report.threshold)})`,
  );
  lines.push(
    `  Archetypes: ${report.archetypes.length}  Duration: ${report.durationMs}ms  Run: ${report.runId}`,
  );
  lines.push(`  Node: ${report.meta.node}  Platform: ${report.meta.platform}`);
  if (report.baseline) {
    const sign = report.baseline.delta >= 0 ? '+' : '';
    const deltaStr = `${sign}${(report.baseline.delta * 100).toFixed(2)}%`;
    const deltaColor = report.baseline.delta < 0 ? color.red : color.green;
    lines.push(
      `  Baseline: ${pct(report.baseline.previousOverallScore)}  Delta: ${deltaColor(deltaStr)}`,
    );
    if (report.baseline.regressions.length > 0) {
      lines.push(
        color.red(`  Regressions: ${report.baseline.regressions.length}`),
      );
      for (const r of report.baseline.regressions) {
        lines.push(
          color.red(`    - ${r.archetypeId}: ${(r.delta * 100).toFixed(2)}%`),
        );
      }
    }
  }

  lines.push('');
  for (const archetype of report.archetypes) {
    lines.push(...renderArchetype(archetype, color, options));
  }

  return lines.join('\n') + '\n';
}

function renderArchetype(
  archetype: ArchetypeScore,
  color: ChalkLike,
  options: RenderOptions,
): string[] {
  const status = archetype.passed ? color.green('PASS') : color.red('FAIL');
  const lines: string[] = [];
  lines.push(
    `  ${status}  ${color.bold(archetype.archetypeId)}  ${pct(archetype.overallScore)}  [${archetype.mode}]`,
  );

  const validator = archetype.validatorResult;
  if (validator) {
    const failTag = validator.failCount > 0
      ? color.red(`${validator.failCount} fail`)
      : color.dim('0 fail');
    lines.push(
      `      validator: ${color.green(`${validator.passCount} pass`)}  ${failTag}  ${color.yellow(`${validator.warningCount} warn`)}`,
    );
  }

  if (archetype.efficiency) {
    const eff = archetype.efficiency;
    lines.push(
      `      efficiency: presented=${eff.questionsPresented}  answered=${eff.questionsAnswered}  floor=${eff.minimumFloor}  score=${pct(eff.efficiencyScore)}`,
    );
  }

  const dimRows = archetype.dimensionScores
    .filter(d => d.checkCount > 0)
    .sort((a, b) => a.score - b.score);
  if (dimRows.length > 0) {
    lines.push(color.dim('      dimensions:'));
    for (const d of dimRows) {
      lines.push(`        - ${d.dimension}: ${pct(d.score)}  (${d.checkCount} checks)`);
    }
  }

  if (options.showFailures) {
    const failures = findFailures(archetype.checks, options.failureLimit ?? 10);
    if (failures.length > 0) {
      lines.push(color.dim('      top failures:'));
      for (const check of failures) {
        const sev = severityColor(check.severity, color);
        lines.push(
          `        - ${sev(check.severity)}  ${check.filePath}  ${check.description}  ${pct(check.score)}`,
        );
      }
    }
  }

  lines.push('');
  return lines;
}

function findFailures(checks: ScoredCheck[], limit: number): ScoredCheck[] {
  const failing = checks.filter(c => c.score < 1 && c.weight > 0);
  failing.sort((a, b) => {
    const weightDelta = b.weight - a.weight;
    if (weightDelta !== 0) return weightDelta;
    return a.score - b.score;
  });
  return failing.slice(0, limit);
}

/** Emit the full report as JSON. Deterministic key order for diffable snapshots. */
export function renderJson(report: EvaluationReport): string {
  return JSON.stringify(report, null, 2) + '\n';
}

/**
 * Write a report in the requested format. When format === 'text' and no path
 * is given, returns the rendered text for the caller to print.
 */
export async function writeReport(
  report: EvaluationReport,
  options: ReporterOptions,
): Promise<string> {
  if (options.format === 'json') {
    const serialized = renderJson(report);
    if (options.jsonPath) {
      await writeFile(options.jsonPath, serialized, 'utf-8');
    }
    return serialized;
  }
  return renderText(report, options);
}

// ─── helpers ──────────────────────────────────────────────────────────────

function pct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

type ChalkLike = typeof chalk;

function severityColor(
  severity: Severity,
  color: ChalkLike,
): (s: string) => string {
  switch (severity) {
    case 'critical':
      return color.red;
    case 'major':
      return color.yellow;
    case 'minor':
    default:
      return color.dim;
  }
}

/**
 * A chalk-compatible stub that passes strings through unmodified. Used when
 * the caller opts out of ANSI color (e.g. CI logs or piped stdout).
 */
function passthroughChalk(): ChalkLike {
  const identity = (s: string) => s;
  const handler: ProxyHandler<object> = {
    get: () => identity,
  };
  return new Proxy({}, handler) as ChalkLike;
}
