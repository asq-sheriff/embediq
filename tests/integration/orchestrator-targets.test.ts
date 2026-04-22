import { describe, it, expect } from 'vitest';
import { SynthesizerOrchestrator } from '../../src/synthesizer/orchestrator.js';
import { TargetFormat, ALL_TARGETS } from '../../src/synthesizer/target-format.js';
import { InMemoryEventBus } from '../../src/events/bus.js';
import { createEmptyProfile, type SetupConfig, type UserProfile } from '../../src/types/index.js';

function buildProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return { ...createEmptyProfile(), ...overrides };
}

async function runOrchestrator(config: SetupConfig) {
  const bus = new InMemoryEventBus();
  const orchestrator = new SynthesizerOrchestrator(bus);
  return orchestrator.generate(config);
}

describe('SynthesizerOrchestrator — target filtering', () => {
  it('defaults to Claude-only output when targets is omitted', async () => {
    const files = await runOrchestrator({
      profile: buildProfile({ role: 'developer', languages: ['typescript'] }),
      targetDir: '/tmp/out',
    });
    // None of the multi-agent files should appear.
    expect(files.some((f) => f.relativePath === 'AGENTS.md')).toBe(false);
    expect(files.some((f) => f.relativePath === 'GEMINI.md')).toBe(false);
    expect(files.some((f) => f.relativePath === '.windsurfrules')).toBe(false);
    expect(files.some((f) => f.relativePath.startsWith('.cursor/rules/'))).toBe(false);
    expect(files.some((f) => f.relativePath.startsWith('.github/'))).toBe(false);
    // And the Claude baseline should be present.
    expect(files.some((f) => f.relativePath === 'CLAUDE.md')).toBe(true);
    expect(files.some((f) => f.relativePath === '.claude/settings.json')).toBe(true);
  });

  it('preserves Claude behavior when targets=[claude]', async () => {
    const baseline = await runOrchestrator({
      profile: buildProfile({ role: 'developer', languages: ['typescript'] }),
      targetDir: '/tmp/out',
    });
    const explicit = await runOrchestrator({
      profile: buildProfile({ role: 'developer', languages: ['typescript'] }),
      targetDir: '/tmp/out',
      targets: [TargetFormat.CLAUDE],
    });
    expect(explicit.map((f) => f.relativePath).sort()).toEqual(
      baseline.map((f) => f.relativePath).sort(),
    );
  });

  it('emits only AGENTS.md when targets=[agents-md]', async () => {
    const files = await runOrchestrator({
      profile: buildProfile({ role: 'developer', languages: ['typescript'] }),
      targetDir: '/tmp/out',
      targets: [TargetFormat.AGENTS_MD],
    });
    expect(files).toHaveLength(1);
    expect(files[0].relativePath).toBe('AGENTS.md');
  });

  it('emits all six target families when targets=ALL', async () => {
    const files = await runOrchestrator({
      profile: buildProfile({
        role: 'developer',
        businessDomain: 'Patient portal',
        languages: ['typescript'],
        complianceFrameworks: ['hipaa'],
        securityConcerns: ['phi', 'dlp'],
      }),
      targetDir: '/tmp/out',
      targets: [...ALL_TARGETS],
    });
    const paths = files.map((f) => f.relativePath);
    expect(paths).toContain('CLAUDE.md');
    expect(paths).toContain('AGENTS.md');
    expect(paths).toContain('GEMINI.md');
    expect(paths).toContain('.windsurfrules');
    expect(paths).toContain('.github/copilot-instructions.md');
    expect(paths.some((p) => p.startsWith('.cursor/rules/'))).toBe(true);
  });

  it('combines selected targets into one run (claude,cursor,agents-md)', async () => {
    const files = await runOrchestrator({
      profile: buildProfile({ role: 'developer', languages: ['typescript'] }),
      targetDir: '/tmp/out',
      targets: [TargetFormat.CLAUDE, TargetFormat.CURSOR, TargetFormat.AGENTS_MD],
    });
    const paths = files.map((f) => f.relativePath);
    expect(paths).toContain('CLAUDE.md');
    expect(paths).toContain('AGENTS.md');
    expect(paths.some((p) => p.startsWith('.cursor/rules/'))).toBe(true);
    // Other targets should be absent.
    expect(paths).not.toContain('GEMINI.md');
    expect(paths).not.toContain('.windsurfrules');
    expect(paths.some((p) => p.startsWith('.github/'))).toBe(false);
  });

  it('produces coworker-shaped output per-target for non-technical roles', async () => {
    const files = await runOrchestrator({
      profile: buildProfile({
        role: 'pm',
        businessDomain: 'SaaS Platform',
        complianceFrameworks: [],
      }),
      targetDir: '/tmp/out',
      targets: [
        TargetFormat.CLAUDE,
        TargetFormat.AGENTS_MD,
        TargetFormat.CURSOR,
        TargetFormat.COPILOT,
        TargetFormat.GEMINI,
        TargetFormat.WINDSURF,
      ],
    });
    // Non-technical Claude produces a coworker CLAUDE.md (orchestrator overlay)
    // and skips hooks/association-map.
    expect(files.some((f) => f.relativePath === 'CLAUDE.md')).toBe(true);
    expect(files.some((f) => f.relativePath.startsWith('.claude/hooks/'))).toBe(false);
    // Every other target emits exactly its coworker variant.
    const agents = files.find((f) => f.relativePath === 'AGENTS.md')!;
    const gemini = files.find((f) => f.relativePath === 'GEMINI.md')!;
    const windsurf = files.find((f) => f.relativePath === '.windsurfrules')!;
    const cursor = files.filter((f) => f.relativePath.startsWith('.cursor/rules/'));
    const copilot = files.filter((f) => f.relativePath.startsWith('.github/'));
    expect(agents.content).toContain('Product Manager Workspace');
    expect(gemini.content).toContain('Product Manager Workspace');
    expect(windsurf.content).toContain('Product Manager Workspace');
    expect(cursor).toHaveLength(1);
    expect(cursor[0].relativePath).toBe('.cursor/rules/project.mdc');
    expect(copilot).toHaveLength(1);
    expect(copilot[0].relativePath).toBe('.github/copilot-instructions.md');
  });

  it('does not add a coworker CLAUDE.md overlay when claude is not selected', async () => {
    const files = await runOrchestrator({
      profile: buildProfile({ role: 'pm', businessDomain: 'Finance' }),
      targetDir: '/tmp/out',
      targets: [TargetFormat.AGENTS_MD],
    });
    expect(files.some((f) => f.relativePath === 'CLAUDE.md')).toBe(false);
    expect(files).toHaveLength(1);
    expect(files[0].relativePath).toBe('AGENTS.md');
  });
});
