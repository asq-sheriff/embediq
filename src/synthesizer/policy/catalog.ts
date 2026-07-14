/**
 * The destination catalog — the schema the rest of the ecosystem is missing.
 *
 * Every layer knows a model's context window and cost; none carries `covered[]`
 * (BAA coverage) or `retainsData`. This is the one place providers and model
 * ids are named — no other generator should hardcode a model id. Metadata here
 * is advisory and updated as models change; only `covered[]` (customer-attested)
 * gates routing.
 */

import type { UserProfile } from '../../types/index.js';
import type { Destination } from './types.js';

const DEFAULT_LOCAL_MODEL = 'llama3.1:8b';

/** Context-window lookup by model id. Advisory; falls back to a safe small window. */
const CONTEXT_WINDOWS: Readonly<Record<string, number>> = {
  'llama3.1:8b': 128_000,
  'qwen2.5-coder:32b': 32_000,
  'claude-sonnet-4-6': 200_000,
  'gpt-4o': 128_000,
};

const DEFAULT_CONTEXT_WINDOW = 8_192;

/** Default external model per provider — the single source for these ids. */
const PROVIDER_DEFAULT_MODEL: Readonly<Record<string, string>> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
};

export function contextWindowFor(model: string | undefined): number {
  if (!model) return CONTEXT_WINDOWS[DEFAULT_LOCAL_MODEL] ?? DEFAULT_CONTEXT_WINDOW;
  return CONTEXT_WINDOWS[model] ?? DEFAULT_CONTEXT_WINDOW;
}

/**
 * Build the destination catalog from the profile. Deterministic and pure.
 *
 * Local destinations are always present (on-host, no egress). External
 * destinations come from `externalApis`, and each is `covered` for the profile's
 * frameworks ONLY when the org attested a BAA for that provider
 * (`coveredProviders`). No attestation → `covered: []` → uncovered → regulated
 * classes cannot route there. That is the air-gap, produced by data, not a flag.
 */
export function resolveDestinations(profile: UserProfile): Destination[] {
  const destinations: Destination[] = [];

  // Local — the default model plus any additional Ollama models the user runs.
  const localModels = dedupe([
    profile.defaultLocalModel ?? profile.ollamaModels?.[0] ?? DEFAULT_LOCAL_MODEL,
    ...(profile.ollamaModels ?? []),
  ]);
  for (const model of localModels) {
    destinations.push({
      id: `ollama:${model}`,
      locality: 'local',
      provider: 'ollama',
      covered: [], // irrelevant for local — no egress ever leaves the host
      retainsData: false,
      contextWindow: contextWindowFor(model),
    });
  }

  // External — only what the user declared available, coverage per attestation.
  const frameworks = profile.complianceFrameworks ?? [];
  const covered = new Set(profile.coveredProviders ?? []);
  for (const provider of profile.externalApis ?? []) {
    const model = PROVIDER_DEFAULT_MODEL[provider] ?? provider;
    destinations.push({
      id: `${provider}:${model}`,
      locality: 'external',
      provider,
      covered: covered.has(provider) ? [...frameworks] : [],
      retainsData: false, // API tiers do not train on submitted content by default
      contextWindow: contextWindowFor(model),
    });
  }

  return destinations;
}

function dedupe(items: readonly string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}
