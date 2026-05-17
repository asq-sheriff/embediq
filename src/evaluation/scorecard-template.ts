/**
 * HTML + CSS templates for customer-facing evaluation scorecards.
 *
 * Pure functions — no I/O, no Date.now(), no random IDs. Determinism is
 * a contract: identical input must produce identical output so scorecard
 * snapshots stay diffable and audit-stamped HTML files re-render
 * byte-identically.
 *
 * Two layouts:
 *   - 'full'       Default. Flex/grid layout, CSS bar charts, optional TOC.
 *   - 'email-safe' Table-only layout, inline styles where helpful. Survives
 *                  email clients that strip CSS.
 *
 * Two themes: 'light' (default), 'dark'.
 *
 * No external assets. Inline `<style>` only. Optional logo is embedded as a
 * data URL by the caller.
 */

import type { ArchetypeScore, EvaluationReport, ScoredCheck } from './types.js';

export type ScorecardTheme = 'light' | 'dark';
export type ScorecardLayout = 'full' | 'email-safe';

export interface ScorecardTemplateOptions {
  title?: string;
  subtitle?: string;
  theme?: ScorecardTheme;
  layout?: ScorecardLayout;
  /** Optional logo as a data URL (`data:image/png;base64,...`) embedded inline. */
  logoDataUrl?: string;
  /** Show the failure-detail tables (default: false for buyer-facing scorecards). */
  includeFailures?: boolean;
  failureLimit?: number;
  /** Side-by-side comparison: render this candidate report alongside the primary. */
  candidate?: {
    label: string;
    report: EvaluationReport;
  };
}

