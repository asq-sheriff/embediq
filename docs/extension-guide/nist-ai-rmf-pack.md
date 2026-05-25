<!-- audience: public -->

# NIST AI RMF + AI 600-1 Domain Pack (v4.0 / 8G)

The `nist-ai-rmf` built-in domain pack maps [NIST AI Risk Management Framework 1.0](https://www.nist.gov/itl/ai-risk-management-framework) (Govern / Map / Measure / Manage) and the [NIST AI 600-1 Generative AI Profile](https://www.nist.gov/itl/ai-risk-management-framework/nist-ai-600-1-generative-artificial-intelligence-profile) onto EmbedIQ's wizard + harness. The pack closes the v4.0 governance suite — together with 8A-8F it gives operators a coherent federal-procurement-ready AI governance story.

## Honest scope boundary

AI RMF governs the **whole AI system**: organizational accountability, governance roles, system-level measurement, ongoing risk management, third-party assessments. EmbedIQ produces the **developer-side harness** — one input to the broader RMF program, not a substitute for it.

The pack covers what the harness can reasonably enforce:

- **Documentation** — surface AI policy, risk tier, intended use in the generated harness so the agent honors them.
- **Confabulation reminders** — under the AI 600-1 profile, generative agents should not present guesses as certain answers.
- **Risk-tier-aware behavior** — elevated- and high-risk systems require more rigorous human review before applying changes.
- **Escalation path recording** — the operator's named escalation authority appears in the generated runbook.

What the pack **does not** address (operator-owned):

- AI policy authorship — the pack assumes a policy exists; the operator brings it.
- Governance role assignment — the pack assumes an accountable authority is named; the agent records it.
- System-level measurement program — bias testing, drift monitoring, incident reporting workflows live outside the harness.
- Third-party assessments — the harness records that an assessment occurred; the assessment itself is external.

## What's in the pack

| Section | Content |
|---|---|
| **Identity** | `id: nist-ai-rmf`, version `1.0.0`. NOT mapped to any industry — cross-industry pack. |
| **Compliance frameworks** | `nist-ai-rmf` (AI RMF 1.0) + `nist-ai-600-1` (Generative AI Profile). |
| **Wizard questions** | 6 questions covering each of the four RMF functions + the AI 600-1 GenAI Profile + external assessment. All gated on `REG_002` containing `nist-ai-rmf`. |
| **Rule templates** | 4 path-scoped Claude Code rule files — one per RMF function (Govern / Map / Measure / Manage). All emit when the `nist-ai-rmf` framework is active. |
| **Priority categories** | AI Governance, AI Trustworthiness, AI Risk Documentation, Generative AI Safety. |
| **DLP patterns / ignore patterns** | Empty by design — AI RMF is not a data-classification framework. Compose with an industry pack when data-class DLP is needed. |
| **Validation checks** | 4 checks confirming the harness includes the four AI RMF rule files. |

## Opting in

The pack is registered in the default `DomainPackRegistry` but does **not** activate automatically from industry. There are three ways operators get AI RMF coverage:

### 1. Select `nist-ai-rmf` as a compliance framework in the wizard

`REG_002` now includes `nist-ai-rmf` as an option:

```
Which compliance frameworks apply to your project?
[ ] HIPAA (healthcare data)
[ ] SOC 2
[ ] PCI-DSS (payment data)
[ ] GDPR (EU data protection)
[ ] FDA (medical devices / life sciences)
[ ] FedRAMP (US government)
[x] NIST AI Risk Management Framework (AI RMF 1.0 + AI 600-1 GenAI Profile)   ← new in 8G
[ ] None / Not applicable
```

When selected, the 6 AI RMF wizard questions (AI_001 through AI_006) appear in the Regulatory Compliance dimension.

### 2. Compose AI RMF with an industry pack programmatically

For operators who want HIPAA + AI RMF in one composed pack:

```ts
import { domainPackRegistry } from 'embediq/domain-packs';

const composed = domainPackRegistry.composeFromPacks(
  ['healthcare', 'nist-ai-rmf'],
  {
    id: 'healthcare-ai-rmf',
    name: 'Healthcare + AI RMF',
    version: '1.0.0',
    description: 'HIPAA DLP + AI RMF governance reminders for the same harness',
  },
);
// composed.complianceFrameworks → [hipaa, nist-ai-rmf, nist-ai-600-1]
// composed.dlpPatterns          → HIPAA's PHI patterns
// composed.ruleTemplates        → HIPAA's rules + 4 AI RMF rules
// composed.questions            → HIPAA + AI RMF questions
// composed.validationChecks     → HIPAA + AI RMF checks
```

Pass `composed` through your wizard flow as the active domain pack.

### 3. Compose via skills

The pack also ships as a `nist-ai-rmf.full` skill in the skill registry, for callers that already compose via `composeSkills(...)`:

```ts
import { skillRegistry } from 'embediq/skills';
import { composeSkills } from 'embediq/skills';

const skills = skillRegistry.getByIds(['healthcare.full', 'nist-ai-rmf.full']);
const composed = composeSkills(skills);
```

## What the rule files contain

Each rule template ships as a path-scoped Claude Code rule (`.claude/rules/nist-ai-rmf-<function>.md`) and tells the agent to:

| Function | Headline expectation |
|---|---|
| **Govern** | Honor the documented risk tolerance; surface AI-policy clauses when relevant; do not weaken governance controls on grounds of "efficiency". |
| **Map** | Scope to the documented intended use; ask the user to clarify ambiguous intent rather than confabulating; respect the risk tier on changes to security-relevant artifacts. |
| **Measure** | Preserve measurable signals; surface uncertainty rather than presenting guesses as facts; honor the generation-header stamps so downstream reviewers can trace changes. |
| **Manage** | Halt before harm; surface the named escalation authority on access-control / audit-hook / compliance-check changes; cooperate with rollback; document the response in the audit log. |

The full text of each rule is in [`src/domain-packs/built-in/nist-ai-rmf.ts`](../../src/domain-packs/built-in/nist-ai-rmf.ts) — read the source for the canonical wording.

## Composing with the rest of v4.0

The pack pairs well with the other v4.0 outputs:

```bash
npm start -- --targets claude,oscal-component,cyclonedx-aibom,provenance
EMBEDIQ_AUDIT_LOG=/var/log/embediq/audit.jsonl \
EMBEDIQ_AUDIT_CHAIN_ENABLED=true \
  npm start
```

With `nist-ai-rmf` selected as a framework, the run produces:

- The Claude Code harness with the four AI RMF rule files
- OSCAL component-definition citing `nist-ai-rmf` and `nist-ai-600-1` as control sources
- CycloneDX-ML AIBOM enumerating the AI components governed under AI RMF
- Provenance trace explaining which AI RMF function drove each rule file
- Tamper-evident audit chain recording every change to the harness

That's the full v4.0 audit-evidence package: AI RMF posture + supply chain + product + deployment + per-file traceability + integrity-verifiable trail.

## What's reserved for follow-up

- **Per-control mapping** — AI RMF subcategories (e.g. GV-1.1, MP-2.3) are not yet bound to specific rule sections. The current 4-rule structure is function-level; a follow-up will add subcategory-level mapping so audit pipelines can claim coverage by subcategory.
- **AI RMF Profile import** — when NIST or an industry consortium publishes a machine-readable AI RMF profile (analogous to a FedRAMP baseline), 8A's profile importer will resolve it.
- **AI 600-1-specific rule files** — the current pack carries one combined `manage` rule mentioning AI 600-1 considerations. As the GenAI Profile matures, a dedicated rule file per GenAI risk category (confabulation, dangerous content, value-chain integrity) is a natural extension.

## See also

- [NIST AI RMF 1.0 home](https://www.nist.gov/itl/ai-risk-management-framework)
- [NIST AI 600-1 Generative AI Profile](https://www.nist.gov/itl/ai-risk-management-framework/nist-ai-600-1-generative-artificial-intelligence-profile)
- [`writing-oscal-imports.md`](writing-oscal-imports.md) — 8A
- [`exporting-oscal-component-definitions.md`](exporting-oscal-component-definitions.md) — 8B
- [`exporting-oscal-ssp-fragments.md`](exporting-oscal-ssp-fragments.md) — 8C
- [`exporting-cyclonedx-aibom.md`](exporting-cyclonedx-aibom.md) — 8D
- [`exporting-provenance-trace.md`](exporting-provenance-trace.md) — 8E
- [`../operator-guide/audit-chain.md`](../operator-guide/audit-chain.md) — 8F
