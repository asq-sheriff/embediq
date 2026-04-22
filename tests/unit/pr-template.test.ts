import { describe, it, expect } from 'vitest';
import { buildPrTemplate } from '../../src/integrations/git/pr-template.js';
import { createEmptyProfile, type GeneratedFile, type UserProfile, type ValidationResult } from '../../src/types/index.js';

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return { ...createEmptyProfile(), ...overrides };
}

function file(path: string): GeneratedFile {
  return { relativePath: path, content: '# x', description: '' };
}

describe('buildPrTemplate', () => {
  it('emits the default title and a commit message derived from it', () => {
    const t = buildPrTemplate({
      profile: profile({ role: 'developer', businessDomain: 'Patient portal' }),
      files: [file('CLAUDE.md')],
    });
    expect(t.title).toBe('EmbedIQ: regenerate configuration');
    expect(t.commitMessage).toContain(t.title);
    expect(t.commitMessage).toContain('Patient portal');
  });

  it('groups files by generator in the Changes section', () => {
    const t = buildPrTemplate({
      profile: profile({ role: 'developer' }),
      files: [
        file('CLAUDE.md'),
        file('.claude/settings.json'),
        file('.claude/rules/typescript.md'),
        file('AGENTS.md'),
        file('.cursor/rules/project.mdc'),
      ],
    });
    expect(t.body).toContain('## Changes');
    expect(t.body).toContain('**CLAUDE.md**');
    expect(t.body).toContain('**settings.json**');
    expect(t.body).toContain('**rules**');
    expect(t.body).toContain('**AGENTS.md**');
    expect(t.body).toContain('**cursor-rules**');
  });

  it('renders a validation section with pass/fail/warn counts and first failures', () => {
    const validation: ValidationResult = {
      passed: false,
      summary: '2 of 4 checks passed',
      checks: [
        { name: 'A', passed: true, severity: 'error', message: '' },
        { name: 'B', passed: true, severity: 'error', message: '' },
        { name: 'C missing', passed: false, severity: 'error', message: 'C must exist' },
        { name: 'D warn', passed: false, severity: 'warning', message: 'D should exist' },
      ],
    };
    const t = buildPrTemplate({
      profile: profile({ role: 'developer' }),
      files: [file('CLAUDE.md')],
      validation,
    });
    expect(t.body).toContain('## Validation');
    expect(t.body).toContain('2 pass / 1 fail / 1 warn');
    expect(t.body).toContain('C missing');
    expect(t.body).toContain('D warn');
  });

  it('omits the Validation section when no validation is supplied', () => {
    const t = buildPrTemplate({
      profile: profile({ role: 'developer' }),
      files: [file('CLAUDE.md')],
    });
    expect(t.body).not.toContain('## Validation');
  });

  it('includes a Contributors table sorted by answer count', () => {
    const t = buildPrTemplate({
      profile: profile({ role: 'developer' }),
      files: [file('CLAUDE.md')],
      contributors: {
        'alice@example.com': 5,
        'bob@example.com': 12,
        'charlie@example.com': 0, // dropped — zero answers
      },
    });
    expect(t.body).toContain('## Contributors');
    const bobIdx = t.body.indexOf('bob@example.com');
    const aliceIdx = t.body.indexOf('alice@example.com');
    expect(bobIdx).toBeGreaterThan(-1);
    expect(aliceIdx).toBeGreaterThan(-1);
    expect(bobIdx).toBeLessThan(aliceIdx); // bob first — higher count
    expect(t.body).not.toContain('charlie');
  });

  it('omits Contributors when the map is missing or empty', () => {
    const t = buildPrTemplate({
      profile: profile({ role: 'developer' }),
      files: [file('CLAUDE.md')],
      contributors: {},
    });
    expect(t.body).not.toContain('## Contributors');
  });

  it('appends the drift section when autopilot supplies drift context', () => {
    const t = buildPrTemplate({
      profile: profile({ role: 'developer' }),
      files: [file('CLAUDE.md')],
      driftSummary: {
        totalDrift: 3,
        missing: 1,
        modifiedByUser: 0,
        modifiedStaleStamp: 1,
        versionMismatch: 0,
        extra: 1,
      },
    });
    expect(t.body).toContain('## Drift that triggered this PR');
    expect(t.body).toContain('Total drift: **3**');
    expect(t.body).toContain('1 missing');
  });

  it('honors titleOverride and commitMessageOverride', () => {
    const t = buildPrTemplate({
      profile: profile({ role: 'developer' }),
      files: [file('CLAUDE.md')],
      titleOverride: 'Custom: nightly regen',
      commitMessageOverride: 'chore(embediq): nightly regen',
    });
    expect(t.title).toBe('Custom: nightly regen');
    expect(t.commitMessage).toBe('chore(embediq): nightly regen');
  });
});
