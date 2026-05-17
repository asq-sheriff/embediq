/**
 * Public entry points for rendering customer-facing evaluation scorecards.
 *
 * Two output formats:
 *   - HTML  (always available, no external deps, byte-deterministic)
 *   - PDF   (requires `puppeteer` as an optional peer dependency; uses
 *           dynamic import so the core build never depends on it)
 *
 * The HTML path is fully deterministic — same input → byte-identical
 * output. The PDF path depends on the headless-Chrome rendering pipeline
 * and is intentionally non-deterministic at the pixel level; for
 * regression-testing the structured content, use the HTML output.
 */

import { readFile, writeFile } from 'node:fs/promises';
import type { EvaluationReport } from './types.js';
import {
  renderScorecardHtml,
  type ScorecardLayout,
  type ScorecardTemplateOptions,
  type ScorecardTheme,
} from './scorecard-template.js';

export type { ScorecardLayout, ScorecardTheme };

export interface ScorecardOptions {
  title?: string;
  subtitle?: string;
  theme?: ScorecardTheme;
  layout?: ScorecardLayout;
  /** Path to a logo file (PNG/JPG/SVG); embedded as a data URL. */
  logoPath?: string;
  includeFailures?: boolean;
  failureLimit?: number;
  /** Side-by-side comparison against a candidate evaluation report. */
  candidate?: {
    label: string;
    report: EvaluationReport;
  };
}

/**
 * Render the scorecard as a complete, standalone HTML string. Pure —
 * does no I/O except optionally reading the logo file at the path
 * provided on `options.logoPath` (synchronously via fs/promises).
 *
 * Output is deterministic for the same inputs.
 */
export async function renderScorecard(
  report: EvaluationReport,
  options: ScorecardOptions = {},
): Promise<string> {
  const logoDataUrl = options.logoPath ? await readLogoAsDataUrl(options.logoPath) : undefined;
  const templateOptions: ScorecardTemplateOptions = {
    title: options.title,
    subtitle: options.subtitle,
    theme: options.theme,
    layout: options.layout,
    logoDataUrl,
    includeFailures: options.includeFailures,
    failureLimit: options.failureLimit,
    candidate: options.candidate,
  };
  return renderScorecardHtml(report, templateOptions);
}

/**
 * Render the scorecard and write it to a file on disk. Returns the HTML
 * string written so callers can do additional processing.
 */
export async function writeScorecard(
  report: EvaluationReport,
  outputPath: string,
  options: ScorecardOptions = {},
): Promise<string> {
  const html = await renderScorecard(report, options);
  await writeFile(outputPath, html, 'utf-8');
  return html;
}

/**
 * Render the scorecard as a PDF using a locally-installed headless
 * browser. Requires `puppeteer` to be installed as a peer dependency —
 * `npm install --save-dev puppeteer`. Throws a clear error if the
 * package isn't available.
 *
 * The PDF is rendered from the same HTML that the `renderScorecard()`
 * function produces, so structural content is identical.
 */
export async function renderScorecardPdf(
  report: EvaluationReport,
  outputPath: string,
  options: ScorecardOptions = {},
): Promise<void> {
  const html = await renderScorecard(report, options);
  const pdfBytes = await htmlToPdf(html);
  await writeFile(outputPath, pdfBytes);
}

// ─── Helpers ──────────────────────────────────────────────────────────────

async function readLogoAsDataUrl(path: string): Promise<string> {
  const data = await readFile(path);
  const mime = guessMimeFromPath(path);
  const base64 = data.toString('base64');
  return `data:${mime};base64,${base64}`;
}

function guessMimeFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

async function htmlToPdf(html: string): Promise<Uint8Array> {
  let puppeteer: unknown;
  try {
    // Dynamic import — puppeteer is an optional peer dependency.
    // The core build does not depend on it; only --format pdf does.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = (await import('puppeteer')) as any;
    puppeteer = mod.default ?? mod;
  } catch {
    throw new Error(
      "PDF generation requires the 'puppeteer' package. " +
        "Install it with: npm install --save-dev puppeteer\n" +
        "Or generate HTML instead with --format scorecard and print to PDF from your browser.",
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pp = puppeteer as any;
  const browser = await pp.launch({ headless: 'new' });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '1.5cm', right: '1.5cm', bottom: '1.5cm', left: '1.5cm' },
    });
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}
