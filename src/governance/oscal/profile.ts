import { readFile } from 'node:fs/promises';
import type { ComplianceFrameworkDef } from '../../domain-packs/index.js';
import {
  flattenControls,
  OscalLoadError,
  readOscalCatalog,
  slugifyTitle,
} from './loader.js';
import type {
  OscalProfile,
  OscalProfileDocument,
  OscalProfileImport,
  ResolvedOscalProfile,
  ResolvedOscalProfileImport,
} from './types.js';

/**
 * Read an OSCAL profile document from disk and return the parsed
 * profile. Structural validation only — uuid + metadata.title + at
 * least one import. Resolution against catalogs happens separately in
 * `resolveOscalProfile`.
 */
export async function readOscalProfile(path: string): Promise<OscalProfile> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf-8');
  } catch (err) {
    throw new OscalLoadError('Failed to read OSCAL profile', path, err);
  }

  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch (err) {
    throw new OscalLoadError('Malformed JSON in OSCAL profile', path, err);
  }

  if (
    !doc || typeof doc !== 'object'
    || !('profile' in doc) || typeof (doc as OscalProfileDocument).profile !== 'object'
  ) {
    throw new OscalLoadError('OSCAL document missing top-level `profile` object', path);
  }

  const profile = (doc as OscalProfileDocument).profile;
  if (typeof profile.uuid !== 'string' || profile.uuid.length === 0) {
    throw new OscalLoadError('OSCAL profile missing required `uuid`', path);
  }
  if (
    !profile.metadata || typeof profile.metadata !== 'object'
    || typeof profile.metadata.title !== 'string'
  ) {
    throw new OscalLoadError('OSCAL profile missing required `metadata.title`', path);
  }
  if (!Array.isArray(profile.imports) || profile.imports.length === 0) {
    throw new OscalLoadError('OSCAL profile must declare at least one import', path);
  }

  return profile;
}

export interface ResolveProfileOptions {
  /**
   * Map from catalog reference → local path. Keys can be either:
   *
   *   - A back-matter resource UUID — when `imports[].href` is
   *     `"#<uuid>"`, the resolver looks up the UUID directly.
   *   - The literal href string — when `imports[].href` is a plain
   *     URL or path.
   *
   * Operators control catalog locations explicitly; the resolver
   * never fetches over the network or follows `rlinks`. This keeps
   * v4.0 profile import offline-safe and audit-friendly.
   */
  catalogPaths: Record<string, string>;
}

/**
 * Resolve a profile's imports into a flat list of selected control
 * IDs. For each import:
 *
 *   1. Locate the catalog via `catalogPaths` (UUID-keyed for `#<uuid>`
 *      hrefs, href-keyed otherwise).
 *   2. Load the catalog and flatten its control tree.
 *   3. Apply `include-controls[].with-ids` and `include-all`.
 *   4. Apply `exclude-controls[].with-ids`.
 *
 * Returns a `ResolvedOscalProfile` that names every control selected
 * across all imports, plus per-import diagnostics (including IDs the
 * include lists asked for but the catalog did not contain — useful
 * when running a full FedRAMP baseline against a sliced catalog).
 *
 * `matching` selections and `with-child-controls` are currently
 * unsupported — they fall back to direct-ID matching only. The
 * resolver flags such selections in `missingControlIds` when their
 * `with-ids` is empty.
 */
export async function resolveOscalProfile(
  profile: OscalProfile,
  options: ResolveProfileOptions,
): Promise<ResolvedOscalProfile> {
  const importBreakdowns: ResolvedOscalProfileImport[] = [];
  const allSelected = new Set<string>();

  for (const imp of profile.imports) {
    const breakdown = await resolveSingleImport(imp, profile, options);
    importBreakdowns.push(breakdown);
    for (const id of breakdown.selectedControlIds) allSelected.add(id);
  }

  return {
    profileUuid: profile.uuid,
    profileTitle: profile.metadata.title,
    selectedControlIds: Array.from(allSelected),
    imports: importBreakdowns,
  };
}

