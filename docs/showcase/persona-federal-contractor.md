<!-- audience: public -->

# EmbedIQ for Federal Contractors

**You are a federal contractor or systems integrator. Your engineering teams are adopting AI coding agents. Your contracting officer is going to ask about it under OMB M-24-10 and NIST AI RMF, and you need an answer that survives a FedRAMP review.**

This brief is for the CTO, ISSM, Authorizing Official representative, and Director of Engineering at a federal contractor — defense primes, civilian agency integrators, federal-focused SaaS providers, or any firm pursuing FedRAMP authorization with developer teams using AI coding tools.

## The specific problem

Federal procurement just changed the rules for how AI tools are used in development:

- **OMB M-24-10** requires agencies to inventory AI use cases, manage AI risk, and maintain governance evidence. Vendors must produce equivalent posture.
- **NIST AI RMF 1.0** plus the **AI 600-1 GenAI Profile** are becoming the de facto evidence standards. Contracting officers are starting to ask for AI RMF posture statements.
- **FedRAMP authorizations** now expect AI tooling to appear in the System Security Plan. OSCAL is the format your 3PAO and the FedRAMP PMO want.
- **NIST 800-53 Rev 5** controls — particularly the IR (incident response), AU (audit), and AC (access control) families — apply to any AI tool that touches federal data or code that processes federal data.

If your developers are using Claude Code, Cursor, or Copilot against a system that handles federal data, your next ATO review will ask how the configuration is governed, how changes are tracked, and how the supply chain is documented. Today most contractors answer with attestation letters. That bar is rising.

## What EmbedIQ produces for a federal contractor

A ten-minute wizard run, scoped to a federal profile, generates:

| Artifact | What it gives your authorization package |
|---|---|
| OSCAL catalog + profile import | Read your existing NIST 800-53 Rev 5 catalog or FedRAMP Low / Moderate / High baseline profile directly. EmbedIQ has been round-trip-tested against verbatim NIST 800-53 Rev 5 fixtures. |
| OSCAL component-definition | Product-level claim describing the AI coding agent harness as a system component. Drop into your SSP package. |
| OSCAL SSP fragment | Per-deployment SSP starter, FedRAMP-style. Operator-overridable via three env vars: profile href, system name, FIPS-199 sensitivity. Stamped `document-completion-status=fragment` so reviewers know it is a starter, not a substitute. |
| CycloneDX-ML AIBOM | CycloneDX 1.6 ML-BOM enumerating every AI component the harness touches. Same standard CISA, NIST, and the AI-supply-chain working groups are converging on. |
| Per-file provenance trace | Maps every emitted file to the generator, target, domain pack, and skill that produced it. Supports the "explain how this artifact was produced" question. |
| Tamper-evident audit chain | RFC-6962-style linked log. Every entry carries `prevHash`. `verify-audit-log` CLI walks the chain and returns exit 0 / 1 / 2 — pipe it through your CI for continuous integrity attestation. |
| NIST AI RMF + AI 600-1 domain pack | Wizard questions covering Govern / Map / Measure / Manage plus the GenAI Profile. Four path-scoped rules surface the operator's documented risk tier, intended use, measurement program, and escalation authority to the agent. |
| Three-tier RBAC | `wizard-viewer` < `wizard-user` < `wizard-admin`. Pluggable auth: HTTP Basic, OIDC, reverse-proxy headers — works with your existing federal IdP. |

## Mapping to the controls your 3PAO will ask about

| Control family | EmbedIQ contribution |
|---|---|
| **AC (Access Control)** | Permission tiers (Permissive / Balanced / Strict / Lockdown) plus three-tier RBAC plus pluggable auth strategies. |
| **AU (Audit and Accountability)** | JSONL audit log, optionally tamper-evident (RFC-6962 linked log), with CLI verifier. Auto-enriched with `userId` and `requestId` from request context. |
| **CM (Configuration Management)** | Deterministic byte-identical regeneration. Drift detection. Autopilot scheduled re-scans. Git PR integration so changes flow through normal CR review. |
| **IR (Incident Response)** | Failure-streak monitor with alerting event. Outbound webhook subscribers for Slack and Teams. |
| **SA (System and Services Acquisition)** | CycloneDX-ML AIBOM enumerates the AI supply chain. Provenance trace records authorship per file. |
| **SI (System and Information Integrity)** | DLP pre-tool hooks block sensitive patterns. Validation checks confirm harness completeness. Audit chain verifier flags tampering. |

