<!-- audience: public -->

# OSCAL Test Fixtures

Two fixtures, two purposes.

## `sample-catalog.json` — hand-crafted minimal catalog

A small synthetic catalog (~50 lines) exercising the loader's structural
edge cases:

- Top-level controls outside any group (`ungrouped-1`)
- Nested groups (`Audit Records` inside `Audit and Accountability`)
- Control enhancements with `parentId` propagation (`ac-1.1` under `ac-1`)
- Withdrawn-status detection (`ac-1.1` carries `status: withdrawn`)
- Multiple control families (`ac`, `au`)

Used by `tests/unit/governance-oscal-loader.test.ts`. Fast, deterministic,
expected values hand-verifiable.

## `nist-800-53-rev5-low-baseline-profile.json` — real FedRAMP-style profile

The verbatim NIST SP 800-53 Rev 5 **LOW IMPACT BASELINE** profile sourced
from [`usnistgov/oscal-content`](https://github.com/usnistgov/oscal-content)
(`nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_LOW-baseline_profile.json`).
~7 KB. Selects 149 controls from the 800-53 catalog including 7 IR
controls (`ir-1`, `ir-2`, `ir-4`, `ir-5`, `ir-6`, `ir-7`, `ir-8`).

Used by `tests/integration/governance-oscal-profile.test.ts` to exercise
the profile resolver against real `#<uuid>` back-matter references, real
`include-controls[].with-ids` arrays, and the partial-catalog round-trip
(7 of 149 selected IDs match what's in the IR slice — the others land
in `missingControlIds` per the resolver's diagnostics).

Refreshing follows the same procedure as the catalog slice.

## `nist-800-53-rev5-ir-slice.json` — real NIST catalog slice

A slice of the actual NIST SP 800-53 Rev 5 catalog containing only the
**IR (Incident Response)** control family. Used by
`tests/integration/governance-oscal-real-catalog.test.ts` to prove the
loader handles real-world OSCAL data, not just hand-crafted fixtures.

**Source:** [`usnistgov/oscal-content`](https://github.com/usnistgov/oscal-content) — `nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog.json`

**Slicing:** preserve `catalog.uuid`, `catalog.metadata`, and exactly one
top-level group (`id: ir`) with all its controls and enhancements
intact. `back-matter.resources` removed to keep the fixture under
400 KB; everything else (control IDs, titles, props, parts, parameters,
links, withdrawn markers, nested enhancements) is verbatim NIST content.

**Why IR specifically:** smallest of the 20 families (~42 controls
including enhancements) while still exercising every structural feature
the loader handles — withdrawn entries (ir-3, ir-9 in this slice), deep
control-enhancement nesting (ir-8 / ir-8.1), real OSCAL kebab-case field
names, multi-paragraph prose, real parameter declarations.

**License / attribution:** NIST works produced by U.S. Government
employees are in the public domain (17 U.S.C. § 105). Attribution to
NIST is requested as a courtesy. The slice retains NIST's original
`catalog.uuid` and metadata so the source is identifiable.

**Refreshing the slice:** NIST publishes catalog updates periodically.
To regenerate against the latest:

```bash
curl -sL https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog.json -o /tmp/nist-800-53-rev5-full.json
python3 -c "
import json
with open('/tmp/nist-800-53-rev5-full.json') as f:
    doc = json.load(f)
c = doc['catalog']
sliced = {
    'catalog': {
        'uuid': c['uuid'],
        'metadata': c['metadata'],
        'groups': [g for g in c['groups'] if g.get('id') == 'ir'],
    }
}
with open('tests/fixtures/oscal/nist-800-53-rev5-ir-slice.json', 'w') as f:
    json.dump(sliced, f, indent=2)
"
```

Then update any hard-coded counts in
`tests/integration/governance-oscal-real-catalog.test.ts` if NIST has
added/withdrawn IR controls in the meantime.
