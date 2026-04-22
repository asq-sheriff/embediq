import chalk from 'chalk';
import type { DriftEntry, DriftReport, DriftStatus } from './drift-detector.js';

export type DriftReportFormat = 'text' | 'json';

export interface RenderDriftOptions {
  noColor?: boolean;
  /** Include full expected/on-disk content in the text output — defaults to false. */
  showContent?: boolean;
}

type ChalkLike = typeof chalk;

export function renderDriftJson(report: DriftReport): string {
  return JSON.stringify(report, null, 2) + '\n';
}

export function renderDriftText(
  report: DriftReport,
  options: RenderDriftOptions = {},
): string {
  const color = options.noColor ? passthroughChalk() : chalk;
  const lines: string[] = [];

  const status = report.clean ? color.green('CLEAN') : color.yellow('DRIFT');
  lines.push('');
  lines.push(color.bold('EmbedIQ Drift Report'));
  lines.push(`  Status:  ${status}`);
  lines.push(`  Target:  ${report.targetDir}`);
  lines.push(`  Answers: ${report.answerSource}`);
  lines.push(`  Version: v${report.embediqVersion}  Generated: ${report.generatedAt}`);
  lines.push('');

  const t = report.totals;
  lines.push(color.dim(
    `  Totals: ${t.match} match · ${t.missing} missing · `
      + `${t.modifiedByUser} modified-by-user · ${t.modifiedStaleStamp} modified-stale-stamp · `
      + `${t.versionMismatch} version-mismatch · ${t.extra} extra`,
  ));
  lines.push('');

  if (report.clean) {
    lines.push(color.green('  ✓ No drift detected — target is in sync with expected generation.'));
    lines.push('');
    return lines.join('\n');
  }

  const order: DriftStatus[] = [
    'missing',
    'modified-by-user',
    'modified-stale-stamp',
    'version-mismatch',
    'extra',
  ];
  for (const status of order) {
    const group = report.entries.filter((e) => e.status === status);
    if (group.length === 0) continue;
    lines.push(color.bold(`  ${labelFor(status)} (${group.length})`));
    for (const entry of group) {
      lines.push(`    ${statusIcon(status, color)} ${color.bold(entry.relativePath)}`);
      lines.push(color.dim(`        ${entry.summary}`));
      if (options.showContent) {
        if (entry.expectedContent) {
          lines.push(color.dim('        expected:'));
          lines.push(indent(entry.expectedContent, '          '));
        }
        if (entry.onDiskContent) {
          lines.push(color.dim('        on-disk:'));
          lines.push(indent(entry.onDiskContent, '          '));
        }
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

function labelFor(status: DriftStatus): string {
  switch (status) {
    case 'match':                return 'In sync';
    case 'missing':              return 'Missing files';
    case 'modified-by-user':     return 'Modified by user (no EmbedIQ stamp)';
    case 'modified-stale-stamp': return 'Modified after generation';
    case 'version-mismatch':     return 'Older EmbedIQ version on disk';
    case 'extra':                return 'Extra files in managed subtree';
  }
}

function statusIcon(status: DriftStatus, color: ChalkLike): string {
  switch (status) {
    case 'match':                return color.green('✓');
    case 'missing':              return color.red('✗');
    case 'modified-by-user':     return color.yellow('!');
    case 'modified-stale-stamp': return color.yellow('!');
    case 'version-mismatch':     return color.cyan('↓');
    case 'extra':                return color.magenta('+');
  }
}

function indent(text: string, prefix: string): string {
  return text.split('\n').map((l) => prefix + l).join('\n');
}

function passthroughChalk(): ChalkLike {
  const identity = (s: string) => s;
  const handler: ProxyHandler<object> = { get: () => identity };
  return new Proxy({}, handler) as ChalkLike;
}
