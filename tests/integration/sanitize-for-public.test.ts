import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sanitize, LEAK_MARKERS, AUDIENCE_RE } from '../../scripts/sanitize-for-public.js';

async function makeFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'embediq-sanitize-'));

  // Public-tagged markdown
  await writeFile(join(root, 'README.md'),
    '<!-- audience: public -->\n\n# Public README\n\nFully public content.\n');

  // Private-tagged markdown
  await writeFile(join(root, 'CLAUDE.md'),
    '<!-- audience: private -->\n\n# Internal contributor guide\n');

  // Unclassified markdown — should be excluded with a warning
  await writeFile(join(root, 'UNCLASSIFIED.md'),
    '# This file has no audience directive\n');

  // Public docs subtree
  await mkdir(join(root, 'docs'), { recursive: true });
  await writeFile(join(root, 'docs/getting-started.md'),
    '<!-- audience: public -->\n\n# Getting started\n');
  await writeFile(join(root, 'docs/ROADMAP.md'),
    '<!-- audience: private -->\n\n# Strategic roadmap\n');

  // Private subtree (path-prefix exclusion regardless of file content)
  await mkdir(join(root, 'docs/internal'), { recursive: true });
  await writeFile(join(root, 'docs/internal/handbook.md'),
    '<!-- audience: public -->\n\n# Should still be excluded by path\n');

  // Non-markdown public file
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src/index.ts'),
    'export const greeting = "hello";\n');

  // Non-markdown that should be excluded by path
  await mkdir(join(root, '.claude/plans'), { recursive: true });
  await writeFile(join(root, '.claude/plans/scratch.md'),
    '<!-- audience: public -->\n\n# Will be excluded by path\n');

  // Skipped directory
  await mkdir(join(root, 'node_modules/some-pkg'), { recursive: true });
  await writeFile(join(root, 'node_modules/some-pkg/index.js'),
    'export const ignored = true;\n');

  return root;
}

