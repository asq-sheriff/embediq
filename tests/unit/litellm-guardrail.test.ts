import { describe, it, expect } from 'vitest';
import { createEmptyProfile, type UserProfile, type GenerationContext } from '../../src/types/index.js';
import { buildRoutingPolicy } from '../../src/synthesizer/policy/index.js';
import {
  LiteLlmGuardrailGenerator,
  guardrailPatterns,
  shouldEmitGuardrail,
} from '../../src/synthesizer/generators/litellm-guardrail.js';
import { LiteLlmGatewayGenerator } from '../../src/synthesizer/generators/litellm-gateway.js';
import { domainPackRegistry } from '../../src/domain-packs/registry.js';

function ctxFor(overrides: Partial<UserProfile>): GenerationContext {
  const profile = { ...createEmptyProfile(), ...overrides };
  const domainPack = domainPackRegistry.getForIndustry(profile.industry);
  return { profile, domainPack, policy: buildRoutingPolicy(profile) };
}

const HEALTHCARE: Partial<UserProfile> = {
  industry: 'healthcare',
  complianceFrameworks: ['hipaa'],
  externalApis: ['anthropic'],
  coveredProviders: ['anthropic'],
  routerEnabled: true,
};

describe('LiteLlmGuardrailGenerator', () => {
  it('emits nothing when the profile contributes no DLP patterns', () => {
    const files = new LiteLlmGuardrailGenerator().generate(ctxFor({ complianceFrameworks: [] }));
    expect(files).toEqual([]);
    expect(shouldEmitGuardrail(ctxFor({ complianceFrameworks: [] }))).toBe(false);
  });

  it('emits nothing when there is no policy on the context', () => {
    const profile = { ...createEmptyProfile(), ...HEALTHCARE };
    const domainPack = domainPackRegistry.getForIndustry(profile.industry);
    // No policy field — guardrail still keys on patterns, which are present,
    // so it renders; the gateway (which needs a policy) is what no-ops.
    expect(new LiteLlmGuardrailGenerator().generate({ profile, domainPack })).toHaveLength(1);
  });

  it('renders the guardrail from the healthcare DLP patterns — one source of truth', () => {
    const files = new LiteLlmGuardrailGenerator().generate(ctxFor(HEALTHCARE));
    expect(files).toHaveLength(1);
    expect(files[0].relativePath).toBe('litellm/guardrails/embediq_phi_egress.py');
    const py = files[0].content;
    // Pattern labels come straight from the healthcare pack.
    expect(py).toContain('Medical Record Number (MRN)');
    expect(py).toContain('DEA Number');
    expect(py).toContain('FHIR Patient Resource ID');
    // Structure.
    expect(py).toContain('class EmbedIQPhiEgress(CustomGuardrail)');
    expect(py).toContain('async def async_pre_call_hook');
  });

  it('every pack pattern reaches the rendered file', () => {
    const ctx = ctxFor(HEALTHCARE);
    const patterns = guardrailPatterns(ctx);
    const py = new LiteLlmGuardrailGenerator().generate(ctx)[0].content;
    expect(patterns.length).toBeGreaterThan(0);
    for (const p of patterns) {
      expect(py).toContain(JSON.stringify(p.name));
    }
  });

  it('defaults to minimize OFF — redaction is opt-in, never the control', () => {
    const py = new LiteLlmGuardrailGenerator().generate(ctxFor(HEALTHCARE))[0].content;
    expect(py).toContain('MINIMIZE_MODE = "off"');
    // Fail-closed hard-block is opt-in via env, never on by default.
    expect(py).toContain('EMBEDIQ_GUARDRAIL_BLOCK');
    // Audits counts, never raw content.
    expect(py).toContain('Counts only — never the matched content itself.');
  });

  it('emits patterns as JSON-escaped literals — no raw-string escaping hazard', () => {
    const py = new LiteLlmGuardrailGenerator().generate(ctxFor(HEALTHCARE))[0].content;
    // MRN regex begins \b — must survive as a double-backslash Python literal.
    expect(py).toMatch(/re\.compile\("\\\\b\(\?:MRN/);
  });
});

describe('gateway ↔ guardrail wiring', () => {
  it('gateway config references the guardrail on a regulated profile', () => {
    const yaml = new LiteLlmGatewayGenerator().generate(ctxFor(HEALTHCARE))[0].content;
    expect(yaml).toContain('guardrails:');
    expect(yaml).toContain('guardrail_name: embediq-phi-egress');
    expect(yaml).toContain('guardrails.embediq_phi_egress.EmbedIQPhiEgress');
  });

  it('gateway config omits the guardrails block when no DLP patterns apply', () => {
    const yaml = new LiteLlmGatewayGenerator().generate(ctxFor({ externalApis: ['openai'] }))[0].content;
    expect(yaml).not.toContain('guardrails:');
  });
});
