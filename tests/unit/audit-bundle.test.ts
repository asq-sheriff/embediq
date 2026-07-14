import { describe, it, expect } from 'vitest';
import { createEmptyProfile, type UserProfile, type GenerationContext, type GeneratedFile } from '../../src/types/index.js';
import { buildRoutingPolicy } from '../../src/synthesizer/policy/index.js';
import {
  buildAuditBundle,
  egressPostureOf,
  renderAuditBundleReadme,
} from '../../src/governance/audit-bundle/index.js';
import { generateAuditBundle } from '../../src/synthesizer/generators/audit-bundle.js';

function policyFor(overrides: Partial<UserProfile>) {
  return buildRoutingPolicy({ ...createEmptyProfile(), ...overrides });
}

const FILES: GeneratedFile[] = [
  { relativePath: 'router/routing-policy.yaml', content: 'version: 1.0.0\n', description: '' },
  { relativePath: 'litellm/config.yaml', content: 'model_list: []\n', description: '' },
  { relativePath: 'litellm/guardrails/embediq_phi_egress.py', content: '# guardrail\n', description: '' },
  { relativePath: '.claude/hooks/pre_tool_use.py', content: '# PreToolUse DLP hook — exit 2 = BLOCK\n', description: '' },
];

const DETERMINISTIC = { now: () => 'FIXED_TS', sha256: (c: string) => `len${c.length}` };

describe('egressPostureOf', () => {
  it('reports air-gapped when a regulated class has no covered external destination', () => {
    const posture = egressPostureOf(policyFor({ industry: 'healthcare', complianceFrameworks: ['hipaa'], externalApis: ['anthropic'], coveredProviders: [], routerEnabled: true }));
    expect(posture.regulatedClasses).toContain('phi');
    expect(posture.airgapped).toBe(true);
    expect(posture.coveredFrameworks).toEqual([]);
  });

  it('is not air-gapped when a covered external destination exists', () => {
    const posture = egressPostureOf(policyFor({ industry: 'healthcare', complianceFrameworks: ['hipaa'], externalApis: ['anthropic'], coveredProviders: ['anthropic'], routerEnabled: true }));
    expect(posture.airgapped).toBe(false);
    expect(posture.coveredFrameworks).toContain('hipaa');
  });

  it('is empty and not air-gapped with no policy', () => {
    expect(egressPostureOf(undefined)).toEqual({ airgapped: false, regulatedClasses: [], coveredFrameworks: [], destinations: [] });
  });
});

describe('buildAuditBundle', () => {
  const baseInput = {
    profile: { industry: 'healthcare', role: 'developer', complianceFrameworks: ['hipaa'], routerEnabled: true },
    policy: policyFor({ industry: 'healthcare', complianceFrameworks: ['hipaa'], externalApis: ['anthropic'], coveredProviders: [], routerEnabled: true }),
    generatedFiles: FILES,
    producerVersion: '4.0.6',
    ...DETERMINISTIC,
  };

  it('indexes present artifacts with a content hash and marks absent ones', () => {
    const m = buildAuditBundle(baseInput);
    const policy = m.artifacts.find((a) => a.kind === 'routing-policy')!;
    expect(policy.present).toBe(true);
    expect(policy.sha256).toBe('len15'); // 'version: 1.0.0\n'
    const ssp = m.artifacts.find((a) => a.kind === 'oscal-ssp-fragment')!;
    expect(ssp.present).toBe(false);
    expect(ssp.sha256).toBeUndefined();
  });

  it('finds the DLP hook by content and adds it as an artifact', () => {
    const m = buildAuditBundle(baseInput);
    const hook = m.artifacts.find((a) => a.kind === 'dlp-hook');
    expect(hook?.present).toBe(true);
    expect(hook?.path).toBe('.claude/hooks/pre_tool_use.py');
  });

  it('lists egress-eligibility + drift + dlp-hook controls when all apply', () => {
    const ids = buildAuditBundle(baseInput).controls.map((c) => c.id);
    expect(ids).toEqual(['egress-eligibility', 'drift', 'dlp-hook']);
  });

  it('omits egress-eligibility when nothing governs egress, and dlp-hook when absent', () => {
    const m = buildAuditBundle({
      ...baseInput,
      profile: { industry: 'tech', role: 'developer', complianceFrameworks: [], routerEnabled: false },
      policy: policyFor({ industry: 'tech' }),
      generatedFiles: [FILES[0]], // no hook
    });
    expect(m.controls.map((c) => c.id)).toEqual(['drift']);
  });

  it('is deterministic under injected clock + hash', () => {
    expect(buildAuditBundle(baseInput)).toEqual(buildAuditBundle(baseInput));
    expect(buildAuditBundle(baseInput).generatedAt).toBe('FIXED_TS');
  });

  it('records the policy version + fail-mode + air-gapped posture', () => {
    const m = buildAuditBundle(baseInput);
    expect(m.policy.version).toBe('1.0.0');
    expect(m.policy.failMode).toBe('closed');
    expect(m.policy.egressPosture.airgapped).toBe(true);
  });
});

describe('renderAuditBundleReadme', () => {
  it('surfaces the air-gapped-by-construction note for a regulated no-BAA profile', () => {
    const md = renderAuditBundleReadme(buildAuditBundle({
      profile: { industry: 'healthcare', role: 'developer', complianceFrameworks: ['hipaa'], routerEnabled: true },
      policy: policyFor({ industry: 'healthcare', complianceFrameworks: ['hipaa'], externalApis: ['anthropic'], coveredProviders: [], routerEnabled: true }),
      generatedFiles: FILES,
      producerVersion: '4.0.6',
      ...DETERMINISTIC,
    }));
    expect(md).toContain('Air-gapped by construction');
    expect(md).toContain('## Controls you can run');
    expect(md).toContain('npm run evaluate -- --mode router-eligibility');
  });
});

describe('generateAuditBundle (wrapper)', () => {
  function ctx(overrides: Partial<UserProfile>): GenerationContext {
    const profile = { ...createEmptyProfile(), role: 'developer', ...overrides };
    return { profile, policy: buildRoutingPolicy(profile) };
  }

  it('emits both the manifest and the README', () => {
    const files = generateAuditBundle(ctx({ industry: 'healthcare', complianceFrameworks: ['hipaa'], routerEnabled: true }), FILES, '4.0.6');
    const paths = files.map((f) => f.relativePath).sort();
    expect(paths).toEqual(['.embediq/audit-bundle/README.md', '.embediq/audit-bundle/manifest.json']);
    expect(() => JSON.parse(files.find((f) => f.relativePath.endsWith('manifest.json'))!.content)).not.toThrow();
  });
});
