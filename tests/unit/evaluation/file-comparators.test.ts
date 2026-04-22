import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WEIGHTS,
  getComparatorFor,
  markdownComparator,
  jsonComparator,
  yamlComparator,
  textComparator,
  binaryComparator,
  type Weights,
  type ScoredCheck,
} from '../../../src/evaluation/index.js';

const W: Weights = DEFAULT_WEIGHTS;

function ids(checks: ScoredCheck[]): string[] {
  return checks.map((c) => c.id);
}

function sumScore(checks: ScoredCheck[]): number {
  const totalWeight = checks.reduce((a, c) => a + c.weight, 0);
  if (totalWeight === 0) return 0;
  return checks.reduce((a, c) => a + c.score * c.weight, 0) / totalWeight;
}

describe('getComparatorFor', () => {
  it('routes by file extension', () => {
    expect(getComparatorFor('x.md').fileType).toBe('markdown');
    expect(getComparatorFor('x.json').fileType).toBe('json');
    expect(getComparatorFor('x.yaml').fileType).toBe('yaml');
    expect(getComparatorFor('x.yml').fileType).toBe('yaml');
    expect(getComparatorFor('x.py').fileType).toBe('text');
    expect(getComparatorFor('x.png').fileType).toBe('binary');
    expect(getComparatorFor('no-extension').fileType).toBe('text');
  });
});

describe('markdownComparator', () => {
  it('scores identical content at 1.0 across all checks', () => {
    const md = '# Title\n\n## Section A\n\nBody\n\n## Section B\n\nMore';
    const checks = markdownComparator.compare({
      filePath: 'CLAUDE.md',
      expected: md,
      actual: md,
      weights: W,
    });
    expect(checks).toHaveLength(3);
    for (const c of checks) expect(c.score).toBe(1);
    expect(sumScore(checks)).toBe(1);
  });

  it('drops structural score when a required heading is missing', () => {
    const expected = '# Title\n\n## Section A\n\n## Section B';
    const actual = '# Title\n\n## Section A'; // Section B dropped
    const checks = markdownComparator.compare({
      filePath: 'doc.md',
      expected,
      actual,
      weights: W,
    });
    const structural = checks.find((c) => c.id.includes('structural.sections'))!;
    // 2 expected headings, 1 matched = 0.5 ... plus the H1 matches too = 2/3
    expect(structural.score).toBeCloseTo(2 / 3, 5);
  });

  it('content Jaccard drops when most lines differ', () => {
    const expected = 'line one\nline two\nline three';
    const actual = 'totally\ndifferent\ncontent';
    const checks = markdownComparator.compare({
      filePath: 'doc.md',
      expected,
      actual,
      weights: W,
    });
    const content = checks.find((c) => c.id.includes('content.jaccard'))!;
    expect(content.score).toBe(0);
  });

  it('content Jaccard tolerates reordering', () => {
    const expected = 'alpha\nbeta\ngamma';
    const actual = 'gamma\nalpha\nbeta';
    const content = markdownComparator
      .compare({ filePath: 'x.md', expected, actual, weights: W })
      .find((c) => c.id.includes('content.jaccard'))!;
    expect(content.score).toBe(1);
  });

  it('heading-order style check drops to 0.5 when order is shuffled', () => {
    const expected = '# A\n\n## B\n\n## C';
    const actual = '# A\n\n## C\n\n## B';
    const order = markdownComparator
      .compare({ filePath: 'x.md', expected, actual, weights: W })
      .find((c) => c.id.includes('style.heading-order'))!;
    expect(order.score).toBe(0.5);
  });

  it('emits critical severity for the structural check', () => {
    const checks = markdownComparator.compare({
      filePath: 'x.md',
      expected: '# A',
      actual: '# A',
      weights: W,
    });
    const structural = checks.find((c) => c.id.includes('structural.sections'))!;
    expect(structural.severity).toBe('critical');
    expect(structural.category).toBe('structural');
  });
});

