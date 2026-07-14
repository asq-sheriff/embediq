import { describe, it, expect } from 'vitest';
import { createEmptyProfile, type UserProfile } from '../../src/types/index.js';
import { healthcarePack } from '../../src/domain-packs/built-in/index.js';
import {
  buildRoutingPolicy,
  composeEligibility,
  eligibleDestinations,
  ruleFor,
  resolveDestinations,
  packEligibility,
  NEUTRAL_CORE,
  POLICY_SCHEMA_VERSION,
  type Destination,
  type EligibilityRule,
} from '../../src/synthesizer/policy/index.js';

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return { ...createEmptyProfile(), ...overrides };
}

describe('policy-builder', () => {
  it('is deterministic — same profile in, byte-identical policy out', () => {
    const p = profile({
      industry: 'healthcare',
      complianceFrameworks: ['hipaa'],
      externalApis: ['anthropic'],
      coveredProviders: ['anthropic'],
      defaultLocalModel: 'llama3.1:8b',
      confidenceEscalation: true,
    });
    const a = buildRoutingPolicy(p);
    const b = buildRoutingPolicy(profile({
      industry: 'healthcare',
      complianceFrameworks: ['hipaa'],
      externalApis: ['anthropic'],
      coveredProviders: ['anthropic'],
      defaultLocalModel: 'llama3.1:8b',
      confidenceEscalation: true,
    }));
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it('always fails closed and ships the cascade strategy', () => {
    const policy = buildRoutingPolicy(profile());
    expect(policy.failMode).toBe('closed');
    expect(policy.strategy).toBe('cascade');
    expect(policy.version).toBe(POLICY_SCHEMA_VERSION);
  });

  it('sets the confidence threshold only when escalation is enabled', () => {
    expect(buildRoutingPolicy(profile({ confidenceEscalation: true })).confidenceThreshold).toBe(6);
    expect(buildRoutingPolicy(profile({ confidenceEscalation: false })).confidenceThreshold).toBeUndefined();
  });

  it('adds a phi rule only for a healthcare/HIPAA profile, and it never promotes', () => {
    const nonHc = buildRoutingPolicy(profile({ industry: 'saas' }));
    expect(nonHc.eligibility.find((r) => r.dataClass === 'phi')).toBeUndefined();

    const hc = buildRoutingPolicy(profile({ industry: 'healthcare', complianceFrameworks: ['hipaa'] }));
    const phi = hc.eligibility.find((r) => r.dataClass === 'phi');
    expect(phi).toBeDefined();
    expect(phi!.redactionCanPromote).toBe(false);
    expect(phi!.minimizeOnEgress).toBe('off');
    expect(phi!.allow).not.toContain('external-uncovered');
  });
});

describe('eligibility — fail-closed lattice', () => {
  it('falls an unrecognized data class through to local-only', () => {
    const rules = composeEligibility([]);
    const rule = ruleFor(rules, 'some-class-no-rule-names');
    expect(rule.dataClass).toBe('unknown');
    expect(rule.allow).toEqual(['local']);
  });

  it('keeps the neutral core authoritative — a contribution cannot loosen it', () => {
    const malicious: EligibilityRule = {
      dataClass: 'restricted',
      allow: ['local', 'external-covered', 'external-uncovered'],
      redactionCanPromote: false,
      minimizeOnEgress: 'off',
    };
    const composed = composeEligibility([malicious]);
    const restricted = composed.find((r) => r.dataClass === 'restricted')!;
    expect(restricted.allow).toEqual(['local']); // core wins, not the loosened contribution
  });

  it('never gives pci a promotion path, under any framework combination', () => {
    for (const frameworks of [['pci'], ['pci', 'hipaa'], ['pci', 'soc2', 'hipaa']]) {
      const rules = composeEligibility(packEligibility(frameworks, 'finance'));
      const pci = rules.find((r) => r.dataClass === 'pci');
      expect(pci).toBeDefined();
      expect(pci!.allow).not.toContain('external-uncovered');
      expect(pci!.redactionCanPromote).toBe(false);
    }
  });

  it('includes exactly the four neutral core classes with no contributions', () => {
    const classes = composeEligibility([]).map((r) => r.dataClass).sort();
    expect(classes).toEqual(['internal', 'public', 'restricted', 'unknown']);
    expect(NEUTRAL_CORE).toHaveLength(4);
  });
});

describe('catalog + eligible-set resolution', () => {
  const local: Destination = { id: 'ollama:llama3.1:8b', locality: 'local', provider: 'ollama', covered: [], retainsData: false, contextWindow: 128000 };
  const coveredExt: Destination = { id: 'anthropic:x', locality: 'external', provider: 'anthropic', covered: ['hipaa'], retainsData: false, contextWindow: 200000 };
  const uncoveredExt: Destination = { id: 'openai:x', locality: 'external', provider: 'openai', covered: [], retainsData: false, contextWindow: 128000 };

  it('never routes phi to an uncovered destination, regardless of its other attributes', () => {
    const rules = composeEligibility(packEligibility(['hipaa'], 'healthcare'));
    const eligible = eligibleDestinations([local, coveredExt, uncoveredExt], rules, 'phi');
    const ids = eligible.map((d) => d.id).sort();
    expect(ids).toEqual(['anthropic:x', 'ollama:llama3.1:8b']); // uncovered openai excluded
  });

  it('air-gaps phi when no covered destination exists (empty coveredProviders)', () => {
    const p = profile({ industry: 'healthcare', complianceFrameworks: ['hipaa'], externalApis: ['anthropic', 'openai'], coveredProviders: [] });
    const dests = resolveDestinations(p);
    expect(dests.every((d) => d.locality === 'local' || d.covered.length === 0)).toBe(true);

    const rules = composeEligibility(packEligibility(['hipaa'], 'healthcare'));
    const eligible = eligibleDestinations(dests, rules, 'phi');
    expect(eligible.every((d) => d.locality === 'local')).toBe(true); // nothing leaves the host
  });

  it('marks a provider covered only when the org attested a BAA for it', () => {
    const p = profile({ complianceFrameworks: ['hipaa'], externalApis: ['anthropic', 'openai'], coveredProviders: ['anthropic'] });
    const dests = resolveDestinations(p);
    expect(dests.find((d) => d.provider === 'anthropic')!.covered).toEqual(['hipaa']);
    expect(dests.find((d) => d.provider === 'openai')!.covered).toEqual([]);
    expect(dests.some((d) => d.locality === 'local')).toBe(true);
  });

  it('public data may reach an uncovered destination; internal may not', () => {
    const rules = composeEligibility([]);
    expect(eligibleDestinations([uncoveredExt], rules, 'public').map((d) => d.id)).toEqual(['openai:x']);
    expect(eligibleDestinations([uncoveredExt], rules, 'internal')).toEqual([]);
  });
});

describe('eligibility — pack-contributed (industry-generality)', () => {
  it('sources the phi rule from the healthcare pack, not the lattice core', () => {
    // The rule is declared as pack data, not hardcoded in the policy core.
    const contrib = healthcarePack.eligibilityContributions?.[0];
    expect(contrib?.framework).toBe('hipaa');
    expect(contrib?.rules[0].dataClass).toBe('phi');
    // …and it is exactly what the resolver returns for a healthcare profile.
    expect(packEligibility([], 'healthcare')).toEqual([...contrib!.rules]);
  });

  it('activates hipaa by healthcare-family industry OR explicit selection', () => {
    // Industry implies it (no explicit framework)…
    expect(packEligibility([], 'pharma').some((r) => r.dataClass === 'phi')).toBe(true);
    // …and an explicit hipaa selection activates it outside a healthcare industry.
    expect(packEligibility(['hipaa'], 'saas').some((r) => r.dataClass === 'phi')).toBe(true);
    // Neither → no phi rule.
    expect(packEligibility([], 'saas').some((r) => r.dataClass === 'phi')).toBe(false);
  });

  it('activates pci only on explicit selection — never by finance industry alone', () => {
    // Deliberately preserved: a finance industry alone does not imply PCI.
    expect(packEligibility([], 'finance').some((r) => r.dataClass === 'pci')).toBe(false);
    expect(packEligibility(['pci'], 'finance').some((r) => r.dataClass === 'pci')).toBe(true);
    expect(packEligibility(['pci'], 'saas').some((r) => r.dataClass === 'pci')).toBe(true);
  });

  it('composes multiple packs in registration order (phi before pci)', () => {
    const rules = packEligibility(['hipaa', 'pci'], 'healthcare');
    const classes = rules.map((r) => r.dataClass);
    expect(classes).toEqual(['phi', 'pci']); // healthcare pack before finance pack
  });
});
