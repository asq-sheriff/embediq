import { describe, it, expect } from 'vitest';
import { CiPipelineGenerator } from '../../src/synthesizer/generators/ci-pipeline.js';
import { EditorConfigGenerator } from '../../src/synthesizer/generators/editorconfig.js';
import { JetBrainsGenerator } from '../../src/synthesizer/generators/jetbrains.js';
import { TargetFormat } from '../../src/synthesizer/target-format.js';
import { parse as parseYaml } from 'yaml';
import { createEmptyProfile, type SetupConfig, type UserProfile } from '../../src/types/index.js';

function buildProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return { ...createEmptyProfile(), ...overrides };
}
function buildConfig(profile: UserProfile): SetupConfig {
  return { profile, targetDir: '/tmp/out' };
}
function devOps(overrides: Partial<UserProfile['devOps']> = {}): UserProfile['devOps'] {
  return { ...createEmptyProfile().devOps, ...overrides };
}

describe('CiPipelineGenerator', () => {
  const gen = new CiPipelineGenerator();

  it('rides on the Claude target', () => {
    expect(gen.target).toBe(TargetFormat.CLAUDE);
  });

  it('emits azure-pipelines.yml only when CI/CD is Azure DevOps', () => {
    const azure = gen.generate(buildConfig(buildProfile({
      role: 'developer', languages: ['csharp'],
      devOps: devOps({ cicd: 'azure_devops', buildTools: ['dotnet'] }),
    })));
    expect(azure).toHaveLength(1);
    expect(azure[0].relativePath).toBe('azure-pipelines.yml');

    const gha = gen.generate(buildConfig(buildProfile({
      role: 'developer', devOps: devOps({ cicd: 'github_actions' }),
    })));
    expect(gha).toHaveLength(0);
  });

  it('skips non-technical roles', () => {
    const files = gen.generate(buildConfig(buildProfile({
      role: 'pm', devOps: devOps({ cicd: 'azure_devops' }),
    })));
    expect(files).toHaveLength(0);
  });

  it('produces valid YAML with stack-matched jobs and a compliance security stage', () => {
    const files = gen.generate(buildConfig(buildProfile({
      role: 'developer',
      languages: ['csharp', 'python'],
      complianceFrameworks: ['hipaa'],
      devOps: devOps({ cicd: 'azure_devops', buildTools: ['dotnet', 'pip'], testFrameworks: ['xunit', 'pytest'] }),
    })));
    const yaml = files[0].content;
    // Must parse — the script values with colons are single-quoted.
    const doc = parseYaml(yaml) as { stages: { stage: string; jobs: { job: string }[] }[] };
    expect(doc.stages.map((s) => s.stage)).toEqual(['Build_Test', 'Security']);
    const jobs = doc.stages[0].jobs.map((j) => j.job);
    expect(jobs).toContain('dotnet');
    expect(jobs).toContain('python');
    expect(yaml).toContain('UseDotNet@2');
    expect(yaml).toContain('pytest');
  });

  it('falls back to a valid placeholder pipeline when no known build tool matches', () => {
    const files = gen.generate(buildConfig(buildProfile({
      role: 'developer', devOps: devOps({ cicd: 'azure_devops', buildTools: ['make'] }),
    })));
    expect(() => parseYaml(files[0].content)).not.toThrow();
    expect(files[0].content).toContain('TODO');
  });
});

describe('EditorConfigGenerator', () => {
  const gen = new EditorConfigGenerator();

  it('emits .editorconfig only when Visual Studio is selected', () => {
    const vs = gen.generate(buildConfig(buildProfile({
      role: 'developer', languages: ['csharp'], devOps: devOps({ ide: ['visual_studio'] }),
    })));
    expect(vs).toHaveLength(1);
    expect(vs[0].relativePath).toBe('.editorconfig');
    expect(vs[0].content).toContain('root = true');
    expect(vs[0].content).toContain('[*.cs]');

    const noVs = gen.generate(buildConfig(buildProfile({
      role: 'developer', devOps: devOps({ ide: ['vscode', 'jetbrains'] }),
    })));
    expect(noVs).toHaveLength(0);
  });

  it('skips non-technical roles', () => {
    const files = gen.generate(buildConfig(buildProfile({
      role: 'executive', devOps: devOps({ ide: ['visual_studio'] }),
    })));
    expect(files).toHaveLength(0);
  });
});

describe('JetBrainsGenerator', () => {
  const gen = new JetBrainsGenerator();

  it('emits .junie/guidelines.md and .aiignore only when JetBrains is selected', () => {
    const files = gen.generate(buildConfig(buildProfile({
      role: 'developer', languages: ['java'], devOps: devOps({ ide: ['jetbrains'] }),
    })));
    expect(files.map((f) => f.relativePath).sort()).toEqual(['.aiignore', '.junie/guidelines.md']);

    const none = gen.generate(buildConfig(buildProfile({
      role: 'developer', devOps: devOps({ ide: ['vscode'] }),
    })));
    expect(none).toHaveLength(0);
  });

  it('adds PHI exclusions to .aiignore for HIPAA profiles', () => {
    const files = gen.generate(buildConfig(buildProfile({
      role: 'developer',
      complianceFrameworks: ['hipaa'],
      securityConcerns: ['phi'],
      devOps: devOps({ ide: ['jetbrains'] }),
    })));
    const aiignore = files.find((f) => f.relativePath === '.aiignore')!;
    expect(aiignore.content).toContain('phi/');
    const guidelines = files.find((f) => f.relativePath === '.junie/guidelines.md')!;
    expect(guidelines.content).toContain('HIPAA');
  });

  it('skips non-technical roles', () => {
    const files = gen.generate(buildConfig(buildProfile({
      role: 'ba', devOps: devOps({ ide: ['jetbrains'] }),
    })));
    expect(files).toHaveLength(0);
  });
});
