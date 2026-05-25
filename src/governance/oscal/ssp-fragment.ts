import { randomUUID } from 'node:crypto';
import type { ComplianceFrameworkDef } from '../../domain-packs/index.js';
import type { GeneratedFile, UserProfile } from '../../types/index.js';
import type { OscalProp } from './component-definition.js';

/**
 * OSCAL System Security Plan (SSP) **fragment** — what EmbedIQ can
 * legitimately claim about a generated harness without speaking for
 * the operator's surrounding system.
 *
 * EmbedIQ deliberately does NOT produce a full SSP. A full SSP needs
 * organization-specific data the operator owns: authorization
 * boundary, leveraged authorizations, system-owner identity,
 * inventory items, network architecture, data-flow diagrams,
 * authorization status. We produce the parts that follow
 * deterministically from the harness — control-implementation
 * statements, the harness component, the profile reference — and
 * stamp the document with `props[name=document-completion-status,
 * value=fragment]` so operators know to merge with their own SSP.
 *
 * Reference: NIST OSCAL System Security Plan Model
 * https://pages.nist.gov/OSCAL-Reference/models/v1.1.2/system-security-plan/json-outline/
 */

const OSCAL_VERSION = '1.1.2';
/** SP 800-60 Vol 1 / FIPS 199 categorization values. */
type SensitivityLevel = 'fips-199-low' | 'fips-199-moderate' | 'fips-199-high';

export interface OscalSspDocument {
  'system-security-plan': OscalSystemSecurityPlan;
}

export interface OscalSystemSecurityPlan {
  uuid: string;
  metadata: SspMetadata;
  'import-profile': OscalImportProfile;
  'system-characteristics': OscalSystemCharacteristics;
  'system-implementation': OscalSystemImplementation;
  'control-implementation': OscalControlImplementationBlock;
}

export interface SspMetadata {
  title: string;
  'last-modified': string;
  version: string;
  'oscal-version': string;
  remarks?: string;
  props?: readonly OscalProp[];
}

export interface OscalImportProfile {
  /**
   * Reference to the OSCAL profile this SSP fragment claims compliance
   * against. May be a relative path, an absolute path, a URL, or a
   * `#<uuid>` back-matter reference if the operator embeds the
   * profile alongside the SSP. EmbedIQ records the operator-supplied
   * value verbatim — we don't fetch or validate it.
   */
  href: string;
}

export interface OscalSystemCharacteristics {
  'system-ids': readonly { id: string; 'identifier-type'?: string }[];
  'system-name': string;
  description: string;
  'security-sensitivity-level': SensitivityLevel;
  'system-information': {
    'information-types': readonly OscalInformationType[];
  };
  'security-impact-level': {
    'security-objective-confidentiality': string;
    'security-objective-integrity': string;
    'security-objective-availability': string;
  };
  status: { state: 'under-development' | 'operational' | 'disposition' | 'other'; remarks?: string };
  'authorization-boundary': { description: string };
  props?: readonly OscalProp[];
}

export interface OscalInformationType {
  uuid: string;
  title: string;
  description: string;
  'confidentiality-impact'?: { base: string };
  'integrity-impact'?: { base: string };
  'availability-impact'?: { base: string };
}

export interface OscalSystemImplementation {
  users: readonly { uuid: string; title?: string; description?: string }[];
  components: readonly OscalSystemComponent[];
}

export interface OscalSystemComponent {
  uuid: string;
  type: 'software' | 'service' | 'this-system';
  title: string;
  description: string;
  status: { state: 'operational' | 'under-development' | 'disposition' | 'other' };
  props?: readonly OscalProp[];
}

export interface OscalControlImplementationBlock {
  description: string;
  'implemented-requirements': readonly OscalSspImplementedRequirement[];
}

export interface OscalSspImplementedRequirement {
  uuid: string;
  'control-id': string;
  statements?: readonly OscalSspStatement[];
  'by-components'?: readonly OscalSspByComponent[];
  props?: readonly OscalProp[];
}

export interface OscalSspStatement {
  'statement-id': string;
  uuid: string;
  description?: string;
  'by-components'?: readonly OscalSspByComponent[];
}

export interface OscalSspByComponent {
  'component-uuid': string;
  uuid: string;
  description: string;
  'implementation-status'?: { state: 'implemented' | 'partial' | 'planned' | 'alternative' | 'not-applicable'; remarks?: string };
}

