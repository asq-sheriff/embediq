#!/usr/bin/env -S npx tsx
/**
 * docs-lint — pre-publish hygiene check for the markdown surface.
 *
 * Three checks, all run in one pass:
 *   1. Audience frontmatter — every in-scope `.md` file must declare
 *      `<!-- audience: public | private -->` on its first non-empty line.
 *   2. Leak markers — files tagged `audience: public` must not contain any
 *      of the strings in `LEAK_MARKERS` (private repo slug, framework
 *      attributions). Reuses the same list as `sanitize-for-public.ts` so
 *      the two tools cannot drift.
 *   3. Broken relative links — every `[text](path)` and `[text](path#anchor)`
 *      pointing at a relative target must resolve to an existing file, and
 *      every anchor must match a heading slug in the target.
 *
 * Scope:
 *   - Every `.md` file under `docs/` (excluding `docs/internal/`, path-private)
 *   - Root `.md` files (README, CHANGELOG, CONTRIBUTING, SECURITY, CLAUDE.md)
 *   - `.claude/`, `node_modules/`, `dist/`, etc. are skipped entirely.
 *
 * CLI:
 *   npm run docs-lint
 *   npm run docs-lint -- --format json
 *   npm run docs-lint -- --no-color
 *
 * Exit codes:
 *   0   clean
 *   1   issues found (leak, missing audience, or broken link)
 *   2   configuration error
 */
import { promises as fs, existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AUDIENCE_RE, LEAK_MARKERS } from './sanitize-for-public.js';

// ─── Config ───────────────────────────────────────────────────────────────

interface Options {
  sourceRoot: string;
  format: 'text' | 'json';
  noColor: boolean;
}

/** Directories never walked. Mirrors sanitize-for-public's SKIP_DIRS. */
const SKIP_DIRS: readonly string[] = [
  'node_modules',
  'dist',
  '.git',
  '.embediq',
  '.claude',
  'out',
  '.idea',
  '.vscode',
  'coverage',
  'tests',
];

/** Path prefixes whose markdown is exempt from audience-tag enforcement. */
const PATH_PRIVATE_PREFIXES: readonly string[] = [
  'docs/internal/',
];

// ─── Report types ─────────────────────────────────────────────────────────

interface MissingAudienceIssue {
  kind: 'missing-audience';
  path: string;
}

interface LeakIssue {
  kind: 'leak';
  path: string;
  line: number;
  marker: string;
  reason: string;
  text: string;
}

interface BrokenLinkIssue {
  kind: 'broken-link';
  path: string;
  line: number;
  link: string;
  reason: string;
}

type Issue = MissingAudienceIssue | LeakIssue | BrokenLinkIssue;

interface DocsLintReport {
  scanned: number;
  publicTagged: number;
  privateTagged: number;
  pathPrivate: number;
  issues: Issue[];
  source: string;
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

  if (!await pathExists(options.sourceRoot)) {
    process.stderr.write(`Source directory does not exist: ${options.sourceRoot}\n`);
    return 2;
  }

  const report = await lint(options);

  if (options.format === 'json') {
    process.stdout.write(JSON.stringify(report, null, 2));
    process.stdout.write('\n');
  } else {
    printText(report, options);
  }

  return report.issues.length === 0 ? 0 : 1;
}

// ─── Core ─────────────────────────────────────────────────────────────────

export async function lint(options: Options): Promise<DocsLintReport> {
  const root = resolve(options.sourceRoot);
  const report: DocsLintReport = {
    scanned: 0,
    publicTagged: 0,
    privateTagged: 0,
    pathPrivate: 0,
    issues: [],
    source: root,
  };

  const files = await collectMarkdown(root);
  // Pre-load every file so link-existence checks can be O(1) lookups.
  const fileSet = new Set(files);

  for (const rel of files) {
    report.scanned++;
    const full = join(root, rel);
    const content = await fs.readFile(full, 'utf-8');

    const isPathPrivate = PATH_PRIVATE_PREFIXES.some((p) => rel.startsWith(p));
    if (isPathPrivate) {
      report.pathPrivate++;
    } else {
      const audience = detectAudience(content);
      if (!audience) {
        report.issues.push({ kind: 'missing-audience', path: rel });
      } else if (audience === 'public') {
        report.publicTagged++;
        scanLeaks(rel, content, report);
      } else {
        report.privateTagged++;
      }
    }

    checkLinks(rel, content, root, fileSet, report);
  }

  // Stable ordering for deterministic output.
  report.issues.sort((a, b) => {
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    const aLine = 'line' in a ? a.line : 0;
    const bLine = 'line' in b ? b.line : 0;
    return aLine - bLine;
  });

  return report;
}

