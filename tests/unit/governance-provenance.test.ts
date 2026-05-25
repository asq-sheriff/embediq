import { describe, it, expect } from 'vitest';
import {
  buildProvenanceTrace,
  serializeProvenanceTrace,
  matchHeuristic,
  DRIVER_HEURISTICS,
  type ProvenanceTrace,
} from '../../src/governance/provenance/index.js';
import { createEmptyProfile, type SetupConfig } from '../../src/types/index.js';

function baseConfig(overrides: Partial<SetupConfig['profile']> = {}): SetupConfig {
  return {
    profile: { ...createEmptyProfile(), ...overrides },
    targetDir: '/tmp/out',
  };
}

const FIXED_NOW = '2026-05-25T21:00:00.000Z';

describe('matchHeuristic — driver inference', () => {
  it('returns null when no rule matches the path (custom domain pack output)', () => {
    const config = baseConfig({ role: 'developer' });
    expect(matchHeuristic('weird/custom-pack-output.bin', config)).toBeNull();
  });

  it('matches CLAUDE.md to role + target + industry drivers', () => {
    const config = baseConfig({ role: 'developer', industry: 'healthcare', languages: ['typescript'] });
    const result = matchHeuristic('CLAUDE.md', config);
    expect(result).not.toBeNull();
    expect(result!.rule.name).toBe('claude-md-root');
    const driverTypes = result!.drivers.map((d) => d.type);
    expect(driverTypes).toContain('profile-field');
    expect(driverTypes).toContain('target');
    expect(driverTypes).toContain('industry');
  });

  it('matches compliance rule files to the framework in the filename', () => {
    const config = baseConfig({ complianceFrameworks: ['hipaa'] });
    const result = matchHeuristic('.claude/rules/hipaa-compliance.md', config);
    expect(result).not.toBeNull();
    expect(result!.rule.name).toBe('compliance-rule-file');
    expect(result!.drivers.some((d) => d.type === 'compliance-framework' && d.value === 'hipaa')).toBe(true);
  });

  it('matches language rule files to the language driver', () => {
    const config = baseConfig({ languages: ['typescript'] });
    const result = matchHeuristic('.claude/rules/typescript.md', config);
    expect(result).not.toBeNull();
    expect(result!.rule.name).toBe('language-rule-file');
    expect(result!.drivers.some((d) => d.type === 'language' && d.value === 'typescript')).toBe(true);
  });

  it('matches router output to routerEnabled + adds HIPAA driver when active', () => {
    const config = baseConfig({
      routerEnabled: true,
      confidenceEscalation: true,
      complianceFrameworks: ['hipaa'],
    });
    const result = matchHeuristic('router/index.ts', config);
    expect(result).not.toBeNull();
    expect(result!.rule.name).toBe('local-router-output');
    const driverValues = result!.drivers.map((d) => d.value);
    expect(driverValues).toContain('true');  // routerEnabled
    expect(driverValues).toContain('hipaa');  // PHI redactor
  });

  it('matches RAG output to localAiEnabled + healthcare industry triggers FHIR variant', () => {
    const config = baseConfig({ localAiEnabled: true, industry: 'healthcare' });
    const result = matchHeuristic('rag/chunker.ts', config);
    expect(result).not.toBeNull();
    expect(result!.rule.name).toBe('rag-scaffold-output');
    expect(result!.drivers.some((d) => d.type === 'industry' && d.value === 'healthcare')).toBe(true);
  });

  it('matches multi-agent targets to the corresponding target driver', () => {
    const config = baseConfig({});
    expect(matchHeuristic('AGENTS.md', config)?.rule.name).toBe('agents-md-output');
    expect(matchHeuristic('GEMINI.md', config)?.rule.name).toBe('gemini-md-output');
    expect(matchHeuristic('.windsurfrules', config)?.rule.name).toBe('windsurf-rules-output');
    expect(matchHeuristic('.cursor/rules/typescript.mdc', config)?.rule.name).toBe('cursor-rules-output');
    expect(matchHeuristic('.github/copilot-instructions.md', config)?.rule.name).toBe('copilot-instructions-output');
  });

  it('matches governance post-pass outputs to their respective target', () => {
    const config = baseConfig({});
    expect(matchHeuristic('.embediq/oscal/component-definition.json', config)?.rule.name).toBe('oscal-component-definition-output');
    expect(matchHeuristic('.embediq/oscal/ssp-fragment.json', config)?.rule.name).toBe('oscal-ssp-fragment-output');
    expect(matchHeuristic('.embediq/cyclonedx/aibom.json', config)?.rule.name).toBe('cyclonedx-aibom-output');
    expect(matchHeuristic('.embediq/provenance/manifest.json', config)?.rule.name).toBe('provenance-manifest-output');
  });

  it('rule names are unique within the catalog', () => {
    const names = DRIVER_HEURISTICS.map((r) => r.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });
});

describe('buildProvenanceTrace', () => {
  const config = baseConfig({
    role: 'developer',
    industry: 'healthcare',
    languages: ['typescript'],
    complianceFrameworks: ['hipaa'],
    securityConcerns: ['phi', 'dlp'],
    localAiEnabled: true,
  });

  const files = [
    { relativePath: 'CLAUDE.md', content: '# Claude', description: 'Root CLAUDE.md' },
    { relativePath: '.claude/rules/hipaa-compliance.md', content: '# HIPAA' },
    { relativePath: '.claude/rules/typescript.md', content: '# TS' },
    { relativePath: 'weird/custom-thing.txt', content: 'custom' },
  ];

  function buildMaps(overrides: Record<string, { generator: string; target: string }> = {}): {
    generatorByPath: Map<string, string>;
    targetByPath: Map<string, string>;
  } {
    const generatorByPath = new Map<string, string>();
    const targetByPath = new Map<string, string>();
    generatorByPath.set('CLAUDE.md', 'claude-md');
    targetByPath.set('CLAUDE.md', 'claude');
    generatorByPath.set('.claude/rules/hipaa-compliance.md', 'rules');
    targetByPath.set('.claude/rules/hipaa-compliance.md', 'claude');
    generatorByPath.set('.claude/rules/typescript.md', 'rules');
    targetByPath.set('.claude/rules/typescript.md', 'claude');
    generatorByPath.set('weird/custom-thing.txt', 'custom-pack');
    targetByPath.set('weird/custom-thing.txt', 'claude');
    for (const [path, attr] of Object.entries(overrides)) {
      generatorByPath.set(path, attr.generator);
      targetByPath.set(path, attr.target);
    }
    return { generatorByPath, targetByPath };
  }

  it('produces a top-level document with the expected shape', () => {
    const { generatorByPath, targetByPath } = buildMaps();
    const trace = buildProvenanceTrace({
      config,
      files,
      generatorByPath,
      targetByPath,
      targets: ['claude', 'provenance'],
      embediqVersion: '3.7.0',
      now: () => FIXED_NOW,
    });
    expect(trace.schemaVersion).toBe(1);
    expect(trace.producer).toEqual({ name: 'EmbedIQ', version: '3.7.0' });
    expect(trace.generatedAt).toBe(FIXED_NOW);
    expect(trace.targets).toEqual(['claude', 'provenance']);  // sorted
    expect(trace.files).toHaveLength(4);
    expect(trace.methodology.generatorAttribution).toBe('authoritative');
    expect(trace.methodology.driverInference).toBe('heuristic');
  });

  it('records authoritative generator + target per file from the maps', () => {
    const { generatorByPath, targetByPath } = buildMaps();
    const trace = buildProvenanceTrace({
      config,
      files,
      generatorByPath,
      targetByPath,
      targets: ['claude'],
      embediqVersion: '3.7.0',
    });
    const claudeEntry = trace.files.find((f) => f.relativePath === 'CLAUDE.md')!;
    expect(claudeEntry.generatorName).toBe('claude-md');
    expect(claudeEntry.target).toBe('claude');
    expect(claudeEntry.description).toBe('Root CLAUDE.md');
  });

  it('infers drivers via heuristics for files that match a rule', () => {
    const { generatorByPath, targetByPath } = buildMaps();
    const trace = buildProvenanceTrace({
      config,
      files,
      generatorByPath,
      targetByPath,
      targets: ['claude'],
      embediqVersion: '3.7.0',
    });
    const hipaaEntry = trace.files.find((f) => f.relativePath === '.claude/rules/hipaa-compliance.md')!;
    expect(hipaaEntry.matchedHeuristic).toBe('compliance-rule-file');
    expect(hipaaEntry.drivers.some((d) => d.type === 'compliance-framework' && d.value === 'hipaa')).toBe(true);

    const tsEntry = trace.files.find((f) => f.relativePath === '.claude/rules/typescript.md')!;
    expect(tsEntry.matchedHeuristic).toBe('language-rule-file');
    expect(tsEntry.drivers.some((d) => d.type === 'language' && d.value === 'typescript')).toBe(true);
  });

  it('records empty drivers + undefined matchedHeuristic for unmatched files', () => {
    const { generatorByPath, targetByPath } = buildMaps();
    const trace = buildProvenanceTrace({
      config,
      files,
      generatorByPath,
      targetByPath,
      targets: ['claude'],
      embediqVersion: '3.7.0',
    });
    const customEntry = trace.files.find((f) => f.relativePath === 'weird/custom-thing.txt')!;
    expect(customEntry.matchedHeuristic).toBeUndefined();
    expect(customEntry.drivers).toEqual([]);
    // But authoritative attribution still surfaces.
    expect(customEntry.generatorName).toBe('custom-pack');
    expect(customEntry.target).toBe('claude');
  });

  it('falls back to "post-pass" when a file has no entry in the maps (defensive)', () => {
    const generatorByPath = new Map<string, string>();
    const targetByPath = new Map<string, string>();
    const trace = buildProvenanceTrace({
      config,
      files: [{ relativePath: 'orphan.md', content: 'no owner' }],
      generatorByPath,
      targetByPath,
      targets: ['claude'],
      embediqVersion: '3.7.0',
    });
    expect(trace.files[0].generatorName).toBe('post-pass');
    expect(trace.files[0].target).toBe('post-pass');
  });

  it('summarizes the profile in the document header', () => {
    const { generatorByPath, targetByPath } = buildMaps();
    const trace = buildProvenanceTrace({
      config,
      files,
      generatorByPath,
      targetByPath,
      targets: ['claude'],
      embediqVersion: '3.7.0',
    });
    expect(trace.profileSummary).toEqual({
      role: 'developer',
      industry: 'healthcare',
      businessDomain: undefined,
      technicalProficiency: config.profile.technicalProficiency,
      complianceFrameworks: ['hipaa'],
      languages: ['typescript'],
      securityConcerns: ['dlp', 'phi'],  // sorted
      teamSize: config.profile.teamSize,
      localAiEnabled: true,
      routerEnabled: undefined,
    });
  });
});

describe('serializeProvenanceTrace', () => {
  it('produces JSON with a trailing newline that round-trips through JSON.parse', () => {
    const trace: ProvenanceTrace = buildProvenanceTrace({
      config: baseConfig({ role: 'developer' }),
      files: [{ relativePath: 'CLAUDE.md', content: '# Claude' }],
      generatorByPath: new Map([['CLAUDE.md', 'claude-md']]),
      targetByPath: new Map([['CLAUDE.md', 'claude']]),
      targets: ['claude'],
      embediqVersion: '3.7.0',
      now: () => FIXED_NOW,
    });
    const json = serializeProvenanceTrace(trace);
    expect(json.endsWith('\n')).toBe(true);
    expect(json).toContain('"schemaVersion": 1');
    expect(JSON.parse(json)).toEqual(trace);
  });
});