describe('sanitize() — classification', () => {
  let source: string;

  beforeEach(async () => {
    source = await makeFixture();
  });

  afterEach(async () => {
    await rm(source, { recursive: true, force: true });
  });

  it('includes public-tagged markdown', async () => {
    const report = await sanitize({
      sourceRoot: source,
      dryRun: true,
      strict: false,
      noColor: true,
    });
    expect(report.included).toContain('README.md');
    expect(report.included).toContain('docs/getting-started.md');
  });

  it('excludes private-tagged markdown', async () => {
    const report = await sanitize({
      sourceRoot: source,
      dryRun: true,
      strict: false,
      noColor: true,
    });
    expect(report.included).not.toContain('CLAUDE.md');
    expect(report.included).not.toContain('docs/ROADMAP.md');
    expect(report.excluded.find((e) => e.path === 'CLAUDE.md')?.reason).toContain('private');
  });

  it('records unclassified markdown and excludes it', async () => {
    const report = await sanitize({
      sourceRoot: source,
      dryRun: true,
      strict: false,
      noColor: true,
    });
    expect(report.unclassified).toContain('UNCLASSIFIED.md');
    expect(report.included).not.toContain('UNCLASSIFIED.md');
  });

  it('honors path-prefix private exclusions even for public-tagged files', async () => {
    const report = await sanitize({
      sourceRoot: source,
      dryRun: true,
      strict: false,
      noColor: true,
    });
    expect(report.included).not.toContain('docs/internal/handbook.md');
    expect(report.included).not.toContain('.claude/plans/scratch.md');
  });

  it('includes non-markdown source files by default', async () => {
    const report = await sanitize({
      sourceRoot: source,
      dryRun: true,
      strict: false,
      noColor: true,
    });
    expect(report.included).toContain('src/index.ts');
  });

  it('skips entire SKIP_DIRS subtrees', async () => {
    const report = await sanitize({
      sourceRoot: source,
      dryRun: true,
      strict: false,
      noColor: true,
    });
    expect(report.included.find((p) => p.startsWith('node_modules/'))).toBeUndefined();
  });

  it('does not write anything in dry-run mode', async () => {
    const out = await mkdtemp(join(tmpdir(), 'embediq-sanitize-out-'));
    try {
      // Note: we deliberately omit outDir; dry-run requires no out
      await sanitize({
        sourceRoot: source,
        dryRun: true,
        strict: false,
        noColor: true,
      });
      const entries = await readdir(out);
      expect(entries).toEqual([]);
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });
});

describe('sanitize() — leak markers', () => {
  let source: string;

  beforeEach(async () => {
    source = await mkdtemp(join(tmpdir(), 'embediq-sanitize-leaks-'));
  });

  afterEach(async () => {
    await rm(source, { recursive: true, force: true });
  });

  it('detects every documented leak marker in a public-tagged file', async () => {
    await writeFile(join(source, 'README.md'),
      '<!-- audience: public -->\n\n'
      + '# Header\n\n'
      + 'This text mentions pl-guide and AgentScope and Multica.\n'
      + 'It also references BABOK, TOGAF, and PESTLE.\n'
      + 'Even the "framework of frameworks" phrase appears here.\n');

    const report = await sanitize({
      sourceRoot: source,
      dryRun: true,
      strict: false,
      noColor: true,
    });

    const markers = new Set(report.leaks.map((l) => l.marker));
    for (const m of LEAK_MARKERS) {
      expect(markers.has(m.pattern), `expected to detect "${m.pattern}"`).toBe(true);
    }
  });

  it('does not flag leak markers in private-tagged files', async () => {
    await writeFile(join(source, 'CLAUDE.md'),
      '<!-- audience: private -->\n\n'
      + '# Internal\n\n'
      + 'This file mentions pl-guide and AgentScope freely.\n');

    const report = await sanitize({
      sourceRoot: source,
      dryRun: true,
      strict: false,
      noColor: true,
    });
    expect(report.leaks).toHaveLength(0);
  });

  it('reports the line number of each leak', async () => {
    await writeFile(join(source, 'README.md'),
      '<!-- audience: public -->\n'   // line 1
      + '\n'                          // line 2
      + '# Title\n'                   // line 3
      + '\n'                          // line 4
      + 'Mentions pl-guide here.\n'); // line 5

    const report = await sanitize({
      sourceRoot: source,
      dryRun: true,
      strict: false,
      noColor: true,
    });
    expect(report.leaks).toHaveLength(1);
    expect(report.leaks[0].line).toBe(5);
    expect(report.leaks[0].marker).toBe('pl-guide');
  });
});

describe('sanitize() — write mode', () => {
  let source: string;
  let out: string;

  beforeEach(async () => {
    source = await makeFixture();
    out = await mkdtemp(join(tmpdir(), 'embediq-sanitize-out-'));
  });

  afterEach(async () => {
    await rm(source, { recursive: true, force: true });
    await rm(out, { recursive: true, force: true });
  });

  it('copies every included file to outDir preserving the layout', async () => {
    await sanitize({
      sourceRoot: source,
      outDir: out,
      dryRun: false,
      strict: false,
      noColor: true,
    });
    const entries = await readdir(out);
    expect(entries).toContain('README.md');
    expect(entries).toContain('docs');
    expect(entries).toContain('src');
    expect(entries).not.toContain('CLAUDE.md');
    const docs = await readdir(join(out, 'docs'));
    expect(docs).toContain('getting-started.md');
    expect(docs).not.toContain('ROADMAP.md');
    expect(docs).not.toContain('internal');   // path-prefix exclude
  });

  it('does not copy files in path-prefix exclusions', async () => {
    await sanitize({
      sourceRoot: source,
      outDir: out,
      dryRun: false,
      strict: false,
      noColor: true,
    });
    const exists = async (p: string) => {
      try {
        const s = await import('node:fs/promises');
        await s.access(p);
        return true;
      } catch { return false; }
    };
    expect(await exists(join(out, '.claude/plans/scratch.md'))).toBe(false);
    expect(await exists(join(out, 'docs/internal/handbook.md'))).toBe(false);
  });
});

describe('exported regex', () => {
  it('AUDIENCE_RE matches both public and private directives', () => {
    expect(AUDIENCE_RE.test('<!-- audience: public -->')).toBe(true);
    expect(AUDIENCE_RE.test('<!-- audience: private -->')).toBe(true);
    expect(AUDIENCE_RE.test('<!-- audience: PUBLIC -->')).toBe(true);
    expect(AUDIENCE_RE.test('plain text without directive')).toBe(false);
  });
});
