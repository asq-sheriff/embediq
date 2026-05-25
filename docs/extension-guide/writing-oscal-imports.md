<!-- audience: public -->

# Importing OSCAL Catalogs

OSCAL — NIST's [Open Security Controls Assessment Language](https://pages.nist.gov/OSCAL/) — is the machine-readable interchange format for security-control catalogs (NIST SP 800-53, SSDF / SP 800-218, SP 800-171, etc.) and profile-tailored baselines (FedRAMP Low / Moderate / High). EmbedIQ can import OSCAL catalogs directly so the control identity, version, and inventory carried by a `ComplianceFrameworkDef` come from the standards body — not from hand-coded copies in the codebase.

This page covers the v4.0 / 8A surface: catalog import. Component-definition export (8B), SSP-fragment export (8C), and AIBOM (8D) are later phases.

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

OSCAL-imported packs are intentionally thin. To get HIPAA's DLP patterns + 800-53's control identity in a single profile, register both packs and the wizard resolves them in tandem:

```ts
// Industry pack — HIPAA DLP, rules, questions
domainPackRegistry.register(healthcarePack);

// Control identity from NIST
await domainPackRegistry.loadFromOscalCatalog(
  './nist-800-53-rev5.json',
  { id: 'nist-800-53-rev5', name: 'NIST SP 800-53 Rev 5', version: '5.1.1' },
);

// At wizard time both are queryable
// domainPackRegistry.getForIndustry('healthcare') → healthcarePack
// domainPackRegistry.getById('nist-800-53-rev5') → OSCAL-imported pack
```

A future iteration will add `composeFromPacks([packA, packB])` so a single archetype can declare both as its compliance source.

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

## What's not in 8A

These ship in later v4.0 phases:

- **Profile import** (catalogs tailored to a baseline — FedRAMP Low / Moderate / High). The `profile.ts` module is reserved for this; 8A only handles raw catalogs.
- **Component-definition export** (8B) — the inverse direction, emitting OSCAL JSON that describes how EmbedIQ's generated harness implements the controls.
- **SSP-fragment export** (8C) — per-engagement System Security Plan fragments suitable for FedRAMP-style audit pipelines.
- **AIBOM** (8D) — separate from OSCAL; uses CycloneDX ML-BOM format.

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
