import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SkillRegistry, skillRegistry } from '../../src/skills/skill-registry.js';
import { summarizeSkill, type Skill } from '../../src/skills/skill.js';

function bareSkill(id: string, overrides: Partial<Skill> = {}): Skill {
  return {
    id,
    name: id,
    version: '1.0.0',
    description: '',
    tags: [],
    ...overrides,
  };
}

describe('SkillRegistry — built-in registration', () => {
  it('exposes the three built-in skills out of the box', () => {
    const ids = skillRegistry.list().map((s) => s.id).sort();
    expect(ids).toContain('healthcare.full');
    expect(ids).toContain('finance.full');
    expect(ids).toContain('education.full');
  });

  it('marks built-in skills with source="built-in"', () => {
    const skill = skillRegistry.getById('healthcare.full');
    expect(skill).toBeDefined();
    expect(skill!.source).toBe('built-in');
  });

  it('summarizeSkill produces a JSON-safe view with counts', () => {
    const skill = skillRegistry.getById('healthcare.full')!;
    const summary = summarizeSkill(skill);
    expect(summary.id).toBe('healthcare.full');
    expect(summary.counts.questions).toBeGreaterThan(0);
    expect(summary.counts.dlpPatterns).toBeGreaterThan(0);
    expect(summary.counts.ruleTemplates).toBeGreaterThan(0);
    // Should be JSON-serializable (no function bodies leak through).
    expect(() => JSON.stringify(summary)).not.toThrow();
  });
});

describe('SkillRegistry — programmatic registration', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  it('registers and retrieves a skill by id', () => {
    registry.register(bareSkill('test.alpha'));
    expect(registry.getById('test.alpha')?.id).toBe('test.alpha');
    expect(registry.size()).toBe(1);
  });

  it('preserves the first registration on id collision', () => {
    registry.register(bareSkill('dup', { name: 'first' }));
    registry.register(bareSkill('dup', { name: 'second' }));
    expect(registry.getById('dup')?.name).toBe('first');
    expect(registry.size()).toBe(1);
  });

  it('returns skills matching a tag', () => {
    registry.register(bareSkill('a', { tags: ['security', 'phi'] }));
    registry.register(bareSkill('b', { tags: ['phi'] }));
    registry.register(bareSkill('c', { tags: ['cardholder'] }));
    const phi = registry.getByTag('phi').map((s) => s.id).sort();
    expect(phi).toEqual(['a', 'b']);
  });

  it('returns the requested subset via getByIds', () => {
    registry.register(bareSkill('a'));
    registry.register(bareSkill('b'));
    registry.register(bareSkill('c'));
    const subset = registry.getByIds(['a', 'c', 'missing']).map((s) => s.id);
    expect(subset).toEqual(['a', 'c']);
  });

  it('list() returns skills sorted by id', () => {
    registry.register(bareSkill('zeta'));
    registry.register(bareSkill('alpha'));
    registry.register(bareSkill('mu'));
    expect(registry.list().map((s) => s.id)).toEqual(['alpha', 'mu', 'zeta']);
  });
});

