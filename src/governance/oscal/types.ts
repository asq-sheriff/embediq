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