export interface BuildSspFragmentInput {
  profile: Pick<UserProfile, 'industry' | 'role' | 'complianceFrameworks'>;
  frameworks: readonly ComplianceFrameworkDef[];
  generatedFiles: readonly GeneratedFile[];
  embediqVersion: string;
  /**
   * Operator-supplied. Reference to the OSCAL profile this fragment
   * claims compliance against. Stamped verbatim into `import-profile.href`.
   * When omitted, defaults to a placeholder string that operators must
   * replace before submitting the SSP to an audit pipeline.
   */
  profileHref?: string;
  /**
   * Operator-supplied. The system's stable name as it appears in
   * authorization paperwork. Defaults to a stub the operator must
   * replace.
   */
  systemName?: string;
  /**
   * Operator-supplied FIPS 199 categorization. Defaults to
   * `fips-199-moderate` — sensible for most production deployments
   * but operators should set this explicitly when known.
   */
  sensitivityLevel?: SensitivityLevel;
  /** Injectable for deterministic tests. */
  uuid?: () => string;
  /** Injectable for deterministic tests. */
  now?: () => string;
}

/**
 * Pure builder for an OSCAL SSP fragment. No I/O. Produces a document
 * conforming to the OSCAL 1.1.2 SSP schema (with placeholder stub
 * content for fields the operator must fill in before the SSP is
 * audit-ready).
 */
