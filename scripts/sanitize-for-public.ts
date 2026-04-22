#!/usr/bin/env -S npx tsx
/**
 * sanitize-for-public — produce the public-safe subset of the repo.
 *
 * Reads every markdown file's `<!-- audience: public | private -->`
 * directive at line 1, copies public-tagged files (and every non-
 * markdown file by default, minus an explicit exclude list) into an
 * output directory, and runs a leak-marker scan over the public
 * surface. Designed to be run as part of the release flow before
 * pushing the sanitized tree to the public `embediq/main` branch.
 *
 * Modes:
 *   --dry-run (default)   — print what would happen; write nothing
 *   --out <dir>           — required when not dry-run; writes there
 *   --strict              — exit 1 on any leak marker (CI-friendly)
 *
 * Exit codes:
 *   0   clean (or dry-run reported clean)
 *   1   leak markers found, or --strict and any warning
 *   2   configuration error (missing --out, missing source dir, etc.)
 */
import { promises as fs } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

// ─── Config ───────────────────────────────────────────────────────────────

interface Options {
  sourceRoot: string;
  outDir?: string;
  dryRun: boolean;
  strict: boolean;
  noColor: boolean;
}

/** Directories never walked. Mostly runtime artifacts and gitignored content. */
const SKIP_DIRS: readonly string[] = [
  'node_modules',
  'dist',
  '.git',
  '.embediq',
  'out',
  '.idea',
  '.vscode',
  'coverage',
];

/**
 * Files / directories that ship publicly even when their contents are
 * not markdown — explicit allowlist by the path-prefix check below.
 *
 * Anything matching one of these EXCLUDES is dropped from the public
 * tree even if it's a public-safe non-markdown file.
 */
const PRIVATE_PATH_PREFIXES: readonly string[] = [
  'docs/internal/',
  '.claude/',
];

/** Hard leak markers — appearing in a public-tagged file is a defect. */
const LEAK_MARKERS: ReadonlyArray<{ pattern: string; reason: string }> = [
  { pattern: 'pl-guide', reason: 'private repo slug' },
  { pattern: 'AgentScope', reason: 'framework attribution (private)' },
  { pattern: 'Multica', reason: 'framework attribution (private)' },
  { pattern: 'BABOK', reason: 'methodology attribution (private)' },
  { pattern: 'TOGAF', reason: 'methodology attribution (private)' },
  { pattern: 'PESTLE', reason: 'methodology attribution (private)' },
  { pattern: 'framework of frameworks', reason: 'attribution phrase (private)' },
];

const AUDIENCE_RE = /<!--\s*audience:\s*(public|private)\s*-->/i;
const AUDIENCE_DECL_RE = /<!--\s*audience:\s*[a-z|\s]+\s*-->/i;

/**
 * Path-prefix list whose contents are treated as data, not documentation.
 * Files under these prefixes are copied without audience classification or
 * leak-marker scanning — they're synthesizer output, fixture data, or
 * other non-prose content.
 */
const DATA_PATH_PREFIXES: readonly string[] = [
  'tests/fixtures/',
];

// ─── Report types ─────────────────────────────────────────────────────────

interface SanitizeReport {
  scanned: number;
  included: string[];
  excluded: { path: string; reason: string }[];
  leaks: { path: string; marker: string; reason: string; line: number; text: string }[];
  unclassified: string[];
  source: string;
  out?: string;
  dryRun: boolean;
}

