import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { lint } from '../../scripts/docs-lint.js';

describe('docs-lint', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'docs-lint-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function writeFileAt(rel: string, content: string): Promise<void> {
    const full = join(root, rel);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content, 'utf-8');
  }

  it('reports clean when every markdown file has an audience tag and links resolve', async () => {
    await mkdir(join(root, 'docs'), { recursive: true });
    await writeFileAt('README.md', [
      '<!-- audience: public -->',
      '',
      '# Project',
      '',
      'See the [CHANGELOG](./CHANGELOG.md).',
    ].join('\n'));
    await writeFileAt('CHANGELOG.md', [
      '<!-- audience: public -->',
      '',
      '# Changelog',
    ].join('\n'));
    await writeFileAt('docs/guide.md', [
      '<!-- audience: public -->',
      '',
      '# Guide',
      '',
      'See the [README](../README.md).',
    ].join('\n'));

    const report = await lint({ sourceRoot: root, format: 'text', noColor: true });
    expect(report.issues).toHaveLength(0);
    expect(report.publicTagged).toBe(3);
  });

  it('flags a markdown file that has no audience directive', async () => {
    await writeFileAt('docs/orphan.md', '# Untagged file\n');
    const report = await lint({ sourceRoot: root, format: 'text', noColor: true });
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].kind).toBe('missing-audience');
    expect(report.issues[0].path).toBe('docs/orphan.md');
  });

  it('flags leak markers that appear in public-tagged files', async () => {
    await writeFileAt('docs/leaky.md', [
      '<!-- audience: public -->',
      '',
      '# Leaky',
      '',
      'This references pl-guide which should never appear in public.',
      'Also inspired by AgentScope.',
    ].join('\n'));
    const report = await lint({ sourceRoot: root, format: 'text', noColor: true });
    const leaks = report.issues.filter((i) => i.kind === 'leak');
    expect(leaks).toHaveLength(2);
    expect(leaks.map((l) => (l.kind === 'leak' ? l.marker : ''))).toEqual(['pl-guide', 'AgentScope']);
  });

  it('does not flag leak markers inside private-tagged files', async () => {
    await writeFileAt('docs/roadmap.md', [
      '<!-- audience: private -->',
      '',
      '# Roadmap',
      '',
      'Inspired by AgentScope and Multica.',
    ].join('\n'));
    const report = await lint({ sourceRoot: root, format: 'text', noColor: true });
    expect(report.issues).toHaveLength(0);
    expect(report.privateTagged).toBe(1);
  });

  it('flags a broken relative link but accepts links inside fenced code blocks', async () => {
    await writeFileAt('docs/broken.md', [
      '<!-- audience: public -->',
      '',
      '# Broken',
      '',
      'A [missing file](./does-not-exist.md).',
      '',
      '```',
      'Raw reports: [embediq.json](./embediq.json), [claude-init.json](./claude-init.json).',
      '```',
    ].join('\n'));
    const report = await lint({ sourceRoot: root, format: 'text', noColor: true });
    const broken = report.issues.filter((i) => i.kind === 'broken-link');
    expect(broken).toHaveLength(1);
    expect(broken[0].kind === 'broken-link' && broken[0].link).toBe('./does-not-exist.md');
  });

  it('accepts in-page anchors and external URLs without checking them', async () => {
    await writeFileAt('docs/clean.md', [
      '<!-- audience: public -->',
      '',
      '# Clean',
      '',
      'Jump to [Section](#section).',
      'External: [anthropic](https://anthropic.com) and [mailto](mailto:a@b.com).',
      '',
      '## Section',
    ].join('\n'));
    const report = await lint({ sourceRoot: root, format: 'text', noColor: true });
    expect(report.issues).toHaveLength(0);
  });

  it('validates cross-file anchor links using GitHub-style slugging', async () => {
    await writeFileAt('docs/target.md', [
      '<!-- audience: public -->',
      '',
      '# Target',
      '',
      '## `npm run foo` — does a thing',
      '',
      'Content.',
    ].join('\n'));
    await writeFileAt('docs/source.md', [
      '<!-- audience: public -->',
      '',
      '# Source',
      '',
      'See [foo](target.md#npm-run-foo--does-a-thing).',
      'Also [bad anchor](target.md#nope).',
    ].join('\n'));
    const report = await lint({ sourceRoot: root, format: 'text', noColor: true });
    const broken = report.issues.filter((i) => i.kind === 'broken-link');
    expect(broken).toHaveLength(1);
    expect(broken[0].kind === 'broken-link' && broken[0].link).toBe('target.md#nope');
  });

  it('exempts docs/internal/ from audience-tag enforcement', async () => {
    await writeFileAt('docs/internal/handbook.md', '# Internal handbook, no tag\n');
    const report = await lint({ sourceRoot: root, format: 'text', noColor: true });
    expect(report.issues).toHaveLength(0);
    expect(report.pathPrivate).toBe(1);
  });
});
