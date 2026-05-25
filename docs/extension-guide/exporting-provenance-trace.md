<!-- audience: public -->

# Exporting the Provenance Trace (v4.0)

EmbedIQ can emit a per-file **provenance trace** answering the auditor question *"why is this file in the generated harness?"*. The trace records, for every file in the same generation run:

- **Authoritative generator attribution** — which `ConfigGenerator` (or post-pass step) emitted the file.
- **Authoritative target attribution** — which `TargetFormat` the emitting generator declares.
- **Heuristic driver inference** — which profile fields, target selections, and compliance frameworks caused the generator to emit the file. Inferred from the file's relative path against a rule catalog.

The output is a single manifest at `.embediq/provenance/manifest.json` — not per-file sidecars, to keep the file-count overhead minimal and tooling discoverability high. The trace also records itself, so the manifest is self-describing.

## Opting in

`provenance` is **not** in `DEFAULT_TARGETS`. Opt in explicitly:

```bash
# CLI flag
npm start -- --targets claude,provenance

# Environment variable
EMBEDIQ_OUTPUT_TARGETS=claude,provenance npm start

# Programmatically
orchestrator.generate({
  profile,
  targetDir,
  targets: [TargetFormat.CLAUDE, TargetFormat.PROVENANCE],
  domainPack,
})
```

Output:

```
.embediq/provenance/manifest.json
```

Existing goldens regenerate byte-identically when this target is omitted.

## What the document contains

```json
{
  "schemaVersion": 1,
  "producer": { "name": "EmbedIQ", "version": "3.7.0" },
  "generatedAt": "2026-05-25T21:00:00.000Z",
  "profileSummary": {
    "role": "developer",
    "industry": "healthcare",
    "complianceFrameworks": ["hipaa"],
    "languages": ["typescript"],
    "securityConcerns": ["dlp", "phi"]
  },
  "targets": ["claude", "provenance"],
  "files": [
    {
      "relativePath": "CLAUDE.md",
      "generatorName": "CLAUDE.md",
      "target": "claude",
      "description": "Root CLAUDE.md",
      "drivers": [
        { "type": "profile-field", "field": "role", "value": "developer", "description": "Role-aware CLAUDE.md content." },
        { "type": "target", "field": "targets", "value": "claude", "description": "Claude Code is the default and selected target." },
        { "type": "industry", "field": "industry", "value": "healthcare", "description": "Industry-aware framing." }
      ],
      "matchedHeuristic": "claude-md-root"
    },
    {
      "relativePath": ".claude/rules/hipaa-compliance.md",
      "generatorName": "rules",
      "target": "claude",
      "drivers": [
        { "type": "compliance-framework", "field": "complianceFrameworks", "value": "hipaa",
          "description": "Compliance rule file for HIPAA." }
      ],
      "matchedHeuristic": "compliance-rule-file"
    }
  ],
  "methodology": {
    "generatorAttribution": "authoritative",
    "driverInference": "heuristic",
    "note": "Generator attribution is authoritative — recorded by the orchestrator as files flow through the parallel batch. Driver attribution is heuristic in v4.0 …"
  }
}
```

## How drivers are inferred

The trace ships with a heuristic catalog at [`src/governance/provenance/driver-heuristics.ts`](../../src/governance/provenance/driver-heuristics.ts) — an ordered list of `{ pattern, drivers }` rules. For each generated file, the matcher returns the first matching rule's drivers and stamps the rule's `name` into `matchedHeuristic` so reviewers can find the source rule quickly.

| File pattern | Inferred drivers |
|---|---|
| `CLAUDE.md` | role, target=claude, industry, languages |
| `.claude/rules/<framework>-compliance.md` | compliance-framework=<framework> |
| `.claude/rules/<language>.md` | language=<language> |
| `.claude/rules/rag-<framework>-compliance.md` | compliance-framework + localAiEnabled |
| `.claude/hooks/*` | target=claude + securityConcerns + complianceFrameworks |
| `.claude/ignore*` / `.claudeignore` | target=claude + securityConcerns (PHI when present) |
| `.cursor/rules/*` | target=cursor |
| `.github/copilot-instructions*` | target=copilot |
| `AGENTS.md` / `GEMINI.md` / `.windsurfrules` | target=<corresponding> |
| `rag/*` | localAiEnabled + industry=healthcare (FHIR-aware chunker variant) |
| `router/*` | routerEnabled + confidenceEscalation + complianceFrameworks=hipaa (PHI redactor) |
| `.continue/` / `.aider` / `.zed/` / `ollama*` | localAiEnabled + ideIntegrations |
| `.embediq/oscal/component-definition.json` | target=oscal-component |
| `.embediq/oscal/ssp-fragment.json` | target=oscal-ssp-fragment |
| `.embediq/cyclonedx/aibom.json` | target=cyclonedx-aibom |
| `.embediq/provenance/manifest.json` | target=provenance (this file) |
| anything else | (empty drivers, `matchedHeuristic: undefined`) |

Files that don't match any rule (custom domain pack output, external skills, future generators that haven't been added to the catalog yet) record `drivers: []` and `matchedHeuristic: undefined`. The authoritative `generatorName` / `target` still surface, so reviewers see WHO produced the file even when they don't see WHY yet.

## Methodology limits

The document includes a `methodology.note` field stating the trace's epistemic stance. Concretely:

- **Generator attribution is exact.** The orchestrator records `relativePath → generatorName` as each generator emits its files. This is not inferred.
- **Driver attribution is heuristic.** Today's generators don't self-declare which profile fields drove their decisions. The path-pattern rules approximate that reasoning. They cover the common cases (compliance, language, target, opt-in flags) and are extended whenever a generator changes its output surface.
- **Per-generator self-declared drivers** are reserved for a follow-up iteration. When they land, the trace will mark `driverInference: 'declared'` on the relevant entries and provide exact rather than inferred drivers.

Auditors should treat the trace as evidence of intent + an explanation of likely causes, not a formal causation proof.

## Composing with the v4.0 governance outputs

The provenance target runs **last** in the post-pass chain, so its manifest naturally includes the OSCAL and CycloneDX outputs:

```bash
npm start -- --targets claude,cyclonedx-aibom,oscal-component,oscal-ssp-fragment,provenance
```

Produces all five governance artifacts alongside the harness:

```
.embediq/cyclonedx/aibom.json                  # AI bill of materials
.embediq/oscal/component-definition.json       # product-level OSCAL claim
.embediq/oscal/ssp-fragment.json               # deployment-level OSCAL claim
.embediq/provenance/manifest.json              # per-file provenance trace (this file)
```

The provenance manifest's `files[]` list will include entries for all four — every governance output references every other governance output transitively through the manifest.

## See also

- [`exporting-oscal-component-definitions.md`](exporting-oscal-component-definitions.md) — - [`exporting-oscal-ssp-fragments.md`](exporting-oscal-ssp-fragments.md) — - [`exporting-cyclonedx-aibom.md`](exporting-cyclonedx-aibom.md) — - [`writing-oscal-imports.md`](writing-oscal-imports.md) — (OSCAL input direction)