async function resolveSingleImport(
  imp: OscalProfileImport,
  profile: OscalProfile,
  options: ResolveProfileOptions,
): Promise<ResolvedOscalProfileImport> {
  const catalogPath = resolveCatalogPath(imp.href, profile, options);
  const catalog = await readOscalCatalog(catalogPath);
  const allControls = flattenControls(catalog);
  const allIds = new Set(allControls.map((c) => c.id));

  // Build the include set.
  let includeIds: Set<string>;
  if (imp['include-all'] !== undefined) {
    includeIds = new Set(allIds);
  } else if (imp['include-controls'] && imp['include-controls'].length > 0) {
    includeIds = new Set();
    for (const sel of imp['include-controls']) {
      for (const id of sel['with-ids'] ?? []) includeIds.add(id);
    }
  } else {
    // No selection criteria — defaults to include-all per OSCAL convention.
    includeIds = new Set(allIds);
  }

  // Apply excludes.
  for (const sel of imp['exclude-controls'] ?? []) {
    for (const id of sel['with-ids'] ?? []) includeIds.delete(id);
  }

  const selected: string[] = [];
  const missing: string[] = [];
  for (const id of includeIds) {
    if (allIds.has(id)) selected.push(id);
    else missing.push(id);
  }

  return {
    href: imp.href,
    catalogPath,
    selectedControlIds: selected,
    missingControlIds: missing,
  };
}

function resolveCatalogPath(
  href: string,
  profile: OscalProfile,
  options: ResolveProfileOptions,
): string {
  // `#<uuid>` references the profile's own back-matter — operator can
  // either key the catalogPaths map by the raw href OR by the bare uuid.
  if (href.startsWith('#')) {
    const uuid = href.slice(1);
    if (options.catalogPaths[uuid] !== undefined) return options.catalogPaths[uuid];
    // Fall through to literal-href lookup in case the operator keyed
    // by the full `#<uuid>` form.
  }
  if (options.catalogPaths[href] !== undefined) return options.catalogPaths[href];

  throw new OscalLoadError(
    `Cannot resolve OSCAL profile import href; pass a catalogPaths entry keyed by `
    + `the back-matter resource UUID or the raw href`,
    href,
  );
}

export interface OscalProfileToFrameworkOptions {
  keyOverride?: string;
  labelOverride?: string;
}

/**
 * Map a resolved profile to a single `ComplianceFrameworkDef`. The
 * description summarizes the tailoring outcome: profile title +
 * version + selected-control count + per-import contribution.
 */
export function oscalProfileToFramework(
  profile: OscalProfile,
  resolved: ResolvedOscalProfile,
  options: OscalProfileToFrameworkOptions = {},
): ComplianceFrameworkDef {
  const importLines: string[] = [];
  for (const imp of resolved.imports) {
    const selectedCount = imp.selectedControlIds.length;
    const missingCount = imp.missingControlIds.length;
    const part = missingCount > 0
      ? `${selectedCount} selected (${missingCount} requested but absent from catalog)`
      : `${selectedCount} selected`;
    importLines.push(`from ${imp.href}: ${part}`);
  }

  return {
    key: options.keyOverride ?? slugifyTitle(profile.metadata.title),
    label: options.labelOverride ?? profile.metadata.title,
    description: buildProfileDescription({
      title: profile.metadata.title,
      version: profile.metadata.version,
      oscalVersion: profile.metadata['oscal-version'],
      totalSelected: resolved.selectedControlIds.length,
      importLines,
    }),
  };
}

interface ProfileDescriptionInput {
  title: string;
  version: string;
  oscalVersion: string;
  totalSelected: number;
  importLines: string[];
}

function buildProfileDescription(input: ProfileDescriptionInput): string {
  const head = `${input.title} (${input.version}). Tailored OSCAL ${input.oscalVersion} profile selecting ${input.totalSelected} controls`;
  if (input.importLines.length === 0) return `${head}.`;
  if (input.importLines.length === 1) return `${head} — ${input.importLines[0]}.`;
  return `${head}: ${input.importLines.join('; ')}.`;
}
