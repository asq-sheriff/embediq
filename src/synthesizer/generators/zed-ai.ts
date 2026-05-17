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

    const settings = {
      assistant: {
        version: '2',
        default_model: {
          provider: 'ollama',
          model: defaultModel,
        },
      },
      language_models: {
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
      },
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
