import { describe, it, expect } from 'vitest';
import { SynthesizerOrchestrator } from '../../src/synthesizer/orchestrator.js';
import { TargetFormat } from '../../src/synthesizer/target-format.js';
import { InMemoryEventBus } from '../../src/events/bus.js';
import { createEmptyProfile, type SetupConfig, type UserProfile } from '../../src/types/index.js';
import type { OscalComponentDefinitionDocument } from '../../src/governance/oscal/index.js';

function buildProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return { ...createEmptyProfile(), ...overrides };
}

async function runOrchestrator(config: SetupConfig) {
  const bus = new InMemoryEventBus();
  const orchestrator = new SynthesizerOrchestrator(bus);
  return orchestrator.generate(config);
}

const COMPONENT_DEF_PATH = '.embediq/oscal/component-definition.json';

describe('SynthesizerOrchestrator — OSCAL component-definition post-pass', () => {
  it('does NOT emit the OSCAL file by default — opt-in via target only', async () => {
    const files = await runOrchestrator({
      profile: buildProfile({
        role: 'developer',
        industry: 'healthcare',
        languages: ['typescript'],
        complianceFrameworks: ['hipaa'],
      }),
      targetDir: '/tmp/out',
    });
    expect(files.some((f) => f.relativePath === COMPONENT_DEF_PATH)).toBe(false);
  });

  it('emits a valid component-definition when oscal-component is in targets', async () => {
    const files = await runOrchestrator({
      profile: buildProfile({
        role: 'developer',
        industry: 'healthcare',
        languages: ['typescript'],
        complianceFrameworks: ['hipaa'],
        securityConcerns: ['phi'],
      }),
      targetDir: '/tmp/out',
      targets: [TargetFormat.CLAUDE, TargetFormat.OSCAL_COMPONENT],
    });
    const componentDef = files.find((f) => f.relativePath === COMPONENT_DEF_PATH);
    expect(componentDef).toBeDefined();

    const doc = JSON.parse(componentDef!.content) as OscalComponentDefinitionDocument;
    expect(doc['component-definition']).toBeDefined();
    expect(doc['component-definition'].metadata['oscal-version']).toBe('1.1.2');
    expect(doc['component-definition'].components).toHaveLength(1);
    const component = doc['component-definition'].components[0]!;
    expect(component.type).toBe('software');
    // The component's artifact-count prop must agree with the actual file
    // count of the synthesis run minus the component-definition itself.
    const artifactCountProp = (component.props ?? []).find((p) => p.name === 'artifact-count');
    expect(artifactCountProp).toBeDefined();
    const claimedCount = Number.parseInt(artifactCountProp!.value, 10);
    expect(claimedCount).toBe(files.length - 1);
  });

  it('manifest reflects every other generated file (post-pass timing)', async () => {
    const files = await runOrchestrator({
      profile: buildProfile({
        role: 'developer',
        industry: 'tech',
        languages: ['typescript'],
      }),
      targetDir: '/tmp/out',
      targets: [TargetFormat.CLAUDE, TargetFormat.OSCAL_COMPONENT],
    });
    const componentDef = files.find((f) => f.relativePath === COMPONENT_DEF_PATH)!;
    const doc = JSON.parse(componentDef.content) as OscalComponentDefinitionDocument;
    const artifactProps = (doc['component-definition'].components[0]!.props ?? [])
      .filter((p) => p.name === 'generated-artifact')
      .map((p) => p.value);
    // Every non-component-definition file appears in the manifest.
    const otherFiles = files
      .filter((f) => f.relativePath !== COMPONENT_DEF_PATH)
      .map((f) => f.relativePath);
    expect(artifactProps.sort()).toEqual(otherFiles.sort());
    // And the component-definition does not list itself (avoid recursion).
    expect(artifactProps).not.toContain(COMPONENT_DEF_PATH);
  });

  it('control-implementations[] mirrors the resolved domain pack frameworks', async () => {
    const files = await runOrchestrator({
      profile: buildProfile({
        role: 'developer',
        industry: 'healthcare',
        languages: ['typescript'],
        complianceFrameworks: ['hipaa'],
        securityConcerns: ['phi'],
      }),
      targetDir: '/tmp/out',
      targets: [TargetFormat.CLAUDE, TargetFormat.OSCAL_COMPONENT],
      // healthcare industry → DomainPackRegistry resolves to the built-in
      // healthcare pack via getForIndustry. But the test path doesn't
      // resolve that — config.domainPack is undefined unless the caller
      // sets it. So we assert the empty-frameworks case here.
    });
    const componentDef = files.find((f) => f.relativePath === COMPONENT_DEF_PATH)!;
    const doc = JSON.parse(componentDef.content) as OscalComponentDefinitionDocument;
    const impls = doc['component-definition'].components[0]!['control-implementations'];
    // Without a domain pack passed in config, control-implementations is
    // empty — proves the post-pass uses the resolved pack only, not the
    // profile's framework-name string array.
    expect(impls).toEqual([]);
  });

  it('lists the resolved pack frameworks when config.domainPack is supplied', async () => {
    const files = await runOrchestrator({
      profile: buildProfile({
        role: 'developer',
        industry: 'healthcare',
        languages: ['typescript'],
        complianceFrameworks: ['hipaa'],
      }),
      targetDir: '/tmp/out',
      targets: [TargetFormat.OSCAL_COMPONENT],
      domainPack: {
        id: 'test-pack',
        name: 'Test Pack',
        version: '1.0.0',
        description: '',
        questions: [],
        complianceFrameworks: [
          { key: 'hipaa', label: 'HIPAA', description: 'Health Insurance Portability and Accountability Act' },
          { key: 'nist-800-53-rev5', label: 'NIST SP 800-53 Rev 5', description: 'Security controls' },
        ],
        priorityCategories: {},
        dlpPatterns: [],
        ruleTemplates: [],
        ignorePatterns: [],
        validationChecks: [],
      },
    });
    const componentDef = files.find((f) => f.relativePath === COMPONENT_DEF_PATH);
    expect(componentDef).toBeDefined();
    const doc = JSON.parse(componentDef!.content) as OscalComponentDefinitionDocument;
    const sources = doc['component-definition'].components[0]!['control-implementations']
      .map((ci) => ci.source).sort();
    expect(sources).toEqual(['hipaa', 'nist-800-53-rev5']);
  });

  it('emits ONLY the component-definition when oscal-component is the only target', async () => {
    const files = await runOrchestrator({
      profile: buildProfile({ role: 'developer', languages: ['typescript'] }),
      targetDir: '/tmp/out',
      targets: [TargetFormat.OSCAL_COMPONENT],
    });
    expect(files.map((f) => f.relativePath)).toEqual([COMPONENT_DEF_PATH]);
  });

  it('adding oscal-component does not alter any non-OSCAL file content', async () => {
    const base = await runOrchestrator({
      profile: buildProfile({ role: 'developer', languages: ['typescript'] }),
      targetDir: '/tmp/out',
      targets: [TargetFormat.CLAUDE],
    });
    const withOscal = await runOrchestrator({
      profile: buildProfile({ role: 'developer', languages: ['typescript'] }),
      targetDir: '/tmp/out',
      targets: [TargetFormat.CLAUDE, TargetFormat.OSCAL_COMPONENT],
    });
    // Strip the OSCAL file from the second run — every other file should
    // match the baseline byte-for-byte.
    const baseSorted = base.slice().sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    const withOscalNoComp = withOscal
      .filter((f) => f.relativePath !== COMPONENT_DEF_PATH)
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    expect(withOscalNoComp.length).toBe(baseSorted.length);
    for (let i = 0; i < baseSorted.length; i++) {
      expect(withOscalNoComp[i].relativePath).toBe(baseSorted[i].relativePath);
      expect(withOscalNoComp[i].content).toBe(baseSorted[i].content);
    }
  });
});
