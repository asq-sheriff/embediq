import { describe, it, expect } from 'vitest';
import { SynthesizerOrchestrator } from '../../src/synthesizer/orchestrator.js';
import { TargetFormat } from '../../src/synthesizer/target-format.js';
import { InMemoryEventBus } from '../../src/events/bus.js';
import { createEmptyProfile, type SetupConfig, type UserProfile } from '../../src/types/index.js';
import type { CycloneDxDocument } from '../../src/governance/cyclonedx/index.js';

function buildProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return { ...createEmptyProfile(), ...overrides };
}

async function runOrchestrator(config: SetupConfig) {
  const bus = new InMemoryEventBus();
  const orchestrator = new SynthesizerOrchestrator(bus);
  return orchestrator.generate(config);
}

const AIBOM_PATH = '.embediq/cyclonedx/aibom.json';
const OSCAL_COMPONENT_PATH = '.embediq/oscal/component-definition.json';

describe('SynthesizerOrchestrator — CycloneDX-ML AIBOM post-pass', () => {
  it('does NOT emit the AIBOM by default — opt-in via target only', async () => {
    const files = await runOrchestrator({
      profile: buildProfile({ role: 'developer', languages: ['typescript'] }),
      targetDir: '/tmp/out',
    });
    expect(files.some((f) => f.relativePath === AIBOM_PATH)).toBe(false);
  });

  it('emits a valid CycloneDX 1.6 AIBOM when cyclonedx-aibom is in targets', async () => {
    const files = await runOrchestrator({
      profile: buildProfile({
        role: 'developer',
        industry: 'tech',
        languages: ['typescript'],
      }),
      targetDir: '/tmp/out',
      targets: [TargetFormat.CLAUDE, TargetFormat.CYCLONEDX_AIBOM],
    });
    const aibom = files.find((f) => f.relativePath === AIBOM_PATH);
    expect(aibom).toBeDefined();
    const doc = JSON.parse(aibom!.content) as CycloneDxDocument;
    expect(doc.bomFormat).toBe('CycloneDX');
    expect(doc.specVersion).toBe('1.6');
    expect(doc.serialNumber).toMatch(/^urn:uuid:/);
    expect(doc.metadata.tools[0].name).toBe('EmbedIQ');
  });

  it('enumerates Ollama models, hosted APIs, IDE agents, and the router service when present in the profile', async () => {
    const files = await runOrchestrator({
      profile: buildProfile({
        role: 'developer',
        industry: 'healthcare',
        languages: ['typescript'],
        complianceFrameworks: ['hipaa'],
        securityConcerns: ['phi'],
        localAiEnabled: true,
        ollamaModels: ['llama3', 'mistral'],
        defaultLocalModel: 'llama3',
        ideIntegrations: ['continue-dev', 'aider'],
        routerEnabled: true,
        externalApis: ['anthropic'],
        confidenceEscalation: true,
      }),
      targetDir: '/tmp/out',
      targets: [TargetFormat.CYCLONEDX_AIBOM],
    });
    const aibom = files.find((f) => f.relativePath === AIBOM_PATH)!;
    const doc = JSON.parse(aibom.content) as CycloneDxDocument;
    const refs = doc.components.map((c) => c['bom-ref']).sort();
    expect(refs).toContain('embediq:ollama:llama3');
    expect(refs).toContain('embediq:ollama:mistral');
    expect(refs).toContain('embediq:hosted:anthropic');
    expect(refs).toContain('embediq:ide:continue-dev');
    expect(refs).toContain('embediq:ide:aider');
    expect(refs).toContain('embediq:local-router');
    // The harness is the BOM subject, not a list entry.
    expect(refs).not.toContain('embediq:harness');
  });

  it('AIBOM is emitted BEFORE the OSCAL component-definition so the latter\'s manifest includes the AIBOM file', async () => {
    const files = await runOrchestrator({
      profile: buildProfile({ role: 'developer', industry: 'healthcare', complianceFrameworks: ['hipaa'] }),
      targetDir: '/tmp/out',
      targets: [TargetFormat.CLAUDE, TargetFormat.CYCLONEDX_AIBOM, TargetFormat.OSCAL_COMPONENT],
    });
    expect(files.some((f) => f.relativePath === AIBOM_PATH)).toBe(true);
    expect(files.some((f) => f.relativePath === OSCAL_COMPONENT_PATH)).toBe(true);
    // Within the file array the AIBOM should appear before the OSCAL
    // component-definition (because the AIBOM runs first in the
    // post-pass chain).
    const aibomIdx = files.findIndex((f) => f.relativePath === AIBOM_PATH);
    const oscalIdx = files.findIndex((f) => f.relativePath === OSCAL_COMPONENT_PATH);
    expect(aibomIdx).toBeLessThan(oscalIdx);
  });

  it('adding cyclonedx-aibom does not alter any non-AIBOM file content', async () => {
    const base = await runOrchestrator({
      profile: buildProfile({ role: 'developer', languages: ['typescript'] }),
      targetDir: '/tmp/out',
      targets: [TargetFormat.CLAUDE],
    });
    const withAibom = await runOrchestrator({
      profile: buildProfile({ role: 'developer', languages: ['typescript'] }),
      targetDir: '/tmp/out',
      targets: [TargetFormat.CLAUDE, TargetFormat.CYCLONEDX_AIBOM],
    });
    const baseSorted = base.slice().sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    const withAibomNo = withAibom
      .filter((f) => f.relativePath !== AIBOM_PATH)
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    expect(withAibomNo.length).toBe(baseSorted.length);
    for (let i = 0; i < baseSorted.length; i++) {
      expect(withAibomNo[i].relativePath).toBe(baseSorted[i].relativePath);
      expect(withAibomNo[i].content).toBe(baseSorted[i].content);
    }
  });

  it('emits only the AIBOM when cyclonedx-aibom is the only target', async () => {
    const files = await runOrchestrator({
      profile: buildProfile({ role: 'developer', languages: ['typescript'] }),
      targetDir: '/tmp/out',
      targets: [TargetFormat.CYCLONEDX_AIBOM],
    });
    expect(files.map((f) => f.relativePath)).toEqual([AIBOM_PATH]);
  });

  it('AIBOM with empty profile produces a minimal but valid document', async () => {
    const files = await runOrchestrator({
      profile: buildProfile({ role: 'developer', industry: 'tech' }),
      targetDir: '/tmp/out',
      targets: [TargetFormat.CYCLONEDX_AIBOM],
    });
    const aibom = files.find((f) => f.relativePath === AIBOM_PATH)!;
    const doc = JSON.parse(aibom.content) as CycloneDxDocument;
    expect(doc.components).toEqual([]);
    expect(doc.dependencies).toEqual([]);
    // Still a valid BOM — the metadata.component (harness) is the subject.
    expect(doc.metadata.component.type).toBe('application');
  });
});
