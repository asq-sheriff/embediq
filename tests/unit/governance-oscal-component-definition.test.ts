import { describe, it, expect } from 'vitest';
import {
  buildComponentDefinition,
  serializeComponentDefinition,
  type OscalComponentDefinitionDocument,
} from '../../src/governance/oscal/index.js';
import type { ComplianceFrameworkDef } from '../../src/domain-packs/index.js';
import type { GeneratedFile } from '../../src/types/index.js';

/** Deterministic UUID and timestamp factories for snapshot-style assertions. */
function counterUuid(): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  };
}

const FIXED_NOW = '2026-05-25T18:00:00.000Z';

function frameworks(): ComplianceFrameworkDef[] {
  return [
    { key: 'hipaa', label: 'HIPAA', description: 'Health Insurance Portability and Accountability Act' },
    { key: 'nist-800-53-rev5', label: 'NIST SP 800-53 Rev 5', description: 'Security controls catalog' },
  ];
}

function files(): GeneratedFile[] {
  return [
    { relativePath: 'CLAUDE.md', content: '# Claude' },
    { relativePath: '.claude/rules/hipaa-compliance.md', content: '# HIPAA' },
    { relativePath: '.claude/hooks/dlp_scan.py', content: '# DLP' },
  ];
}

describe('buildComponentDefinition', () => {
  it('produces a valid component-definition document with stable structure', () => {
    const doc = buildComponentDefinition({
      profile: {
        industry: 'healthcare',
        role: 'developer',
        complianceFrameworks: ['hipaa'],
      },
      frameworks: frameworks(),
      generatedFiles: files(),
      embediqVersion: '3.7.0',
      uuid: counterUuid(),
      now: () => FIXED_NOW,
    });

    expect(doc['component-definition']).toBeDefined();
    const cd = doc['component-definition'];

    // Top-level identity uses deterministic UUIDs because we injected the
    // factory; the order is: (1) framework impl HIPAA, (2) framework impl NIST,
    // (3) component, (4) component-definition root.
    expect(cd.uuid).toBe('00000000-0000-0000-0000-000000000004');
    expect(cd.metadata['oscal-version']).toBe('1.1.2');
    expect(cd.metadata.version).toBe('3.7.0');
    expect(cd.metadata['last-modified']).toBe(FIXED_NOW);
    expect(cd.metadata.title).toContain('healthcare');
    expect(cd.metadata.title).toContain('developer');
  });

  it('emits exactly one component (the harness) with all frameworks listed', () => {
    const doc = buildComponentDefinition({
      profile: { industry: 'healthcare', role: 'developer', complianceFrameworks: ['hipaa'] },
      frameworks: frameworks(),
      generatedFiles: files(),
      embediqVersion: '3.7.0',
    });
    const cd = doc['component-definition'];
    expect(cd.components).toHaveLength(1);
    const c = cd.components[0]!;
    expect(c.type).toBe('software');
    expect(c['control-implementations']).toHaveLength(2);
    const sources = c['control-implementations'].map((ci) => ci.source);
    expect(sources).toContain('hipaa');
    expect(sources).toContain('nist-800-53-rev5');
  });

  it('surfaces every generated file as a generated-artifact prop on the component', () => {
    const doc = buildComponentDefinition({
      profile: { industry: 'healthcare', role: 'developer', complianceFrameworks: ['hipaa'] },
      frameworks: frameworks(),
      generatedFiles: files(),
      embediqVersion: '3.7.0',
    });
    const c = doc['component-definition'].components[0]!;
    const artifactProps = (c.props ?? []).filter((p) => p.name === 'generated-artifact');
    expect(artifactProps.map((p) => p.value).sort()).toEqual([
      '.claude/hooks/dlp_scan.py',
      '.claude/rules/hipaa-compliance.md',
      'CLAUDE.md',
    ]);
    const countProp = (c.props ?? []).find((p) => p.name === 'artifact-count');
    expect(countProp?.value).toBe('3');
  });

  it('produces a well-formed control-implementation per framework with framework metadata props', () => {
    const doc = buildComponentDefinition({
      profile: { industry: 'healthcare', role: 'developer', complianceFrameworks: ['hipaa'] },
      frameworks: frameworks(),
      generatedFiles: files(),
      embediqVersion: '3.7.0',
      uuid: counterUuid(),
    });
    const ciHipaa = doc['component-definition'].components[0]!['control-implementations']
      .find((ci) => ci.source === 'hipaa')!;
    expect(ciHipaa.uuid).toMatch(/^00000000-0000-0000-0000-/);
    expect(ciHipaa.description).toContain('HIPAA');
    const props = ciHipaa.props ?? [];
    expect(props.some((p) => p.name === 'framework-key' && p.value === 'hipaa')).toBe(true);
    expect(props.some((p) => p.name === 'framework-label' && p.value === 'HIPAA')).toBe(true);
    expect(ciHipaa['implemented-requirements']).toEqual([]);
  });

  it('emits a component with empty control-implementations when no frameworks present', () => {
    const doc = buildComponentDefinition({
      profile: { industry: 'tech', role: 'developer', complianceFrameworks: [] },
      frameworks: [],
      generatedFiles: files(),
      embediqVersion: '3.7.0',
    });
    const c = doc['component-definition'].components[0]!;
    expect(c['control-implementations']).toEqual([]);
    // Component itself still has identity + artifact manifest.
    expect(c.uuid).toBeTruthy();
    expect((c.props ?? []).some((p) => p.name === 'generated-artifact')).toBe(true);
  });

  it('records producer + producer-version + profile context props', () => {
    const doc = buildComponentDefinition({
      profile: { industry: 'finance', role: 'lead', complianceFrameworks: ['pci'] },
      frameworks: [{ key: 'pci', label: 'PCI-DSS', description: '' }],
      generatedFiles: files(),
      embediqVersion: '9.9.9',
    });
    const props = doc['component-definition'].components[0]!.props ?? [];
    expect(props.some((p) => p.name === 'producer' && p.value === 'EmbedIQ')).toBe(true);
    expect(props.some((p) => p.name === 'producer-version' && p.value === '9.9.9')).toBe(true);
    expect(props.some((p) => p.name === 'profile-industry' && p.value === 'finance')).toBe(true);
    expect(props.some((p) => p.name === 'profile-role' && p.value === 'lead')).toBe(true);
  });

  it('uses real UUIDs (crypto.randomUUID format) when no factory is injected', () => {
    const doc = buildComponentDefinition({
      profile: { industry: 'tech', role: 'developer', complianceFrameworks: [] },
      frameworks: frameworks(),
      generatedFiles: files(),
      embediqVersion: '3.7.0',
    });
    const cd = doc['component-definition'];
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(cd.uuid).toMatch(uuidPattern);
    expect(cd.components[0]!.uuid).toMatch(uuidPattern);
    for (const ci of cd.components[0]!['control-implementations']) {
      expect(ci.uuid).toMatch(uuidPattern);
    }
  });
});

describe('serializeComponentDefinition', () => {
  it('produces stable, indented JSON ending with a trailing newline', () => {
    const doc: OscalComponentDefinitionDocument = buildComponentDefinition({
      profile: { industry: 'healthcare', role: 'developer', complianceFrameworks: ['hipaa'] },
      frameworks: frameworks(),
      generatedFiles: files(),
      embediqVersion: '3.7.0',
      uuid: counterUuid(),
      now: () => FIXED_NOW,
    });
    const json = serializeComponentDefinition(doc);
    expect(json.endsWith('\n')).toBe(true);
    // Two-space indent — matches NIST oscal-content convention.
    expect(json).toContain('\n  "component-definition"');
    // Parses back to the same shape.
    expect(JSON.parse(json)).toEqual(doc);
  });
});
