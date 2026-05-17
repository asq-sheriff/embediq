import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  renderScorecard,
  writeScorecard,
} from '../../../src/evaluation/scorecard-renderer.js';
import type { EvaluationReport } from '../../../src/evaluation/types.js';

function makeReport(overrides: Partial<EvaluationReport> = {}): EvaluationReport {
  return {
    reportVersion: 1,
    runId: 'run-test-001',
    startedAt: '2026-05-17T00:00:00.000Z',
    durationMs: 142,
    threshold: 0.75,
    overallScore: 0.8734,
    passed: true,
    archetypes: [
      {
        archetypeId: 'hipaa-developer-strict',
        mode: 'engine-driven',
        overallScore: 0.92,
        passed: true,
        threshold: 0.75,
        checks: [
          {
            id: 'c1',
            category: 'compliance',
            severity: 'critical',
            filePath: 'CLAUDE.md',
            description: 'HIPAA section present',
            score: 1,
            weight: 1,
          },
          {
            id: 'c2',
            category: 'structural',
            severity: 'major',
            filePath: '.claude/settings.json',
            description: 'missing key — permissions',
            score: 0.5,
            weight: 0.8,
          },
        ],
        fileScores: [],
        dimensionScores: [
          { dimension: 'compliance', score: 0.95, weightTotal: 5, checkCount: 5 },
          { dimension: 'security', score: 0.85, weightTotal: 3, checkCount: 3 },
          { dimension: 'structural', score: 0.6, weightTotal: 2, checkCount: 2 },
        ],
        generatorScores: [],
        validatorResult: { passCount: 8, failCount: 0, warningCount: 2 },
        durationMs: 87,
        startedAt: '2026-05-17T00:00:00.000Z',
        generatorVersion: '3.2.0',
      },
    ],
    meta: {
      node: 'v18.17.0',
      platform: 'darwin',
      commitSha: 'abc123def4567890',
    },
    ...overrides,
  };
}

describe('renderScorecard — HTML output', () => {
  it('produces a complete HTML document', async () => {
    const html = await renderScorecard(makeReport());
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('</html>');
    expect(html).toContain('<title>');
    expect(html).toContain('<style>');
  });

  it('includes the overall score and pass/fail status', async () => {
    const html = await renderScorecard(makeReport());
    expect(html).toContain('87.34%');
    expect(html).toContain('PASS');
    expect(html).toContain('status-pass');
  });

  it('renders FAIL when the report did not pass', async () => {
    const html = await renderScorecard(makeReport({ passed: false, overallScore: 0.42 }));
    expect(html).toContain('FAIL');
    expect(html).toContain('status-fail');
    expect(html).toContain('42.00%');
  });

  it('renders each archetype with dimension bars', async () => {
    const html = await renderScorecard(makeReport());
    expect(html).toContain('hipaa-developer-strict');
    expect(html).toContain('compliance');
    expect(html).toContain('security');
    expect(html).toContain('structural');
    expect(html).toContain('dim-bar-fill');
  });

  it('includes provenance metadata in the footer', async () => {
    const html = await renderScorecard(makeReport());
    expect(html).toContain('run-test-001');
    expect(html).toContain('v18.17.0');
    expect(html).toContain('darwin');
    expect(html).toContain('abc123def456');
  });

  it('hides failure details by default', async () => {
    const html = await renderScorecard(makeReport());
    // The .failures-table CSS rule appears regardless; the actual rendered
    // <table class="failures-table"> only appears when includeFailures=true.
    expect(html).not.toContain('<table class="failures-table"');
    expect(html).not.toContain('missing key — permissions');
  });

  it('shows failure details when includeFailures=true', async () => {
    const html = await renderScorecard(makeReport(), { includeFailures: true });
    expect(html).toContain('<table class="failures-table"');
    expect(html).toContain('missing key — permissions');
  });

  it('respects the failure-limit option', async () => {
    const report = makeReport();
    // pad with many failing checks
    report.archetypes[0].checks = Array.from({ length: 20 }, (_, i) => ({
      id: `c${i}`,
      category: 'structural' as const,
      severity: 'minor' as const,
      filePath: `file-${i}.md`,
      description: `failure ${i}`,
      score: 0.4,
      weight: 0.5,
    }));
    const html = await renderScorecard(report, { includeFailures: true, failureLimit: 3 });
    // Count rows in tbody — should be exactly 3
    const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    expect(tbodyMatch).toBeTruthy();
    const rowCount = (tbodyMatch![1].match(/<tr>/g) ?? []).length;
    expect(rowCount).toBe(3);
  });
});

describe('renderScorecard — themes', () => {
  it('defaults to light theme', async () => {
    const html = await renderScorecard(makeReport());
    expect(html).toContain('theme-light');
    expect(html).toContain('--bg:#ffffff');
  });

  it('emits dark theme variables when theme=dark', async () => {
    const html = await renderScorecard(makeReport(), { theme: 'dark' });
    expect(html).toContain('theme-dark');
    expect(html).toContain('--bg:#0f172a');
  });
});

describe('renderScorecard — layouts', () => {
  it('defaults to full layout', async () => {
    const html = await renderScorecard(makeReport());
    expect(html).toContain('layout-full');
    // Full layout uses CSS grid/flex; should not have width="100%" on a <table class="header">
    expect(html).not.toContain('<table class="header"');
  });

  it('uses table-based markup for email-safe layout', async () => {
    const html = await renderScorecard(makeReport(), { layout: 'email-safe' });
    expect(html).toContain('layout-email-safe');
    expect(html).toContain('<table class="header"');
    expect(html).toContain('cellpadding="0"');
  });
});

