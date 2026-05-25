import { readFile } from 'node:fs/promises';
import type { ComplianceFrameworkDef } from '../../domain-packs/index.js';
import type {
  FlattenedOscalControl,
  OscalCatalog,
  OscalCatalogDocument,
  OscalControl,
  OscalGroup,
  OscalProp,
} from './types.js';

/**
 * Errors emitted by the OSCAL loader. Callers can distinguish parse
 * failures (malformed JSON, missing required fields) from I/O failures
 * (file not found) by inspecting `cause`.
 */
export class OscalLoadError extends Error {
  constructor(message: string, readonly path: string, readonly cause?: unknown) {
    super(`${message}: ${path}`);
    this.name = 'OscalLoadError';
  }
}

/**
 * Read a catalog file from disk and return the parsed document.
 * Validates only the structural minimum — presence of `catalog`,
 * `catalog.uuid`, and `catalog.metadata.title`. Deeper validation is
 * left to OSCAL-aware tooling downstream (we trust the NIST-published
 * catalogs and any other source the operator points at).
 */
export async function readOscalCatalog(path: string): Promise<OscalCatalog> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf-8');
  } catch (err) {
    throw new OscalLoadError('Failed to read OSCAL catalog', path, err);
  }

  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch (err) {
    throw new OscalLoadError('Malformed JSON in OSCAL catalog', path, err);
  }

  if (
    !doc || typeof doc !== 'object'
    || !('catalog' in doc) || typeof (doc as OscalCatalogDocument).catalog !== 'object'
  ) {
    throw new OscalLoadError('OSCAL document missing top-level `catalog` object', path);
  }

  const catalog = (doc as OscalCatalogDocument).catalog;
  if (typeof catalog.uuid !== 'string' || catalog.uuid.length === 0) {
    throw new OscalLoadError('OSCAL catalog missing required `uuid`', path);
  }
  if (
    !catalog.metadata || typeof catalog.metadata !== 'object'
    || typeof catalog.metadata.title !== 'string'
  ) {
    throw new OscalLoadError('OSCAL catalog missing required `metadata.title`', path);
  }

  return catalog;
}

export interface OscalToFrameworkOptions {
  /**
   * Override the framework key. By default `slugifyTitle(metadata.title)`
   * — e.g. "NIST SP 800-53 Rev 5" → "nist-sp-800-53-rev-5".
   */
  keyOverride?: string;
  /**
   * Override the framework label. Defaults to `metadata.title`.
   */
  labelOverride?: string;
}

/**
 * Map an OSCAL catalog to a single `ComplianceFrameworkDef` — the entry
 * point for wiring a NIST control set into the domain-pack pipeline.
 * The catalog's metadata becomes the framework's identity; the
 * control inventory is summarized in the description so audit
 * tooling sees the count without parsing the catalog itself.
 */
export function oscalCatalogToFramework(
  catalog: OscalCatalog,
  options: OscalToFrameworkOptions = {},
): ComplianceFrameworkDef {
  const controls = flattenControls(catalog);
  const activeCount = controls.filter((c) => !c.withdrawn).length;
  const withdrawnCount = controls.length - activeCount;
  const families = new Set<string>();
  for (const c of controls) {
    if (c.familyId) families.add(c.familyId);
  }

  return {
    key: options.keyOverride ?? slugifyTitle(catalog.metadata.title),
    label: options.labelOverride ?? catalog.metadata.title,
    description: buildDescription({
      title: catalog.metadata.title,
      version: catalog.metadata.version,
      oscalVersion: catalog.metadata['oscal-version'],
      lastModified: catalog.metadata['last-modified'],
      activeCount,
      withdrawnCount,
      familyCount: families.size,
    }),
  };
}

/**
 * Walk the catalog's nested group/control tree and return every
 * control as a flat list. Captures the top-level family id/title so
 * downstream consumers can group by control family without re-walking
 * the tree. Control enhancements (e.g. ac-1.1 nested under ac-1) are
 * included with `parentId` set.
 */
export function flattenControls(catalog: OscalCatalog): readonly FlattenedOscalControl[] {
  const out: FlattenedOscalControl[] = [];

  for (const c of catalog.controls ?? []) {
    walkControl(c, undefined, undefined, undefined, out);
  }
  for (const g of catalog.groups ?? []) {
    walkGroup(g, out);
  }

  return out;
}

// ─── internals ────────────────────────────────────────────────────────────

function walkGroup(
  group: OscalGroup,
  out: FlattenedOscalControl[],
  inheritedFamilyId?: string,
  inheritedFamilyTitle?: string,
): void {
  // A top-level group becomes the family; nested groups inherit their
  // parent's family identity (they're sub-organizers, not new families).
  const familyId = inheritedFamilyId ?? group.id;
  const familyTitle = inheritedFamilyTitle ?? group.title;

  for (const c of group.controls ?? []) {
    walkControl(c, undefined, familyId, familyTitle, out);
  }
  for (const sub of group.groups ?? []) {
    walkGroup(sub, out, familyId, familyTitle);
  }
}

function walkControl(
  control: OscalControl,
  parentId: string | undefined,
  familyId: string | undefined,
  familyTitle: string | undefined,
  out: FlattenedOscalControl[],
): void {
  out.push({
    id: control.id,
    title: control.title,
    familyId,
    familyTitle,
    withdrawn: isWithdrawn(control.props),
    parentId,
  });
  for (const enhancement of control.controls ?? []) {
    walkControl(enhancement, control.id, familyId, familyTitle, out);
  }
}

function isWithdrawn(props: readonly OscalProp[] | undefined): boolean {
  if (!props) return false;
  for (const p of props) {
    if (p.name === 'status' && p.value.toLowerCase() === 'withdrawn') return true;
  }
  return false;
}

interface DescriptionInput {
  title: string;
  version: string;
  oscalVersion: string;
  lastModified: string;
  activeCount: number;
  withdrawnCount: number;
  familyCount: number;
}

function buildDescription(input: DescriptionInput): string {
  const lines = [
    `${input.title} (${input.version}). Imported from an OSCAL ${input.oscalVersion} catalog`,
    `last modified ${input.lastModified}.`,
  ];
  const inventoryParts: string[] = [];
  if (input.familyCount > 0) inventoryParts.push(`${input.familyCount} control families`);
  if (input.activeCount > 0) inventoryParts.push(`${input.activeCount} active controls`);
  if (input.withdrawnCount > 0) inventoryParts.push(`${input.withdrawnCount} withdrawn`);
  if (inventoryParts.length > 0) lines.push(inventoryParts.join(', ') + '.');
  return lines.join(' ');
}

/**
 * Catalog titles like `"NIST Special Publication 800-53 Revision 5 Catalog"`
 * become `nist-special-publication-800-53-revision-5-catalog`. Stable —
 * the same title always produces the same slug, so re-importing the
 * same catalog stays idempotent in registries keyed by framework key.
 */
export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