describe('jsonComparator', () => {
  it('scores identical objects at 1.0', () => {
    const obj = { permissions: { allow: ['Bash'] }, model: 'sonnet' };
    const checks = jsonComparator.compare({
      filePath: 'settings.json',
      expected: obj,
      actual: obj,
      weights: W,
    });
    for (const c of checks) expect(c.score).toBe(1);
    expect(sumScore(checks)).toBe(1);
  });

  it('emits a critical missing-key check when a required key is absent', () => {
    const expected = { permissions: { allow: ['Bash'] }, model: 'sonnet' };
    const actual = { model: 'sonnet' }; // permissions missing
    const checks = jsonComparator.compare({
      filePath: 'settings.json',
      expected,
      actual,
      weights: W,
    });
    const missing = checks.find((c) => c.description.includes('Missing key "permissions"'))!;
    expect(missing).toBeDefined();
    expect(missing.severity).toBe('critical');
    expect(missing.score).toBe(0);
    expect(missing.category).toBe('security');
  });

  it('assigns configuration category by default and security for permissions/hooks paths', () => {
    const expected = { permissions: { allow: ['Bash'] }, model: 'sonnet' };
    const actual = { permissions: { allow: ['Edit'] }, model: 'sonnet' };
    const checks = jsonComparator.compare({
      filePath: 'settings.json',
      expected,
      actual,
      weights: W,
    });
    const perm = checks.find((c) => c.id.includes('json.permissions.allow'))!;
    const model = checks.find((c) => c.id.includes('json.model'))!;
    expect(perm.category).toBe('security');
    expect(model.category).toBe('configuration');
  });

  it('compares permissions.allow as an unordered set', () => {
    const expected = { permissions: { allow: ['Bash', 'Edit', 'Write'] } };
    const actual = { permissions: { allow: ['Write', 'Bash', 'Edit'] } }; // reordered
    const perm = jsonComparator
      .compare({ filePath: 'settings.json', expected, actual, weights: W })
      .find((c) => c.id.includes('permissions.allow'))!;
    expect(perm.score).toBe(1);
  });

  it('gives 0.5 for value mismatch at a leaf', () => {
    const expected = { model: 'sonnet' };
    const actual = { model: 'opus' };
    const checks = jsonComparator.compare({
      filePath: 'settings.json',
      expected,
      actual,
      weights: W,
    });
    const model = checks.find((c) => c.id.includes('json.model'))!;
    expect(model.score).toBe(0.5);
    expect(model.severity).toBe('major');
  });

  it('handles both-empty top level as a passing minor check', () => {
    const checks = jsonComparator.compare({
      filePath: 'empty.json',
      expected: {},
      actual: {},
      weights: W,
    });
    expect(checks).toHaveLength(1);
    expect(checks[0].score).toBe(1);
    expect(checks[0].severity).toBe('minor');
  });

  it('emits a major check when expected array becomes something else', () => {
    const expected = { hooks: [{ event: 'PreToolUse' }] };
    const actual = { hooks: 'broken' as unknown };
    const checks = jsonComparator.compare({
      filePath: 'settings.json',
      expected,
      actual,
      weights: W,
    });
    const hooks = checks.find((c) => c.id.includes('json.hooks'))!;
    expect(hooks.score).toBe(0);
    expect(hooks.severity).toBe('major');
  });
});

describe('yamlComparator (delegates to json walk)', () => {
  it('scores identical YAML-parsed payloads at 1.0', () => {
    const obj = { name: 'alice', age: 30 };
    const checks = yamlComparator.compare({
      filePath: 'x.yaml',
      expected: obj,
      actual: obj,
      weights: W,
    });
    expect(sumScore(checks)).toBe(1);
  });
});

describe('textComparator', () => {
  it('emits a single content check with Jaccard score', () => {
    const checks = textComparator.compare({
      filePath: '.claude/hooks/dlp.py',
      expected: 'import re\n\ndef scan(): pass',
      actual: 'import re\n\ndef scan(): pass',
      weights: W,
    });
    expect(checks).toHaveLength(1);
    expect(checks[0].score).toBe(1);
    expect(checks[0].category).toBe('content');
  });
});

describe('binaryComparator', () => {
  it('returns 1 for identical content and 0 otherwise', () => {
    const same = binaryComparator.compare({
      filePath: 'logo.png',
      expected: 'AAAA',
      actual: 'AAAA',
      weights: W,
    });
    const different = binaryComparator.compare({
      filePath: 'logo.png',
      expected: 'AAAA',
      actual: 'BBBB',
      weights: W,
    });
    expect(same[0].score).toBe(1);
    expect(different[0].score).toBe(0);
  });
});

describe('ScoredCheck weight plumbing', () => {
  it('multiplies category × severity weights correctly', () => {
    const checks = markdownComparator.compare({
      filePath: 'CLAUDE.md',
      expected: '# Title',
      actual: '# Title',
      weights: W,
    });
    const structural = checks.find((c) => c.id.includes('structural.sections'))!;
    // structural=3 × critical=3 × fileMultiplier=1 = 9
    expect(structural.weight).toBe(9);
    const content = checks.find((c) => c.id.includes('content.jaccard'))!;
    // content=1.5 × major=2 = 3
    expect(content.weight).toBe(3);
    const style = checks.find((c) => c.id.includes('style.heading-order'))!;
    // style=0.5 × minor=1 = 0.5
    expect(style.weight).toBe(0.5);
  });

  it('honors per-file weight overrides', () => {
    const weights: Weights = {
      ...DEFAULT_WEIGHTS,
      byFile: { 'CLAUDE.md': 10 },
    };
    const checks = markdownComparator.compare({
      filePath: 'CLAUDE.md',
      expected: '# Title',
      actual: '# Title',
      weights,
    });
    const content = checks.find((c) => c.id.includes('content.jaccard'))!;
    // content=1.5 × major=2 × fileMultiplier=10 = 30
    expect(content.weight).toBe(30);
  });
});

describe('ids are stable per file path', () => {
  it('prefixes every check id with the file path', () => {
    const mdChecks = markdownComparator.compare({
      filePath: 'CLAUDE.md',
      expected: '# T',
      actual: '# T',
      weights: W,
    });
    const jsonChecks = jsonComparator.compare({
      filePath: '.claude/settings.json',
      expected: { a: 1 },
      actual: { a: 1 },
      weights: W,
    });
    for (const id of ids(mdChecks)) expect(id.startsWith('CLAUDE.md#')).toBe(true);
    for (const id of ids(jsonChecks)) expect(id.startsWith('.claude/settings.json#')).toBe(true);
  });
});
