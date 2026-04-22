import { describe, it, expect, beforeEach } from 'vitest';
import { AgentsMdGenerator } from '../../src/synthesizer/generators/agents-md.js';
import { CursorRulesGenerator } from '../../src/synthesizer/generators/cursor-rules.js';
import { CopilotInstructionsGenerator } from '../../src/synthesizer/generators/copilot-instructions.js';
import { GeminiMdGenerator } from '../../src/synthesizer/generators/gemini-md.js';
import { WindsurfRulesGenerator } from '../../src/synthesizer/generators/windsurf-rules.js';
import { TargetFormat } from '../../src/synthesizer/target-format.js';
import { createEmptyProfile, type SetupConfig, type UserProfile } from '../../src/types/index.js';

function buildProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return { ...createEmptyProfile(), ...overrides };
}

function buildConfig(profile: UserProfile): SetupConfig {
  return { profile, targetDir: '/tmp/out' };
}

describe('AgentsMdGenerator', () => {
  let generator: AgentsMdGenerator;
  beforeEach(() => {
    generator = new AgentsMdGenerator();
  });

  it('targets the AGENTS.md format', () => {
    expect(generator.target).toBe(TargetFormat.AGENTS_MD);
  });

  it('emits a single AGENTS.md file at the repo root', () => {
    const files = generator.generate(buildConfig(buildProfile({
      role: 'developer',
      businessDomain: 'Patient portal',
      languages: ['typescript'],
    })));
    expect(files).toHaveLength(1);
    expect(files[0].relativePath).toBe('AGENTS.md');
  });

  it('includes Stack, Commands, Rules, and Terminology sections for technical roles', () => {
    const files = generator.generate(buildConfig(buildProfile({
      role: 'developer',
      languages: ['typescript'],
      devOps: { ...createEmptyProfile().devOps, buildTools: ['npm'], testFrameworks: ['jest'] },
    })));
    const content = files[0].content;
    expect(content).toContain('## Stack');
    expect(content).toContain('## Commands');
    expect(content).toContain('## Rules');
    expect(content).toContain('## Terminology');
    expect(content).toContain('npm install');
    expect(content).toContain('npm test');
  });

  it('surfaces HIPAA boundaries when compliance is configured', () => {
    const files = generator.generate(buildConfig(buildProfile({
      role: 'developer',
      complianceFrameworks: ['hipaa'],
      securityConcerns: ['phi', 'dlp', 'strict_permissions'],
    })));
    const content = files[0].content;
    expect(content).toContain('## Boundaries');
    expect(content).toContain('HIPAA');
    expect(content).toContain('PHI');
    expect(content).toContain('DLP');
    expect(content).toContain('PHI: Protected Health Information');
  });

  it('renders a coworker-shaped document for non-technical roles', () => {
    const files = generator.generate(buildConfig(buildProfile({
      role: 'pm',
      businessDomain: 'SaaS Platform',
      complianceFrameworks: ['hipaa'],
    })));
    const content = files[0].content;
    expect(content).toContain('Product Manager Workspace');
    expect(content).toContain('Use clear, non-technical language');
    expect(content).toContain('HIPAA');
    expect(content).not.toMatch(/npm install/);
  });
});

describe('CursorRulesGenerator', () => {
  let generator: CursorRulesGenerator;
  beforeEach(() => {
    generator = new CursorRulesGenerator();
  });

  it('emits a project rule under .cursor/rules/project.mdc', () => {
    const files = generator.generate(buildConfig(buildProfile({
      role: 'developer',
      languages: ['typescript'],
    })));
    const project = files.find((f) => f.relativePath === '.cursor/rules/project.mdc');
    expect(project).toBeDefined();
    expect(project!.content).toContain('---');
    expect(project!.content).toContain('alwaysApply: true');
  });

  it('emits glob-scoped language rules with a globs frontmatter field', () => {
    const files = generator.generate(buildConfig(buildProfile({
      role: 'developer',
      languages: ['typescript', 'python'],
    })));
    const ts = files.find((f) => f.relativePath === '.cursor/rules/typescript.mdc');
    const py = files.find((f) => f.relativePath === '.cursor/rules/python.mdc');
    expect(ts).toBeDefined();
    expect(ts!.content).toContain('globs:');
    expect(ts!.content).toContain('**/*.ts');
    expect(py!.content).toContain('**/*.py');
  });

  it('marks security and compliance rules alwaysApply:true', () => {
    const files = generator.generate(buildConfig(buildProfile({
      role: 'developer',
      languages: ['typescript'],
      complianceFrameworks: ['hipaa'],
      securityConcerns: ['phi', 'dlp'],
    })));
    const security = files.find((f) => f.relativePath === '.cursor/rules/security.mdc');
    const hipaa = files.find((f) => f.relativePath === '.cursor/rules/hipaa-compliance.mdc');
    expect(security).toBeDefined();
    expect(security!.content).toContain('alwaysApply: true');
    expect(hipaa).toBeDefined();
    expect(hipaa!.content).toContain('alwaysApply: true');
  });

  it('emits a single coworker-shaped rule for non-technical roles', () => {
    const files = generator.generate(buildConfig(buildProfile({
      role: 'ba',
      businessDomain: 'Healthcare',
    })));
    expect(files).toHaveLength(1);
    expect(files[0].relativePath).toBe('.cursor/rules/project.mdc');
    expect(files[0].content).toContain('Business Analyst Workspace');
  });
});

