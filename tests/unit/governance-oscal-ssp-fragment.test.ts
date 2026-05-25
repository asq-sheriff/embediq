import { describe, it, expect } from 'vitest';
import {
  buildSspFragment,
  serializeSspFragment,
  type OscalSspDocument,
} from '../../src/governance/oscal/index.js';
import type { ComplianceFrameworkDef } from '../../src/domain-packs/index.js';
import type { GeneratedFile } from '../../src/types/index.js';

function counterUuid(): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  };
}

const FIXED_NOW = '2026-05-25T19:00:00.000Z';

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
  ];
}

describe('buildSspFragment', () => {
  it('produces a valid SSP document with required top-level sections', () => {
    const doc = buildSspFragment({
      profile: { industry: 'healthcare', role: 'developer', complianceFrameworks: ['hipaa'] },
      frameworks: frameworks(),
      generatedFiles: files(),
      embediqVersion: '3.7.0',
    });
    const ssp = doc['system-security-plan'];
    expect(ssp).toBeDefined();
    expect(ssp.uuid).toBeTruthy();
    expect(ssp.metadata['oscal-version']).toBe('1.1.2');
    expect(ssp['import-profile']).toBeDefined();
    expect(ssp['system-characteristics']).toBeDefined();
    expect(ssp['system-implementation']).toBeDefined();
    expect(ssp['control-implementation']).toBeDefined();
  });

  it('stamps document-completion-status=fragment so audit pipelines know to merge', () => {
    const doc = buildSspFragment({
      profile: { industry: 'healthcare', role: 'developer', complianceFrameworks: ['hipaa'] },
      frameworks: frameworks(),
      generatedFiles: files(),
      embediqVersion: '3.7.0',
    });
    const props = doc['system-security-plan'].metadata.props ?? [];
    expect(props.some((p) => p.name === 'document-completion-status' && p.value === 'fragment')).toBe(true);
  });

  it('uses placeholder text for operator-owned sections when not supplied', () => {
    const doc = buildSspFragment({
      profile: { industry: 'healthcare', role: 'developer', complianceFrameworks: ['hipaa'] },
      frameworks: frameworks(),
      generatedFiles: files(),
      embediqVersion: '3.7.0',
    });
    const sc = doc['system-security-plan']['system-characteristics'];
    expect(sc['system-name']).toMatch(/<<REPLACE/);
    expect(sc['authorization-boundary'].description).toMatch(/<<REPLACE/);
    expect(sc['system-ids'][0].id).toMatch(/<<REPLACE/);
    expect(doc['system-security-plan']['import-profile'].href).toMatch(/<<REPLACE/);
  });

  it('honors operator-supplied profileHref, systemName, sensitivityLevel', () => {
    const doc = buildSspFragment({
      profile: { industry: 'healthcare', role: 'developer', complianceFrameworks: ['hipaa'] },
      frameworks: frameworks(),
      generatedFiles: files(),
      embediqVersion: '3.7.0',
      profileHref: './fedramp-low-baseline-profile.json',
      systemName: 'AcmeMed Claims Adjudication Platform',
      sensitivityLevel: 'fips-199-high',
    });
    const ssp = doc['system-security-plan'];
    expect(ssp['import-profile'].href).toBe('./fedramp-low-baseline-profile.json');
    expect(ssp['system-characteristics']['system-name']).toBe('AcmeMed Claims Adjudication Platform');
    expect(ssp.metadata.title).toContain('AcmeMed Claims Adjudication Platform');
    expect(ssp['system-characteristics']['security-sensitivity-level']).toBe('fips-199-high');
    expect(ssp['system-characteristics']['security-impact-level']['security-objective-confidentiality']).toBe('high');
    expect(ssp['system-characteristics']['security-impact-level']['security-objective-integrity']).toBe('high');
    expect(ssp['system-characteristics']['security-impact-level']['security-objective-availability']).toBe('high');
  });

  it('emits one implemented-requirement per framework, framework-level claim', () => {
    const doc = buildSspFragment({
      profile: { industry: 'healthcare', role: 'developer', complianceFrameworks: ['hipaa'] },
      frameworks: frameworks(),
      generatedFiles: files(),
      embediqVersion: '3.7.0',
    });
    const requirements = doc['system-security-plan']['control-implementation']['implemented-requirements'];
    expect(requirements).toHaveLength(2);
    const controlIds = requirements.map((r) => r['control-id']).sort();
    expect(controlIds).toEqual(['framework:hipaa', 'framework:nist-800-53-rev5']);
    for (const r of requirements) {
      const claimScope = (r.props ?? []).find((p) => p.name === 'claim-scope');
      expect(claimScope?.value).toBe('framework-level');
    }
  });

  it('cross-references the harness component from every implemented-requirement', () => {
    const doc = buildSspFragment({
      profile: { industry: 'healthcare', role: 'developer', complianceFrameworks: ['hipaa'] },
      frameworks: frameworks(),
      generatedFiles: files(),
      embediqVersion: '3.7.0',
      uuid: counterUuid(),
    });
    const ssp = doc['system-security-plan'];
    const components = ssp['system-implementation'].components;
    expect(components).toHaveLength(1);
    const harnessUuid = components[0]!.uuid;
    for (const r of ssp['control-implementation']['implemented-requirements']) {
      const byComponents = r['by-components'] ?? [];
      expect(byComponents.length).toBeGreaterThan(0);
      expect(byComponents[0]['component-uuid']).toBe(harnessUuid);
      expect(byComponents[0]['implementation-status']?.state).toBe('partial');
    }
  });

  it('surfaces every generated file in the harness component props', () => {
    const doc = buildSspFragment({
      profile: { industry: 'healthcare', role: 'developer', complianceFrameworks: ['hipaa'] },
      frameworks: frameworks(),
      generatedFiles: files(),
      embediqVersion: '3.7.0',
    });
    const component = doc['system-security-plan']['system-implementation'].components[0]!;
    const artifactProps = (component.props ?? []).filter((p) => p.name === 'generated-artifact');
    expect(artifactProps.map((p) => p.value).sort()).toEqual([
      '.claude/rules/hipaa-compliance.md',
      'CLAUDE.md',
    ]);
    const countProp = (component.props ?? []).find((p) => p.name === 'artifact-count');
    expect(countProp?.value).toBe('2');
  });

  it('defaults sensitivity to fips-199-moderate when unset', () => {
    const doc = buildSspFragment({
      profile: { industry: 'tech', role: 'developer', complianceFrameworks: [] },
      frameworks: [],
      generatedFiles: files(),
      embediqVersion: '3.7.0',
    });
    expect(doc['system-security-plan']['system-characteristics']['security-sensitivity-level'])
      .toBe('fips-199-moderate');
  });

  it('produces stable JSON ending with a trailing newline', () => {
    const doc: OscalSspDocument = buildSspFragment({
      profile: { industry: 'healthcare', role: 'developer', complianceFrameworks: ['hipaa'] },
      frameworks: frameworks(),
      generatedFiles: files(),
      embediqVersion: '3.7.0',
      uuid: counterUuid(),
      now: () => FIXED_NOW,
    });
    const json = serializeSspFragment(doc);
    expect(json.endsWith('\n')).toBe(true);
    expect(json).toContain('\n  "system-security-plan"');
    expect(JSON.parse(json)).toEqual(doc);
  });
});