describe('renderScorecard — TOC', () => {
  it('omits the TOC when there is a single archetype', async () => {
    const html = await renderScorecard(makeReport());
    expect(html).not.toContain('<nav class="toc"');
  });

  it('emits a TOC when there are multiple archetypes', async () => {
    const report = makeReport({
      archetypes: [
        { ...makeReport().archetypes[0], archetypeId: 'arch-a' },
        { ...makeReport().archetypes[0], archetypeId: 'arch-b' },
      ],
    });
    const html = await renderScorecard(report);
    expect(html).toContain('<nav class="toc"');
    expect(html).toContain('href="#archetype-arch-a"');
    expect(html).toContain('href="#archetype-arch-b"');
  });
});

describe('renderScorecard — side-by-side benchmark', () => {
  it('renders a comparison section when candidate is provided', async () => {
    const html = await renderScorecard(makeReport(), {
      candidate: {
        label: 'Claude /init',
        report: makeReport({ overallScore: 0.62, passed: false, runId: 'run-candidate' }),
      },
    });
    expect(html).toContain('comparison');
    expect(html).toContain('Claude /init');
    expect(html).toContain('EmbedIQ');
  });

  it('shows positive delta when EmbedIQ scores higher', async () => {
    const html = await renderScorecard(makeReport(), {
      candidate: {
        label: 'Other',
        report: makeReport({ overallScore: 0.5, passed: false, runId: 'r2' }),
      },
    });
    expect(html).toContain('delta-positive');
    expect(html).toContain('+');
  });

  it('shows negative delta when EmbedIQ scores lower', async () => {
    const html = await renderScorecard(makeReport({ overallScore: 0.5, passed: false }), {
      candidate: {
        label: 'Other',
        report: makeReport({ overallScore: 0.9, passed: true, runId: 'r2' }),
      },
    });
    expect(html).toContain('delta-negative');
  });
});

describe('renderScorecard — custom title and subtitle', () => {
  it('uses the custom title when provided', async () => {
    const html = await renderScorecard(makeReport(), {
      title: 'Acme HealthCo Q3 Compliance Score',
    });
    expect(html).toContain('Acme HealthCo Q3 Compliance Score');
  });

  it('uses the custom subtitle when provided', async () => {
    const html = await renderScorecard(makeReport(), {
      subtitle: 'Internal benchmark · 2026-Q3',
    });
    expect(html).toContain('Internal benchmark · 2026-Q3');
  });

  it('escapes HTML special characters in the title', async () => {
    const html = await renderScorecard(makeReport(), {
      title: '<script>alert("xss")</script>',
    });
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('renderScorecard — determinism', () => {
  it('produces byte-identical output for the same input', async () => {
    const report = makeReport();
    const html1 = await renderScorecard(report, { theme: 'dark', includeFailures: true });
    const html2 = await renderScorecard(report, { theme: 'dark', includeFailures: true });
    expect(html1).toBe(html2);
  });

  it('sorts dimension scores deterministically (alphabetically by name)', async () => {
    const report = makeReport();
    // Shuffle dimensionScores before rendering — output should still be sorted
    report.archetypes[0].dimensionScores = [
      { dimension: 'structural', score: 0.6, weightTotal: 2, checkCount: 2 },
      { dimension: 'compliance', score: 0.95, weightTotal: 5, checkCount: 5 },
      { dimension: 'security', score: 0.85, weightTotal: 3, checkCount: 3 },
    ];
    const html = await renderScorecard(report);
    const compIdx = html.indexOf('>compliance<');
    const secIdx = html.indexOf('>security<');
    const strIdx = html.indexOf('>structural<');
    expect(compIdx).toBeLessThan(secIdx);
    expect(secIdx).toBeLessThan(strIdx);
  });
});

describe('writeScorecard — file output', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'embediq-scorecard-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('writes the HTML to the specified path', async () => {
    const out = join(workDir, 'scorecard.html');
    const returned = await writeScorecard(makeReport(), out);
    const onDisk = await readFile(out, 'utf-8');
    expect(onDisk).toBe(returned);
    expect(onDisk).toMatch(/^<!DOCTYPE html>/);
  });

  it('embeds a logo from a file path as a base64 data URL', async () => {
    // Write a tiny 1x1 PNG (red pixel)
    const pngBytes = Buffer.from(
      '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D49444154789C63F8CFC0500F000005C40103D40D11C40000000049454E44AE426082',
      'hex',
    );
    const logoPath = join(workDir, 'logo.png');
    await writeFile(logoPath, pngBytes);

    const html = await renderScorecard(makeReport(), { logoPath });
    expect(html).toContain('data:image/png;base64,');
    expect(html).toContain('<img class="logo"');
  });
});

describe('renderScorecard — baseline regression', () => {
  it('renders the baseline section when present', async () => {
    const html = await renderScorecard(
      makeReport({
        baseline: {
          previousOverallScore: 0.91,
          delta: -0.04,
          regressions: [{ archetypeId: 'hipaa-developer-strict', delta: -0.08 }],
        },
      }),
    );
    expect(html).toContain('Baseline:');
    expect(html).toContain('91.00%');
    expect(html).toContain('-4.00%');
    expect(html).toContain('Regressions:');
  });
});
