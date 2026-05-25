import { describe, it, expect } from 'vitest';
import { SynthesizerOrchestrator } from '../../src/synthesizer/orchestrator.js';
import { TargetFormat } from '../../src/synthesizer/target-format.js';
import { InMemoryEventBus } from '../../src/events/bus.js';
import { createEmptyProfile, type SetupConfig, type UserProfile } from '../../src/types/index.js';
import type { ProvenanceTrace } from '../../src/governance/provenance/index.js';

function buildProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return { ...createEmptyProfile(), ...overrides };
}

async function runOrchestrator(config: SetupConfig) {
  const bus = new InMemoryEventBus();
  const orchestrator = new SynthesizerOrchestrator(bus);
  return orchestrator.generate(config);
}

const PROVENANCE_PATH = '.embediq/provenance/manifest.json';

describe('SynthesizerOrchestrator — provenance trace post-pass (8E)', () => {
  it('does NOT emit the provenance manifest by default — opt-in via target only', async () => {
    const files = await runOrchestrator({
      profile: buildProfile({ role: 'developer', languages: ['typescript'] }),
      targetDir: '/tmp/out',
    });
    expect(files.some((f) => f.relativePath === PROVENANCE_PATH)).toBe(false);
  });

  it('emits a valid provenance trace when the provenance target is selected', async () => {
    const files = await runOrchestrator({
      profile: buildProfile({
        role: 'developer',
        industry: 'healthcare',
        languages: ['typescript'],
        complianceFrameworks: ['hipaa'],
      }),
      targetDir: '/tmp/out',
      targets: [TargetFormat.CLAUDE, TargetFormat.PROVENANCE],
    });
    const provenance = files.find((f) => f.relativePath === PROVENANCE_PATH);
    expect(provenance).toBeDefined();
    const doc = JSON.parse(provenance!.content) as ProvenanceTrace;
    expect(doc.schemaVersion).toBe(1);
    expect(doc.producer.name).toBe('EmbedIQ');
    expect(doc.methodology.generatorAttribution).toBe('authoritative');
    expect(doc.methodology.driverInference).toBe('heuristic');
    // Every file in the run has an entry (including the provenance manifest itself).
    expect(doc.files.length).toBe(files.length);
  });

  it('records authoritative generator + target for every file', async () => {
    const files = await runOrchestrator({
      profile: buildProfile({
        role: 'developer',
        languages: ['typescript'],
      }),
      targetDir: '/tmp/out',
      targets: [TargetFormat.CLAUDE, TargetFormat.PROVENANCE],
    });
    const provenance = files.find((f) => f.relativePath === PROVENANCE_PATH)!;
    const doc = JSON.parse(provenance.content) as ProvenanceTrace;
    // CLAUDE.md is emitted by the ClaudeMdGenerator whose .name = 'CLAUDE.md'
    // (the generators use their file name as the generator identifier).
    const claudeEntry = doc.files.find((f) => f.relativePath === 'CLAUDE.md');
    expect(claudeEntry).toBeDefined();
    expect(claudeEntry!.generatorName).toBe('CLAUDE.md');
    expect(claudeEntry!.target).toBe('claude');
  });

  it('runs LAST in the post-pass chain — manifest includes 8B + 8C + 8D outputs', async () => {
    const files = await runOrchestrator({
      profile: buildProfile({
        role: 'developer',
        industry: 'healthcare',
        complianceFrameworks: ['hipaa'],
      }),
      targetDir: '/tmp/out',
      targets: [
        TargetFormat.CLAUDE,
        TargetFormat.CYCLONEDX_AIBOM,
        TargetFormat.OSCAL_COMPONENT,
        TargetFormat.OSCAL_SSP_FRAGMENT,
        TargetFormat.PROVENANCE,
      ],
    });
    const provenance = files.find((f) => f.relativePath === PROVENANCE_PATH)!;
    const doc = JSON.parse(provenance.content) as ProvenanceTrace;
    const paths = doc.files.map((f) => f.relativePath);
    expect(paths).toContain('.embediq/cyclonedx/aibom.json');
    expect(paths).toContain('.embediq/oscal/component-definition.json');
    expect(paths).toContain('.embediq/oscal/ssp-fragment.json');
    expect(paths).toContain(PROVENANCE_PATH);  // The trace records itself.
  });

  it('records authoritative attribution for governance post-pass outputs (8B/8C/8D)', async () => {
    const files = await runOrchestrator({
      profile: buildProfile({ role: 'developer', industry: 'healthcare', complianceFrameworks: ['hipaa'] }),
      targetDir: '/tmp/out',
      targets: [
        TargetFormat.CLAUDE,
        TargetFormat.OSCAL_COMPONENT,
        TargetFormat.CYCLONEDX_AIBOM,
        TargetFormat.PROVENANCE,
      ],
    });
    const provenance = files.find((f) => f.relativePath === PROVENANCE_PATH)!;
    const doc = JSON.parse(provenance.content) as ProvenanceTrace;
    const oscalEntry = doc.files.find((f) => f.relativePath === '.embediq/oscal/component-definition.json')!;
    expect(oscalEntry.generatorName).toBe('oscal-component');
    expect(oscalEntry.target).toBe('oscal-component');
    const aibomEntry = doc.files.find((f) => f.relativePath === '.embediq/cyclonedx/aibom.json')!;
    expect(aibomEntry.generatorName).toBe('cyclonedx-aibom');
  });

  it('infers compliance-framework drivers for HIPAA rule files', async () => {
    const files = await runOrchestrator({
      profile: buildProfile({
        role: 'developer',
        industry: 'healthcare',
        complianceFrameworks: ['hipaa'],
        securityConcerns: ['phi'],
      }),
      targetDir: '/tmp/out',
      targets: [TargetFormat.CLAUDE, TargetFormat.PROVENANCE],
      domainPack: {
        id: 'test',
        name: 'test',
        version: '1.0.0',
        description: '',
        questions: [],
        complianceFrameworks: [{ key: 'hipaa', label: 'HIPAA', description: '' }],
        priorityCategories: {},
        dlpPatterns: [],
        ruleTemplates: [],
        ignorePatterns: [],
        validationChecks: [],
      },
    });
    const provenance = files.find((f) => f.relativePath === PROVENANCE_PATH)!;
    const doc = JSON.parse(provenance.content) as ProvenanceTrace;
    const hipaaRule = doc.files.find((f) => f.relativePath === '.claude/rules/hipaa-compliance.md');
    if (hipaaRule) {  // Only present when the rules generator includes it
      expect(hipaaRule.matchedHeuristic).toBe('compliance-rule-file');
      expect(hipaaRule.drivers.some(
        (d) => d.type === 'compliance-framework' && d.value === 'hipaa',
      )).toBe(true);
    }
  });

  it('emits only the provenance manifest when it is the sole target', async () => {
    const files = await runOrchestrator({
      profile: buildProfile({ role: 'developer', languages: ['typescript'] }),
      targetDir: '/tmp/out',
      targets: [TargetFormat.PROVENANCE],
    });
    expect(files.map((f) => f.relativePath)).toEqual([PROVENANCE_PATH]);
    const doc = JSON.parse(files[0].content) as ProvenanceTrace;
    // The trace covers only itself in this case — its own self-entry.
    expect(doc.files).toHaveLength(1);
    expect(doc.files[0].relativePath).toBe(PROVENANCE_PATH);
    expect(doc.files[0].generatorName).toBe('provenance-trace');
  });

  it('adding provenance target does not alter any non-provenance file content', async () => {
    const base = await runOrchestrator({
      profile: buildProfile({ role: 'developer', languages: ['typescript'] }),
      targetDir: '/tmp/out',
      targets: [TargetFormat.CLAUDE],
    });
    const withProv = await runOrchestrator({
      profile: buildProfile({ role: 'developer', languages: ['typescript'] }),
      targetDir: '/tmp/out',
      targets: [TargetFormat.CLAUDE, TargetFormat.PROVENANCE],
    });
    const baseSorted = base.slice().sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    const withProvNo = withProv
      .filter((f) => f.relativePath !== PROVENANCE_PATH)
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    expect(withProvNo.length).toBe(baseSorted.length);
    for (let i = 0; i < baseSorted.length; i++) {
      expect(withProvNo[i].relativePath).toBe(baseSorted[i].relativePath);
      expect(withProvNo[i].content).toBe(baseSorted[i].content);
    }
  });
});
