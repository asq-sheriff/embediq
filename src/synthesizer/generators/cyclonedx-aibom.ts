import { buildAibom, serializeAibom } from '../../governance/cyclonedx/index.js';
import type { GenerationContext, GeneratedFile } from '../../types/index.js';

/**
 * v4.0 — CycloneDX-ML AI Bill of Materials emitter.
 *
 * Post-pass step (not a parallel `ConfigGenerator`) — same pattern as
 * the v4.0 governance outputs. Opt-in via `TargetFormat.CYCLONEDX_AIBOM`; existing goldens
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
  config: GenerationContext,
  allFiles: readonly GeneratedFile[],
  embediqVersion: string,
): GeneratedFile {
  const frameworks = config.domainPack?.complianceFrameworks ?? [];

  // Coverage per external provider, from the routing policy's destination
  // catalog — so each hosted model in the BOM carries its BAA/DPA coverage.
  const coveredByProvider: Record<string, readonly string[]> = {};
  for (const d of config.policy?.destinations ?? []) {
    if (d.locality === 'external') coveredByProvider[d.provider] = d.covered;
  }

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
    coveredByProvider,
  });

  return {
    relativePath: '.embediq/cyclonedx/aibom.json',
    content: serializeAibom(doc),
    description: 'CycloneDX 1.6 ML-BOM — AI bill of materials for the generated harness',
  };
}
