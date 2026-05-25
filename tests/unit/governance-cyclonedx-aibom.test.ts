import { describe, it, expect } from 'vitest';
import {
  buildAibom,
  serializeAibom,
  CYCLONEDX_SPEC_VERSION,
  type CycloneDxDocument,
} from '../../src/governance/cyclonedx/index.js';
import type { ComplianceFrameworkDef } from '../../src/domain-packs/index.js';
import type { GeneratedFile } from '../../src/types/index.js';

function counterUuid(): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  };
}

const FIXED_NOW = '2026-05-25T20:00:00.000Z';

const HIPAA: ComplianceFrameworkDef = {
  key: 'hipaa',
  label: 'HIPAA',
  description: 'Health Insurance Portability and Accountability Act',
};

function files(): GeneratedFile[] {
  return [
    { relativePath: 'CLAUDE.md', content: '# Claude' },
    { relativePath: '.claude/rules/hipaa-compliance.md', content: '# HIPAA' },
  ];
}

describe('buildAibom — top-level structure', () => {
  it('produces a valid CycloneDX 1.6 BOM', () => {
    const doc = buildAibom({
      profile: { industry: 'healthcare', role: 'developer', complianceFrameworks: ['hipaa'] },
      frameworks: [HIPAA],
      generatedFiles: files(),
      embediqVersion: '3.7.0',
      uuid: counterUuid(),
      now: () => FIXED_NOW,
    });
    expect(doc.bomFormat).toBe('CycloneDX');
    expect(doc.specVersion).toBe(CYCLONEDX_SPEC_VERSION);
    expect(doc.serialNumber).toMatch(/^urn:uuid:[0-9a-f-]+$/);
    expect(doc.version).toBe(1);
    expect(doc.metadata.timestamp).toBe(FIXED_NOW);
    expect(doc.metadata.tools).toContainEqual(
      expect.objectContaining({ vendor: 'Praglogic', name: 'EmbedIQ', version: '3.7.0' }),
    );
  });

  it('places the harness in metadata.component (BOM subject convention) and not in components[]', () => {
    const doc = buildAibom({
      profile: {
        industry: 'healthcare',
        role: 'developer',
        complianceFrameworks: ['hipaa'],
        ollamaModels: ['llama3'],
      },
      frameworks: [HIPAA],
      generatedFiles: files(),
      embediqVersion: '3.7.0',
    });
    expect(doc.metadata.component.type).toBe('application');
    expect(doc.metadata.component['bom-ref']).toBe('embediq:harness');
    // The subject MUST NOT be duplicated into components[].
    expect(doc.components.some((c) => c['bom-ref'] === 'embediq:harness')).toBe(false);
  });

  it('emits no components when no AI integrations are configured', () => {
    const doc = buildAibom({
      profile: { industry: 'tech', role: 'developer', complianceFrameworks: [] },
      frameworks: [],
      generatedFiles: files(),
      embediqVersion: '3.7.0',
    });
    expect(doc.components).toEqual([]);
    expect(doc.dependencies).toEqual([]);
  });
});