// ─── Entry point ──────────────────────────────────────────────────────────

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  let options: Options;
  try {
    options = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n${USAGE}`);
    return 2;
  }

  if (options.outDir === undefined && !options.dryRun) {
    process.stderr.write(`--out is required when not in dry-run mode\n${USAGE}`);
    return 2;
  }

  if (!await pathExists(options.sourceRoot)) {
    process.stderr.write(`Source directory does not exist: ${options.sourceRoot}\n`);
    return 2;
  }

  const report = await sanitize(options);
  printReport(report, options);

  if (report.leaks.length > 0) return 1;
  if (options.strict && report.unclassified.length > 0) return 1;
  return 0;
}

// ─── Core ─────────────────────────────────────────────────────────────────

export async function sanitize(options: Options): Promise<SanitizeReport> {
  const report: SanitizeReport = {
    scanned: 0,
    included: [],
    excluded: [],
    leaks: [],
    unclassified: [],
    source: resolve(options.sourceRoot),
    out: options.outDir ? resolve(options.outDir) : undefined,
    dryRun: options.dryRun,
  };

  await walk(report.source, report.source, options, report);

  if (!options.dryRun && options.outDir) {
    for (const rel of report.included) {
      const src = join(report.source, rel);
      const dst = join(resolve(options.outDir), rel);
      await fs.mkdir(dirname(dst), { recursive: true });
      await fs.copyFile(src, dst);
    }
  }

  return report;
}

async function walk(
  root: string,
  current: string,
  options: Options,
  report: SanitizeReport,
): Promise<void> {
  const entries = await fs.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.includes(entry.name)) continue;
      await walk(root, join(current, entry.name), options, report);
      continue;
    }
    if (!entry.isFile()) continue;
    const full = join(current, entry.name);
    const rel = relative(root, full).split(sep).join('/');
    await classify(full, rel, options, report);
  }
}

async function classify(
  full: string,
  rel: string,
  options: Options,
  report: SanitizeReport,
): Promise<void> {
  report.scanned++;

  // Path-based private exclusion always wins, regardless of file type.
  for (const prefix of PRIVATE_PATH_PREFIXES) {
    if (rel === prefix || rel.startsWith(prefix)) {
      report.excluded.push({ path: rel, reason: `private path (${prefix})` });
      return;
    }
  }

  // Data paths (test fixtures, synthesizer output) ship as-is without
  // audience classification or leak scanning.
  if (DATA_PATH_PREFIXES.some((p) => rel.startsWith(p))) {
    report.included.push(rel);
    return;
  }

  if (rel.endsWith('.md')) {
    await classifyMarkdown(full, rel, options, report);
    return;
  }

  // Non-markdown files (source code, configs, scripts) default to included
  // unless excluded by path above. We DON'T scan source code for leak
  // markers — code can legitimately reference any string (constants,
  // test fixtures, comments). The publish surface is markdown.
  report.included.push(rel);
}

async function classifyMarkdown(
  full: string,
  rel: string,
  _options: Options,
  report: SanitizeReport,
): Promise<void> {
  const content = await fs.readFile(full, 'utf-8');
  const firstNonEmpty = firstNonEmptyLine(content);
  const audienceMatch = firstNonEmpty ? AUDIENCE_RE.exec(firstNonEmpty) : null;

  if (!audienceMatch) {
    // Some legacy files might not have a directive. Look for any
    // audience comment elsewhere in the file as a fallback.
    const fallback = AUDIENCE_RE.exec(content);
    if (fallback) {
      const audience = fallback[1].toLowerCase();
      if (audience === 'public') {
        report.included.push(rel);
        await scanForLeaks(full, rel, report, content);
      } else {
        report.excluded.push({ path: rel, reason: `audience: ${audience}` });
      }
      return;
    }
    report.unclassified.push(rel);
    report.excluded.push({ path: rel, reason: 'no audience directive' });
    return;
  }

  const audience = audienceMatch[1].toLowerCase();
  if (audience === 'public') {
    report.included.push(rel);
    await scanForLeaks(full, rel, report, content);
  } else {
    report.excluded.push({ path: rel, reason: `audience: ${audience}` });
  }
}

function firstNonEmptyLine(content: string): string | undefined {
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return undefined;
}

async function scanForLeaks(
  full: string,
  rel: string,
  report: SanitizeReport,
  preloaded?: string,
): Promise<void> {
  const content = preloaded ?? await fs.readFile(full, 'utf-8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const marker of LEAK_MARKERS) {
      if (!line.includes(marker.pattern)) continue;
      // Skip lines that are themselves the leak-marker definition list
      // inside a known marker-listing context (e.g. CLI usage messages).
      // The handbook is private-tagged so it never enters here.
      report.leaks.push({
        path: rel,
        marker: marker.pattern,
        reason: marker.reason,
        line: i + 1,
        text: line.trim(),
      });
    }
  }
}

// ─── Reporting ────────────────────────────────────────────────────────────

function printReport(report: SanitizeReport, options: Options): void {
  const c = options.noColor ? identity : ansi;
  const out: string[] = [];

  out.push('');
  out.push(c.bold('Sanitize-for-public report'));
  out.push(`  Source: ${report.source}`);
  if (report.out) out.push(`  Output: ${report.out}`);
  out.push(`  Mode:   ${options.dryRun ? c.yellow('dry-run (no writes)') : c.green('writing')}`);
  out.push('');
  out.push(`  Scanned:        ${report.scanned}`);
  out.push(`  Included:       ${c.green(String(report.included.length))}`);
  out.push(`  Excluded:       ${c.dim(String(report.excluded.length))}`);
  out.push(`  Unclassified:   ${report.unclassified.length === 0 ? c.dim('0') : c.yellow(String(report.unclassified.length))}`);
  out.push(`  Leak markers:   ${report.leaks.length === 0 ? c.green('0') : c.red(String(report.leaks.length))}`);
  out.push('');

  if (report.unclassified.length > 0) {
    out.push(c.yellow('Markdown files without an audience directive (excluded by default):'));
    for (const path of report.unclassified) out.push(`  - ${path}`);
    out.push('');
  }

  if (report.leaks.length > 0) {
    out.push(c.red('Leak markers in public-tagged files:'));
    for (const leak of report.leaks) {
      out.push(`  ${c.red('✗')} ${leak.path}:${leak.line}  ${c.bold(leak.marker)}  ${c.dim('(' + leak.reason + ')')}`);
      out.push(`      ${c.dim(leak.text.slice(0, 140))}`);
    }
    out.push('');
  } else {
    out.push(c.green('  ✓ No leak markers detected.'));
    out.push('');
  }

  process.stdout.write(out.join('\n'));
  process.stdout.write('\n');
}

// ─── Args ─────────────────────────────────────────────────────────────────

const USAGE = `Usage:
  npm run sanitize-public -- [options]

Options:
  --source <path>          Source repository root (default: .)
  --out <path>             Output directory (required when not --dry-run)
  --dry-run                Default. Walk + scan + report, write nothing.
  --strict                 Exit 1 on unclassified-markdown warnings, not just leaks.
  --no-color               Disable ANSI color in the report.
  -h, --help               Print this help and exit.

Exit codes:
  0   clean
  1   leak markers (or --strict + unclassified files)
  2   configuration error
`;

function parseArgs(argv: string[]): Options {
  const out: Options = {
    sourceRoot: '.',
    dryRun: true,
    strict: false,
    noColor: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '-h':
      case '--help':
        process.stdout.write(USAGE);
        process.exit(0);
        return out; // unreachable
      case '--source':
        out.sourceRoot = expectValue(argv[++i], '--source');
        break;
      case '--out':
        out.outDir = expectValue(argv[++i], '--out');
        out.dryRun = false;
        break;
      case '--dry-run':
        out.dryRun = true;
        break;
      case '--strict':
        out.strict = true;
        break;
      case '--no-color':
        out.noColor = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return out;
}

function expectValue(v: string | undefined, flag: string): string {
  if (!v || v.startsWith('--')) throw new Error(`${flag} requires a value`);
  return v;
}

async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

// ─── Tiny chalk-like helpers (avoid the chalk dep for this script) ─────────

interface Painter {
  red: (s: string) => string;
  green: (s: string) => string;
  yellow: (s: string) => string;
  dim: (s: string) => string;
  bold: (s: string) => string;
}

const ansi: Painter = {
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[22m`,
  bold:   (s) => `\x1b[1m${s}\x1b[22m`,
};

const identity: Painter = {
  red: (s) => s, green: (s) => s, yellow: (s) => s, dim: (s) => s, bold: (s) => s,
};

// ─── Direct-run handling ──────────────────────────────────────────────────

import { fileURLToPath } from 'node:url';
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().then((code) => process.exit(code));
}

// AUDIENCE_DECL_RE retained for tests that exercise the parser directly.
export { AUDIENCE_RE, AUDIENCE_DECL_RE, LEAK_MARKERS };
