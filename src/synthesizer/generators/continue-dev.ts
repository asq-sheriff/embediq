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

    const continueConfig = {
      models: models
        .filter((m) => !m.includes('embed'))
        .map((m) => ({
          title: m,
          provider: 'ollama' as const,
          model: m,
        })),
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

    // Fallback when the user picked only `custom` or no models — emit a
    // working skeleton with the default suggestion so the config opens
    // cleanly in the extension.
    if (continueConfig.models.length === 0) {
      continueConfig.models = [
        { title: defaultModel, provider: 'ollama' as const, model: defaultModel },
      ];
    }

    return [
      {
        relativePath: '.continue/config.json',
        content: JSON.stringify(continueConfig, null, 2) + '\n',
        description: 'Continue.dev configuration (.continue/config.json)',
      },
    ];
  }
}

/** Exposed for tests. */
export function shouldEmitContinueDev(profile: UserProfile): boolean {
  return (
    profile.localAiEnabled === true &&
    Array.isArray(profile.ideIntegrations) &&
    profile.ideIntegrations.includes('continue-dev')
  );
}
