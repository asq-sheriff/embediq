import { describe, it, expect } from 'vitest';
import { ManagedSettingsGenerator } from '../../src/synthesizer/generators/managed-settings.js';
import { DevContainerGenerator } from '../../src/synthesizer/generators/devcontainer.js';
import { TargetFormat } from '../../src/synthesizer/target-format.js';
import { createEmptyProfile, type Answer, type SetupConfig, type UserProfile } from '../../src/types/index.js';

function buildProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return { ...createEmptyProfile(), ...overrides };
}
function buildConfig(profile: UserProfile): SetupConfig {
  return { profile, targetDir: '/tmp/out' };
}
function devOps(overrides: Partial<UserProfile['devOps']> = {}): UserProfile['devOps'] {
  return { ...createEmptyProfile().devOps, ...overrides };
}
function withTier(tier: string): Map<string, Answer> {
  return new Map([['REG_008', { questionId: 'REG_008', value: tier, timestamp: new Date(0) }]]);
}

describe('ManagedSettingsGenerator', () => {
  const gen = new ManagedSettingsGenerator();

  it('rides on the Claude target', () => {
    expect(gen.target).toBe(TargetFormat.CLAUDE);
  });

  it('emits managed-settings.json + README for a sandbox-enforced posture, with sandbox required', () => {
    const files = gen.generate(buildConfig(buildProfile({
      role: 'developer', devOps: devOps({ isolationModel: 'vdi' }),
    })));
    expect(files.map((f) => f.relativePath).sort()).toEqual([
      'deploy/claude-code/README.md',
      'deploy/claude-code/managed-settings.json',
    ]);
    const json = JSON.parse(files.find((f) => f.relativePath.endsWith('.json'))!.content);
    expect(json.sandbox.enabled).toBe(true);
    expect(json.permissions.deny).toContain('Bash(rm -rf /)');
    expect(json.permissions.deny).toContain('Read(**/.env)');
  });

  it('emits for managed_endpoint, dev_container, vdi, ephemeral_cloud', () => {
    for (const model of ['managed_endpoint', 'dev_container', 'vdi', 'ephemeral_cloud']) {
      const files = gen.generate(buildConfig(buildProfile({ role: 'developer', devOps: devOps({ isolationModel: model }) })));
      expect(files, model).toHaveLength(2);
    }
  });

  it('no-op for ci_only, none, unset', () => {
    for (const model of ['ci_only', 'none', '']) {
      const files = gen.generate(buildConfig(buildProfile({ role: 'developer', devOps: devOps({ isolationModel: model }) })));
      expect(files, `model="${model}"`).toHaveLength(0);
    }
  });

  it('skips non-technical roles', () => {
    const files = gen.generate(buildConfig(buildProfile({
      role: 'pm', devOps: devOps({ isolationModel: 'vdi' }),
    })));
    expect(files).toHaveLength(0);
  });

  it('adds PHI read-denies for HIPAA profiles', () => {
    const files = gen.generate(buildConfig(buildProfile({
      role: 'developer', securityConcerns: ['phi'], devOps: devOps({ isolationModel: 'managed_endpoint' }),
    })));
    const json = JSON.parse(files.find((f) => f.relativePath.endsWith('.json'))!.content);
    expect(json.permissions.deny).toContain('Read(**/phi/**)');
  });

  it('denies raw network commands at the strict/lockdown floor', () => {
    const files = gen.generate(buildConfig(buildProfile({
      role: 'developer', answers: withTier('lockdown'), devOps: devOps({ isolationModel: 'vdi' }),
    })));
    const json = JSON.parse(files.find((f) => f.relativePath.endsWith('.json'))!.content);
    expect(json.permissions.deny).toContain('Bash(curl *)');
  });
});

describe('DevContainerGenerator', () => {
  const gen = new DevContainerGenerator();

  it('emits devcontainer.json + README only when isolation posture is dev_container', () => {
    const files = gen.generate(buildConfig(buildProfile({
      role: 'developer', languages: ['python'], devOps: devOps({ isolationModel: 'dev_container' }),
    })));
    expect(files.map((f) => f.relativePath).sort()).toEqual([
      '.devcontainer/README.md',
      '.devcontainer/devcontainer.json',
    ]);
    const json = JSON.parse(files.find((f) => f.relativePath.endsWith('.json'))!.content);
    expect(json.image).toContain('python');
    expect(json.postCreateCommand).toContain('@anthropic-ai/claude-code');
  });

  it('no-op for every other isolation posture and unset', () => {
    for (const model of ['managed_endpoint', 'vdi', 'ephemeral_cloud', 'ci_only', 'none', '']) {
      const files = gen.generate(buildConfig(buildProfile({ role: 'developer', devOps: devOps({ isolationModel: model }) })));
      expect(files, `model="${model}"`).toHaveLength(0);
    }
  });

  it('falls back to a base image when no known language matches', () => {
    const files = gen.generate(buildConfig(buildProfile({
      role: 'developer', languages: [], devOps: devOps({ isolationModel: 'dev_container' }),
    })));
    const json = JSON.parse(files.find((f) => f.relativePath.endsWith('.json'))!.content);
    expect(json.image).toContain('base:ubuntu');
  });

  it('warns that --dangerously-skip-permissions is only safe inside the boundary', () => {
    const files = gen.generate(buildConfig(buildProfile({
      role: 'developer', devOps: devOps({ isolationModel: 'dev_container' }),
    })));
    const readme = files.find((f) => f.relativePath.endsWith('README.md'))!;
    expect(readme.content).toContain('--dangerously-skip-permissions');
    expect(readme.content).toContain('Never');
  });

  it('skips non-technical roles', () => {
    const files = gen.generate(buildConfig(buildProfile({
      role: 'ba', devOps: devOps({ isolationModel: 'dev_container' }),
    })));
    expect(files).toHaveLength(0);
  });
});
