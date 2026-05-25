<!-- audience: public -->

# Exporting CycloneDX-ML AI Bill of Materials (v4.0 / 8D)

EmbedIQ emits a [CycloneDX 1.6](https://cyclonedx.org/docs/1.6/json/) **AI Bill of Materials** (ML-BOM) describing every model, agent, and service the generated harness invokes. The document is procurement-relevant: EO 14110 and emerging FedRAMP supply-chain guidance both expect AI/ML BOMs alongside traditional SBOMs.

8A/8B/8C cover the OSCAL track (catalog import, component definition, SSP fragment). 8D is the OWASP/CycloneDX track — a different lineage, a different consumer ecosystem (Dependency-Track, OSV-Scanner, AI-focused supply-chain tooling).

## Opting in

`cyclonedx-aibom` is **not** in `DEFAULT_TARGETS`. Opt in explicitly:

```bash
# CLI flag
npm start -- --targets claude,cyclonedx-aibom

# Environment variable
EMBEDIQ_OUTPUT_TARGETS=claude,cyclonedx-aibom npm start

# Programmatically
orchestrator.generate({
  profile,
  targetDir,
  targets: [TargetFormat.CLAUDE, TargetFormat.CYCLONEDX_AIBOM],
  domainPack,
})
```

Output:

```
.embediq/cyclonedx/aibom.json
```

Adding the target never alters any other generator's output — existing goldens regenerate byte-identically.

## What the document contains

A valid CycloneDX 1.6 BOM with ML-BOM extensions:

- **`bomFormat: "CycloneDX"`** + **`specVersion: "1.6"`** + **`serialNumber: urn:uuid:…`** + **`version: 1`**.
- **`metadata.timestamp`**, **`metadata.tools[0] = { vendor: Praglogic, name: EmbedIQ, version: <embediq-version> }`**, and **`metadata.component`** — the harness as the BOM subject (per CycloneDX convention, the subject lives in metadata.component and is NOT duplicated into `components[]`).
- **`components[]`** — every AI model, agent, and service the harness depends on:

| Profile signal | Component type | Notes |
|---|---|---|
| `ollamaModels[]` | `machine-learning-model` per model | `purl: pkg:ollama/<model>`, supplier "Ollama (locally hosted)", modelCard with `architectureFamily: transformer`, regulatory-reporting cross-reference to active frameworks |
| `defaultLocalModel` | (flag on the matching model component) | `properties: [{ name: "embediq:default-local-model", value: "true" }]` |
| `externalApis: ["anthropic"]` | `machine-learning-model` | `purl: pkg:generic/anthropic/claude`, supplier "Anthropic" |
| `externalApis: ["openai"]` | `machine-learning-model` | `purl: pkg:generic/openai/gpt`, supplier "OpenAI" |
| `externalApis` (unknown) | `machine-learning-model` | Recorded generically with `embediq:hosted-provider-id` property for manual review |
| `ideIntegrations: ["continue-dev"]` | `library` | `purl: pkg:generic/continuedev/continue` |
| `ideIntegrations: ["aider"]` | `library` | `purl: pkg:generic/paul-gauthier/aider` |
| `ideIntegrations: ["zed-ai"]` | `library` | `purl: pkg:generic/zed-industries/zed-ai` |
| `routerEnabled: true` | `service` | EmbedIQ-generated local router; description reflects `confidenceEscalation` flag |

- **`dependencies[]`** — one entry recording that the harness depends on every emitted component. Tools like [Dependency-Track](https://dependencytrack.org/) and [OSV-Scanner](https://github.com/google/osv-scanner) use this to walk the BOM graph.

## Example output (abbreviated)

```json
{
  "bomFormat": "CycloneDX",
  "specVersion": "1.6",
  "serialNumber": "urn:uuid:8a3c…",
  "version": 1,
  "metadata": {
    "timestamp": "2026-05-25T20:00:00.000Z",
    "tools": [{ "vendor": "Praglogic", "name": "EmbedIQ", "version": "3.7.0" }],
    "component": {
      "bom-ref": "embediq:harness",
      "type": "application",
      "name": "EmbedIQ-generated AI coding agent harness (healthcare/developer)",
      "version": "3.7.0",
      "supplier": { "name": "Praglogic", "url": ["https://pragmaticlogic.ai"] },
      "publisher": "Praglogic",
      "properties": [
        { "name": "compliance-framework", "value": "hipaa:HIPAA" }
      ]
    }
  },
  "components": [
    {
      "bom-ref": "embediq:local-router",
      "type": "service",
      "name": "EmbedIQ local router",
      "description": "Express dispatch service… Confidence-based escalation enabled…"
    },
    {
      "bom-ref": "embediq:ollama:llama3",
      "type": "machine-learning-model",
      "name": "llama3",
      "purl": "pkg:ollama/llama3",
      "supplier": { "name": "Ollama (locally hosted)" },
      "modelCard": {
        "modelParameters": {
          "task": "code-generation",
          "architectureFamily": "transformer",
          "modelArchitecture": "llama3"
        },
        "considerations": {
          "useCases": ["Local-only AI-assisted code generation via Ollama."],
          "regulatoryReporting": [{ "regulationType": "HIPAA" }]
        }
      },
      "properties": [{ "name": "embediq:default-local-model", "value": "true" }]
    },
    {
      "bom-ref": "embediq:hosted:anthropic",
      "type": "machine-learning-model",
      "name": "Claude (Anthropic API)",
      "purl": "pkg:generic/anthropic/claude",
      "supplier": { "name": "Anthropic", "url": ["https://www.anthropic.com"] },
      "modelCard": { … }
    },
    {
      "bom-ref": "embediq:ide:continue-dev",
      "type": "library",
      "name": "Continue.dev",
      "purl": "pkg:generic/continuedev/continue"
    }
  ],
  "dependencies": [
    { "ref": "embediq:harness", "dependsOn": [
      "embediq:local-router",
      "embediq:ollama:llama3",
      "embediq:hosted:anthropic",
      "embediq:ide:continue-dev"
    ] }
  ]
}
```

## Composing 8B + 8C + 8D outputs together

The three governance outputs compose. Adding all three to your targets:

```bash
npm start -- --targets claude,cyclonedx-aibom,oscal-component,oscal-ssp-fragment
```

emits three governance artifacts alongside the harness:

```
.embediq/cyclonedx/aibom.json                  # 8D — AI bill of materials
.embediq/oscal/component-definition.json       # 8B — product-level OSCAL claim
.embediq/oscal/ssp-fragment.json               # 8C — deployment-level OSCAL claim
```

Post-pass ordering: **AIBOM first**, then component-definition, then SSP fragment. Later steps' artifact manifests include the earlier files, so the OSCAL outputs cite the AIBOM as part of their evidence.

## Feeding into compliance + supply-chain tooling

The document conforms to the official CycloneDX 1.6 JSON schema, so any CycloneDX-aware tool can ingest it:

- **[OWASP Dependency-Track](https://dependencytrack.org/)** — accepts CycloneDX BOMs as-is. The harness becomes a tracked project; each ML component appears in the bill-of-materials view; supply-chain advisories surface against the supplier URLs.
- **[OSV-Scanner](https://github.com/google/osv-scanner)** — reads CycloneDX BOMs and matches components against OSV vulnerability databases.
- **[CycloneDX cdxgen](https://github.com/CycloneDX/cdxgen)** — complementary; produces traditional SBOMs for the same project that the AIBOM can be merged into for unified supply-chain disclosure.
- **OSCAL-aware compliance platforms (Drata / Vanta)** — increasingly accept CycloneDX evidence alongside OSCAL artifacts. Combine 8D's AIBOM with 8B's component-definition for the strongest claim.

## What's NOT in 8D

- **Specific hosted-model versions.** The wizard doesn't ask which Claude or GPT version the operator will invoke (version is pinned at runtime), so the AIBOM records the provider-level identity. Operators who want version-pinned ML components can hand-edit the JSON or extend the builder.
- **Vulnerability annotations.** EmbedIQ does not pull from CVE / OSV / NVD databases at generation time. Downstream tools attach vulnerability data when they ingest the BOM.
- **Quantitative analysis (`modelCard.quantitativeAnalysis`).** Performance metrics (HumanEval, MMLU, etc.) are out of scope — those belong on the model supplier's documentation, not on the harness operator's BOM.
- **Training-data references (`modelCard.modelParameters.datasets`).** Hosted-API models and Ollama-quantized models don't expose training-data manifests EmbedIQ could cite. Left empty.

## See also

- [`exporting-oscal-component-definitions.md`](exporting-oscal-component-definitions.md) — 8B product-level OSCAL output.
- [`exporting-oscal-ssp-fragments.md`](exporting-oscal-ssp-fragments.md) — 8C deployment-level OSCAL output.
- [`writing-oscal-imports.md`](writing-oscal-imports.md) — OSCAL input direction (8A).
- [CycloneDX 1.6 JSON specification](https://cyclonedx.org/docs/1.6/json/) — the schema this output conforms to.
- [CycloneDX ML-BOM capability page](https://cyclonedx.org/capabilities/mlbom/) — the ML-BOM extension this output uses.
- [OWASP AI Exchange](https://owaspai.org/) — broader AI-supply-chain context.
