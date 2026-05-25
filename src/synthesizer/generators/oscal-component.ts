import {
  buildComponentDefinition,
  serializeComponentDefinition,
} from '../../governance/oscal/component-definition.js';
import type { SetupConfig, GeneratedFile } from '../../types/index.js';

/**
 * v4.0 — OSCAL Component Definition emitter.
 *
 * Not a `ConfigGenerator`-style parallel generator: it needs the
 * full manifest of files emitted by the rest of the synthesizer run, so
 * the orchestrator invokes it as a post-pass after `allFiles` is
 * collected. Stays opt-in via `TargetFormat.OSCAL_COMPONENT` — never
 * auto-included, so existing goldens regenerate byte-identically.
 *
 * Output:
 *   `.embediq/oscal/component-definition.json`
 *
 * The document is a valid OSCAL 1.1.2 Component Definition listing
 * every compliance framework on the resolved domain pack as a
 * `control-implementations[]` entry, with the full file manifest in
 * the component's `props` for audit-tool ingestion.
 */
export function generateOscalComponentDefinition(
  config: SetupConfig,
  allFiles: readonly GeneratedFile[],
  embediqVersion: string,
): GeneratedFile {
  const frameworks = config.domainPack?.complianceFrameworks ?? [];

  const doc = buildComponentDefinition({
    profile: {
      industry: config.profile.industry,
      role: config.profile.role,
      complianceFrameworks: config.profile.complianceFrameworks,
    },
    frameworks,
    generatedFiles: allFiles,
    embediqVersion,
  });

  return {
    relativePath: '.embediq/oscal/component-definition.json',
    content: serializeComponentDefinition(doc),
    description: 'OSCAL Component Definition — audit-pipeline ingestion target (Drata / Vanta / FedRAMP)',
  };
}
