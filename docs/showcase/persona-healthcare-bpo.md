<!-- audience: public -->

# EmbedIQ for Healthcare BPOs

**You run a healthcare BPO with hundreds or thousands of developers, analysts, and claims operators. Some of them are adopting Claude Code, Cursor, or Copilot. Your HIPAA officer wants to know what to do about it.**

This brief is for the CTO, CISO, and Director of Engineering at a healthcare business process outsourcer — claims adjudication, prior authorization, clinical coding, RCM, eligibility verification, contact-center support — who has people writing code or running AI-assisted workflows against PHI-adjacent systems.

## The specific problem

Your engineers have already started using AI coding agents. You cannot stop them — productivity gains are real and your competitors are using them too. But:

- **PHI exposure risk** — every code snippet pasted into a hosted AI tool is potentially a HIPAA disclosure. Same for sample data, log lines, error traces, and test fixtures.
- **Inconsistent setup across teams** — Team A configured Claude Code with PHI rules; Team B installed it with defaults; Team C is on Cursor. Three different security postures, and no single way to audit them.
- **Audit trail gaps** — your next HIPAA audit will ask "what AI tools touch member data, what is the configuration of each, and how do you prove it has not drifted since the last review?" You cannot answer in a defensible way today.
- **Client compliance flow-down** — your payer and provider clients are starting to put AI-tool clauses in their MSAs. They expect attestable, repeatable evidence.

## What EmbedIQ produces for a healthcare BPO

A ten-minute wizard run, scoped to a healthcare-BPO profile, generates:

| Artifact | What it gives your HIPAA officer |
|---|---|
| `.claude/` rules + hooks | Pre-tool DLP scanners that block PHI patterns (MRN, SSN, DOB, member-ID, ICD/CPT in combination) before any prompt leaves the dev's machine. |
| `.claude/settings.local.json` permission tiers | Permissive / Balanced / Strict / Lockdown — matched to the developer's role and the system they are working on. |
| Path-scoped rules for PHI directories | Different rules for `claims/`, `eligibility/`, `member/` directories versus `infra/` or `docs/`. The agent applies the right policy per directory. |
| HIPAA domain pack (built-in) | Six wizard questions, six DLP patterns, three rule templates, five validation checks specific to PHI handling. |
| OSCAL component-definition + SSP fragment | Audit evidence in the format your GRC platform already understands. Feeds Drata or Vanta directly. |
| CycloneDX-ML AIBOM | Bill of materials for every AI component touching member data — Ollama local models, hosted APIs, IDE agents, the local-router service. |
| Tamper-evident audit chain | Every configuration change carries a cryptographic link to the previous change. Verifier returns exit 0 / 1 / 2 — your CI knows when someone tampered. |
| PHI-safe local router (optional) | Routes prompts through a confidence-based local model first; only escalates to hosted models when local cannot answer and the prompt has been redacted. PHI never leaves your boundary unless redaction succeeds. |

## What changes for each role

| Role | Before EmbedIQ | After EmbedIQ |
|---|---|---|
| **Developer** | Free-form Claude Code setup; sometimes pastes PHI samples into prompts. | DLP hooks block PHI patterns; permission tier prevents accidental file access; rules surface "ask the data team" before assuming. |
| **Engineering Manager** | No visibility into per-team AI configuration. | Single wizard interview produces the harness; drift detection flags when a team's setup diverges. |
| **HIPAA / Privacy Officer** | Spreadsheet inventory of AI tools, manually maintained. | OSCAL component-definition + SSP fragment auto-generated and re-generated on every wizard run. Audit-ready. |
| **Audit Manager** | Cannot prove configuration has not been tampered with. | RFC-6962-style audit chain with CLI verifier; one command returns "intact" or "broken at line N". |
| **Client Account Lead** | "We use Claude Code carefully" — no evidence to attach. | Hand the OSCAL + AIBOM package to the client's procurement team. |

## A 30-day pilot plan

**Week 1 — Evaluate.**
- Pick one engineering team working on PHI-adjacent code (claims adjudication is the sharpest test).
- Have the team lead run the wizard: `git clone https://github.com/asq-sheriff/embediq && make start`.
- Choose one of the four canonical healthcare-bpo archetypes: `healthcare-bpo-web-developer` (TS/Python web stack), `healthcare-bpo-web-pm` (PM persona on web stack), `healthcare-bpo-microsoft-developer` (C#/Java/Python Azure-DevOps stack), or `healthcare-bpo-microsoft-pm` (PM persona on Microsoft stack). Pick the stack that matches yours; the `-pm` variants exercise the non-technical role path.
- Walk the generated harness through with the HIPAA officer.

**Week 2 — Pilot deploy.**
- Drop the generated `.claude/` directory into the team's repo on a feature branch.
- Have the developers work against it for one sprint.
- Track: how many DLP-rule blocks fired? How many were legitimate? How many were false positives?

**Week 3 — Audit evidence dry run.**
- Generate the OSCAL component-definition and SSP fragment.
- Submit them to your GRC platform (Drata, Vanta, or internal equivalent).
- Confirm the format is ingestible.
- Run `verify-audit-log` on the audit JSONL and confirm CI exit code 0.

**Week 4 — Decide.**
- Roll out to a second team, or pause to refine the domain pack.
- If a second team is in scope: turn on autopilot drift detection so the configuration stays in sync.
- If pausing: capture the false-positive DLP patterns and feed them into a custom domain pack.

By the end of week four you have one team running with a HIPAA-compliant, audit-defensible AI agent configuration plus the OSCAL evidence to prove it.

## Pricing and engagement

- **Open source core** — MIT licensed. No license cost. Self-hosted.
- **Professional services** — Praglogic offers custom healthcare-BPO domain pack development, integration with your existing GRC platform, audit support, and developer training. Engagements typically run four to twelve weeks.
- **Hosted offerings** — In planning. If you want multi-tenant hosted deployment with managed updates, let us know — it informs the roadmap.

## What to read next

- [`HEALTHCARE-BPO-DEPLOYMENT.md`](../HEALTHCARE-BPO-DEPLOYMENT.md) — operator runbook for healthcare BPO IT teams.
- [`EXECUTIVE-BRIEF.md`](EXECUTIVE-BRIEF.md) — the general executive brief, persona-agnostic.
- [`../evaluators/security-model.md`](../evaluators/security-model.md) — the CISO-grade security posture document.
- [`../extension-guide/exporting-oscal-component-definitions.md`](../extension-guide/exporting-oscal-component-definitions.md) — how the OSCAL output is built.

**Contact:** [praglogic.com](https://praglogic.com) · **Source:** [github.com/asq-sheriff/embediq](https://github.com/asq-sheriff/embediq)
