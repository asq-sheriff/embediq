import type { RoutingPolicy } from '../../synthesizer/policy/types.js';

/**
 * Unified audit / evidence bundle — the "govern" layer of enforce → prove →
 * govern. A single policy-versioned index an auditor receives: it does not
 * itself enforce or verify anything, it *composes* the evidence the run already
 * produced (routing policy, gateway config, egress guardrail, OSCAL, AIBOM,
 * provenance, DLP hook) into one deliverable, records a content hash for each,
 * summarizes the egress posture from the routing policy, and lists the runnable
 * controls an auditor can execute to re-verify the claims.
 */

/** One artifact the bundle indexes. `present: false` records an expected-but-absent output. */
export interface BundleArtifact {
  /** Stable kind so a consumer can find "the routing policy" without path-matching. */
  kind:
    | 'routing-policy'
    | 'litellm-gateway'
    | 'egress-guardrail'
    | 'dlp-hook'
    | 'oscal-component'
    | 'oscal-ssp-fragment'
    | 'cyclonedx-aibom'
    | 'provenance';
  /** What this artifact is, in one line, for the human-readable README. */
  label: string;
  /** Repo-relative path of the emitted file. */
  path: string;
  present: boolean;
  /** sha256 of the file content, hex. Present only when `present`. */
  sha256?: string;
}

/** A control an auditor can run to re-verify a claim the bundle makes. */
export interface BundleControl {
  id: 'egress-eligibility' | 'drift' | 'dlp-hook';
  /** Preventive (blocks at generation/runtime) vs detective (catches after the fact). */
  type: 'preventive' | 'detective' | 'preventive+detective';
  /** The claim this control substantiates. */
  proves: string;
  /** A command the auditor runs to check it. */
  verify: string;
}

/** Egress posture distilled from the routing policy — the compliance headline. */
export interface EgressPosture {
  /**
   * True when no external destination is reachable for any regulated class —
   * the air-gapped configuration (route absence beats a filter). Derived from
   * the policy: a regulated class with no covered destination in the catalog.
   */
  airgapped: boolean;
  /** Regulated data classes the policy governs (e.g. phi, pci). */
  regulatedClasses: string[];
  /** Frameworks that have at least one BAA/DPA-covered destination attested. */
  coveredFrameworks: string[];
  /** Per-destination summary — id, locality, provider, and the frameworks it is covered for. */
  destinations: Array<{ id: string; locality: string; provider: string; covered: string[] }>;
}

export interface AuditBundleManifest {
  bundleVersion: 1;
  producer: 'EmbedIQ';
  producerVersion: string;
  generatedAt: string;
  profile: {
    industry: string;
    role: string;
    complianceFrameworks: string[];
  };
  policy: {
    version: string;
    strategy: string;
    failMode: string;
    egressPosture: EgressPosture;
  };
  artifacts: BundleArtifact[];
  controls: BundleControl[];
}

export interface BuildAuditBundleInput {
  profile: {
    industry: string;
    role: string;
    complianceFrameworks: readonly string[];
    routerEnabled?: boolean;
  };
  policy?: RoutingPolicy;
  /** Every file emitted in this run — scanned for the known evidence artifacts. */
  generatedFiles: ReadonlyArray<{ relativePath: string; content: string }>;
  producerVersion: string;
  /** Injectable for deterministic tests. */
  now?: () => string;
  sha256?: (content: string) => string;
}
