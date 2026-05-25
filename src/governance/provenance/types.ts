/**
 * v4.0 / 8E — Provenance Trace types.
 *
 * Provenance answers the auditor question "why is this file in the
 * generated harness?" with a structured per-file explanation that
 * combines:
 *
 *   - **Authoritative generator attribution** — which `ConfigGenerator`
 *     emitted the file (or which post-pass step, for 8B/8C/8D/8E).
 *     Recorded by the orchestrator as files flow through the parallel
 *     batch; not inferred.
 *
 *   - **Heuristic driver inference** — which profile fields, target
 *     selections, or compliance frameworks caused the generator to
 *     emit THIS file. Inferred from the file's relative path because
 *     today's generators don't self-declare drivers. Documented as
 *     heuristic so auditors understand the limitation; per-generator
 *     declaration is reserved for a follow-up iteration.
 *
 * The trace is one document at `.embediq/provenance/manifest.json`
 * (a manifest, not per-file sidecars — easier for tooling and avoids
 * doubling the file count).
 */

export interface ProvenanceTrace {
  /** Schema version of THIS document. Bumped on shape changes. */
  schemaVersion: 1;
  producer: { name: 'EmbedIQ'; version: string };
  generatedAt: string;
  profileSummary: ProvenanceProfileSummary;
  targets: readonly string[];
  files: readonly ProvenanceFileEntry[];
  methodology: ProvenanceMethodology;
}

export interface ProvenanceProfileSummary {
  role: string;
  industry: string;
  businessDomain?: string;
  technicalProficiency?: string;
  complianceFrameworks: readonly string[];
  languages: readonly string[];
  securityConcerns: readonly string[];
  teamSize?: string;
  localAiEnabled?: boolean;
  routerEnabled?: boolean;
}

export interface ProvenanceFileEntry {
  /** Path of the generated file relative to the project root. */
  relativePath: string;
  /** Authoritative — which generator emitted the file. */
  generatorName: string;
  /** Authoritative — which `TargetFormat` value the emitting generator declared. */
  target: string;
  /** From the `GeneratedFile.description` field, if the generator set one. */
  description?: string;
  /** Heuristic — profile fields, targets, frameworks etc. that the file's presence depends on. */
  drivers: readonly ProvenanceDriver[];
  /** Identifier of the heuristic pattern that matched this file's path. `undefined` when no rule matched (e.g. custom domain-pack output). */
  matchedHeuristic?: string;
}

export type ProvenanceDriverType =
  | 'profile-field'
  | 'target'
  | 'compliance-framework'
  | 'security-concern'
  | 'language'
  | 'opt-in-flag'
  | 'industry';

export interface ProvenanceDriver {
  type: ProvenanceDriverType;
  /** UserProfile / SetupConfig field name when applicable (e.g. `languages`, `routerEnabled`). */
  field?: string;
  /** Specific value when the driver is a single value (e.g. `hipaa`, `typescript`). */
  value?: string;
  /** Human-readable explanation specific to this file's context. */
  description?: string;
}

export interface ProvenanceMethodology {
  /** Generator attribution is always authoritative — recorded by the orchestrator. */
  generatorAttribution: 'authoritative';
  /** Driver attribution is heuristic in v4.0 / 8E; per-generator self-declaration is reserved for a follow-up. */
  driverInference: 'heuristic';
  /** Explanatory text included in the document so auditors don't misread the trace. */
  note: string;
}