export function buildSspFragment(input: BuildSspFragmentInput): OscalSspDocument {
  const uuid = input.uuid ?? (() => randomUUID());
  const now = input.now ?? (() => new Date().toISOString());
  const timestamp = now();

  const componentUuid = uuid();
  const harnessComponent: OscalSystemComponent = {
    uuid: componentUuid,
    type: 'software',
    title: `EmbedIQ-generated AI coding agent harness (${input.profile.industry}/${input.profile.role})`,
    description:
      'Auto-generated by EmbedIQ during config synthesis. Implements '
      + 'declarative compliance enforcement via path-scoped rules, '
      + 'pre-tool DLP hooks, ignore patterns, and permission-tier '
      + 'gating across the listed frameworks. Byte-identical when the '
      + 'same profile re-runs.',
    status: { state: 'operational' },
    props: [
      { name: 'producer', value: 'EmbedIQ', class: 'embediq.tool' },
      { name: 'producer-version', value: input.embediqVersion, class: 'embediq.tool' },
      { name: 'artifact-count', value: String(input.generatedFiles.length), class: 'embediq.tool' },
      ...input.generatedFiles.map((f) => ({
        name: 'generated-artifact',
        value: f.relativePath,
        class: 'embediq.relativePath',
      })),
    ],
  };

  // One implemented-requirement per framework. Per-control breakdown
  // is reserved for a follow-up iteration (same scope decision as the component-definition —
  // the framework-level claim is enough for first-cut audit ingestion).
  const implementedRequirements: OscalSspImplementedRequirement[] = input.frameworks.map((f) => ({
    uuid: uuid(),
    'control-id': frameworkKeyToControlId(f.key),
    props: [
      { name: 'framework-key', value: f.key, class: 'embediq.framework' },
      { name: 'framework-label', value: f.label, class: 'embediq.framework' },
      { name: 'claim-scope', value: 'framework-level', class: 'embediq.ssp' },
    ],
    'by-components': [
      {
        'component-uuid': componentUuid,
        uuid: uuid(),
        description:
          `The EmbedIQ-generated harness implements the controls of ${f.label} `
          + 'via the artifact manifest declared on the component. Per-control '
          + 'mapping is reserved for a future iteration; this fragment makes '
          + 'a framework-level claim that the operator can refine.',
        'implementation-status': { state: 'partial', remarks: 'Framework-level claim only.' },
      },
    ],
  }));

  const systemName = input.systemName ?? '<<REPLACE: authoritative system name from your authorization paperwork>>';
  const profileHref = input.profileHref ?? '<<REPLACE: relative path or URL to the OSCAL profile this SSP claims compliance against>>';
  const sensitivity: SensitivityLevel = input.sensitivityLevel ?? 'fips-199-moderate';

  const ssp: OscalSystemSecurityPlan = {
    uuid: uuid(),
    metadata: {
      title: `EmbedIQ SSP Fragment — ${systemName}`,
      'last-modified': timestamp,
      version: input.embediqVersion,
      'oscal-version': OSCAL_VERSION,
      remarks:
        'Fragment only — EmbedIQ generates the control-implementation + '
        + 'harness-component sections that follow deterministically from '
        + 'the synthesized harness. Operators must merge this with their '
        + 'own SSP content (authorization boundary, leveraged authorizations, '
        + 'system-owner identity, inventory, network architecture, data-flow '
        + 'diagrams, authorization status) before submitting to an audit pipeline.',
      props: [
        { name: 'document-completion-status', value: 'fragment', class: 'embediq.ssp' },
        { name: 'producer', value: 'EmbedIQ', class: 'embediq.tool' },
        { name: 'producer-version', value: input.embediqVersion, class: 'embediq.tool' },
      ],
    },
    'import-profile': { href: profileHref },
    'system-characteristics': {
      'system-ids': [
        { id: '<<REPLACE: stable system identifier from your authorization paperwork>>' },
      ],
      'system-name': systemName,
      description:
        `Industry: ${input.profile.industry}. Role profile: ${input.profile.role}. `
        + 'AI coding agent harness for the workforce, governed by the listed '
        + 'compliance frameworks. The harness itself is byte-identical when '
        + 'the same wizard answers re-run; surrounding system context is the '
        + "operator's responsibility to fill in.",
      'security-sensitivity-level': sensitivity,
      'system-information': {
        'information-types': [
          {
            uuid: uuid(),
            title: 'Source code + agent configuration',
            description:
              'Source code, AI agent rules and hooks, generated configuration '
              + 'artifacts, plus whatever data the harness mediates access to '
              + '(per the active compliance frameworks).',
          },
        ],
      },
      'security-impact-level': impactLevelFromSensitivity(sensitivity),
      status: {
        state: 'under-development',
        remarks: 'EmbedIQ-generated fragment; operator must update before authorization decision.',
      },
      'authorization-boundary': {
        description:
          '<<REPLACE: operator-specific boundary description. The EmbedIQ-generated '
          + 'harness occupies the workforce-tooling portion of the boundary; '
          + 'surrounding application, data, and infrastructure boundaries are out '
          + "of scope for this fragment and must be supplied from the operator's "
          + 'authorization paperwork.>>',
      },
    },
    'system-implementation': {
      users: [
        {
          uuid: uuid(),
          title: '<<REPLACE: authorized workforce population covered by this harness>>',
          description:
            'Operators describe the user population the harness governs: AI-assisted '
            + 'engineering team, BPO operations workforce, compliance reviewers, etc.',
        },
      ],
      components: [harnessComponent],
    },
    'control-implementation': {
      description:
        `Control implementation for ${input.frameworks.length} framework`
        + `${input.frameworks.length === 1 ? '' : 's'}: `
        + input.frameworks.map((f) => f.label).join(', ')
        + '. Each implemented-requirement below is a framework-level claim — the '
        + "harness's artifact manifest stands as evidence, with per-control mapping "
        + 'reserved for a future iteration.',
      'implemented-requirements': implementedRequirements,
    },
  };

  return { 'system-security-plan': ssp };
}

export function serializeSspFragment(doc: OscalSspDocument): string {
  return JSON.stringify(doc, null, 2) + '\n';
}

/**
 * Frameworks become a single synthetic control-id for the fragment-
 * level claim. Real per-control implemented-requirements use the
 * actual catalog control IDs (e.g. `ac-1`, `au-2`) — reserved for a
 * follow-up. Synthetic ids are prefixed with `framework:` so audit
 * tools can distinguish them from real catalog IDs.
 */
function frameworkKeyToControlId(key: string): string {
  return `framework:${key}`;
}

function impactLevelFromSensitivity(s: SensitivityLevel): OscalSystemCharacteristics['security-impact-level'] {
  // FIPS 199 categorization — confidentiality / integrity / availability
  // typically share the same level for a workforce-tooling harness.
  const base = s.replace('fips-199-', '') as 'low' | 'moderate' | 'high';
  return {
    'security-objective-confidentiality': base,
    'security-objective-integrity': base,
    'security-objective-availability': base,
  };
}
