import type { ConfigGenerator } from '../generator.js';
import { TargetFormat } from '../target-format.js';
import type { SetupConfig, GeneratedFile, UserProfile } from '../../types/index.js';

/**
 * Zed AI generator — emits `.zed/settings.json`. Registers an Ollama
 * provider for the user's selected models and sets the default model.
 *
 * Only runs when the user has opted into local AI (TECH_013) and selected
 * `zed-ai` in TECH_017.
 */
export class ZedAiGenerator implements ConfigGenerator {
  name = 'zed-ai';
  target = TargetFormat.ZED_AI;

  generate(config: SetupConfig): GeneratedFile[] {
    const { profile } = config;
    const models = (profile.ollamaModels ?? []).filter((m) => !m.includes('embed'));
    const defaultModel = profile.defaultLocalModel ?? models[0] ?? 'llama3.1:8b';

    const languageModels: Record<string, unknown> = {
      ollama: {
        api_url: 'http://localhost:11434',
        available_models:
          models.length > 0
            ? models.map((m) => ({
                name: m,
                display_name: m,
                max_tokens: 32768,
              }))
            : [
                {
                  name: defaultModel,
                  display_name: defaultModel,
                  max_tokens: 32768,
                },
              ],
      },
    };

    // Explicit chaining — register additional hosted providers when the
    // router is enabled and external APIs are configured. The default
    // model stays local so autocomplete latency stays low; switch the
    // active model in Zed's assistant UI to use a hosted backend.
    if (profile.routerEnabled === true) {
      const apis = profile.externalApis ?? [];
      if (apis.includes('anthropic')) {
        languageModels.anthropic = {
          api_url: 'https://api.anthropic.com',
          available_models: [
            { name: 'claude-sonnet-4-6', display_name: 'Claude Sonnet (hosted)', max_tokens: 200000 },
          ],
        };
      }
      if (apis.includes('openai')) {
        languageModels.openai = {
          api_url: 'https://api.openai.com/v1',
          available_models: [
            { name: 'gpt-4o', display_name: 'GPT-4o (hosted)', max_tokens: 128000 },
          ],
        };
      }
    }

    const settings = {
      assistant: {
        version: '2',
        default_model: {
          provider: 'ollama',
          model: defaultModel,
        },
      },
      language_models: languageModels,
    };

    return [
      {
        relativePath: '.zed/settings.json',
        content: JSON.stringify(settings, null, 2) + '\n',
        description: 'Zed AI configuration (.zed/settings.json)',
      },
    ];
  }
}

/** Exposed for tests. */
export function shouldEmitZedAi(profile: UserProfile): boolean {
  return (
    profile.localAiEnabled === true &&
    Array.isArray(profile.ideIntegrations) &&
    profile.ideIntegrations.includes('zed-ai')
  );
}