/** Top-level entry point. Returns a complete HTML document. */
export function renderScorecardHtml(
  report: EvaluationReport,
  options: ScorecardTemplateOptions = {},
): string {
  const theme = options.theme ?? 'light';
  const layout = options.layout ?? 'full';
  const title = options.title ?? 'EmbedIQ Evaluation Scorecard';
  const subtitle = options.subtitle ?? defaultSubtitle(report, options.candidate?.label);

  const style = layout === 'email-safe' ? emailSafeStyle(theme) : fullStyle(theme);
  const header = renderHeader(title, subtitle, options.logoDataUrl, layout);
  const summary = renderSummary(report, options.candidate, layout);
  const toc = layout === 'full' && report.archetypes.length > 1
    ? renderToc(report)
    : '';
  const archetypes = report.archetypes
    .map((arch) => renderArchetype(arch, options, layout))
    .join('\n');
  const footer = renderFooter(report);

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${style}</style>
</head><body class="theme-${theme} layout-${layout}">
${header}
${summary}
${toc}
${archetypes}
${footer}
</body></html>`;
}

// ─── Sections ─────────────────────────────────────────────────────────────

function renderHeader(
  title: string,
  subtitle: string,
  logoDataUrl: string | undefined,
  layout: ScorecardLayout,
): string {
  const logo = logoDataUrl
    ? `<img class="logo" src="${escapeAttr(logoDataUrl)}" alt="">`
    : '';

  if (layout === 'email-safe') {
    return `<table class="header" cellpadding="0" cellspacing="0" width="100%">
<tr><td class="header-cell">
${logo}
<h1>${escapeHtml(title)}</h1>
<p class="subtitle">${escapeHtml(subtitle)}</p>
</td></tr></table>`;
  }

  return `<header class="header">
${logo}
<h1>${escapeHtml(title)}</h1>
<p class="subtitle">${escapeHtml(subtitle)}</p>
</header>`;
}

function renderSummary(
  report: EvaluationReport,
  candidate: ScorecardTemplateOptions['candidate'],
  layout: ScorecardLayout,
): string {
  const status = report.passed ? 'pass' : 'fail';
  const statusLabel = report.passed ? 'PASS' : 'FAIL';
  const overallPct = formatPct(report.overallScore);
  const thresholdPct = formatPct(report.threshold);

  let comparison = '';
  if (candidate) {
    const candPassed = candidate.report.passed;
    const candStatus = candPassed ? 'pass' : 'fail';
    const delta = report.overallScore - candidate.report.overallScore;
    const sign = delta >= 0 ? '+' : '';
    const deltaPct = `${sign}${(delta * 100).toFixed(2)}%`;
    const deltaClass = delta >= 0 ? 'delta-positive' : 'delta-negative';

    comparison = `<div class="comparison">
<div class="comparison-row">
<span class="comparison-label">EmbedIQ</span>
<span class="comparison-value status-${status}">${overallPct}</span>
</div>
<div class="comparison-row">
<span class="comparison-label">${escapeHtml(candidate.label)}</span>
<span class="comparison-value status-${candStatus}">${formatPct(candidate.report.overallScore)}</span>
</div>
<div class="comparison-row delta-row">
<span class="comparison-label">Δ</span>
<span class="comparison-value ${deltaClass}">${deltaPct}</span>
</div>
</div>`;
  }

  const baseline = report.baseline ? renderBaseline(report.baseline) : '';

  const tag = layout === 'email-safe' ? 'table' : 'section';
  return `<${tag} class="summary"${layout === 'email-safe' ? ' cellpadding="0" cellspacing="0" width="100%"' : ''}>
<${layout === 'email-safe' ? 'tr><td class="summary-cell"' : 'div class="summary-cell"'}>
<div class="overall-score status-${status}">
<span class="score-number">${overallPct}</span>
<span class="score-label">Overall · ${statusLabel} · threshold ${thresholdPct}</span>
</div>
<dl class="summary-meta">
<dt>Archetypes</dt><dd>${report.archetypes.length}</dd>
<dt>Duration</dt><dd>${report.durationMs} ms</dd>
<dt>Run</dt><dd class="mono">${escapeHtml(report.runId)}</dd>
</dl>
${comparison}
${baseline}
</${layout === 'email-safe' ? 'td></tr></table' : 'div></section'}>`;
}

function renderBaseline(baseline: EvaluationReport['baseline']): string {
  if (!baseline) return '';
  const sign = baseline.delta >= 0 ? '+' : '';
  const deltaPct = `${sign}${(baseline.delta * 100).toFixed(2)}%`;
  const deltaClass = baseline.delta >= 0 ? 'delta-positive' : 'delta-negative';
  const regressions = baseline.regressions.length > 0
    ? `<div class="regressions">
<strong>Regressions:</strong>
<ul>${baseline.regressions.map((r) => `<li>${escapeHtml(r.archetypeId)}: ${(r.delta * 100).toFixed(2)}%</li>`).join('')}</ul>
</div>`
    : '';
  return `<div class="baseline">
<span class="baseline-label">Baseline:</span>
<span class="mono">${formatPct(baseline.previousOverallScore)}</span>
<span class="delta ${deltaClass}">Δ ${deltaPct}</span>
${regressions}
</div>`;
}

function renderToc(report: EvaluationReport): string {
  const items = report.archetypes
    .map((arch) => {
      const slug = slugify(arch.archetypeId);
      const status = arch.passed ? 'pass' : 'fail';
      return `<li><a href="#archetype-${slug}" class="toc-link status-${status}">${escapeHtml(arch.archetypeId)} <span class="toc-score">${formatPct(arch.overallScore)}</span></a></li>`;
    })
    .join('');
  return `<nav class="toc">
<h2>Archetypes</h2>
<ul>${items}</ul>
</nav>`;
}

function renderArchetype(
  archetype: ArchetypeScore,
  options: ScorecardTemplateOptions,
  layout: ScorecardLayout,
): string {
  const slug = slugify(archetype.archetypeId);
  const status = archetype.passed ? 'pass' : 'fail';
  const statusLabel = archetype.passed ? 'PASS' : 'FAIL';

  const dimensions = archetype.dimensionScores
    .filter((d) => d.checkCount > 0)
    .slice()
    .sort((a, b) => a.dimension.localeCompare(b.dimension))
    .map((d) => renderDimensionBar(d.dimension, d.score, d.checkCount, layout))
    .join('');

  const validator = archetype.validatorResult
    ? `<div class="validator">
<span class="badge pass-light">${archetype.validatorResult.passCount} pass</span>
<span class="badge ${archetype.validatorResult.failCount > 0 ? 'fail-light' : 'neutral-light'}">${archetype.validatorResult.failCount} fail</span>
<span class="badge warn-light">${archetype.validatorResult.warningCount} warn</span>
</div>`
    : '';

  const efficiency = archetype.efficiency
    ? `<div class="efficiency">
<span class="efficiency-label">Question efficiency:</span>
<span class="mono">${archetype.efficiency.questionsPresented} presented</span> ·
<span class="mono">${archetype.efficiency.questionsAnswered} answered</span> ·
<span class="mono">floor ${archetype.efficiency.minimumFloor}</span> ·
<span class="mono">${formatPct(archetype.efficiency.efficiencyScore)}</span>
</div>`
    : '';

  const failures = options.includeFailures
    ? renderFailures(archetype.checks, options.failureLimit ?? 10, layout)
    : '';

  const tag = layout === 'email-safe' ? 'table' : 'section';
  return `<${tag} class="archetype" id="archetype-${slug}"${layout === 'email-safe' ? ' cellpadding="0" cellspacing="0" width="100%"' : ''}>
<${layout === 'email-safe' ? 'tr><td class="archetype-cell"' : 'div class="archetype-cell"'}>
<div class="archetype-header">
<h2>${escapeHtml(archetype.archetypeId)}</h2>
<span class="badge status-${status}">${statusLabel} · ${formatPct(archetype.overallScore)}</span>
</div>
<div class="dimensions">
${dimensions}
</div>
${validator}
${efficiency}
${failures}
</${layout === 'email-safe' ? 'td></tr></table' : 'div></section'}>`;
}

function renderDimensionBar(
  dimension: string,
  score: number,
  checkCount: number,
  layout: ScorecardLayout,
): string {
  const widthPct = Math.max(0, Math.min(100, score * 100)).toFixed(2);
  const fillClass = score >= 0.9 ? 'fill-strong' : score >= 0.7 ? 'fill-mid' : 'fill-weak';

  if (layout === 'email-safe') {
    return `<table class="dim-row" cellpadding="0" cellspacing="0" width="100%">
<tr>
<td class="dim-label">${escapeHtml(dimension)}</td>
<td class="dim-bar-cell" width="40%"><div class="dim-bar"><div class="dim-bar-fill ${fillClass}" style="width:${widthPct}%"></div></div></td>
<td class="dim-value mono">${formatPct(score)}</td>
<td class="dim-count">${checkCount} checks</td>
</tr>
</table>`;
  }

  return `<div class="dim-row">
<span class="dim-label">${escapeHtml(dimension)}</span>
<div class="dim-bar"><div class="dim-bar-fill ${fillClass}" style="width:${widthPct}%"></div></div>
<span class="dim-value mono">${formatPct(score)}</span>
<span class="dim-count">${checkCount} checks</span>
</div>`;
}

function renderFailures(
  checks: ScoredCheck[],
  limit: number,
  layout: ScorecardLayout,
): string {
  const failing = checks
    .filter((c) => c.score < 1 && c.weight > 0)
    .slice()
    .sort((a, b) => {
      const w = b.weight - a.weight;
      return w !== 0 ? w : a.score - b.score;
    })
    .slice(0, limit);

  if (failing.length === 0) return '';

  const rows = failing
    .map(
      (c) => `<tr>
<td class="severity-${c.severity}">${c.severity}</td>
<td class="mono">${escapeHtml(c.filePath)}</td>
<td>${escapeHtml(c.description)}</td>
<td class="mono">${formatPct(c.score)}</td>
</tr>`,
    )
    .join('');

  const tag = layout === 'email-safe' ? 'div' : 'details';
  const open = layout === 'email-safe' ? '' : '';
  return `<${tag} class="failures"${open}>
${layout === 'email-safe' ? '<h3>Top failures</h3>' : '<summary>Top failures</summary>'}
<table class="failures-table" cellpadding="0" cellspacing="0">
<thead><tr><th>Severity</th><th>File</th><th>Description</th><th>Score</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</${tag}>`;
}

function renderFooter(report: EvaluationReport): string {
  return `<footer class="provenance">
<p>
<span class="mono">${escapeHtml(report.startedAt)}</span> ·
Run <span class="mono">${escapeHtml(report.runId)}</span> ·
Node <span class="mono">${escapeHtml(report.meta.node)}</span> ·
${escapeHtml(report.meta.platform)}
${report.meta.commitSha ? ` · Git <span class="mono">${escapeHtml(report.meta.commitSha.slice(0, 12))}</span>` : ''}
</p>
<p class="methodology-link">
Methodology: see <code>docs/evaluators/evaluation-methodology.md</code> in the EmbedIQ repository.
</p>
</footer>`;
}

// ─── Styles ───────────────────────────────────────────────────────────────

function fullStyle(theme: ScorecardTheme): string {
  const vars = themeVars(theme);
  return `${vars}
*{box-sizing:border-box}
body{margin:0;padding:2rem;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--text);line-height:1.5;max-width:960px;margin:0 auto}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:0.9em}
.header{margin-bottom:2rem;padding-bottom:1.5rem;border-bottom:2px solid var(--border)}
.header .logo{max-height:48px;margin-bottom:1rem;display:block}
.header h1{margin:0 0 0.25rem 0;font-size:1.75rem;color:var(--text)}
.header .subtitle{margin:0;color:var(--muted);font-size:0.95rem}
.summary{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:1.5rem;margin-bottom:2rem}
.overall-score{display:flex;flex-direction:column;align-items:center;text-align:center;padding-bottom:1rem;border-bottom:1px solid var(--border);margin-bottom:1rem}
.overall-score .score-number{font-size:3rem;font-weight:700;letter-spacing:-0.02em}
.overall-score .score-label{margin-top:0.5rem;color:var(--muted);font-size:0.9rem;text-transform:uppercase;letter-spacing:0.05em}
.overall-score.status-pass .score-number{color:var(--success)}
.overall-score.status-fail .score-number{color:var(--danger)}
.summary-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin:0}
.summary-meta dt{font-size:0.75rem;text-transform:uppercase;color:var(--muted);letter-spacing:0.05em;margin-bottom:0.25rem}
.summary-meta dd{margin:0;font-weight:600}
.comparison{margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border)}
.comparison-row{display:flex;justify-content:space-between;padding:0.4rem 0}
.comparison-label{color:var(--muted)}
.comparison-value{font-weight:600;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.comparison-value.status-pass{color:var(--success)}
.comparison-value.status-fail{color:var(--danger)}
.delta-row{border-top:1px dashed var(--border);margin-top:0.5rem;padding-top:0.75rem}
.delta-positive{color:var(--success)}
.delta-negative{color:var(--danger)}
.baseline{margin-top:1rem;padding:0.75rem;background:var(--bg);border-radius:6px;font-size:0.9rem}
.baseline .regressions{margin-top:0.5rem}
.baseline .regressions ul{margin:0.25rem 0 0 1.25rem;padding:0}
.toc{margin-bottom:2rem;padding:1rem 1.5rem;background:var(--surface);border:1px solid var(--border);border-radius:8px}
.toc h2{margin:0 0 0.75rem 0;font-size:1rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted)}
.toc ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:0.5rem}
.toc-link{display:flex;justify-content:space-between;padding:0.5rem 0.75rem;text-decoration:none;color:var(--text);background:var(--bg);border:1px solid var(--border);border-radius:6px;transition:border-color 0.15s}
.toc-link:hover{border-color:var(--primary)}
.toc-link.status-pass{border-left:3px solid var(--success)}
.toc-link.status-fail{border-left:3px solid var(--danger)}
.toc-score{color:var(--muted);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:0.85rem}
.archetype{margin-bottom:1.5rem;padding:1.5rem;background:var(--surface);border:1px solid var(--border);border-radius:8px}
.archetype-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;padding-bottom:0.75rem;border-bottom:1px solid var(--border)}
.archetype-header h2{margin:0;font-size:1.25rem}
.badge{display:inline-block;padding:0.25rem 0.6rem;border-radius:999px;font-size:0.85rem;font-weight:600;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.badge.status-pass{background:var(--success-bg);color:var(--success)}
.badge.status-fail{background:var(--danger-bg);color:var(--danger)}
.badge.pass-light{background:var(--success-bg);color:var(--success)}
.badge.fail-light{background:var(--danger-bg);color:var(--danger)}
.badge.warn-light{background:var(--warning-bg);color:var(--warning)}
.badge.neutral-light{background:var(--border);color:var(--muted)}
.dimensions{margin-bottom:1rem}
.dim-row{display:grid;grid-template-columns:180px 1fr 80px 100px;align-items:center;gap:1rem;padding:0.4rem 0;border-bottom:1px solid var(--border)}
.dim-row:last-child{border-bottom:none}
.dim-label{color:var(--text);font-size:0.9rem}
.dim-bar{height:8px;background:var(--bg);border-radius:4px;overflow:hidden}
.dim-bar-fill{height:100%;border-radius:4px;transition:width 0.3s}
.dim-bar-fill.fill-strong{background:var(--success)}
.dim-bar-fill.fill-mid{background:var(--warning)}
.dim-bar-fill.fill-weak{background:var(--danger)}
.dim-value{text-align:right;font-weight:600;font-size:0.9rem}
.dim-count{color:var(--muted);font-size:0.8rem}
.validator{display:flex;gap:0.5rem;flex-wrap:wrap;margin:0.75rem 0}
.efficiency{font-size:0.85rem;color:var(--muted);margin:0.5rem 0}
.efficiency-label{font-weight:600;color:var(--text)}
.failures{margin-top:1rem;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:0.75rem 1rem}
.failures summary{cursor:pointer;font-weight:600;font-size:0.9rem}
.failures-table{width:100%;border-collapse:collapse;margin-top:0.5rem;font-size:0.85rem}
.failures-table th{text-align:left;padding:0.4rem 0.5rem;border-bottom:1px solid var(--border);color:var(--muted);font-weight:600;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em}
.failures-table td{padding:0.4rem 0.5rem;border-bottom:1px solid var(--border)}
.severity-critical{color:var(--danger);font-weight:600}
.severity-major{color:var(--warning);font-weight:600}
.severity-minor{color:var(--muted)}
.provenance{margin-top:3rem;padding-top:1.5rem;border-top:1px solid var(--border);color:var(--muted);font-size:0.8rem}
.provenance p{margin:0.25rem 0}
.methodology-link code{background:var(--surface);padding:0.1rem 0.3rem;border-radius:3px;font-size:0.9em}
@media print{body{padding:1rem;max-width:none}.toc-link:hover{border-color:var(--border)}.failures details{open:""}}
@page{margin:1.5cm}`;
}

function emailSafeStyle(theme: ScorecardTheme): string {
  const vars = themeVars(theme);
  return `${vars}
body{margin:0;padding:1rem;font-family:Arial,sans-serif;background:var(--bg);color:var(--text);line-height:1.5}
.mono{font-family:Courier,monospace;font-size:0.9em}
.header,.summary,.archetype{background:var(--surface);border:1px solid var(--border);margin-bottom:1rem;padding:1rem}
.header h1{margin:0;font-size:1.5rem}
.header .subtitle{color:var(--muted)}
.overall-score{text-align:center;padding-bottom:0.75rem;border-bottom:1px solid var(--border);margin-bottom:0.75rem}
.score-number{font-size:2.5rem;font-weight:bold;display:block}
.score-label{color:var(--muted);text-transform:uppercase;font-size:0.85rem}
.status-pass{color:var(--success)}
.status-fail{color:var(--danger)}
.summary-meta{margin:0.5rem 0}
.summary-meta dt{display:inline;font-weight:bold;color:var(--muted);font-size:0.85rem;margin-right:0.25rem}
.summary-meta dd{display:inline;margin:0 1rem 0 0}
.archetype-header{margin-bottom:0.75rem;padding-bottom:0.5rem;border-bottom:1px solid var(--border)}
.archetype-header h2{margin:0;display:inline}
.badge{display:inline-block;padding:0.2rem 0.5rem;border:1px solid var(--border);font-weight:bold;margin-left:0.5rem;font-size:0.85rem}
.badge.status-pass{background:var(--success-bg);color:var(--success);border-color:var(--success)}
.badge.status-fail{background:var(--danger-bg);color:var(--danger);border-color:var(--danger)}
.dim-row{margin-bottom:0.3rem}
.dim-label{display:inline-block;width:30%;font-size:0.9rem}
.dim-bar-cell{padding:0 0.5rem}
.dim-bar{background:var(--bg);border:1px solid var(--border);height:10px}
.dim-bar-fill{height:100%}
.dim-bar-fill.fill-strong{background:var(--success)}
.dim-bar-fill.fill-mid{background:var(--warning)}
.dim-bar-fill.fill-weak{background:var(--danger)}
.dim-value{display:inline-block;width:60px;text-align:right;font-weight:bold}
.dim-count{color:var(--muted);font-size:0.85rem}
.validator{margin:0.5rem 0}
.badge.pass-light{background:var(--success-bg);color:var(--success)}
.badge.fail-light{background:var(--danger-bg);color:var(--danger)}
.badge.warn-light{background:var(--warning-bg);color:var(--warning)}
.badge.neutral-light{background:var(--border);color:var(--muted)}
.failures{margin-top:0.75rem}
.failures-table{width:100%;border-collapse:collapse;font-size:0.85rem}
.failures-table th,.failures-table td{padding:0.3rem;border-bottom:1px solid var(--border);text-align:left}
.severity-critical{color:var(--danger);font-weight:bold}
.severity-major{color:var(--warning)}
.severity-minor{color:var(--muted)}
.provenance{margin-top:2rem;color:var(--muted);font-size:0.8rem;text-align:center}`;
}

function themeVars(theme: ScorecardTheme): string {
  if (theme === 'dark') {
    return `:root{
--bg:#0f172a;--surface:#1e293b;--text:#f1f5f9;--muted:#94a3b8;
--primary:#60a5fa;--success:#4ade80;--warning:#fb923c;--danger:#f87171;
--border:#334155;
--success-bg:rgba(74,222,128,0.12);--warning-bg:rgba(251,146,60,0.12);--danger-bg:rgba(248,113,113,0.12);
}`;
  }
  return `:root{
--bg:#ffffff;--surface:#f8f9fa;--text:#1a1a1a;--muted:#6c757d;
--primary:#2563eb;--success:#16a34a;--warning:#ea580c;--danger:#dc2626;
--border:#e5e7eb;
--success-bg:#ecfdf5;--warning-bg:#fff7ed;--danger-bg:#fef2f2;
}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function defaultSubtitle(report: EvaluationReport, candidateLabel?: string): string {
  const mode = candidateLabel ? `EmbedIQ vs ${candidateLabel}` : 'EmbedIQ evaluation';
  return `${mode} · ${report.archetypes.length} archetype${report.archetypes.length === 1 ? '' : 's'} · ${report.startedAt}`;
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
