<!-- audience: public -->

# Importing OSCAL Catalogs

OSCAL — NIST's [Open Security Controls Assessment Language](https://pages.nist.gov/OSCAL/) — is the machine-readable interchange format for security-control catalogs (NIST SP 800-53, SSDF / SP 800-218, SP 800-171, etc.) and profile-tailored baselines (FedRAMP Low / Moderate / High). EmbedIQ can import OSCAL catalogs directly so the control identity, version, and inventory carried by a `ComplianceFrameworkDef` come from the standards body — not from hand-coded copies in the codebase.

This page covers the v4.0 surface: catalog import. Component-definition export, SSP-fragment export, and AIBOM are later phases.

## What you get from an OSCAL import

A single OSCAL catalog import produces a thin `DomainPack` whose only payload is one `ComplianceFrameworkDef` carrying the catalog's identity. Specifically:

- `framework.key` — slug of the catalog's metadata title (e.g. `nist-special-publication-800-53-revision-5-catalog`), or your override
- `framework.label` — the catalog's metadata title
- `framework.description` — auto-generated summary: catalog title + version + OSCAL schema version + last-modified date + control-family count + active-control count + withdrawn-control count

The pack carries no questions, no DLP patterns, no rule templates, no ignore patterns, no validation checks. **OSCAL-imported packs are designed to compose with industry packs** — you typically register both an OSCAL-imported pack (for control identity) and an industry pack like `healthcare` (for HIPAA-specific DLP, rules, and questions).

## Where to get catalogs

