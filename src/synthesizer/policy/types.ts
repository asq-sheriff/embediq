/**
 * Routing policy — the Policy Decision Point (PDP).
 *
 * One versioned, deterministic object that answers a single question the rest
 * of the AI stack does not: *which destinations is a given data class legally
 * eligible to reach?* It is a constraint, evaluated BEFORE any cost/quality
 * optimization — not a score. Enforcement points (the router, the LLM gateway,
 * the ignore file) are compiled from this one artifact so they cannot drift.
 *
 * Pure data. No I/O. No provider SDKs. No LiteLLM/Ollama concepts — those live
 * only in the per-target compilers that render this policy.
 */

/** Where a request may physically run. */
export type Locality = 'local' | 'external';

/**
 * The three destination categories the eligibility lattice reasons over.
 * `external-covered` = an external provider under a BAA/DPA for the frameworks
 * the data class requires; `external-uncovered` = an external provider without.
 */
export type AllowTarget = 'local' | 'external-covered' | 'external-uncovered';

/**
 * Data classification of a prompt. The neutral core classes are well-known;
 * domain packs contribute the regulated ones (`phi`, `pci`, …) so the core
 * carries no industry content. The `(string & {})` keeps autocomplete for the
 * known values while allowing any pack-supplied class.
 */
export type DataClass = 'public' | 'internal' | 'restricted' | 'unknown' | (string & {});

/** Covered-path minimum-necessary redaction mode. Off by default. */
export type MinimizeMode = 'off' | 'safe-classes' | 'all';

/**
 * A place a request may be sent. `covered` is the field that exists nowhere
 * else in the ecosystem: the frameworks this destination is *contractually*
 * covered for. It is customer-attested (from a BAA), never inferred.
 */
export interface Destination {
  /** Stable id: '<provider>:<model>' — e.g. 'ollama:llama3.1:8b'. */
  id: string;
  locality: Locality;
  provider: string;
  /** Frameworks this destination is contractually covered for. Empty = uncovered. */
  covered: string[];
  /** True when the provider may train on submitted content (consumer tiers). */
  retainsData: boolean;
  contextWindow: number;
  /** USD per 1M input tokens. Advisory only — NEVER a gating input. */
  costPer1MInput?: number;
}

/**
 * A single deny-unless-listed eligibility rule for one data class.
 *
 * `allow` expresses POLICY (which categories are permissible); the destination
 * catalog expresses REALITY (which covered destinations actually exist). The
 * eligible set is their intersection — so an org with no BAA (no covered
 * destination) is air-gapped for regulated classes *by construction*, without
 * the rule having to know about it.
 */
export interface EligibilityRule {
  dataClass: DataClass;
  /**
   * Permitted destination categories. `['local']` = never leaves the host.
   * `[]` = nothing eligible → the dispatcher must refuse (fail-closed).
   */
  allow: AllowTarget[];
  /**
   * Frameworks a destination must be `covered` for to count as
   * `external-covered` for this class (e.g. `['hipaa']` for `phi`). Empty /
   * undefined → any external destination with a non-empty `covered` qualifies.
   */
  requiresCoverage?: string[];
  /**
   * Whether a successful redaction pass may widen the allow-set to reach an
   * *uncovered* destination. This is ALWAYS `false` and must stay so: regex
   * redaction is not HIPAA de-identification, so redacted PHI is still PHI and
   * still requires a BAA. Retained as an explicit, non-configurable invariant
   * so the legally-unsound "redact-and-promote" path cannot be reintroduced.
   */
  redactionCanPromote: false;
  /**
   * Minimum-necessary redaction on the COVERED path only. Optional hygiene,
   * never a compliance gate (the BAA is the gate). Default `off` — turning it
   * on trades model capability against data minimization, and is the customer's
   * attributed choice, not EmbedIQ's silent default.
   */
  minimizeOnEgress: MinimizeMode;
}

/**
 * A domain pack's contribution to the eligibility lattice: the regulated-class
 * rules it adds and when they activate — its `framework` is explicitly selected,
 * or the profile's `industry` is one that implies that framework. This is what
 * lets a vertical ship its egress policy as pack *data* (not a core edit): the
 * lattice core stays industry-neutral and composes these in.
 */
export interface EligibilityContribution {
  /** The compliance framework these rules belong to (e.g. 'hipaa', 'pci'). */
  framework: string;
  /** Industries that imply this framework even when it isn't explicitly selected. */
  industries?: readonly string[];
  rules: readonly EligibilityRule[];
}

/** Routing strategy. Ship `cascade`; the other three are reserved behind the interface. */
export type StrategyId = 'heuristic' | 'cascade' | 'learned' | 'ensemble';

/**
 * The compiled policy artifact. Serialized to `routing-policy.yaml`, diffed,
 * and drift-scanned. `version` anchors drift detection.
 */
export interface RoutingPolicy {
  version: string;
  strategy: StrategyId;
  destinations: Destination[];
  eligibility: EligibilityRule[];
  /** cascade only — self-eval score below which the router escalates. */
  confidenceThreshold?: number;
  /** cascade only — token count above which the router escalates regardless of confidence. */
  tokenBudgetOverflow?: number;
  /** 'learned' only — pins the classifier checkpoint so decisions stay reproducible. */
  classifierChecksum?: string;
  /**
   * Literal type, not a union. Fail-closed is not configurable in v1. This is
   * deliberate — do not "make it flexible."
   */
  failMode: 'closed';
}

export const POLICY_SCHEMA_VERSION = '1.0.0';