describe('CopilotInstructionsGenerator', () => {
  let generator: CopilotInstructionsGenerator;
  beforeEach(() => {
    generator = new CopilotInstructionsGenerator();
  });

  it('emits .github/copilot-instructions.md plus scoped instructions', () => {
    const files = generator.generate(buildConfig(buildProfile({
      role: 'developer',
      languages: ['typescript'],
      complianceFrameworks: ['hipaa'],
      securityConcerns: ['phi'],
    })));
    const paths = files.map((f) => f.relativePath);
    expect(paths).toContain('.github/copilot-instructions.md');
    expect(paths).toContain('.github/instructions/typescript.instructions.md');
    expect(paths).toContain('.github/instructions/tests.instructions.md');
    expect(paths).toContain('.github/instructions/security.instructions.md');
  });

  it('includes applyTo frontmatter on scoped instruction files', () => {
    const files = generator.generate(buildConfig(buildProfile({
      role: 'developer',
      languages: ['typescript'],
    })));
    const ts = files.find(
      (f) => f.relativePath === '.github/instructions/typescript.instructions.md',
    );
    expect(ts).toBeDefined();
    expect(ts!.content).toMatch(/^---\napplyTo: "\*\*\/\*\.ts,\*\*\/\*\.tsx"\n---/);
  });

  it('renders a coworker-shaped project file for non-technical roles', () => {
    const files = generator.generate(buildConfig(buildProfile({
      role: 'executive',
      businessDomain: 'Finance',
    })));
    expect(files).toHaveLength(1);
    expect(files[0].relativePath).toBe('.github/copilot-instructions.md');
    expect(files[0].content).toContain('Executive Workspace');
  });
});

describe('GeminiMdGenerator', () => {
  let generator: GeminiMdGenerator;
  beforeEach(() => {
    generator = new GeminiMdGenerator();
  });

  it('emits a single GEMINI.md with "About this project" preamble', () => {
    const files = generator.generate(buildConfig(buildProfile({
      role: 'developer',
      businessDomain: 'Patient portal',
      languages: ['typescript'],
    })));
    expect(files).toHaveLength(1);
    expect(files[0].relativePath).toBe('GEMINI.md');
    expect(files[0].content).toContain('## About this project');
    expect(files[0].content).toContain('## Stack');
  });

  it('includes Boundaries section when compliance or security concerns exist', () => {
    const files = generator.generate(buildConfig(buildProfile({
      role: 'developer',
      complianceFrameworks: ['pci'],
      securityConcerns: ['strict_permissions'],
    })));
    expect(files[0].content).toContain('## Boundaries');
    expect(files[0].content).toContain('PCI-DSS');
    expect(files[0].content).toContain('Destructive shell operations');
  });
});

describe('WindsurfRulesGenerator', () => {
  let generator: WindsurfRulesGenerator;
  beforeEach(() => {
    generator = new WindsurfRulesGenerator();
  });

  it('emits a single .windsurfrules file', () => {
    const files = generator.generate(buildConfig(buildProfile({
      role: 'developer',
      languages: ['typescript'],
    })));
    expect(files).toHaveLength(1);
    expect(files[0].relativePath).toBe('.windsurfrules');
    expect(files[0].content).toContain('## Stack');
    expect(files[0].content).toContain('## Rules');
  });

  it('omits boundaries when no compliance is configured', () => {
    const files = generator.generate(buildConfig(buildProfile({
      role: 'developer',
      languages: ['typescript'],
    })));
    expect(files[0].content).not.toContain('## Boundaries');
  });
});
