import { describe, it, expect } from 'vitest';
import { createEmptyProfile, type UserProfile, type GenerationContext } from '../../src/types/index.js';
import { buildRoutingPolicy } from '../../src/synthesizer/policy/index.js';
import { LiteLlmGatewayGenerator } from '../../src/synthesizer/generators/litellm-gateway.js';

function ctxFor(overrides: Partial<UserProfile>): GenerationContext {
  const profile = { ...createEmptyProfile(), ...overrides };
  return { profile, policy: buildRoutingPolicy(profile) };
}

function render(overrides: Partial<UserProfile>): string {
  const files = new LiteLlmGatewayGenerator().generate(ctxFor(overrides));
  expect(files).toHaveLength(1);
  expect(files[0].relativePath).toBe('litellm/config.yaml');
  return files[0].content;
}

describe('LiteLlmGatewayGenerator', () => {
  it('emits nothing when there is no policy on the context', () => {
    expect(new LiteLlmGatewayGenerator().generate({ profile: createEmptyProfile() })).toEqual([]);
  });

  it('air-gaps a HIPAA profile with no BAA — zero external destinations in the file', () => {
    const yaml = render({ industry: 'healthcare', complianceFrameworks: ['hipaa'], externalApis: ['anthropic', 'openai'], coveredProviders: [] });
    expect(yaml).toContain('model_list:');
    expect(yaml).toContain('ollama/');
    expect(yaml).not.toContain('anthropic/');
    expect(yaml).not.toContain('openai/');
    expect(yaml).not.toContain('context_window_fallbacks');
  });

  it('includes only the BAA-covered provider on a regulated profile', () => {
    const yaml = render({ industry: 'healthcare', complianceFrameworks: ['hipaa'], externalApis: ['anthropic', 'openai'], coveredProviders: ['anthropic'] });
    expect(yaml).toContain('anthropic/');
    expect(yaml).not.toContain('openai/'); // uncovered — absent, not merely unreachable
    expect(yaml).toContain('context_window_fallbacks');
  });

  it('leaves all declared externals reachable on a non-regulated profile', () => {
    expect(render({ externalApis: ['openai'], coveredProviders: [] })).toContain('openai/');
  });

  it('gives each local model a distinct model_name — no coder/embed collision', () => {
    const yaml = render({ ollamaModels: ['qwen2.5-coder:32b', 'nomic-embed-text'] });
    const names = [...yaml.matchAll(/model_name: (\S+)/g)].map((m) => m[1]);
    const localNames = names.filter((n) => n.startsWith('local-'));
    expect(localNames.length).toBeGreaterThanOrEqual(2);
    expect(new Set(localNames).size).toBe(localNames.length); // all unique
    expect(yaml).toContain('model_name: local-qwen2.5-coder:32b');
    expect(yaml).toContain('model_name: local-nomic-embed-text');
  });

  it('reads OLLAMA_HOST and provider keys from the environment, never inlined', () => {
    const yaml = render({ complianceFrameworks: ['hipaa'], externalApis: ['anthropic'], coveredProviders: ['anthropic'] });
    expect(yaml).toContain('api_base: os.environ/OLLAMA_HOST');
    expect(yaml).toContain('api_key: os.environ/ANTHROPIC_API_KEY');
  });
});
