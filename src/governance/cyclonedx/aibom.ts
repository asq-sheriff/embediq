import { randomUUID } from 'node:crypto';
import type { ComplianceFrameworkDef } from '../../domain-packs/index.js';
import type { GeneratedFile, UserProfile } from '../../types/index.js';
import {
  CYCLONEDX_SPEC_VERSION,
  type CycloneDxComponent,
  type CycloneDxDocument,
  type CycloneDxModelCard,
} from './types.js';

/**
 * Catalog of hosted LLM providers EmbedIQ can route to. Used to map
 * `profile.externalApis` entries to component metadata (purl, supplier,
 * architecture). Operators add to this list when they extend the
 * router to new providers — but the existing list covers what the
 * wizard surfaces today.
 */
const HOSTED_PROVIDERS: Record<string, {
  displayName: string;
  supplier: string;
  supplierUrl: string;
  architecture: string;
  purl: string;
}> = {
  anthropic: {
    displayName: 'Claude (Anthropic API)',
    supplier: 'Anthropic',
    supplierUrl: 'https://www.anthropic.com',
    architecture: 'Claude family transformer',
    purl: 'pkg:generic/anthropic/claude',
  },
  openai: {
    displayName: 'OpenAI GPT (OpenAI API)',
    supplier: 'OpenAI',
    supplierUrl: 'https://openai.com',
    architecture: 'GPT-family transformer',
    purl: 'pkg:generic/openai/gpt',
  },
};

/**
 * IDE-resident agents the harness wires up. Maps wizard answers
 * (`profile.ideIntegrations`) onto CycloneDX library components.
 */
const IDE_AGENTS: Record<string, { displayName: string; purl: string; description: string }> = {
  'continue-dev': {
    displayName: 'Continue.dev',
    purl: 'pkg:generic/continuedev/continue',
    description: 'IDE-resident AI coding assistant — routes to local + hosted models per workspace config.',
  },
  aider: {
    displayName: 'Aider',
    purl: 'pkg:generic/paul-gauthier/aider',
    description: 'CLI-based AI pair programmer; configurable main + weak model split.',
  },
  'zed-ai': {
    displayName: 'Zed AI',
    purl: 'pkg:generic/zed-industries/zed-ai',
    description: 'Zed editor\'s built-in assistant; provider-pluggable.',
  },
};

export interface BuildAibomInput {
  profile: Pick<
    UserProfile,
    | 'industry'
    | 'role'
    | 'complianceFrameworks'
    | 'localAiEnabled'
    | 'ollamaModels'
    | 'defaultLocalModel'
    | 'ideIntegrations'
    | 'routerEnabled'
    | 'externalApis'
    | 'confidenceEscalation'
  >;
  frameworks: readonly ComplianceFrameworkDef[];
  generatedFiles: readonly GeneratedFile[];
  embediqVersion: string;
  uuid?: () => string;
  now?: () => string;
}

/**
 * Pure builder: turns the resolved profile into a valid CycloneDX 1.6
 * ML-BOM. Components are emitted in stable order so re-running the
 * same profile produces a byte-identical document modulo timestamps
 * + serial-number (both injectable for deterministic tests):
 *
 *   1. The harness itself (BOM subject in metadata.component).
 *   2. The local-router service (when routerEnabled).
 *   3. Each Ollama model in profile.ollamaModels (machine-learning-model).
 *   4. Each hosted API in profile.externalApis (machine-learning-model).
 *   5. Each IDE agent in profile.ideIntegrations (library).
 *
 * `dependencies[]` records that the harness depends on every other
 * component, giving the BOM a navigable structure for tools that
 * walk the dependency graph (Dependency-Track, OSV-Scanner, etc.).
 */