async function collectMarkdown(root: string): Promise<string[]> {
  const out: string[] = [];
  await walk(root, root, out);
  return out.sort();
}

async function walk(root: string, current: string, out: string[]): Promise<void> {
  const entries = await fs.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.includes(entry.name)) continue;
      await walk(root, join(current, entry.name), out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.md')) continue;
    const full = join(current, entry.name);
    const rel = relative(root, full).split(sep).join('/');
    out.push(rel);
  }
}

function detectAudience(content: string): 'public' | 'private' | undefined {
  const firstNonEmpty = firstNonEmptyLine(content);
  const m = firstNonEmpty ? AUDIENCE_RE.exec(firstNonEmpty) : null;
  if (m) return m[1].toLowerCase() as 'public' | 'private';
  // Fallback: any audience comment elsewhere in the file.
  const fallback = AUDIENCE_RE.exec(content);
  if (fallback) return fallback[1].toLowerCase() as 'public' | 'private';
  return undefined;
}

function firstNonEmptyLine(content: string): string | undefined {
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return undefined;
}

function scanLeaks(rel: string, content: string, report: DocsLintReport): void {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const marker of LEAK_MARKERS) {
      if (!line.includes(marker.pattern)) continue;
      report.issues.push({
        kind: 'leak',
        path: rel,
        line: i + 1,
        marker: marker.pattern,
        reason: marker.reason,
        text: line.trim(),
      });
    }
  }
}

// ─── Link checking ────────────────────────────────────────────────────────

const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

function checkLinks(
  rel: string,
  content: string,
  root: string,
  fileSet: Set<string>,
  report: DocsLintReport,
): void {
  const lines = content.split('\n');
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    let m: RegExpExecArray | null;
    LINK_RE.lastIndex = 0;
    while ((m = LINK_RE.exec(line)) !== null) {
      const target = m[2].trim();
      const issue = classifyLinkTarget(target, rel, root, fileSet);
      if (issue) {
        report.issues.push({
          kind: 'broken-link',
          path: rel,
          line: i + 1,
          link: target,
          reason: issue,
        });
      }
    }
  }
}

function classifyLinkTarget(
  target: string,
  fromRel: string,
  root: string,
  fileSet: Set<string>,
): string | undefined {
  // Skip empty / whitespace-only.
  if (target.length === 0) return 'empty link target';

  // Strip optional title: `path "title"`.
  const cleaned = target.replace(/\s+["'].*["']\s*$/, '').trim();

  // Skip absolute URLs and special schemes.
  if (/^[a-z][a-z0-9+.-]*:/i.test(cleaned)) return undefined;
  if (cleaned.startsWith('//')) return undefined;
  if (cleaned.startsWith('mailto:')) return undefined;

  // Pure in-page anchor.
  if (cleaned.startsWith('#')) {
    return undefined;
  }

  const [pathPart, anchor] = cleaned.split('#', 2);
  if (pathPart === '') {
    // `#anchor-only` already handled above; this case is `#` alone.
    return undefined;
  }

  // Resolve the target relative to the file containing the link.
  const fromDir = dirname(fromRel);
  const resolvedRel = normalizeRelative(join(fromDir, pathPart));

  // Some links go up out of the docs tree (e.g. ../README.md from a
  // docs/ subfolder). We accept any path that resolves inside the repo.
  if (!fileSet.has(resolvedRel)) {
    // Allow links to non-markdown files (images, scripts, etc.) as long
    // as the file exists on disk.
    const abs = join(root, resolvedRel);
    if (!existsSyncSafe(abs)) {
      return `target not found: ${resolvedRel}`;
    }
    if (anchor) {
      // Anchors only meaningful for markdown; non-md anchors are skipped.
      return undefined;
    }
    return undefined;
  }

  if (!anchor) return undefined;

  // For markdown targets with an anchor, verify the heading exists.
  // We swallow the read error since fileSet guaranteed presence.
  try {
    const targetContent = readTargetFile(join(root, resolvedRel));
    const slugs = extractHeadingSlugs(targetContent);
    if (!slugs.has(anchor.toLowerCase())) {
      return `anchor not found in ${resolvedRel}: #${anchor}`;
    }
  } catch {
    return `could not read target for anchor check: ${resolvedRel}`;
  }
  return undefined;
}

function normalizeRelative(path: string): string {
  // Resolve `..` and `.` segments, normalize to forward slashes.
  const parts = path.split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '' || p === '.') continue;
    if (p === '..') {
      out.pop();
      continue;
    }
    out.push(p);
  }
  return out.join('/');
}

