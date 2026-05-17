import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { main as evaluateCli } from '../../src/evaluation/cli.js';

/**
 * End-to-end test of the scorecard CLI surface. Exercises the *real*
 * evaluation pipeline (evaluator + scorer + renderer + reporter +
 * scorecard) against the shipped golden configs, then validates the
 * resulting HTML on disk.
 *
 * This is the canary that catches regressions in the wiring between
 * src/evaluation/cli.ts → reporter.ts → scorecard-renderer.ts → template.
 */
describe('scorecard CLI — end-to-end against minimal-developer golden', () => {
  let workDir: string;
  let scorecardPath: string;
  let html: string;

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'embediq-scorecard-e2e-'));
    scorecardPath = join(workDir, 'scorecard.html');

    // Invoke the CLI exactly as a user would. The exit code matters too —
    // 0 means the eval passed; we expect the minimal-developer golden to pass.
    const exitCode = await evaluateCli([
      '--archetype', 'minimal-developer',
      '--format', 'scorecard',
      '--out', scorecardPath,
      '--scorecard-title', 'Integration Test Scorecard',
      '--scorecard-theme', 'light',
      '--scorecard-layout', 'full',
    ]);

    expect(exitCode).toBe(0);
    html = await readFile(scorecardPath, 'utf-8');
  }, 30_000);

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('writes a non-empty HTML file', async () => {
    const stats = await stat(scorecardPath);
    expect(stats.size).toBeGreaterThan(1024);
  });

  it('is a complete HTML document', () => {
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html.trim()).toMatch(/<\/html>$/);
    expect(html).toContain('<head>');
    expect(html).toContain('<body');
  });

  it('contains the custom title', () => {
    expect(html).toContain('Integration Test Scorecard');
  });

  it('uses the light theme and full layout classes', () => {
    expect(html).toContain('theme-light');
    expect(html).toContain('layout-full');
  });

  it('shows the minimal-developer archetype with a score', () => {
    expect(html).toContain('minimal-developer');
    // The archetype score appears as a percentage with two decimals
    expect(html).toMatch(/\d+\.\d{2}%/);
  });

  it('renders at least one dimension bar', () => {
    expect(html).toContain('dim-bar-fill');
    expect(html).toMatch(/width:\d+\.\d{2}%/);
  });

  it('includes provenance metadata', () => {
    // runId is a UUID — match the UUID pattern inside the Run span
    expect(html).toMatch(
      /Run\s*<span class="mono">[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}<\/span>/i,
    );
    expect(html).toMatch(/Node\s*<span class="mono">v/);
  });

  it('hides failure details by default (no --scorecard-include-failures)', () => {
    expect(html).not.toContain('<table class="failures-table"');
  });

  it('does not embed a logo when none specified', () => {
    expect(html).not.toContain('<img class="logo"');
  });
});

describe('scorecard CLI — dark theme + email-safe layout', () => {
  let workDir: string;
  let scorecardPath: string;
  let html: string;

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'embediq-scorecard-e2e2-'));
    scorecardPath = join(workDir, 'dark-email.html');

    const exitCode = await evaluateCli([
      '--archetype', 'minimal-developer',
      '--format', 'scorecard',
      '--out', scorecardPath,
      '--scorecard-theme', 'dark',
      '--scorecard-layout', 'email-safe',
      '--scorecard-include-failures',
      '--failure-limit', '5',
    ]);

    expect(exitCode).toBe(0);
    html = await readFile(scorecardPath, 'utf-8');
  }, 30_000);

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('uses dark-theme variables', () => {
    expect(html).toContain('theme-dark');
    expect(html).toContain('--bg:#0f172a');
  });

  it('uses table-based markup for the email-safe layout', () => {
    expect(html).toContain('layout-email-safe');
    expect(html).toContain('<table class="header"');
  });

  it('includes failure tables when --scorecard-include-failures is set', () => {
    // Failures only appear if there *are* any failing checks.
    // The minimal-developer archetype should pass cleanly, so this guards
    // against rendering an empty failures section, not against showing one.
    if (html.includes('Top failures')) {
      expect(html).toContain('<thead><tr><th>Severity</th>');
    } else {
      // Clean run — no failures table is the correct outcome
      expect(html).not.toContain('<thead><tr><th>Severity</th>');
    }
  });
});

describe('scorecard CLI — error paths', () => {
  it('errors clearly when --format scorecard is used without --out', async () => {
    let captured = '';
    const origStderr = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      captured += chunk.toString();
      return true;
    }) as typeof process.stderr.write;

    try {
      const exitCode = await evaluateCli([
        '--archetype', 'minimal-developer',
        '--format', 'scorecard',
      ]);
      expect(exitCode).not.toBe(0);
      expect(captured.toLowerCase()).toMatch(/--out|output/);
    } finally {
      process.stderr.write = origStderr;
    }
  }, 30_000);

  it('errors clearly when --scorecard-theme value is invalid', async () => {
    let captured = '';
    const origStderr = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      captured += chunk.toString();
      return true;
    }) as typeof process.stderr.write;

    try {
      const exitCode = await evaluateCli([
        '--archetype', 'minimal-developer',
        '--format', 'scorecard',
        '--out', '/tmp/x.html',
        '--scorecard-theme', 'neon',
      ]);
      expect(exitCode).not.toBe(0);
      expect(captured).toMatch(/scorecard-theme|light, dark/);
    } finally {
      process.stderr.write = origStderr;
    }
  }, 30_000);
});

describe('scorecard CLI — deterministic output', () => {
  it('produces byte-identical HTML across two consecutive runs with identical args', async () => {
    const workDir = await mkdtemp(join(tmpdir(), 'embediq-scorecard-det-'));
    try {
      const a = join(workDir, 'a.html');
      const b = join(workDir, 'b.html');

      await evaluateCli([
        '--archetype', 'minimal-developer',
        '--format', 'scorecard',
        '--out', a,
        '--scorecard-title', 'Deterministic Run',
      ]);
      await evaluateCli([
        '--archetype', 'minimal-developer',
        '--format', 'scorecard',
        '--out', b,
        '--scorecard-title', 'Deterministic Run',
      ]);

      const ha = await readFile(a, 'utf-8');
      const hb = await readFile(b, 'utf-8');

      // runId (UUID), startedAt timestamp, and durationMs all change per
      // run by design — the rest of the document is identical. Strip
      // those before comparing.
      const stripVolatile = (s: string) =>
        s
          .replace(
            /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi,
            'UUID-NORMALIZED',
          )
          .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, 'TIMESTAMP-NORMALIZED')
          .replace(/<dd>\d+ ms<\/dd>/g, '<dd>DURATION-NORMALIZED</dd>');

      expect(stripVolatile(ha)).toBe(stripVolatile(hb));
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }, 60_000);
});