describe('buildAibom — Ollama local models', () => {
  it('emits one machine-learning-model component per Ollama model', () => {
    const doc = buildAibom({
      profile: {
        industry: 'healthcare',
        role: 'developer',
        complianceFrameworks: ['hipaa'],
        ollamaModels: ['llama3', 'mistral'],
      },
      frameworks: [HIPAA],
      generatedFiles: files(),
      embediqVersion: '3.7.0',
    });
    const mlComponents = doc.components.filter((c) => c.type === 'machine-learning-model');
    expect(mlComponents.map((c) => c.name).sort()).toEqual(['llama3', 'mistral']);
    for (const c of mlComponents) {
      expect(c['bom-ref']).toMatch(/^embediq:ollama:/);
      expect(c.purl).toMatch(/^pkg:ollama\//);
      expect(c.supplier?.name).toContain('Ollama');
      expect(c.modelCard?.modelParameters?.architectureFamily).toBe('transformer');
    }
  });

  it('flags the default-local-model with a property', () => {
    const doc = buildAibom({
      profile: {
        industry: 'tech',
        role: 'developer',
        complianceFrameworks: [],
        ollamaModels: ['llama3', 'mistral'],
        defaultLocalModel: 'llama3',
      },
      frameworks: [],
      generatedFiles: files(),
      embediqVersion: '3.7.0',
    });
    const llama = doc.components.find((c) => c.name === 'llama3')!;
    const mistral = doc.components.find((c) => c.name === 'mistral')!;
    expect((llama.properties ?? []).some((p) => p.name === 'embediq:default-local-model')).toBe(true);
    expect((mistral.properties ?? []).some((p) => p.name === 'embediq:default-local-model')).toBe(false);
  });

  it('attaches active compliance frameworks to the ML modelCard considerations', () => {
    const doc = buildAibom({
      profile: {
        industry: 'healthcare',
        role: 'developer',
        complianceFrameworks: ['hipaa'],
        ollamaModels: ['llama3'],
      },
      frameworks: [HIPAA],
      generatedFiles: files(),
      embediqVersion: '3.7.0',
    });
    const llama = doc.components.find((c) => c.name === 'llama3')!;
    const reg = llama.modelCard?.considerations?.regulatoryReporting ?? [];
    expect(reg.some((r) => r.regulationType === 'HIPAA')).toBe(true);
  });
});

describe('buildAibom — hosted API providers', () => {
  it('emits known providers (anthropic, openai) with full supplier/architecture metadata', () => {
    const doc = buildAibom({
      profile: {
        industry: 'tech',
        role: 'developer',
        complianceFrameworks: [],
        externalApis: ['anthropic', 'openai'],
      },
      frameworks: [],
      generatedFiles: files(),
      embediqVersion: '3.7.0',
    });
    const anthropic = doc.components.find((c) => c['bom-ref'] === 'embediq:hosted:anthropic')!;
    expect(anthropic.type).toBe('machine-learning-model');
    expect(anthropic.supplier?.name).toBe('Anthropic');
    expect(anthropic.purl).toBe('pkg:generic/anthropic/claude');
    expect(anthropic.modelCard?.modelParameters?.modelArchitecture).toMatch(/Claude/);

    const openai = doc.components.find((c) => c['bom-ref'] === 'embediq:hosted:openai')!;
    expect(openai.supplier?.name).toBe('OpenAI');
    expect(openai.purl).toBe('pkg:generic/openai/gpt');
  });

  it('records unknown providers generically with a property tag (manual review)', () => {
    const doc = buildAibom({
      profile: {
        industry: 'tech',
        role: 'developer',
        complianceFrameworks: [],
        externalApis: ['cohere'],
      },
      frameworks: [],
      generatedFiles: files(),
      embediqVersion: '3.7.0',
    });
    const cohere = doc.components.find((c) => c['bom-ref'] === 'embediq:hosted:cohere')!;
    expect(cohere.type).toBe('machine-learning-model');
    expect(cohere.name).toBe('cohere');
    expect(cohere.supplier).toBeUndefined();
    expect((cohere.properties ?? []).some((p) => p.name === 'embediq:hosted-provider-id')).toBe(true);
  });
});

describe('buildAibom — IDE agents + local router', () => {
  it('emits library components for known IDE agents', () => {
    const doc = buildAibom({
      profile: {
        industry: 'tech',
        role: 'developer',
        complianceFrameworks: [],
        ideIntegrations: ['continue-dev', 'aider', 'zed-ai'],
      },
      frameworks: [],
      generatedFiles: files(),
      embediqVersion: '3.7.0',
    });
    const libraries = doc.components.filter((c) => c.type === 'library');
    expect(libraries.map((c) => c.name).sort()).toEqual(['Aider', 'Continue.dev', 'Zed AI']);
    for (const lib of libraries) {
      expect(lib.purl).toMatch(/^pkg:generic\//);
    }
  });

  it('emits a service component for the local router when enabled', () => {
    const doc = buildAibom({
      profile: {
        industry: 'healthcare',
        role: 'developer',
        complianceFrameworks: ['hipaa'],
        routerEnabled: true,
        confidenceEscalation: true,
      },
      frameworks: [HIPAA],
      generatedFiles: files(),
      embediqVersion: '3.7.0',
    });
    const router = doc.components.find((c) => c.type === 'service');
    expect(router).toBeDefined();
    expect(router!['bom-ref']).toBe('embediq:local-router');
    expect(router!.description).toMatch(/Confidence-based escalation enabled/);
  });

  it('omits the router service when routerEnabled is false', () => {
    const doc = buildAibom({
      profile: {
        industry: 'tech',
        role: 'developer',
        complianceFrameworks: [],
        routerEnabled: false,
      },
      frameworks: [],
      generatedFiles: files(),
      embediqVersion: '3.7.0',
    });
    expect(doc.components.some((c) => c.type === 'service')).toBe(false);
  });
});

describe('buildAibom — dependency graph', () => {
  it('records the harness as depending on every emitted component', () => {
    const doc = buildAibom({
      profile: {
        industry: 'healthcare',
        role: 'developer',
        complianceFrameworks: ['hipaa'],
        ollamaModels: ['llama3'],
        externalApis: ['anthropic'],
        ideIntegrations: ['continue-dev'],
        routerEnabled: true,
      },
      frameworks: [HIPAA],
      generatedFiles: files(),
      embediqVersion: '3.7.0',
    });
    expect(doc.dependencies).toHaveLength(1);
    const dep = doc.dependencies![0];
    expect(dep.ref).toBe('embediq:harness');
    expect(dep.dependsOn).toContain('embediq:ollama:llama3');
    expect(dep.dependsOn).toContain('embediq:hosted:anthropic');
    expect(dep.dependsOn).toContain('embediq:ide:continue-dev');
    expect(dep.dependsOn).toContain('embediq:local-router');
  });
});

describe('serializeAibom', () => {
  it('produces stable JSON ending with a trailing newline; round-trips JSON.parse', () => {
    const doc: CycloneDxDocument = buildAibom({
      profile: {
        industry: 'healthcare',
        role: 'developer',
        complianceFrameworks: ['hipaa'],
        ollamaModels: ['llama3'],
      },
      frameworks: [HIPAA],
      generatedFiles: files(),
      embediqVersion: '3.7.0',
      uuid: counterUuid(),
      now: () => FIXED_NOW,
    });
    const json = serializeAibom(doc);
    expect(json.endsWith('\n')).toBe(true);
    expect(json).toContain('"bomFormat": "CycloneDX"');
    expect(json).toContain('"specVersion": "1.6"');
    expect(JSON.parse(json)).toEqual(doc);
  });
});
