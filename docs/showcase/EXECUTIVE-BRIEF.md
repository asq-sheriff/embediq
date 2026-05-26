<!-- audience: public -->

# EmbedIQ — Executive Brief

**Federal-procurement-grade AI governance for the AI coding agents your developers already use.**

Production AI coding agents — Claude Code, Cursor, GitHub Copilot, Gemini, Windsurf — are now embedded in every regulated engineering team. Auditors are starting to ask about them. EmbedIQ produces the configuration harness, supply-chain bill of materials, OSCAL evidence package, and tamper-evident audit trail that lets you answer those questions in minutes instead of months.

## Why now

Three forces converged in the last twelve months:

- **Federal pressure** — NIST AI RMF 1.0, the AI 600-1 Generative AI Profile, and the OMB M-24-10 AI memo all require AI governance posture, supply-chain transparency, and continuous monitoring for any federal use of generative AI.
- **Audit pressure** — SOC 2, HIPAA, PCI-DSS, and ISO 27001 auditors are starting to ask "which AI tools touch this codebase, what data flows to them, and how do you prove the configuration hasn't drifted?"
- **Procurement pressure** — Drata and Vanta now expect OSCAL-formatted evidence. CycloneDX-ML is becoming the AI supply-chain standard.

Most regulated teams answer those questions today with spreadsheets and screenshots. That doesn't survive the next audit cycle.

## What EmbedIQ is

A ten-minute adaptive interview that produces:

1. **A production-ready AI coding agent harness** — fifteen to forty configuration files for Claude Code, Cursor, Copilot, Gemini, Windsurf, or all of them. HIPAA / PCI-DSS / FERPA / FedRAMP / SOC 2 / NIST AI RMF rules built in.
2. **A complete audit evidence package** — OSCAL component-definition, OSCAL SSP fragment, CycloneDX-ML AIBOM, per-file provenance trace, and a tamper-evident RFC-6962-style audit chain.
3. **Continuous compliance** — drift detection, scheduled re-scans, Drata and Vanta webhook integration, and a `verify-audit-log` CLI suitable for CI.

All deterministic. No LLM in the generator. Re-running the same interview produces byte-identical output. The answers never leave memory.

## Who it is for

- **Regulated healthcare** — HIPAA-covered developer teams, healthcare BPOs adopting Claude Code at scale.
- **Financial services** — PCI-DSS, SOX, and GLBA developer environments.
- **Federal contractors** — FedRAMP authorization candidates and agency teams adopting GenAI under OMB M-24-10.
- **Consulting firms** — Standardizing AI-agent setup across multiple regulated client engagements.
- **Education** — FERPA and COPPA developer environments.

## What you get from one wizard run

| Artifact | What it does |
|---|---|
| `.claude/`, `.cursor/`, `.github/copilot-instructions.md`, etc. | A working AI coding agent setup — rules, hooks, agents, skills, MCP config, DLP patterns. |
| `.embediq/oscal/component-definition.json` | Product-level compliance claim. Drop into Drata or Vanta. |
| `.embediq/oscal/ssp-fragment.json` | Per-deployment SSP starter, FedRAMP-style. |
| `.embediq/cyclonedx/aibom.json` | CycloneDX-ML bill of materials for every AI component the harness uses. |
| `.embediq/provenance/manifest.json` | Per-file traceability — which generator, target, domain pack, and skill produced what. |
| `audit.jsonl` (chained) | RFC-6962-style tamper-evident audit log. `verify-audit-log` CLI returns exit 0 / 1 / 2 for CI. |

## What makes it defensible

| Alternative | Gap EmbedIQ closes |
|---|---|
| Claude Code `/init` | No compliance rules, no audit evidence, no drift detection, no procurement-ready output. |
| Hand-authored configs | Inconsistent across teams, no traceability, drifts within weeks, audit-hostile. |
| LLM-generated configs | Non-deterministic — the auditor cannot reproduce the artifact that was audited. |
| GRC platforms (Drata, Vanta) | Manage policy, not developer tooling. EmbedIQ produces the evidence they ingest. |

The defining property: **the same interview always produces the same harness.** Auditors can reproduce the artifact. Developers can re-run after a policy update. CI can detect drift automatically. No competing tool currently provides all three.

## Where it runs

- **Local** — CLI wizard, MIT-licensed, no network calls required, answers never leave memory.
- **Self-hosted web** — Express server, four pluggable auth strategies (Basic / OIDC / reverse-proxy header / demo), three-tier RBAC, Postgres-backed sessions for multi-node deployment, optional TLS.
- **Air-gapped** — Local-AI integration layer (Ollama) for organizations that cannot send code or prompts to hosted LLM APIs. Includes a PHI-safe local router with confidence-based escalation.
- **Continuous** — Autopilot scheduler (cron-driven or webhook-triggered) re-scans target projects, detects drift, and can open pull requests automatically.

## Commercial model

- **Open source core** — MIT licensed. Runs locally or in your private infrastructure. No vendor lock-in.
- **Hosted offerings** — In planning. Multi-tenant SaaS for organizations that want managed deployment.
- **Professional services** — Available through Praglogic for healthcare BPOs, consulting firms, and federal contractors who need custom domain packs, integration with existing GRC tooling, or audit support.

## How to engage

1. **Evaluate** — `git clone https://github.com/asq-sheriff/embediq`, `make start`, walk through the wizard against one of your projects. About fifteen minutes.
2. **Pilot** — Identify one regulated engineering team. Generate the harness plus the governance package. Drop it into the team's repo on a feature branch. Submit the OSCAL output to your audit pipeline for review.
3. **Scale** — Standardize across teams. Turn on autopilot drift detection. Connect Drata or Vanta webhooks. Wire the audit-chain verifier into CI.

---

**Source:** [github.com/asq-sheriff/embediq](https://github.com/asq-sheriff/embediq) (MIT) · **Vendor:** [praglogic.com](https://praglogic.com)