This is not a claim of full ATO coverage — controls also depend on your organizational program, your hosting environment, and your operational practices. EmbedIQ produces the developer-side evidence. Your ATO package combines that with the rest.

## A 60-day pilot plan

**Days 1-10 — Scope the boundary.**
- Identify one program with developers using AI coding agents.
- Confirm the FedRAMP baseline (Low, Moderate, or High) and the authorization status.
- Locate your OSCAL profile JSON (or obtain it from FedRAMP PMO).

**Days 11-25 — Generate the package.**
- Run the wizard against the program's primary repo. Choose the `nist-ai-rmf` framework option.
- Use `EMBEDIQ_OSCAL_SSP_PROFILE_HREF`, `EMBEDIQ_OSCAL_SSP_SYSTEM_NAME`, `EMBEDIQ_OSCAL_SSP_SENSITIVITY` to stamp the SSP fragment with operator-specific values.
- Enable the tamper-evident audit chain: `EMBEDIQ_AUDIT_CHAIN_ENABLED=true`.

**Days 26-40 — 3PAO dry run.**
- Submit the OSCAL component-definition and SSP fragment to your 3PAO for informal review.
- Hand the CycloneDX-ML AIBOM to your supply chain risk management function.
- Run `verify-audit-log` and confirm chain integrity over the pilot period.

**Days 41-60 — Refinement.**
- Capture 3PAO feedback. If specific NIST 800-53 controls need per-control claims (versus the framework-level claims EmbedIQ ships today), document them — the per-control mapping is the natural extension and we can prioritize it for your engagement.
- Decide whether to roll out to a second program.
- Turn on autopilot drift detection so the configuration stays in sync between continuous-monitoring reviews.

## What is reserved for follow-up work

EmbedIQ v4.0 ships the foundation. These extensions are on the roadmap and we can prioritize them for federal engagements:

- **Per-control mapping** — claim coverage of specific 800-53 control IDs (e.g., AU-2, AC-3) rather than only framework-level claims.
- **Machine-readable AI RMF profile import** — when NIST publishes one analogous to a FedRAMP baseline.
- **HSM-signed chain heads** — combine the linked-log audit chain with HSM-backed signatures for higher integrity assurance.
- **CMMC and IL5/IL6 domain packs** — DoD-specific compliance scaffolding.

## Pricing and engagement

- **Open source core** — MIT licensed. Runs locally or in your private infrastructure. No vendor lock-in. No telemetry phoning home. The wizard answers never leave memory.
- **Professional services** — Praglogic offers custom federal-domain-pack development, per-control mapping for specific 800-53 controls, integration with your existing GRC and ATO tooling, and 3PAO support. Engagements typically run six to sixteen weeks.
- **Hosted offerings** — Not appropriate for federal data today. Self-hosted only.

## What to read next

- [`EXECUTIVE-BRIEF.md`](EXECUTIVE-BRIEF.md) — the general executive brief.
- [`../extension-guide/writing-oscal-imports.md`](../extension-guide/writing-oscal-imports.md) — OSCAL catalog and profile import internals.
- [`../extension-guide/exporting-oscal-ssp-fragments.md`](../extension-guide/exporting-oscal-ssp-fragments.md) — SSP-fragment output and operator overrides.
- [`../extension-guide/nist-ai-rmf-pack.md`](../extension-guide/nist-ai-rmf-pack.md) — NIST AI RMF domain pack composition.
- [`../operator-guide/audit-chain.md`](../operator-guide/audit-chain.md) — tamper-evident audit chain operator guide.
- [`../evaluators/security-model.md`](../evaluators/security-model.md) — security-model document for evaluators.

**Contact:** [praglogic.com](https://praglogic.com) · **Source:** [github.com/asq-sheriff/embediq](https://github.com/asq-sheriff/embediq)
