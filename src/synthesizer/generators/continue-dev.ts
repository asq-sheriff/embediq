import type { ConfigGenerator } from '../generator.js';
import { TargetFormat } from '../target-format.js';
import type { SetupConfig, GeneratedFile, UserProfile } from '../../types/index.js';

/**
 * Continue.dev generator — emits `.continue/config.json`. Configures the
 * Continue.dev VS Code / JetBrains extension to use the user's Ollama
 * models, with the default model wired as both the chat target and the
 * tab-autocomplete model.
 *
 * Only runs when the user has opted into local AI (TECH_013) and selected
 * `continue-dev` in TECH_017.
 */
export class ContinueDevGenerator implements ConfigGenerator {
  name = 'continue-dev';
  target = TargetFormat.CONTINUE_DEV;

  generate(config: SetupConfig): GeneratedFile[] {
    const { profile } = config;
    const models = profile.ollamaModels ?? [];
    const defaultModel = profile.defaultLocalModel ?? models[0] ?? 'llama3.1:8b';
    const embedModel = models.find((m) => m.includes('embed')) ?? 'nomic-embed-text';

    type ContinueModel = {
      title: string;
      provider: string;
      model: string;
      apiKey?: string;
    };

    const localModels: ContinueModel[] = models
      .filter((m) => !m.includes('embed'))
      .map((m) => ({
        title: m,
        provider: 'ollama',
        model: m,
      }));

    // Fallback when the user picked only `custom` or no models — emit a
    // working skeleton with the default suggestion so the config opens
    // cleanly in the extension.
    if (localModels.length === 0) {
      localModels.push({ title: defaultModel, provider: 'ollama', model: defaultModel });
    }

    // Explicit chaining — when the router is enabled and an external API
    // is configured, surface the hosted model as a selectable chat target
    // alongside the local entries. Autocomplete + embeddings stay local
    // because they're latency-sensitive.
    const hostedModels = resolveContinueChain(profile);

    const continueConfig = {
      models: [...localModels, ...hostedModels],
      tabAutocompleteModel: {
        title: defaultModel,
        provider: 'ollama',
        model: defaultModel,
      },
      embeddingsProvider: {
        provider: 'ollama',
        model: embedModel,
      },
      allowAnonymousTelemetry: false,
    };

    return [
      {
        relativePath: '.continue/config.json',
        content: JSON.stringify(continueConfig, null, 2) + '\n',
        description: 'Continue.dev configuration (.continue/config.json)',
      },
    ];
  }
}

function resolveContinueChain(profile: UserProfile): Array<{
  title: string;
  provider: string;
  model: string;
  apiKey: string;
}> {
  if (profile.routerEnabled !== true) return [];
  const apis = profile.externalApis ?? [];
  const out: Array<{ title: string; provider: string; model: string; apiKey: string }> = [];
  if (apis.includes('anthropic')) {
    out.push({
      title: 'Claude Sonnet (hosted)',
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      apiKey: '${ANTHROPIC_API_KEY}',
    });
  }
  if (apis.includes('openai')) {
    out.push({
      title: 'GPT-4o (hosted)',
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: '${OPENAI_API_KEY}',
    });
  }
  return out;
}

/** Exposed for tests. */
export function shouldEmitContinueDev(profile: UserProfile): boolean {
  return (
    profile.localAiEnabled === true &&
    Array.isArray(profile.ideIntegrations) &&
    profile.ideIntegrations.includes('continue-dev')
  );
}
