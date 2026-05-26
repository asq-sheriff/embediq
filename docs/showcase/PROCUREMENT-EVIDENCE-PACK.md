<!-- audience: public -->

# EmbedIQ — Procurement Evidence Pack

This is the document a vendor-risk, procurement, or third-party-risk-management (TPRM) team asks for when EmbedIQ enters their evaluation process. It bundles the security posture, deployment model, data-flow diagrams, pre-filled questionnaire responses, and compliance status into one reviewable artifact.

**Important framing:** EmbedIQ is currently **open-source self-hosted software** (MIT licensed), not a hosted SaaS. This changes the procurement model — many standard SaaS vendor-risk questions (subprocessors, cross-region replication, data-at-rest encryption keys held by us) do not apply because the customer runs the software in their own environment. This pack is structured to make that distinction explicit so reviewers do not flag missing-by-design fields as gaps.

A future hosted offering will require a separate, expanded version of this pack. See [Section 11 — Future Hosted Offering](#11-future-hosted-offering).

---

## Table of contents

1. [Deployment model attestation](#1-deployment-model-attestation)
2. [Data-flow diagrams](#2-data-flow-diagrams)
3. [Data classification and handling](#3-data-classification-and-handling)
4. [Pre-filled vendor-risk questionnaire (CAIQ-style)](#4-pre-filled-vendor-risk-questionnaire-caiq-style)
5. [Compliance posture and certification status](#5-compliance-posture-and-certification-status)
6. [Supply chain and subprocessor disclosure](#6-supply-chain-and-subprocessor-disclosure)
7. [Vulnerability management and disclosure](#7-vulnerability-management-and-disclosure)
8. [Incident response references](#8-incident-response-references)
9. [Licensing, insurance, and contracts](#9-licensing-insurance-and-contracts)
10. [Audit and assurance references](#10-audit-and-assurance-references)
11. [Future hosted offering](#11-future-hosted-offering)
12. [Contact and how to engage](#12-contact-and-how-to-engage)

---

## 1. Deployment model attestation

EmbedIQ ships in three deployment modes. Each has a distinct vendor-risk profile:

### Mode A — Local CLI (default, recommended for first evaluation)

- **What runs:** The `embediq` CLI on a single developer machine.
- **What is sent over the network:** Nothing. The wizard runs entirely offline. No telemetry, no analytics, no phone-home.
- **Where the data lives:** Wizard answers exist only in volatile memory unless the operator explicitly opts into the encrypted session store. Generated files are written to a directory the operator chooses.
- **Who is the vendor:** Praglogic, via the MIT-licensed repo. There is no operational relationship with Praglogic in this mode — the customer downloads source code from GitHub and runs it.

### Mode B — Self-hosted web server

- **What runs:** A Node.js Express server inside the customer's infrastructure (Kubernetes, EC2, bare metal, on-prem — operator's choice).
- **What is sent over the network:** Only what the operator's deployment exposes. Session data persists to an operator-managed Postgres database. Autopilot state persists to operator-managed storage. Optional outbound webhooks (Slack, Teams, custom) only if the operator configures them.
- **Where the data lives:** All operator-controlled storage. Praglogic has no access to operator deployments.
- **Who is the vendor:** Praglogic, via the MIT-licensed repo. Optional Praglogic professional services for adoption support — only if the customer engages them under a separate contract.

### Mode C — Air-gapped self-hosted

- **What runs:** Same as Mode B, plus the optional local-AI integration (Ollama running locally) and the PHI-safe local router with confidence escalation.
- **What is sent over the network:** Nothing reaches the public internet unless the operator explicitly opts into hosted-model escalation through the router.
- **Where the data lives:** Entirely within the operator's air-gapped boundary.
- **Who is the vendor:** Same as Mode B.

### Mode D — Hosted SaaS (in planning, not shipped)

Not available. A multi-tenant hosted offering is on the roadmap and will require a separate, expanded procurement evidence pack at that time. Federal data is expected to remain self-hosted indefinitely.

---

## 2. Data-flow diagrams

### Mode A — Local CLI

```
+---------------------+
|  Developer machine  |
|                     |
|  Wizard answers ----+--> volatile memory
|       |             |
|       v             |
|  Generator engine   |
|       |             |
|       v             |
|  Output files ------+--> local filesystem
|                     |
+---------------------+
        |
        | (nothing leaves the boundary)
        v
       [air]
```

**Data-at-rest:** Only generated configuration files in the chosen output directory. No PHI, PCI, or other regulated data ever enters the system unless the operator explicitly includes it in the wizard answers.

**Data-in-transit:** None.

### Mode B — Self-hosted web

```
+----------------+    HTTPS     +-------------------+
| Developer or   | -----------> |  Express server   |
| operator UA    | <----------- |  (operator infra) |
+----------------+              |        |          |
                                |        v          |
                                |  Postgres         |
                                |  (operator infra) |
                                |        |          |
                                |        v          |
                                |  Generated files  |
                                |  → developer repo |
                                +-------------------+
                                         |
                                         | (optional, operator-configured)
                                         v
                                +-------------------+
                                | Outbound webhooks |
                                |  Slack / Teams /  |
                                |  custom JSON      |
                                +-------------------+
```

**Data-at-rest:** Encrypted session payloads in operator-managed Postgres (AES-GCM, key rotation supported via `EMBEDIQ_SESSION_KEY_ROTATION`). Generated files on operator-managed storage.

**Data-in-transit:** TLS terminated at the operator's chosen ingress. Outbound webhook traffic encrypted via HTTPS to operator-specified URLs only.

**Authentication:** Four pluggable strategies — HTTP Basic, OIDC (any compliant IdP), reverse-proxy headers, and demo (admin/user persona switcher — demo-only, never for production). Three-tier RBAC: `wizard-viewer` < `wizard-user` < `wizard-admin`.

### Mode C — Air-gapped

```
+----------------+    HTTPS     +-------------------+
| Developer UA   | -----------> |  Express server   |
+----------------+              |        |          |
                                |        v          |
                                |  Postgres         |
                                |        |          |
                                |        v          |
                                |  Generated files  |
                                |        |          |
                                |        v          |
                                |  Ollama (local)   |
                                |  PHI-safe router  |
                                +-------------------+
                                  Air-gapped boundary
                                         |
                                         x (no egress)
```

**Data-at-rest:** Same as Mode B, with the addition of locally-hosted AI model weights on operator infrastructure.

**Data-in-transit:** All traffic stays within the air-gapped boundary. Outbound webhooks disabled or pointed at air-gapped destinations only.

---

## 3. Data classification and handling

| Data category | Where it appears | How it is handled |
|---|---|---|
| **Wizard answers** | User input during interview | Volatile memory by default; optional encrypted session store. Never persisted in plaintext. |
| **Generated config files** | Output directory | Written to operator-chosen path. No EmbedIQ retention. |
| **Audit log entries** | JSONL file at operator-configured path | Optional tamper-evident chain via `EMBEDIQ_AUDIT_CHAIN_ENABLED=true`. Auto-enriched with userId and requestId in web mode. |
| **PHI / PCI / regulated data** | Should never enter EmbedIQ | Pre-tool DLP hooks block known patterns at the agent boundary. EmbedIQ itself does not process regulated data — it produces the configuration that prevents the agent from leaking it. |
| **Authentication credentials** | Auth middleware | Handled per chosen strategy. Basic auth credentials are environment variables; OIDC tokens are verified against operator's IdP; proxy headers come from operator's trusted reverse proxy. |
| **Session payloads** | Postgres (if web server enabled) | Encrypted at rest with AES-GCM. Key rotation supported. |
| **Telemetry data** | OpenTelemetry traces and metrics | Optional, off by default. When enabled, sent to operator-configured OTLP collector only. |

**Critical attestation:** Wizard answers describe *configuration intent*, not *operational data*. A wizard answer might say "we use Postgres for sessions" — it does not contain the contents of those sessions. PHI, PCI, payment card data, or personal data never enters the EmbedIQ data path under normal operation.

---

## 4. Pre-filled vendor-risk questionnaire (CAIQ-style)

Responses keyed to common CAIQ v4 / CSA STAR question patterns. Adapt to your specific TPRM template.

### 4.1 Audit assurance and compliance management

| Question | Response |
|---|---|
| AAC-01: Audit planning | EmbedIQ is open-source MIT software. Customer's internal audit program owns audit planning of the customer's deployment. Praglogic does not maintain operator deployments. |
| AAC-02: Independent audits | The EmbedIQ codebase is publicly auditable on GitHub. No SOC 2 / ISO 27001 attestation on Praglogic itself today — see Section 5. |
| AAC-03: Information system regulatory mapping | EmbedIQ ships built-in domain packs for HIPAA, PCI-DSS, SOX, GLBA, FERPA, COPPA, SOC 2, FedRAMP, GDPR, and NIST AI RMF 1.0 + AI 600-1 GenAI Profile. |

### 4.2 Application and interface security

| Question | Response |
|---|---|
| AIS-01: Application security | TypeScript strict mode. 1,100+ automated tests (vitest). No known security CVEs at time of writing. Dependency scanning via `npm audit` in CI. |
| AIS-02: Customer access requirements | Four pluggable auth strategies. Three-tier RBAC. Auth required by default in web mode (the `demo` strategy is permissive and demo-only). |
| AIS-03: Data integrity | Optional tamper-evident audit chain (RFC-6962 linked log). Deterministic byte-identical generation — same answers produce identical output, verifiable via the evaluation harness (`make evaluate`). |

### 4.3 Business continuity management

| Question | Response |
|---|---|
| BCR-01: Business continuity plan | Not applicable to the open-source product. Customer's deployment of EmbedIQ is part of the customer's BCP, not Praglogic's. |
| BCR-08: Power and equipment | Not applicable — customer-controlled deployment. |
| BCR-11: Retention policy | EmbedIQ has no retention policy on customer data because it does not retain customer data outside of customer-controlled storage. |

### 4.4 Change control and configuration management

| Question | Response |
|---|---|
| CCC-01: New development | Open-source development on GitHub. Every change reviewed via pull request. Conventional commits. Pre-commit hooks. CI-gated test suite. |
| CCC-03: Quality testing | 1,100+ automated tests across 73+ suites. Evaluation harness against 19 golden archetypes. Type checking via `tsc --noEmit`. |
| CCC-04: Unauthorized software installations | Not applicable to the product itself. Customer's deployment is governed by customer's change-control process. |

### 4.5 Data security and information lifecycle management

| Question | Response |
|---|---|
| DSI-02: Data inventory | EmbedIQ produces an asset inventory (CycloneDX-ML AIBOM) of every AI component the generated harness uses. The product itself stores only what is required to operate — wizard answers (encrypted if persisted), audit log (optional, chained), generated config files (operator-controlled output path). |
| DSI-03: E-commerce transactions | Not applicable — EmbedIQ does not process transactions. |
| DSI-04: Handling, labeling, security policy | EmbedIQ does not handle customer regulated data. DLP patterns in generated configs handle labeling at the agent boundary. |
| DSI-05: Nonproduction data | Not applicable — EmbedIQ does not maintain nonproduction copies of customer data. |
| DSI-07: Secure disposal | Volatile-memory-by-default architecture; secure disposal is automatic at process exit. Persisted session payloads are encrypted; key rotation supported. |

### 4.6 Data center security

Not applicable — Praglogic does not operate data centers for the open-source product. Customer-controlled deployment.

### 4.7 Encryption and key management

| Question | Response |
|---|---|
| EKM-01: Entitlement | Not applicable — keys are operator-managed. |
| EKM-02: Key generation | Session encryption keys generated per operator deployment. Customer-supplied via `EMBEDIQ_SESSION_ENC_KEY`. Rotation supported via `EMBEDIQ_SESSION_KEY_ROTATION`. |
| EKM-03: Sensitive data protection | AES-GCM for session payloads at rest. TLS in transit (operator-terminated). |
| EKM-04: Storage and access | Operator-managed. Praglogic has no access. |

### 4.8 Governance and risk management

| Question | Response |
|---|---|
| GRM-01: Baseline requirements | Customer's GRC program owns baseline requirements for the deployment. EmbedIQ produces the developer-side artifact in the format their GRC platform ingests (OSCAL). |
| GRM-04: Management program | Praglogic's role: open-source maintenance, optional professional services. Customer's role: deployment governance. |
| GRM-06: Policy | EmbedIQ generates path-scoped policy rules for AI coding agents. Customer's enterprise AI policy is upstream of this. |

### 4.9 Human resources

Not applicable in the standard sense — EmbedIQ has no employees who access customer environments without explicit customer engagement. Praglogic personnel only interact with customer environments via paid professional services under separate contract.

### 4.10 Identity and access management

| Question | Response |
|---|---|
| IAM-01: Audit tools access | Operator-managed RBAC. `wizard-admin` role required for audit-tooling access. |
| IAM-02: User access policy | Three-tier RBAC enforced in web mode. Pluggable auth strategies. |
| IAM-08: User access reviews | Operator-managed — EmbedIQ does not maintain user state outside the operator's chosen auth backend. |
| IAM-09: User responsibility | Operator-managed. |
| IAM-12: Authentication | Four pluggable strategies: HTTP Basic, OIDC, reverse-proxy header, and demo (demo-only — admin/user persona switcher, never for production). No auth by default in local CLI mode. |

### 4.11 Infrastructure and virtualization security

| Question | Response |
|---|---|
| IVS-01: Audit logging | JSONL audit log, optional tamper-evident chain. `verify-audit-log` CLI for integrity verification. |
| IVS-04: Information system documentation | Public documentation at `github.com/asq-sheriff/embediq`. Generation produces OSCAL system documentation as output. |
| IVS-06: Network security | Operator-managed. EmbedIQ runs as a normal Node.js service inside the operator's network. |

### 4.12 Mobile security

Not applicable — EmbedIQ has no mobile clients.

### 4.13 Security incident management

| Question | Response |
|---|---|
| SEF-01: Contact / authority maintenance | Security disclosure: open a GitHub security advisory at `github.com/asq-sheriff/embediq/security/advisories`. |
| SEF-02: Incident management | Operator owns incident management for their deployment. Praglogic's role on the open-source product is to triage reported vulnerabilities and publish fixes. |
| SEF-04: Incident response legal preparation | Operator-controlled. |
| SEF-05: Incident response metrics | Audit chain integrity verifier exit codes 0/1/2 are CI-suitable for continuous integrity monitoring. |

### 4.14 Supply chain management and accountability

| Question | Response |
|---|---|
| STA-01: Data quality and integrity | Deterministic generation; same wizard answers always produce byte-identical output. Verifiable via `make evaluate`. |
| STA-04: Provider internal assessments | Not applicable — operator runs the software. |
| STA-05: Supply chain agreements | EmbedIQ produces a CycloneDX-ML AIBOM enumerating its own AI supply chain (Ollama models, hosted APIs the customer optionally enables, IDE agents, local router). This is the artifact a supply-chain reviewer asks for. |
| STA-07: Supply chain metrics | See `make build` output; dependency tree available via `npm ls`. |

### 4.15 Threat and vulnerability management

| Question | Response |
|---|---|
| TVM-01: Antivirus / malicious software | Not applicable — operator-managed runtime. |
| TVM-02: Vulnerability and patch management | Open-source patch-management model. New releases announced on GitHub Releases, with CHANGELOG.md entries. Customer responsible for updating their deployment. |
| TVM-03: Mobile code | Not applicable. |

---

## 5. Compliance posture and certification status

**Honest disclosure.** Some certifications customers expect of SaaS vendors do not apply to EmbedIQ in its current open-source self-hosted form, because *Praglogic does not operate the deployment*. Customer's own compliance program covers the deployment.

| Certification / framework | Status | What it means here |
|---|---|---|
| SOC 2 Type II (on Praglogic) | **Not certified.** Will not pursue while the offering remains exclusively self-hosted — there is no shared infrastructure to attest. A future hosted offering would change this. |
| ISO 27001 (on Praglogic) | Not certified. Same reasoning. |
| HIPAA BAA (Praglogic-customer) | Not applicable. Praglogic does not handle PHI on behalf of customers in the open-source model. The customer's deployment, configured with the HIPAA domain pack, handles PHI under the customer's existing HIPAA program. |
| GDPR data-processor agreement | Not applicable to the self-hosted model. Praglogic is not a data processor in the open-source model. |
| FedRAMP authorization | Not pursuing — federal customers self-host. EmbedIQ produces OSCAL evidence (component-definition, SSP fragment) that feeds into the *customer's* FedRAMP authorization. |
| NIST AI RMF 1.0 + AI 600-1 | Built-in domain pack ships. Honest scope: EmbedIQ produces the developer-side artifacts under the AI RMF — the customer's organizational AI risk program covers the broader RMF requirements. |
| CycloneDX-ML AIBOM | EmbedIQ emits CycloneDX 1.6 ML-BOM output — the format itself is the standard. |
| OSCAL 1.1.2 | EmbedIQ both imports (NIST 800-53 catalogs and FedRAMP profiles) and exports (component-definition, SSP fragment). Round-trip tested against verbatim NIST 800-53 Rev 5 fixtures. |

**What this means for procurement:** The right question to ask is not "is Praglogic SOC 2 certified" — it is "what does Praglogic's open-source product help our SOC 2 / HIPAA / FedRAMP audit produce?" The answer is the OSCAL evidence package, the CycloneDX-ML AIBOM, the provenance trace, and the tamper-evident audit chain.

---

## 6. Supply chain and subprocessor disclosure

**Open-source mode:** No subprocessors. EmbedIQ runs in the customer's infrastructure. There are no Praglogic-side data flows.

**Software supply chain (the npm dependencies EmbedIQ itself ships):**

- Core runtime: Node.js 18+, Express 5, `@inquirer/prompts` v7, `chalk`, `yaml`, `tsx` for dev execution.
- Optional dependencies: OpenTelemetry SDK packages (loaded only when telemetry enabled), `pg` for Postgres backend, `better-sqlite3` for SQLite backend.
- No telemetry libraries that phone home by default.

A full dependency tree is available via `npm ls` in any EmbedIQ install. CycloneDX SBOM of the EmbedIQ npm package itself is on the roadmap (the AIBOM ships today; the broader SBOM is a natural extension).

**AI supply chain (what the *generated harness* invokes when in use):**

EmbedIQ emits a CycloneDX 1.6 ML-BOM listing every AI component the generated harness will invoke. Categories:

- Hosted models (Anthropic Claude, OpenAI GPT, etc.) — only when the customer's chosen agent invokes them. EmbedIQ itself does not call hosted models.
- Local models (Ollama-hosted) — only when the customer opts into the local-AI integration.
- IDE agents (Claude Code, Cursor, Copilot, Gemini, Windsurf) — the configuration targets, not subprocessors of EmbedIQ.
- PHI-safe local router — only when the customer opts in.

---

## 7. Vulnerability management and disclosure

### Reporting a vulnerability

Open a private security advisory at: `https://github.com/asq-sheriff/embediq/security/advisories`

Praglogic acknowledges security reports within 5 business days. Triage and CVSS scoring within 10 business days. Coordinated disclosure timeline: 90 days, extendable for severe vulnerabilities under negotiation.

### Praglogic's commitments

- Investigate every reported security issue in good faith.
- Publish security advisories with CVE assignment (via GitHub) for confirmed vulnerabilities.
- Release patched versions with clear CHANGELOG entries.
- Backport fixes to the latest minor release for at least 12 months.

### Customer responsibilities

- Subscribe to GitHub Releases or watch the repo for security advisories.
- Update self-hosted deployments according to your patch management policy.
- Test EmbedIQ updates in non-production environments before rolling to production.

### What is NOT in scope

- Reports of behavior that is documented and intentional (e.g., "the wizard prompts for sensitive answers" — that is the design).
- Vulnerabilities in customer-controlled deployment configurations (auth strategy choice, network topology, secret management) — those are the operator's responsibility.
- Issues in customer-authored domain packs or skills — operator-authored extensions are outside the EmbedIQ codebase.

---

## 8. Incident response references

EmbedIQ runs inside the customer's environment. Customer's incident response plan governs incident response. Praglogic's role on the open-source product is limited to publishing security fixes for confirmed vulnerabilities in the upstream codebase.

For incidents involving the EmbedIQ tamper-evident audit chain:

1. Run `make verify-audit-log INPUT=<path>` — exit code 1 indicates a chain break with line number and reason.
2. Preserve the audit log file as evidence. Snapshot the surrounding state.
3. Use the provenance manifest (`.embediq/provenance/manifest.json`) to identify which files were emitted by which generator — useful for narrowing the incident timeline.
4. Escalate to your security team using their standard playbook.

See [`../operator-guide/audit-chain.md`](../operator-guide/audit-chain.md) for chain-mode operator guidance.

---

## 9. Licensing, insurance, and contracts

### Licensing

- **EmbedIQ core**: MIT License. Free to use, modify, distribute, and sublicense. No royalties. No attribution beyond standard MIT notice. Commercial use permitted without restriction.
- **Domain packs (built-in)**: Same MIT License.
- **Customer-authored extensions**: Operator-chosen license. The operator owns code they write against the extension interface.

### Insurance

Praglogic professional services engagements carry standard professional liability and errors-and-omissions coverage. Specific coverage details negotiated per engagement contract; not bundled with the open-source product.

The open-source product itself is provided "as is" per the MIT license — there is no implied warranty. This is the standard open-source posture; it is the same disclaimer that ships with React, Node.js, Express, and every other open-source dependency in your stack.

### Contracts

- **Open-source use**: MIT License is the entire contract. No master services agreement required.
- **Professional services**: Praglogic negotiates standard professional services agreements per engagement — scope, milestones, payment terms, IP ownership, confidentiality. Standard MSA template available on request.
- **Hosted offering**: Not currently available. Future hosted offering will require a separate service agreement, BAA (for healthcare customers), and DPA (for EU customers).

---

## 10. Audit and assurance references

### Documents in this repo that auditors and reviewers will ask for

- [`../evaluators/security-model.md`](../evaluators/security-model.md) — CISO-grade security posture overview.
- [`../evaluators/threat-coverage.md`](../evaluators/threat-coverage.md) — threat model and coverage matrix.
- [`../evaluators/evaluation-methodology.md`](../evaluators/evaluation-methodology.md) — how generated output is scored against golden references.
- [`../evaluators/competitive-comparison.md`](../evaluators/competitive-comparison.md) — methodology for comparing alternatives.
- [`../operator-guide/audit-chain.md`](../operator-guide/audit-chain.md) — tamper-evident audit chain operator guide.
- [`../extension-guide/exporting-oscal-component-definitions.md`](../extension-guide/exporting-oscal-component-definitions.md) — OSCAL component output internals.
- [`../extension-guide/exporting-oscal-ssp-fragments.md`](../extension-guide/exporting-oscal-ssp-fragments.md) — OSCAL SSP fragment output internals.
- [`../extension-guide/exporting-cyclonedx-aibom.md`](../extension-guide/exporting-cyclonedx-aibom.md) — CycloneDX-ML AIBOM output internals.
- [`../extension-guide/exporting-provenance-trace.md`](../extension-guide/exporting-provenance-trace.md) — provenance trace output internals.
- [`../extension-guide/nist-ai-rmf-pack.md`](../extension-guide/nist-ai-rmf-pack.md) — NIST AI RMF + AI 600-1 domain pack documentation.

### Producible on-demand from the running product

- OSCAL component-definition for any wizard run (`.embediq/oscal/component-definition.json`).
- OSCAL SSP fragment with operator-supplied profile reference and system name (`.embediq/oscal/ssp-fragment.json`).
- CycloneDX-ML AIBOM enumerating every AI component the harness invokes (`.embediq/cyclonedx/aibom.json`).
- Provenance manifest mapping every emitted file to its generator, target, domain pack, and skill (`.embediq/provenance/manifest.json`).
- Tamper-evident audit log (`audit.jsonl` chained, with `verify-audit-log` CLI for integrity attestation).

These artifacts are what most procurement teams actually want — concrete, repeatable, machine-readable evidence rather than attestation letters.

---

## 11. Future hosted offering

A multi-tenant hosted offering is in planning, not shipped. When it ships, the procurement model changes substantially:

- Praglogic becomes a data processor for customer-supplied data.
- Subprocessor disclosure becomes meaningful (the cloud provider, the database provider, the observability stack).
- SOC 2 Type II attestation becomes appropriate (and likely required by enterprise customers).
- BAA availability becomes a hard requirement for healthcare customers.
- DPA becomes a hard requirement for EU customers.
- Federal data is expected to remain self-hosted indefinitely — the hosted offering will not target federal data.

This procurement evidence pack will be updated, expanded, and signed off when the hosted offering ships. Customers evaluating EmbedIQ today should evaluate the self-hosted model; the hosted offering is not yet a product.

---

## 12. Contact and how to engage

### For procurement and vendor-risk teams

- **Repo:** [github.com/asq-sheriff/embediq](https://github.com/asq-sheriff/embediq) (MIT licensed)
- **Security disclosure:** [github.com/asq-sheriff/embediq/security/advisories](https://github.com/asq-sheriff/embediq/security/advisories)
- **Praglogic contact:** [praglogic.com](https://praglogic.com)

### For pilot evaluation

The fastest path to a vendor-risk decision is a one-team pilot in the customer's own infrastructure:

1. Clone the repo. Run the wizard. Review the generated output with the security and compliance leads.
2. Run the procurement-relevant outputs (OSCAL, CycloneDX-ML AIBOM, provenance, audit chain). Hand them to the GRC platform.
3. Decide whether the open-source posture is sufficient or whether professional services are required to integrate with existing tooling.

Most procurement reviews on EmbedIQ complete in two to four weeks because the open-source model has fewer vendor-risk surfaces to evaluate than a hosted SaaS would.

---

## See also

- [`README.md`](README.md) — showcase index.
- [`EXECUTIVE-BRIEF.md`](EXECUTIVE-BRIEF.md) — leave-behind document for the CIO/CISO.
- [`FAQ.md`](FAQ.md) — fifteen common objections with crisp answers.
- [`DEMO-SCRIPT.md`](DEMO-SCRIPT.md) — 20-minute live-demo talk track.
- [`persona-healthcare-bpo.md`](persona-healthcare-bpo.md), [`persona-federal-contractor.md`](persona-federal-contractor.md), [`persona-consulting-firm.md`](persona-consulting-firm.md) — per-persona deep dives.

---

**Contact:** [praglogic.com](https://praglogic.com) · **Source:** [github.com/asq-sheriff/embediq](https://github.com/asq-sheriff/embediq) · MIT licensed
