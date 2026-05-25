import { describe, it, expect } from 'vitest';
import { SynthesizerOrchestrator } from '../../src/synthesizer/orchestrator.js';
import { TargetFormat } from '../../src/synthesizer/target-format.js';
import { InMemoryEventBus } from '../../src/events/bus.js';
import { createEmptyProfile, type SetupConfig, type UserProfile } from '../../src/types/index.js';
import type { OscalSspDocument } from '../../src/governance/oscal/index.js';

function buildProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return { ...createEmptyProfile(), ...overrides };
}

async function runOrchestrator(config: SetupConfig) {
  const bus = new InMemoryEventBus();
  const orchestrator = new SynthesizerOrchestrator(bus);
  return orchestrator.generate(config);
}

const SSP_PATH = '.embediq/oscal/ssp-fragment.json';
const COMPONENT_DEF_PATH = '.embediq/oscal/component-definition.json';

describe('SynthesizerOrchestrator — OSCAL SSP-fragment post-pass', () => {
  it('does NOT emit the SSP fragment by default — opt-in via target only', async () => {
    const files = await runOrchestrator({
      profile: buildProfile({ role: 'developer', languages: ['typescript'] }),
      targetDir: '/tmp/out',
    });
    expect(files.some((f) => f.relativePath === SSP_PATH)).toBe(false);
  });

  it('emits a valid SSP fragment when oscal-ssp-fragment is in targets', async () => {
    const files = await runOrchestrator({
      profile: buildProfile({
        role: 'developer',
        industry: 'healthcare',
        languages: ['typescript'],
        complianceFrameworks: ['hipaa'],
      }),
      targetDir: '/tmp/out',
      targets: [TargetFormat.CLAUDE, TargetFormat.OSCAL_SSP_FRAGMENT],
    });
    const ssp = files.find((f) => f.relativePath === SSP_PATH);
    expect(ssp).toBeDefined();
    const doc = JSON.parse(ssp!.content) as OscalSspDocument;
    expect(doc['system-security-plan'].metadata['oscal-version']).toBe('1.1.2');
    // Fragment marker is the headline contract of.
    const props = doc['system-security-plan'].metadata.props ?? [];
    expect(props.some((p) => p.name === 'document-completion-status' && p.value === 'fragment')).toBe(true);
  });

  it('lists framework-level implemented-requirements from the resolved domain pack', async () => {
    const files = await runOrchestrator({
      profile: buildProfile({
        role: 'developer',
        industry: 'healthcare',
        complianceFrameworks: ['hipaa'],
      }),
      targetDir: '/tmp/out',
      targets: [TargetFormat.OSCAL_SSP_FRAGMENT],
      domainPack: {
        id: 'pack',
        name: 'pack',
        version: '1.0.0',
        description: '',
        questions: [],
        complianceFrameworks: [
          { key: 'hipaa', label: 'HIPAA', description: '' },
          { key: 'nist-800-53-rev5', label: 'NIST SP 800-53 Rev 5', description: '' },
        ],
        priorityCategories: {},
        dlpPatterns: [],
        ruleTemplates: [],
        ignorePatterns: [],
        validationChecks: [],
      },
    });
    const ssp = files.find((f) => f.relativePath === SSP_PATH)!;
    const doc = JSON.parse(ssp.content) as OscalSspDocument;
    const requirements = doc['system-security-plan']['control-implementation']['implemented-requirements'];
    expect(requirements.map((r) => r['control-id']).sort()).toEqual([
      'framework:hipaa',
      'framework:nist-800-53-rev5',
    ]);
  });

  it('SSP fragment co-exists with component-definition when both are targeted', async () => {
    const files = await runOrchestrator({
      profile: buildProfile({ role: 'developer', industry: 'healthcare', complianceFrameworks: ['hipaa'] }),
      targetDir: '/tmp/out',
      targets: [TargetFormat.CLAUDE, TargetFormat.OSCAL_COMPONENT, TargetFormat.OSCAL_SSP_FRAGMENT],
    });
    expect(files.some((f) => f.relativePath === SSP_PATH)).toBe(true);
    expect(files.some((f) => f.relativePath === COMPONENT_DEF_PATH)).toBe(true);
  });

  it('SSP fragment is emitted last so its manifest includes the component-definition file', async () => {
    const files = await runOrchestrator({
      profile: buildProfile({ role: 'developer', industry: 'healthcare', complianceFrameworks: ['hipaa'] }),
      targetDir: '/tmp/out',
      targets: [TargetFormat.CLAUDE, TargetFormat.OSCAL_COMPONENT, TargetFormat.OSCAL_SSP_FRAGMENT],
    });
    const ssp = files.find((f) => f.relativePath === SSP_PATH)!;
    const doc = JSON.parse(ssp.content) as OscalSspDocument;
    const artifacts = (doc['system-security-plan']['system-implementation'].components[0]!.props ?? [])
      .filter((p) => p.name === 'generated-artifact')
      .map((p) => p.value);
    // The component-definition was emitted before the SSP fragment, so
    // it should appear in the SSP's manifest.
    expect(artifacts).toContain(COMPONENT_DEF_PATH);
    // But the SSP fragment does NOT list itself (avoids the recursive
    // manifest problem — the SSP is the last file emitted).
    expect(artifacts).not.toContain(SSP_PATH);
  });

  it('honors EMBEDIQ_OSCAL_SSP_* env overrides', async () => {
    const originalEnv = { ...process.env };
    process.env.EMBEDIQ_OSCAL_SSP_PROFILE_HREF = './my-baseline.json';
    process.env.EMBEDIQ_OSCAL_SSP_SYSTEM_NAME = 'TestCorp Production Harness';
    process.env.EMBEDIQ_OSCAL_SSP_SENSITIVITY = 'fips-199-high';
    try {
      const files = await runOrchestrator({
        profile: buildProfile({ role: 'developer', industry: 'tech' }),
        targetDir: '/tmp/out',
        targets: [TargetFormat.OSCAL_SSP_FRAGMENT],
      });
      const ssp = files.find((f) => f.relativePath === SSP_PATH)!;
      const doc = JSON.parse(ssp.content) as OscalSspDocument;
      expect(doc['system-security-plan']['import-profile'].href).toBe('./my-baseline.json');
      expect(doc['system-security-plan']['system-characteristics']['system-name'])
        .toBe('TestCorp Production Harness');
      expect(doc['system-security-plan']['system-characteristics']['security-sensitivity-level'])
        .toBe('fips-199-high');
    } finally {
      process.env = { ...originalEnv };
    }
  });

  it('falls back to placeholders when env vars are not set', async () => {
    const originalEnv = { ...process.env };
    delete process.env.EMBEDIQ_OSCAL_SSP_PROFILE_HREF;
    delete process.env.EMBEDIQ_OSCAL_SSP_SYSTEM_NAME;
    delete process.env.EMBEDIQ_OSCAL_SSP_SENSITIVITY;
    try {
      const files = await runOrchestrator({
        profile: buildProfile({ role: 'developer', industry: 'tech' }),
        targetDir: '/tmp/out',
        targets: [TargetFormat.OSCAL_SSP_FRAGMENT],
      });
      const ssp = files.find((f) => f.relativePath === SSP_PATH)!;
      const doc = JSON.parse(ssp.content) as OscalSspDocument;
      expect(doc['system-security-plan']['import-profile'].href).toMatch(/<<REPLACE/);
      expect(doc['system-security-plan']['system-characteristics']['system-name']).toMatch(/<<REPLACE/);
      // Default sensitivity is fips-199-moderate.
      expect(doc['system-security-plan']['system-characteristics']['security-sensitivity-level'])
        .toBe('fips-199-moderate');
    } finally {
      process.env = { ...originalEnv };
    }
  });

  it('rejects unrecognized EMBEDIQ_OSCAL_SSP_SENSITIVITY values by falling back to default', async () => {
    const originalEnv = { ...process.env };
    process.env.EMBEDIQ_OSCAL_SSP_SENSITIVITY = 'definitely-not-a-fips-level';
    try {
      const files = await runOrchestrator({
        profile: buildProfile({ role: 'developer', industry: 'tech' }),
        targetDir: '/tmp/out',
        targets: [TargetFormat.OSCAL_SSP_FRAGMENT],
      });
      const ssp = files.find((f) => f.relativePath === SSP_PATH)!;
      const doc = JSON.parse(ssp.content) as OscalSspDocument;
      expect(doc['system-security-plan']['system-characteristics']['security-sensitivity-level'])
        .toBe('fips-199-moderate');
    } finally {
      process.env = { ...originalEnv };
    }
  });
});
