<!-- audience: public -->

# Exporting OSCAL System Security Plan Fragments (v4.0)

EmbedIQ can emit an OSCAL [System Security Plan](https://pages.nist.gov/OSCAL-Reference/models/v1.1.2/system-security-plan/json-outline/) **fragment** — the control-implementation and harness-component sections that follow deterministically from the synthesized harness. This is the per-engagement complement to the org-wide [component-definition](exporting-oscal-component-definitions.md): where the component-definition describes the EmbedIQ product, the SSP fragment describes a specific deployment of that product within an operator's authorization boundary.

## Why "fragment" and not a full SSP

A full OSCAL SSP needs organization-specific data EmbedIQ does not (and should not) make up:

- **Authorization boundary** — the technical and physical scope under authorization, which extends well beyond the EmbedIQ-generated harness.
- **Leveraged authorizations** — references to existing ATOs the harness builds on (cloud provider FedRAMP packages, shared services, etc.).
- **System-owner identity** — the official accountable party and signing authorities.
- **Inventory items, network architecture, data-flow diagrams** — operator-supplied technical context.
- **Authorization status** — pre-authorization, under-development, operational, etc.

EmbedIQ produces what it can defend: the harness component, the framework-level control-implementation claims, the artifact manifest, and a profile reference. The document is stamped with `props[name=document-completion-status, value=fragment]` so audit pipelines and reviewers know it's not standalone.

## Opting in

`oscal-ssp-fragment` is **not** in `DEFAULT_TARGETS`. Opt in explicitly:

```bash
# CLI flag
npm start -- --targets claude,oscal-ssp-fragment

# Environment variable
EMBEDIQ_OUTPUT_TARGETS=claude,oscal-component,oscal-ssp-fragment npm start

# Programmatically
orchestrator.generate({
  profile,
  targetDir,
  targets: [TargetFormat.CLAUDE, TargetFormat.OSCAL_SSP_FRAGMENT],
  domainPack,
})
```

Output:

```
.embediq/oscal/ssp-fragment.json
```

Existing goldens regenerate byte-identically when this target is omitted.

## Environment overrides for operator-owned fields

Three fields the operator typically knows at generation time can be passed via environment variables, avoiding hand-editing the placeholder-stubbed JSON:

| Env var | Stamped into | Default |
|---|---|---|
| `EMBEDIQ_OSCAL_SSP_PROFILE_HREF` | `import-profile.href` | `<<REPLACE: …>>` placeholder |
| `EMBEDIQ_OSCAL_SSP_SYSTEM_NAME` | `system-characteristics.system-name` (and metadata title) | `<<REPLACE: …>>` placeholder |
| `EMBEDIQ_OSCAL_SSP_SENSITIVITY` | `system-characteristics.security-sensitivity-level` + the C/I/A impact triple | `fips-199-moderate` |

Valid sensitivity values: `fips-199-low`, `fips-199-moderate`, `fips-199-high`. Unknown values fall back to `fips-199-moderate` (no startup error — the SSP is still generated, just with the default level).

Example:

```bash
EMBEDIQ_OSCAL_SSP_PROFILE_HREF=./fedramp-low-baseline-profile.json \
EMBEDIQ_OSCAL_SSP_SYSTEM_NAME="AcmeMed Claims Adjudication Platform" \
EMBEDIQ_OSCAL_SSP_SENSITIVITY=fips-199-high \
npm start -- --targets claude,oscal-ssp-fragment
```

## What the document contains

A valid OSCAL 1.1.2 SSP with these sections:

- **`metadata`** — title (includes system name), oscal-version, embediq version, `document-completion-status=fragment` prop, producer attribution.
- **`import-profile`** — `href` to the OSCAL profile this fragment claims compliance against (operator-supplied via env var, or a placeholder).
- **`system-characteristics`** — system identity (placeholder unless `EMBEDIQ_OSCAL_SSP_SYSTEM_NAME` is set), profile-derived description, FIPS-199 categorization, information-type entry covering "Source code + agent configuration", placeholder authorization-boundary description, status: `under-development` with a remark instructing the operator to update.
- **`system-implementation`** — one user entry (placeholder for the workforce population) + one component representing the EmbedIQ-generated harness (UUID, type: `software`, status: `operational`, full artifact manifest in props).
- **`control-implementation`** — one `implemented-requirements[]` entry per compliance framework. Each requirement carries a synthetic `control-id` of the form `framework:<key>` (e.g. `framework:hipaa`), props identifying the framework, and one `by-components[]` entry pointing at the harness component with `implementation-status: partial` (framework-level claim — per-control mapping is reserved for a future iteration).

## Composing the OSCAL output set

The OSCAL outputs compose:

```bash
npm start -- --targets claude,oscal-component,oscal-ssp-fragment
```

emits two OSCAL artifacts alongside the harness:

```
.embediq/oscal/component-definition.json    # product-level claim
.embediq/oscal/ssp-fragment.json            # deployment-level claim (this file)
```

The SSP fragment is emitted **after** the component-definition, so the SSP's artifact manifest includes the component-definition file. The SSP does not list itself (avoiding the recursive-manifest problem — it's always last).

## Completing the SSP before audit submission

The generated fragment is intentionally a starting point. Before submitting:

1. Replace every `<<REPLACE: …>>` placeholder with the operator's specific value.
2. Add organization-specific sections OSCAL supports but EmbedIQ does not generate (`network-architecture`, `data-flow`, `leveraged-authorizations`, additional `inventory-items`, additional `users`, `authorized-privileges`, etc.).
3. Add `responsible-parties` referencing the operator's authoring officials.
4. Update `system-characteristics.status.state` from `under-development` to `operational` when authorization is in place.
5. Per-control implemented-requirements: when the harness is intended to claim coverage of specific control IDs (e.g. `ac-1`, `au-2`), add those as additional entries alongside the framework-level claims. EmbedIQ's SSP fragment doesn't make per-control claims today; the per-control mapping is reserved for a follow-up iteration.

## See also

- [`exporting-oscal-component-definitions.md`](exporting-oscal-component-definitions.md) — the product-level OSCAL output.
- [`writing-oscal-imports.md`](writing-oscal-imports.md) — the input direction (catalog + profile import).
- [NIST OSCAL SSP Model](https://pages.nist.gov/OSCAL-Reference/models/v1.1.2/system-security-plan/json-outline/) — the JSON outline this output conforms to.
- [NIST OSCAL SSP concept](https://pages.nist.gov/OSCAL/learn/concepts/layer/implementation/ssp/) — the role of SSPs in the OSCAL stack.
