import { randomUUID } from 'node:crypto';
import type { ComplianceFrameworkDef } from '../../domain-packs/index.js';
import type { GeneratedFile, UserProfile } from '../../types/index.js';

/**
 * OSCAL Component Definition document — the output side of the OSCAL track. Describes
 * which controls the generated EmbedIQ harness implements, in the format
 * Drata / Vanta / FedRAMP-aware audit pipelines can ingest.
 *
 * Reference: NIST OSCAL Component Definition Model
 * https://pages.nist.gov/OSCAL-Reference/models/v1.1.2/component-definition/json-outline/
 *
 * Minimal types — only the fields the builder emits. Symmetric with the
 * input-side types in `loader.ts` / `profile.ts`, hand-rolled rather than
 * pulled from a heavy dependency (the GSA `oscal` npm package brings a
 * JVM runtime dep; for output we only need to produce well-formed JSON).
 */

const OSCAL_VERSION = '1.1.2';

export interface OscalComponentDefinitionDocument {
  'component-definition': OscalComponentDefinition;
}

export interface OscalComponentDefinition {
  uuid: string;
  metadata: ComponentDefinitionMetadata;
  components: readonly OscalComponent[];
}

export interface ComponentDefinitionMetadata {
  title: string;
  'last-modified': string;
  version: string;
  'oscal-version': string;
  remarks?: string;
  props?: readonly OscalProp[];
}

export interface OscalComponent {
  uuid: string;
  /**
   * OSCAL spec allows: software | service | policy | physical |
   * process-procedure | guidance | standard | system | interconnection
   * | network | data | this-system | hardware | validation.
   * EmbedIQ harnesses are always `software`.
   */
  type: 'software';
  title: string;
  description: string;
  purpose?: string;
  props?: readonly OscalProp[];
  'control-implementations': readonly OscalControlImplementation[];
}

export interface OscalControlImplementation {
  uuid: string;
  /** URI identifying the source catalog/profile this implementation references. */
  source: string;
  description: string;
  props?: readonly OscalProp[];
  'implemented-requirements'?: readonly OscalImplementedRequirement[];
}

export interface OscalImplementedRequirement {
  uuid: string;
  'control-id': string;
  description: string;
  props?: readonly OscalProp[];
}

export interface OscalProp {
  name: string;
  ns?: string;
  value: string;
  class?: string;
}

export interface BuildComponentDefinitionInput {
  /** The composed profile that drove this generation. */
  profile: Pick<UserProfile, 'industry' | 'role' | 'complianceFrameworks'>;
  /** Compliance frameworks present on the resolved domain pack. */
  frameworks: readonly ComplianceFrameworkDef[];
  /** Every file the synthesizer emitted in this run (used as evidence pointers). */
  generatedFiles: readonly GeneratedFile[];
  /** EmbedIQ version producing the harness — surfaces as a prop on the component. */
  embediqVersion: string;
  /**
   * Optional UUID generator override — accepts an injectable function for
   * deterministic tests. Defaults to `crypto.randomUUID()`.
   */
  uuid?: () => string;
  /**
   * Optional timestamp override — accepts an ISO-8601 string for
   * deterministic tests. Defaults to `new Date().toISOString()`.
   */
  now?: () => string;
}

/**
 * Pure builder: turns the resolved profile + generated artifacts into a
 * valid OSCAL component-definition document. No I/O — the wrapper
 * generator handles persistence.
 *
 * Scope (MVP):
 *   - One `components[]` entry representing the generated harness.
 *   - One `control-implementations[]` entry per `complianceFrameworks`
 *     entry on the resolved pack.
 *   - `implemented-requirements[]` left empty in the MVP — surfaces the
 *     framework's intent but does not (yet) claim per-control coverage.
 *     A follow-up phase adds the control-to-artifact mapping.
 *   - File-list manifest in the component's `props` so downstream
 *     tools can locate every generated artifact.
 */
export function buildComponentDefinition(
  input: BuildComponentDefinitionInput,
): OscalComponentDefinitionDocument {
  const uuid = input.uuid ?? (() => randomUUID());
  const now = input.now ?? (() => new Date().toISOString());
  const timestamp = now();

  const fileProps: OscalProp[] = input.generatedFiles
    .map((f) => ({
      name: 'generated-artifact',
      value: f.relativePath,
      class: 'embediq.relativePath',
    }));

  const controlImplementations: OscalControlImplementation[] = input.frameworks
    .map((framework) => ({
      uuid: uuid(),
      source: framework.key,
      description:
        `${framework.label} — control implementation provided by the `
        + `EmbedIQ-generated harness. See component-level props for the `
        + `complete artifact manifest.`,
      props: [
        { name: 'framework-key', value: framework.key, class: 'embediq.framework' },
        { name: 'framework-label', value: framework.label, class: 'embediq.framework' },
      ],
      'implemented-requirements': [],
    }));

  const component: OscalComponent = {
    uuid: uuid(),
    type: 'software',
    title: `EmbedIQ-generated AI coding agent harness — ${input.profile.industry}/${input.profile.role}`,
    description:
      `Auto-generated by EmbedIQ during config synthesis. The harness `
      + `enforces the listed compliance frameworks via a combination of `
      + `path-scoped rules, pre-tool DLP hooks, ignore patterns, and `
      + `permission-tier gating. Re-running the same profile produces a `
      + `byte-identical harness; the artifact manifest below names every `
      + `file emitted in this run.`,
    purpose:
      'Provide a deterministic, audit-friendly AI coding agent '
      + 'configuration with declarative compliance enforcement.',
    props: [
      { name: 'producer', value: 'EmbedIQ', class: 'embediq.tool' },
      { name: 'producer-version', value: input.embediqVersion, class: 'embediq.tool' },
      { name: 'profile-industry', value: input.profile.industry, class: 'embediq.profile' },
      { name: 'profile-role', value: input.profile.role, class: 'embediq.profile' },
      { name: 'artifact-count', value: String(input.generatedFiles.length), class: 'embediq.tool' },
      ...fileProps,
    ],
    'control-implementations': controlImplementations,
  };

  return {
    'component-definition': {
      uuid: uuid(),
      metadata: {
        title: `EmbedIQ Component Definition — ${input.profile.industry} ${input.profile.role}`,
        'last-modified': timestamp,
        version: input.embediqVersion,
        'oscal-version': OSCAL_VERSION,
        remarks:
          'Generated by EmbedIQ as part of synthesizing the agent harness. '
          + 'Feed this document into a compliance platform (Drata, Vanta, '
          + 'FedRAMP-style audit pipeline) to register the harness against '
          + 'the listed control families.',
      },
      components: [component],
    },
  };
}

/**
 * Serialize the component definition to a stable, formatted JSON string.
 * Two-space indent matches the convention NIST uses for its published
 * oscal-content samples, so diffs against operator-side OSCAL pipelines
 * stay legible.
 */
export function serializeComponentDefinition(
  doc: OscalComponentDefinitionDocument,
): string {
  return JSON.stringify(doc, null, 2) + '\n';
}