describe('SkillRegistry — external loading', () => {
  let dir: string;
  let registry: SkillRegistry;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'embediq-skills-'));
    registry = new SkillRegistry();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('loads a skill from a SKILL.md directory', async () => {
    const skillDir = join(dir, 'my-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      [
        '---',
        'id: external.test',
        'name: External Test Skill',
        'version: 0.1.0',
        'tags:',
        '  - test',
        '  - external',
        '---',
        'A skill loaded from disk for testing.',
      ].join('\n'),
      'utf-8',
    );

    await registry.loadExternalSkills(dir);
    const skill = registry.getById('external.test');
    expect(skill).toBeDefined();
    expect(skill!.source).toBe('external');
    expect(skill!.tags).toEqual(['test', 'external']);
    expect(skill!.description).toBe('A skill loaded from disk for testing.');
  });

  it('parses dlp.yaml, compliance.yaml, rules/, ignore.txt when present', async () => {
    const skillDir = join(dir, 'rich-skill');
    await mkdir(join(skillDir, 'rules'), { recursive: true });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      '---\nid: rich.test\nname: Rich\nversion: 1.0.0\n---\nRich skill',
      'utf-8',
    );
    await writeFile(
      join(skillDir, 'dlp.yaml'),
      `- name: TestPattern\n  pattern: "\\\\bTEST\\\\d+\\\\b"\n  severity: HIGH\n  description: A test pattern\n`,
      'utf-8',
    );
    await writeFile(
      join(skillDir, 'compliance.yaml'),
      `frameworks:\n  - key: testfw\n    label: Test Framework\n    description: Framework for testing\npriorityCategories:\n  Testing:\n    - test\n    - example\n`,
      'utf-8',
    );
    await writeFile(join(skillDir, 'rules', 'testing.md'), '# Test rule\n', 'utf-8');
    await writeFile(join(skillDir, 'ignore.txt'), 'fixtures/\n*.tmp\n', 'utf-8');

    await registry.loadExternalSkills(dir);
    const skill = registry.getById('rich.test')!;
    expect(skill.dlpPatterns).toHaveLength(1);
    expect(skill.dlpPatterns![0].name).toBe('TestPattern');
    expect(skill.complianceFrameworks).toHaveLength(1);
    expect(skill.priorityCategories?.Testing).toEqual(['test', 'example']);
    expect(skill.ruleTemplates).toHaveLength(1);
    expect(skill.ruleTemplates![0].filename).toBe('testing.md');
    expect(skill.ignorePatterns).toEqual(['fixtures/', '*.tmp']);
  });

  it('skips subdirectories without SKILL.md', async () => {
    await mkdir(join(dir, 'not-a-skill'), { recursive: true });
    await writeFile(join(dir, 'not-a-skill', 'README.md'), '# README', 'utf-8');
    await registry.loadExternalSkills(dir);
    expect(registry.size()).toBe(0);
  });

  it('logs (does not throw) when a skill directory is malformed', async () => {
    const badDir = join(dir, 'bad');
    await mkdir(badDir, { recursive: true });
    await writeFile(join(badDir, 'SKILL.md'), 'no frontmatter here', 'utf-8');
    // Suppress noise from the registry's console.error.
    const orig = console.error;
    console.error = () => {};
    try {
      await expect(registry.loadExternalSkills(dir)).resolves.toBeUndefined();
    } finally {
      console.error = orig;
    }
    expect(registry.size()).toBe(0);
  });

  it('returns silently when EMBEDIQ_SKILLS_DIR does not exist', async () => {
    await registry.loadExternalSkills(join(dir, 'nope'));
    expect(registry.size()).toBe(0);
  });
});

describe('DomainPackRegistry — composeFromSkills', () => {
  it('composes a DomainPack from registered skill ids', async () => {
    const { domainPackRegistry } = await import('../../src/domain-packs/registry.js');
    const composed = domainPackRegistry.composeFromSkills(
      ['healthcare.full'],
      {
        id: 'composed-test',
        name: 'Composed test',
        version: '0.1.0',
        description: 'composed in-test',
      },
    );
    expect(composed).toBeDefined();
    // Composing a single skill is a passthrough — payload should match
    // the underlying healthcare pack's full content.
    const native = domainPackRegistry.getById('healthcare')!;
    expect(composed!.questions.length).toBe(native.questions.length);
    expect(composed!.dlpPatterns.length).toBe(native.dlpPatterns.length);
    expect(composed!.ruleTemplates.length).toBe(native.ruleTemplates.length);
  });

  it('returns undefined when any skill id is unknown', async () => {
    const { domainPackRegistry } = await import('../../src/domain-packs/registry.js');
    const composed = domainPackRegistry.composeFromSkills(
      ['healthcare.full', 'does-not-exist'],
      { id: 'x', name: 'x', version: '0.0.0', description: '' },
    );
    expect(composed).toBeUndefined();
  });
});