function extractHeadingSlugs(content: string): Set<string> {
  const slugs = new Set<string>();
  const lines = content.split('\n');
  let inFence = false;
  for (const line of lines) {
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^#{1,6}\s+(.+?)\s*#*$/.exec(line);
    if (!m) continue;
    slugs.add(slugify(m[1]));
  }
  return slugs;
}

/**
 * GitHub-style heading slugifier. Whitespace is replaced one-for-one
 * with a hyphen so that consecutive whitespace produces consecutive
 * hyphens (matches GitHub's GFM behaviour for headings containing em
 * dashes or other punctuation that gets stripped).
 */
function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s/g, '-');
}

// ─── Reporting ────────────────────────────────────────────────────────────

function printText(report: DocsLintReport, options: Options): void {
  const c = options.noColor ? identity : ansi;
  const out: string[] = [];

  out.push('');
  out.push(c.bold('docs-lint report'));
  out.push(`  Source: ${report.source}`);
  out.push('');
  out.push(`  Scanned:        ${report.scanned}`);
  out.push(`  Public-tagged:  ${c.green(String(report.publicTagged))}`);
  out.push(`  Private-tagged: ${c.dim(String(report.privateTagged))}`);
  out.push(`  Path-private:   ${c.dim(String(report.pathPrivate))}`);
  out.push(`  Issues:         ${report.issues.length === 0 ? c.green('0') : c.red(String(report.issues.length))}`);
  out.push('');

  if (report.issues.length === 0) {
    out.push(c.green('  ✓ No issues found.'));
    out.push('');
    process.stdout.write(out.join('\n') + '\n');
    return;
  }

  // Group by kind.
  const missing = report.issues.filter((i): i is MissingAudienceIssue => i.kind === 'missing-audience');
  const leaks = report.issues.filter((i): i is LeakIssue => i.kind === 'leak');
  const links = report.issues.filter((i): i is BrokenLinkIssue => i.kind === 'broken-link');

  if (missing.length > 0) {
    out.push(c.yellow(`Missing audience directive (${missing.length}):`));
    for (const i of missing) out.push(`  ${c.yellow('!')} ${i.path}`);
    out.push('');
  }

  if (leaks.length > 0) {
    out.push(c.red(`Leak markers in public-tagged files (${leaks.length}):`));
    for (const i of leaks) {
      out.push(`  ${c.red('✗')} ${i.path}:${i.line}  ${c.bold(i.marker)}  ${c.dim('(' + i.reason + ')')}`);
      out.push(`      ${c.dim(i.text.slice(0, 140))}`);
    }
    out.push('');
  }

  if (links.length > 0) {
    out.push(c.red(`Broken links (${links.length}):`));
    for (const i of links) {
      out.push(`  ${c.red('✗')} ${i.path}:${i.line}  ${c.bold(i.link)}`);
      out.push(`      ${c.dim(i.reason)}`);
    }
    out.push('');
  }

  process.stdout.write(out.join('\n') + '\n');
}

// ─── Args ─────────────────────────────────────────────────────────────────

const USAGE = `Usage:
  npm run docs-lint -- [options]

Options:
  --source <path>          Source repository root (default: .)
  --format <text|json>     Output format (default: text)
  --no-color               Disable ANSI color in text output.
  -h, --help               Print this help and exit.

Exit codes:
  0   clean
  1   issues found (leak, missing audience, or broken link)
  2   configuration error
`;

function parseArgs(argv: string[]): Options {
  const out: Options = {
    sourceRoot: '.',
    format: 'text',
    noColor: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '-h':
      case '--help':
        process.stdout.write(USAGE);
        process.exit(0);
        return out;
      case '--source':
        out.sourceRoot = expectValue(argv[++i], '--source');
        break;
      case '--format': {
        const v = expectValue(argv[++i], '--format');
        if (v !== 'text' && v !== 'json') throw new Error(`--format must be 'text' or 'json'`);
        out.format = v;
        break;
      }
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

function existsSyncSafe(p: string): boolean {
  try {
    return existsSync(p);
  } catch {
    return false;
  }
}

function readTargetFile(p: string): string {
  return readFileSync(p, 'utf-8');
}

// ─── Tiny chalk-like helpers ──────────────────────────────────────────────

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

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().then((code) => process.exit(code));
}
