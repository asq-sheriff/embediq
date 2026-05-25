/**
 * Minimal OSCAL types — just the subset of the catalog model that
 * `loader.ts` needs to consume. The full OSCAL schema is large and
 * versioned; we hand-roll the fields we actually read so EmbedIQ stays
 * dep-free for governance imports.
 *
 * Reference: NIST OSCAL Catalog Model
 * https://pages.nist.gov/OSCAL-Reference/models/v1.1.2/catalog/json-outline/
 *
 * Versions covered: OSCAL 1.0.x / 1.1.x catalogs. Field names use the
 * OSCAL convention (kebab-case in JSON) preserved verbatim in the
 * TypeScript shapes so JSON.parse output matches without remapping.
 */

export interface OscalCatalogDocument {
  catalog: OscalCatalog;
}

export interface OscalCatalog {
  uuid: string;
  metadata: OscalMetadata;
  params?: readonly OscalParameter[];
  controls?: readonly OscalControl[];
  groups?: readonly OscalGroup[];
  'back-matter'?: OscalBackMatter;
}

export interface OscalMetadata {
  title: string;
  /** ISO datetime when this catalog was last modified. */
  'last-modified': string;
  /** Version of the source standard (e.g. "Rev 5", "1.1"). */
  version: string;
  /** OSCAL schema version this document conforms to. */
  'oscal-version': string;
  props?: readonly OscalProp[];
  links?: readonly OscalLink[];
}

export interface OscalGroup {
  /** Optional in OSCAL — top-level families typically have an id ("ac", "au", …). */
  id?: string;
  class?: string;
  title: string;
  params?: readonly OscalParameter[];
  props?: readonly OscalProp[];
  parts?: readonly OscalPart[];
  groups?: readonly OscalGroup[];
  controls?: readonly OscalControl[];
}

export interface OscalControl {
  id: string;
  class?: string;
  title: string;
  params?: readonly OscalParameter[];
  props?: readonly OscalProp[];
  links?: readonly OscalLink[];
  parts?: readonly OscalPart[];
  /** Control enhancements (e.g. ac-1.1 inside ac-1). */
  controls?: readonly OscalControl[];
}

export interface OscalParameter {
  id: string;
  class?: string;
  label?: string;
  values?: readonly string[];
  select?: { 'how-many'?: 'one' | 'one-or-more'; choice?: readonly string[] };
}

export interface OscalProp {
  name: string;
  ns?: string;
  value: string;
  class?: string;
  remarks?: string;
}

export interface OscalLink {
  href: string;
  rel?: string;
  'media-type'?: string;
  text?: string;
}

export interface OscalPart {
  id?: string;
  name: string;
  ns?: string;
  class?: string;
  title?: string;
  prose?: string;
  parts?: readonly OscalPart[];
  props?: readonly OscalProp[];
  links?: readonly OscalLink[];
}

export interface OscalBackMatter {
  resources?: readonly OscalResource[];
}

export interface OscalResource {
  uuid: string;
  title?: string;
  description?: string;
  citation?: { text: string };
  rlinks?: readonly OscalLink[];
}

// ─── Profile model ─────────────────────────────────────────────────────────
// Profiles tailor a catalog into a baseline (FedRAMP Low / Moderate / High,
// agency-specific overlays, etc.) by selecting a subset of controls and
// optionally setting parameter values. We model the subset of fields the
// resolver actually consumes.

export interface OscalProfileDocument {
  profile: OscalProfile;
}

export interface OscalProfile {
  uuid: string;
  metadata: OscalMetadata;
  imports: readonly OscalProfileImport[];
  merge?: OscalProfileMerge;
  modify?: OscalProfileModify;
  'back-matter'?: OscalBackMatter;
}

export interface OscalProfileImport {
  /**
   * Reference to the imported catalog. Two shapes:
   *   "#<uuid>"   — points to a back-matter resource of the profile;
   *                 follow that resource's `rlinks` for the actual file.
   *   "<url|path>" — direct reference to the catalog.
   *
   * The resolver maps both shapes onto a caller-supplied
   * `catalogPaths` map (keyed by either the bare UUID or the raw href).
   */
  href: string;
  'include-all'?: Record<string, unknown> | OscalControlSelection;
  'include-controls'?: readonly OscalControlSelection[];
  'exclude-controls'?: readonly OscalControlSelection[];
}

export interface OscalControlSelection {
  /** Explicit list of control IDs to include or exclude. */
  'with-ids'?: readonly string[];
  /**
   * When `yes`, control enhancements of the listed controls are also
   * pulled in. When `no` or unset, only the explicit IDs match.
   */
  'with-child-controls'?: 'yes' | 'no';
  matching?: readonly { pattern: string }[];
}

export interface OscalProfileMerge {
  combine?: { method?: 'use-first' | 'merge' | 'keep' };
  'as-is'?: boolean;
  flat?: Record<string, unknown>;
  custom?: Record<string, unknown>;
}

export interface OscalProfileModify {
  'set-parameters'?: readonly OscalProfileParameterSetting[];
  alters?: readonly Record<string, unknown>[];
}

export interface OscalProfileParameterSetting {
  'param-id': string;
  values?: readonly string[];
  select?: OscalParameter['select'];
}

/**
 * Resolved view of a profile's selected controls. Produced by the
 * profile resolver after applying include/exclude semantics to one or
 * more imported catalogs.
 */
export interface ResolvedOscalProfile {
  profileUuid: string;
  profileTitle: string;
  /** Distinct control IDs the profile selects, across all imports. */
  selectedControlIds: readonly string[];
  /** Per-import breakdown — useful for diagnostics + per-catalog stats. */
  imports: readonly ResolvedOscalProfileImport[];
}

export interface ResolvedOscalProfileImport {
  /** The raw href from the profile (`#<uuid>` or a literal href). */
  href: string;
  /** Local path the operator pointed the resolver at via `catalogPaths`. */
  catalogPath: string;
  /** Control IDs the operator's catalog contributed under this import's selection rules. */
  selectedControlIds: readonly string[];
  /** Control IDs from the include lists that were NOT found in this catalog. */
  missingControlIds: readonly string[];
}

/** Flattened view of a control with its OSCAL family context. */
export interface FlattenedOscalControl {
  /** Catalog-unique control id (e.g. "ac-1", "ac-1.1"). */
  id: string;
  /** Human-readable title. */
  title: string;
  /** Top-level family id (e.g. "ac"). Undefined for top-level controls outside any group. */
  familyId?: string;
  /** Family title (e.g. "Access Control"). Undefined when not in a group. */
  familyTitle?: string;
  /** Withdrawn flag — OSCAL marks via props[name=status, value=withdrawn]. */
  withdrawn: boolean;
  /** Parent control id when this is a control enhancement; undefined for top-level. */
  parentId?: string;
}