export function buildAibom(input: BuildAibomInput): CycloneDxDocument {
  const uuid = input.uuid ?? (() => randomUUID());
  const now = input.now ?? (() => new Date().toISOString());
  const timestamp = now();

  // The BOM subject — the EmbedIQ-generated harness.
  const harnessRef = 'embediq:harness';
  const harnessComponent: CycloneDxComponent = {
    'bom-ref': harnessRef,
    type: 'application',
    name: `EmbedIQ-generated AI coding agent harness (${input.profile.industry}/${input.profile.role})`,
    version: input.embediqVersion,
    description:
      'Configuration-only harness produced by EmbedIQ. Declarative '
      + 'compliance enforcement (path-scoped rules, pre-tool DLP hooks, '
      + 'ignore patterns, permission-tier gating). The harness does not '
      + 'bundle the LLMs it invokes — those are separate `machine-learning-model` '
      + 'components in this BOM.',
    supplier: { name: 'Praglogic', url: ['https://pragmaticlogic.ai'] },
    publisher: 'Praglogic',
    properties: [
      { name: 'producer', value: 'EmbedIQ' },
      { name: 'producer-version', value: input.embediqVersion },
      { name: 'profile-industry', value: input.profile.industry },
      { name: 'profile-role', value: input.profile.role },
      { name: 'artifact-count', value: String(input.generatedFiles.length) },
      ...input.frameworks.map((f) => ({
        name: 'compliance-framework',
        value: `${f.key}:${f.label}`,
      })),
    ],
  };

  const components: CycloneDxComponent[] = [];

  // Local router as a service (when enabled).
  if (input.profile.routerEnabled) {
    components.push({
      'bom-ref': 'embediq:local-router',
      type: 'service',
      name: 'EmbedIQ local router',
      version: input.embediqVersion,
      description:
        'Express dispatch service generated by EmbedIQ (v3.3). '
        + 'Routes inbound prompts to local Ollama models by default, '
        + 'escalates to hosted LLMs after optional PHI redaction. '
        + (input.profile.confidenceEscalation
          ? 'Confidence-based escalation enabled — the router self-evaluates and escalates below a threshold.'
          : 'Confidence-based escalation disabled — routing is deterministic by token-count classification.'),
      supplier: { name: 'Praglogic', url: ['https://pragmaticlogic.ai'] },
    });
  }

  // Ollama models — each one is a separate machine-learning-model component.
  for (const modelId of input.profile.ollamaModels ?? []) {
    components.push(makeOllamaComponent(modelId, input.profile.defaultLocalModel === modelId, input.frameworks));
  }

  // Hosted-API providers — each is a machine-learning-model component
  // representing the family of models the operator may invoke through
  // the API. Specific model versions aren't pinned in the wizard so the
  // BOM records the provider-level identity.
  for (const apiId of input.profile.externalApis ?? []) {
    const provider = HOSTED_PROVIDERS[apiId];
    if (!provider) {
      // Unknown provider — still record it generically so the BOM is
      // complete from the operator's perspective; downstream tools can
      // tag the entry for manual review.
      components.push({
        'bom-ref': `embediq:hosted:${apiId}`,
        type: 'machine-learning-model',
        name: apiId,
        description: `Hosted LLM provider (unknown to EmbedIQ's component catalog) — manual review required.`,
        properties: [{ name: 'embediq:hosted-provider-id', value: apiId }],
      });
      continue;
    }
    components.push({
      'bom-ref': `embediq:hosted:${apiId}`,
      type: 'machine-learning-model',
      name: provider.displayName,
      description:
        `Hosted LLM provider used by the EmbedIQ-generated harness. `
        + `Specific model versions are pinned at invocation time, not in the BOM.`,
      purl: provider.purl,
      supplier: { name: provider.supplier, url: [provider.supplierUrl] },
      modelCard: {
        modelParameters: {
          approach: { type: 'supervised' },
          task: 'code-generation',
          architectureFamily: 'transformer',
          modelArchitecture: provider.architecture,
        },
        considerations: {
          useCases: ['AI-assisted code generation through the EmbedIQ harness.'],
          regulatoryReporting: input.frameworks.length > 0
            ? input.frameworks.map((f) => ({ regulationType: f.label, regulator: 'See framework definition' }))
            : undefined,
        },
      },
    });
  }

  // IDE-resident agents — libraries the harness wires configuration into.
  for (const ideId of input.profile.ideIntegrations ?? []) {
    const ide = IDE_AGENTS[ideId];
    if (!ide) continue;
    components.push({
      'bom-ref': `embediq:ide:${ideId}`,
      type: 'library',
      name: ide.displayName,
      description: ide.description,
      purl: ide.purl,
    });
  }

  // Dependency graph — the harness depends on every other component.
  // Tools like Dependency-Track use this to walk the BOM tree.
  const dependencies = components.length > 0
    ? [{ ref: harnessRef, dependsOn: components.map((c) => c['bom-ref']) }]
    : [];

  return {
    bomFormat: 'CycloneDX',
    specVersion: CYCLONEDX_SPEC_VERSION,
    serialNumber: `urn:uuid:${uuid()}`,
    version: 1,
    metadata: {
      timestamp,
      tools: [
        { vendor: 'Praglogic', name: 'EmbedIQ', version: input.embediqVersion },
      ],
      component: harnessComponent,
    },
    // The harness appears in `metadata.component` as the BOM subject.
    // Per CycloneDX convention the subject is NOT duplicated into the
    // components[] list — that array describes what the subject is
    // made of, not the subject itself.
    components,
    dependencies,
  };
}

function makeOllamaComponent(
  modelId: string,
  isDefault: boolean,
  frameworks: readonly ComplianceFrameworkDef[],
): CycloneDxComponent {
  const modelCard: CycloneDxModelCard = {
    modelParameters: {
      approach: { type: 'supervised' },
      task: 'code-generation',
      architectureFamily: 'transformer',
      modelArchitecture: modelId,
    },
    considerations: {
      useCases: ['Local-only AI-assisted code generation via Ollama.'],
      regulatoryReporting: frameworks.length > 0
        ? frameworks.map((f) => ({ regulationType: f.label, regulator: 'See framework definition' }))
        : undefined,
      // Local Ollama models are a real privacy advantage for regulated
      // workforces — flag it explicitly so downstream evaluators don't
      // miss the difference vs hosted-API entries.
      technicalLimitations: [
        'Runs locally on operator-provided hardware (Ollama). Output quality and latency depend on local GPU/CPU resources. Capabilities lag hosted frontier models on complex multi-step reasoning.',
      ],
    },
  };
  return {
    'bom-ref': `embediq:ollama:${modelId}`,
    type: 'machine-learning-model',
    name: modelId,
    description:
      `Ollama-hosted local model. ${isDefault ? 'Default model for autocomplete + chat in the generated harness.' : 'Available to the harness for explicit invocation.'}`,
    purl: `pkg:ollama/${modelId}`,
    supplier: { name: 'Ollama (locally hosted)', url: ['https://ollama.com'] },
    modelCard,
    properties: isDefault ? [{ name: 'embediq:default-local-model', value: 'true' }] : undefined,
  };
}

export function serializeAibom(doc: CycloneDxDocument): string {
  return JSON.stringify(doc, null, 2) + '\n';
}
