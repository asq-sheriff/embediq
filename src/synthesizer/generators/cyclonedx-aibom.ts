import { buildAibom, serializeAibom } from '../../governance/cyclonedx/index.js';
import type { SetupConfig, GeneratedFile } from '../../types/index.js';

/**
 * v4.0 / 8D — CycloneDX-ML AI Bill of Materials emitter.
 *
 * Post-pass step (not a parallel `ConfigGenerator`) — same pattern as
 * 8B/8C. Opt-in via `TargetFormat.CYCLONEDX_AIBOM`; existing goldens
 * stay byte-identical.
 *
 * Output: `.embediq/cyclonedx/aibom.json`. Conforms to CycloneDX 1.6
 * with ML-BOM extensions. Enumerates every AI model, agent, and
 * service the generated harness invokes:
 *
 *   - Ollama local models (machine-learning-model components)
 *   - Hosted-API providers like Anthropic / OpenAI (machine-learning-model)
 *   - IDE-resident agents (Continue.dev, Aider, Zed AI — library components)
 *   - The local-router service (service component)
 *
 * The harness itself appears as the BOM subject in `metadata.component`.
 */
export function generateCycloneDxAibom(
  config: SetupConfig,
  allFiles: readonly GeneratedFile[],
  embediqVersion: string,
): GeneratedFile {
  const frameworks = config.domainPack?.complianceFrameworks ?? [];

  const doc = buildAibom({
    profile: {
      industry: config.profile.industry,
      role: config.profile.role,
      complianceFrameworks: config.profile.complianceFrameworks,
      localAiEnabled: config.profile.localAiEnabled,
      ollamaModels: config.profile.ollamaModels,
      defaultLocalModel: config.profile.defaultLocalModel,
      ideIntegrations: config.profile.ideIntegrations,
      routerEnabled: config.profile.routerEnabled,
      externalApis: config.profile.externalApis,
      confidenceEscalation: config.profile.confidenceEscalation,
    },
    frameworks,
    generatedFiles: allFiles,
    embediqVersion,
  });

  return {
    relativePath: '.embediq/cyclonedx/aibom.json',
    content: serializeAibom(doc),
    description: 'CycloneDX 1.6 ML-BOM — AI bill of materials for the generated harness',
  };
}
