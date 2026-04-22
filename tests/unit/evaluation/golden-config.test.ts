import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  discoverArchetypes,
  loadArchetype,
} from '../../../src/evaluation/golden-config.js';
import { EvaluationError } from '../../../src/evaluation/types.js';

describe('golden-config loader', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'embediq-goldens-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function writeFixture(name: string, files: Record<string, string>): Promise<string> {
    const dir = join(root, name);
    await mkdir(dir, { recursive: true });
    for (const [rel, contents] of Object.entries(files)) {
      const full = join(dir, rel);
      await mkdir(join(full, '..'), { recursive: true });
      await writeFile(full, contents, 'utf-8');
    }
    return dir;
  }

  describe('discoverArchetypes', () => {
    it('returns only directories with archetype.yaml', async () => {
      await writeFixture('alpha', { 'archetype.yaml': 'id: alpha\ntitle: A\nminimumFloor: 1\n' });
      await writeFixture('beta', { 'archetype.yaml': 'id: beta\ntitle: B\nminimumFloor: 1\n' });
      await writeFixture('junk', { 'README.md': '# not an archetype' });

      const dirs = await discoverArchetypes(root);
      expect(dirs.map(d => d.split('/').pop()).sort()).toEqual(['alpha', 'beta']);
    });

    it('returns an empty array when the root does not exist', async () => {
      const dirs = await discoverArchetypes(join(root, 'nope'));
      expect(dirs).toEqual([]);
    });
  });

  describe('loadArchetype', () => {
    it('loads a complete archetype with all files', async () => {
      const dir = await writeFixture('complete', {
        'archetype.yaml': 'id: complete\ntitle: Complete\nminimumFloor: 4\ndescription: test\n',
        'answers.yaml': 'STRAT_000: developer\nREG_001: false\nTECH_001:\n  - typescript\n',
        'weights.yaml': 'missingFilePenalty: 0.5\nextraFilePenalty: 0.1\n',
        'golden-meta.yaml': 'reviewer: alice\nreviewedAt: 2026-04-15\n',
        'expected/CLAUDE.md': '# Project\n\n## Stack',
        'expected/.claude/settings.json': '{"model":"sonnet"}',
      });

      const archetype = await loadArchetype(dir);
      expect(archetype.meta.id).toBe('complete');
      expect(archetype.meta.minimumFloor).toBe(4);
      expect(archetype.meta.description).toBe('test');
      expect(archetype.answers.size).toBe(3);
      expect(archetype.answers.get('TECH_001')?.value).toEqual(['typescript']);
      expect(archetype.weights.missingFilePenalty).toBe(0.5);
      expect(archetype.weights.extraFilePenalty).toBe(0.1);
      expect(archetype.goldenMeta.reviewer).toBe('alice');
      expect(archetype.expectedFiles).toHaveLength(2);
      expect(archetype.expectedFiles.map(f => f.relativePath).sort()).toEqual([
        '.claude/settings.json',
        'CLAUDE.md',
      ]);
    });

    it('normalizes expected file paths to forward slashes', async () => {
      const dir = await writeFixture('slashes', {
        'archetype.yaml': 'id: slashes\ntitle: Slashes\nminimumFloor: 1\n',
        'answers.yaml': 'STRAT_000: developer\n',
        'expected/.claude/rules/nested.md': '# Nested',
      });
      const { expectedFiles } = await loadArchetype(dir);
      expect(expectedFiles[0].relativePath).toBe('.claude/rules/nested.md');
    });

    it('throws EvaluationError when the directory does not exist', async () => {
      await expect(loadArchetype(join(root, 'missing'))).rejects.toThrow(EvaluationError);
    });

    it('throws when archetype.yaml is missing', async () => {
      const dir = await writeFixture('no-meta', {
        'answers.yaml': 'STRAT_000: developer\n',
        'expected/CLAUDE.md': '# P',
      });
      await expect(loadArchetype(dir)).rejects.toThrow(/archetype\.yaml/);
    });

    it('throws when answers.yaml is missing', async () => {
      const dir = await writeFixture('no-answers', {
        'archetype.yaml': 'id: x\ntitle: X\nminimumFloor: 1\n',
        'expected/CLAUDE.md': '# P',
      });
      await expect(loadArchetype(dir)).rejects.toThrow(/answers\.yaml/);
    });

    it('throws when expected/ is missing', async () => {
      const dir = await writeFixture('no-expected', {
        'archetype.yaml': 'id: x\ntitle: X\nminimumFloor: 1\n',
        'answers.yaml': 'STRAT_000: developer\n',
      });
      await expect(loadArchetype(dir)).rejects.toThrow(/expected\//);
    });

    it('throws when archetype.yaml is malformed YAML', async () => {
      const dir = await writeFixture('bad-yaml', {
        'archetype.yaml': 'id: [unclosed\n',
        'answers.yaml': 'STRAT_000: developer\n',
        'expected/CLAUDE.md': '# P',
      });
      await expect(loadArchetype(dir)).rejects.toThrow(/Malformed YAML/);
    });

    it('throws when archetype.yaml omits required fields', async () => {
      const dir = await writeFixture('incomplete-meta', {
        'archetype.yaml': 'title: NoId\nminimumFloor: 1\n',
        'answers.yaml': 'STRAT_000: developer\n',
        'expected/CLAUDE.md': '# P',
      });
      await expect(loadArchetype(dir)).rejects.toThrow(/"id"/);
    });

    it('throws when answers.yaml contains unsupported value types', async () => {
      const dir = await writeFixture('bad-answers', {
        'archetype.yaml': 'id: x\ntitle: X\nminimumFloor: 1\n',
        'answers.yaml': 'STRAT_000:\n  nested: invalid\n',
        'expected/CLAUDE.md': '# P',
      });
      await expect(loadArchetype(dir)).rejects.toThrow(/not a supported type/);
    });

    it('merges weight overrides on top of defaults', async () => {
      const dir = await writeFixture('weights', {
        'archetype.yaml': 'id: w\ntitle: W\nminimumFloor: 1\n',
        'answers.yaml': 'STRAT_000: developer\n',
        'weights.yaml': 'byCategory:\n  compliance: 10\nextraFilePenalty: 0.25\n',
        'expected/CLAUDE.md': '# P',
      });
      const { weights } = await loadArchetype(dir);
      expect(weights.byCategory.compliance).toBe(10);
      // Defaults preserved for unspecified categories.
      expect(weights.byCategory.style).toBe(0.5);
      expect(weights.extraFilePenalty).toBe(0.25);
      // Defaults preserved for penalties not set.
      expect(weights.missingFilePenalty).toBe(0);
    });

    it('treats missing weights.yaml/golden-meta.yaml as optional', async () => {
      const dir = await writeFixture('minimal', {
        'archetype.yaml': 'id: m\ntitle: M\nminimumFloor: 1\n',
        'answers.yaml': 'STRAT_000: developer\n',
        'expected/CLAUDE.md': '# P',
      });
      const archetype = await loadArchetype(dir);
      expect(archetype.weights.byCategory.compliance).toBe(5); // default
      expect(archetype.goldenMeta).toEqual({});
    });
  });
});