NIST publishes machine-readable OSCAL editions of its standards in the [`usnistgov/oscal-content`](https://github.com/usnistgov/oscal-content) repository. Common catalogs:

| Standard | OSCAL path |
|---|---|
| NIST SP 800-53 Rev 5 | `nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog.json` |
| NIST SP 800-53 Rev 5.1.1 | `nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5.1.1_catalog.json` |
| NIST SP 800-171 Rev 2 | `nist.gov/SP800-171/rev2/json/NIST_SP-800-171_rev2_catalog.json` |
| NIST SSDF / SP 800-218 | `nist.gov/SP800-218/json/NIST_SP-800-218_ssdf_catalog.json` |
| CIS Controls | See [CIS Controls OSCAL repository](https://github.com/CISecurity/CIS_Controls) |

Download whichever catalog matches your compliance posture, or clone the whole `oscal-content` repo as a vendored dependency.

## Minimal example

```ts
import { DomainPackRegistry } from 'embediq/domain-packs';

const registry = new DomainPackRegistry();
await registry.loadFromOscalCatalog(
  './oscal-content/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog.json',
  {
    id: 'nist-800-53-rev5',
    name: 'NIST SP 800-53 Rev 5',
    version: '5.1.1',
  },
);

const pack = registry.getById('nist-800-53-rev5');
console.log(pack?.complianceFrameworks[0].description);
// → "NIST Special Publication 800-53 Revision 5 Catalog (5.1.1). Imported from
//    an OSCAL 1.1.2 catalog last modified 2026-…. 20 control families, 1189
//    active controls, 84 withdrawn."
```

## Overriding key and label

When you need a custom framework key — e.g. for FedRAMP profiles that share an underlying catalog with another baseline, or for aligning the framework key to your internal compliance-platform identifier — pass `keyOverride` / `labelOverride` as the third argument:

```ts
await registry.loadFromOscalCatalog(
  './fedramp-moderate-baseline.json',
  { id: 'fedramp-moderate', name: 'FedRAMP Moderate', version: '1.0.0' },
  { keyOverride: 'fedramp-moderate', labelOverride: 'FedRAMP Moderate' },
);
```

The catalog's actual metadata still drives the description — overrides only affect identity, never provenance.

## Composing OSCAL with industry packs

OSCAL-imported packs are intentionally thin. To get HIPAA's DLP patterns + 800-53's control identity in a single profile, register both packs and use `composeFromPacks` to merge them at archetype time:

```ts
// Industry pack — HIPAA DLP, rules, questions
domainPackRegistry.register(healthcarePack);

// Control identity from NIST
await domainPackRegistry.loadFromOscalCatalog(
  './nist-800-53-rev5.json',
  { id: 'nist-800-53-rev5', name: 'NIST SP 800-53 Rev 5', version: '5.1.1' },
);

// Compose at archetype time — both frameworks land in one DomainPack
const composed = domainPackRegistry.composeFromPacks(
  ['nist-800-53-rev5', 'healthcare'],
  {
    id: 'oscal-controlled-healthcare',
    name: 'OSCAL-controlled Healthcare',
    version: '1.0.0',
    description: 'NIST 800-53 Rev 5 control identity + HIPAA DLP / rules / questions',
  },
);
// composed.complianceFrameworks → [nist-800-53-rev5, hipaa]
// composed.dlpPatterns           → HIPAA's PHI patterns
// composed.ruleTemplates         → HIPAA's rule templates
```

Composition is **order-sensitive** — earlier packs win on collisions (overlapping question ids, framework keys, DLP names, rule filenames, validation-check names). Each collision is recorded in `out.warnings`. Pass `{ allowFirstWins: false }` to throw a `PackCompositionError` on collision instead.

Ignore patterns are deduplicated silently; priority categories are merged with union semantics on their tag arrays.

## Importing OSCAL Profiles (FedRAMP baselines, agency overlays)

OSCAL **profiles** tailor a catalog into a baseline — FedRAMP Low / Moderate / High, agency-specific overlays, or anything that selects a subset of controls from one or more catalogs. EmbedIQ resolves profile imports against a caller-supplied catalog map so there's no network fetch and no `rlinks` chasing.

```ts
await domainPackRegistry.loadFromOscalProfile(
  './fedramp-rev5-low-baseline-profile.json',
  {
    // Profile imports reference a catalog via `href: "#<uuid>"` (a
    // back-matter resource pointer) or a plain href. Key your map by
    // either — both forms resolve.
    catalogPaths: {
      // Key by the back-matter resource UUID:
      '84cbf061-eb87-4ec1-8112-1f529232e907': './nist-800-53-rev5-catalog.json',
      // Or by the raw href:
      // '#84cbf061-eb87-4ec1-8112-1f529232e907': './nist-800-53-rev5-catalog.json',
    },
    keyOverride: 'fedramp-rev5-low',
    labelOverride: 'FedRAMP Rev 5 LOW Baseline',
  },
  {
    id: 'fedramp-rev5-low',
    name: 'FedRAMP Rev 5 LOW',
    version: '5.2.0',
  },
);
```

The resulting DomainPack's `complianceFrameworks[0].description` summarizes the tailoring:

```
NIST SP 800-53 Rev 5 LOW IMPACT BASELINE (5.2.0). Tailored OSCAL 1.2.2 profile
selecting 149 controls — from #84cbf061-…: 149 selected.
```

### Partial catalogs and the `missingControlIds` diagnostic

When a profile's `include-controls[].with-ids` references controls that aren't in the catalog you pointed at (e.g. a FedRAMP-LOW profile against a subset of 800-53), the resolver reports them as `missingControlIds` in the per-import breakdown. The summary description surfaces the count:

```
…selecting 7 controls — from #84cbf061-…: 7 selected (142 requested but absent from catalog).
```

This is exactly how operators know when they've pointed the resolver at the wrong catalog version, or when they're intentionally working with a sliced catalog for development.

### Supported profile features

The current v4.0 implementation supports the realistic subset operators hit when importing FedRAMP / agency baselines:

| Profile feature | Status |
|---|---|
| `imports[].href` with `#<uuid>` back-matter resource references | ✅ Resolved via `catalogPaths` keyed by UUID or raw href |
| `imports[].href` with direct URL or path | ✅ Resolved via `catalogPaths` keyed by the raw href |
| `imports[].include-controls[].with-ids` | ✅ Explicit ID lists |
| `imports[].include-all` | ✅ Selects everything in the imported catalog |
| `imports[].exclude-controls[].with-ids` | ✅ Removes IDs from the include set |
| Omitting all selection criteria | ✅ Defaults to include-all (per OSCAL convention) |
| `imports[].include-controls[].matching` (pattern matching) | ⬜ Not yet — falls back to direct-ID matching |
| `imports[].include-controls[].with-child-controls: yes` | ⬜ Not yet — controls are selected by literal ID only |
| `modify.set-parameters` / `modify.alters` | ⬜ Not yet — parameter overrides aren't surfaced in the framework |
| Multi-import profiles (extension stacks) | ✅ Resolver walks every import; selected IDs union across them |
| Network catalog fetch via `rlinks` | ⬜ Out of scope by design — operators supply catalog paths explicitly |

### Composing a profile pack with an industry pack

The same `composeFromPacks` flow works whether the OSCAL pack came from `loadFromOscalCatalog` or `loadFromOscalProfile`:

```ts
await domainPackRegistry.loadFromOscalProfile(
  profilePath, { catalogPaths }, { id: 'fedramp-low', name: 'FedRAMP LOW', version: '5.2.0' },
);
domainPackRegistry.register(healthcarePack);

const composed = domainPackRegistry.composeFromPacks(
  ['fedramp-low', 'healthcare'],
  { id: 'fedramp-low-healthcare', name: 'FedRAMP LOW + HIPAA', version: '1.0.0', description: '…' },
);
```

## Error handling

`loadFromOscalCatalog` throws `OscalLoadError` and does not register the pack when:

- The catalog file does not exist or cannot be read
- The JSON is malformed
- The document is missing its top-level `catalog` object
- The catalog lacks `uuid` or `metadata.title`

Catch it explicitly when loading user-supplied paths:

```ts
import { OscalLoadError } from 'embediq/governance/oscal';

try {
  await registry.loadFromOscalCatalog(path, meta);
} catch (err) {
  if (err instanceof OscalLoadError) {
    console.error(`OSCAL import failed: ${err.message}`);
    if (err.cause) console.error('Cause:', err.cause);
  } else {
    throw err;
  }
}
```

## Verifying against real NIST catalogs

EmbedIQ ships a slice of the actual NIST SP 800-53 Rev 5 catalog under
`tests/fixtures/oscal/nist-800-53-rev5-ir-slice.json` (the IR control
family, ~400 KB, sourced verbatim from
[`usnistgov/oscal-content`](https://github.com/usnistgov/oscal-content)).
The integration test at
`tests/integration/governance-oscal-real-catalog.test.ts` round-trips
the slice end-to-end and asserts on real-world counts (42 controls
total, 32 enhancements, 2 withdrawn entries including the top-level
`ir-10`, the known `ir-8` / `ir-8.1` parent-child relationship, NIST's
stable catalog UUID, OSCAL schema version), so a future loader change
that silently breaks compatibility with real NIST data fails CI.

Refreshing the slice when NIST publishes catalog updates is documented
in [`tests/fixtures/oscal/README.md`](../../tests/fixtures/oscal/README.md).

## What's not in this first v4.0 cut

These ship in later v4.0 phases:

- **Profile import** (catalogs tailored to a baseline — FedRAMP Low / Moderate / High). The `profile.ts` module is reserved for this; the current cut only handles raw catalogs.
- **Component-definition export** — the inverse direction, emitting OSCAL JSON that describes how EmbedIQ's generated harness implements the controls.
- **SSP-fragment export** — per-engagement System Security Plan fragments suitable for FedRAMP-style audit pipelines.
- **AIBOM** — separate from OSCAL; uses CycloneDX ML-BOM format.

## Inspecting the flat control list

For tools that need to enumerate the catalog's controls (e.g. building a coverage matrix against EmbedIQ's generated artifacts), use the lower-level `flattenControls` helper:

```ts
import { readOscalCatalog, flattenControls } from 'embediq/governance/oscal';

const catalog = await readOscalCatalog('./nist-800-53-rev5.json');
for (const c of flattenControls(catalog)) {
  if (c.withdrawn) continue;
  console.log(`${c.familyId}\t${c.id}\t${c.title}`);
}
```

Each `FlattenedOscalControl` includes the control's `id`, `title`, top-level `familyId` / `familyTitle`, a `withdrawn` flag (from OSCAL `props[name=status, value=withdrawn]`), and a `parentId` when the entry is a control enhancement (e.g. `ac-1.1` nested under `ac-1`).

## See also

- [NIST OSCAL Reference](https://pages.nist.gov/OSCAL-Reference/) — schema documentation
- [`usnistgov/oscal-content`](https://github.com/usnistgov/oscal-content) — NIST-published catalogs and profiles
- [OSCAL Catalog Model v1.1.2 JSON Outline](https://pages.nist.gov/OSCAL-Reference/models/v1.1.2/catalog/json-outline/)
- [`oscal-club/awesome-oscal`](https://github.com/oscal-club/awesome-oscal) — community-curated tooling index
- `docs/extension-guide/writing-domain-packs.md` — the underlying `DomainPack` interface
- `docs/extension-guide/writing-skills.md` — skill composition (orthogonal to OSCAL imports)
