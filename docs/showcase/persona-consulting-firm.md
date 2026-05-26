<!-- audience: public -->

# EmbedIQ for Consulting Firms

**You run a consulting firm that delivers engineering work across multiple regulated client engagements. Different clients have different compliance regimes. Your engineers need AI coding agents that match each client's posture — not your own.**

This brief is for Partners, Engagement Directors, Practice Leads, and CIOs at consulting firms, systems integrators, and professional services organizations whose engineers work simultaneously across healthcare, financial services, federal, and education clients.

## The specific problem

A consulting firm has a fundamentally harder AI-tooling problem than a single-vertical company:

- **Per-engagement compliance posture** — the engineer working on a hospital system this week is on a payment processor next month. The AI agent configuration that is appropriate for one is wrong for the other.
- **Engagement isolation** — Client A's data, prompts, and audit trail must not cross into Client B's. Your engagement letters require it. Your insurers require it.
- **Reproducible setup per engagement** — when an engineer rotates onto a new project, the AI tooling needs to be configured correctly on day one, not week three.
- **Audit-friendly handoff** — at the end of an engagement you deliver code to the client. The client's auditor asks "what AI tools were used, how were they configured, and how do you know the configuration didn't drift during the engagement?" You need to be able to answer.
- **Practice-wide visibility** — your partners want to know across all active engagements which AI tools are in use, what compliance frameworks they're configured for, and where drift exists.

## What EmbedIQ produces for a consulting firm

A ten-minute wizard run per engagement generates:

| Artifact | What it gives your engagement |
|---|---|
| Engagement-specific harness | One `.claude/`, `.cursor/`, or `.github/copilot-instructions.md` set per engagement repo, scoped to that client's regulatory posture. |
| Multi-framework composition | Combine domain packs — healthcare + AI RMF for a hospital adopting GenAI; PCI + SOC 2 for a fintech; FERPA for an edtech. Skill registry composes multiple skills with first-wins conflict resolution. |
| Per-engagement audit trail | Optional engagement-scoped audit JSONL. Tamper-evident with `EMBEDIQ_AUDIT_CHAIN_ENABLED=true`. |
| OSCAL evidence package per engagement | Component-definition + SSP fragment per client, branded with the client's system name and authorization profile. Hand it to the client at engagement close. |
| CycloneDX-ML AIBOM per engagement | Bill of materials for every AI component used during the engagement. Satisfies client supply-chain questions. |
| Autopilot drift detection | Scheduled re-scans flag if the engagement's harness has drifted from the canonical profile. Catches the case where an engineer hand-edited a rule mid-engagement. |
| Git PR integration | When a client policy update is published, regenerate the harness and open a PR against the engagement repo. The client reviews the diff before merging. |

## What changes for each role

| Role | Before EmbedIQ | After EmbedIQ |
|---|---|---|
| **Engineer rotating onto a new engagement** | Spends days configuring Claude Code from scratch or copying half-stale settings from the last project. | Runs the wizard once against the new engagement repo. Harness is correct on day one. |
| **Engagement Lead** | Cannot prove to the client that the AI configuration matches the agreed posture. | Hands the OSCAL component-definition + SSP fragment to the client's compliance lead. Done. |
| **Practice Lead** | No view across active engagements. | Engagement-scoped autopilot data feeds a practice-wide dashboard (drift, last-scan, framework coverage). |
| **Partner / CIO** | "We follow client compliance" is the most concrete claim you can make. | Per-engagement audit chain plus OSCAL evidence proves it, not just claims it. |
| **Client (at handoff)** | Receives the code. Asks "what AI tools were used?" — no good answer. | Receives the code plus the OSCAL package plus the AIBOM plus the audit chain. Drops cleanly into their GRC platform. |

## Engagement isolation patterns

EmbedIQ does not yet ship a built-in multi-engagement workspace abstraction — that's on the roadmap. Today, two patterns work for consulting firms:

**Pattern 1 — Per-engagement directory scoping.**
- Each engagement is its own directory tree with its own `.embediq/` subtree.
- Each engagement has its own audit JSONL, autopilot state, and OSCAL outputs.
- Engineers `cd` into the engagement directory before running anything.
- Simple, no infrastructure required. Works for firms with up to a few dozen active engagements.

**Pattern 2 — Per-engagement env var scoping.**
- Set `EMBEDIQ_AUTOPILOT_DIR`, `EMBEDIQ_AUDIT_LOG`, and `EMBEDIQ_OSCAL_SSP_SYSTEM_NAME` per engagement.
- Drop the env vars into the engineer's shell session when they start work on a given client.
- Works well alongside direnv or asdf-style per-directory env-var loading.

A formal multi-engagement workspace abstraction with explicit engagement IDs, cross-engagement reporting, and admin scoping is on the v4.x roadmap.

## A 90-day adoption plan

**Days 1-15 — Pick a flagship engagement.**
- Choose one active engagement where the client has a clear compliance posture (HIPAA, PCI, FERPA, or NIST AI RMF).
- Have the engagement's tech lead run the wizard and review the generated harness with the client's compliance lead.
- Confirm the OSCAL output is acceptable to the client.

**Days 16-45 — Standardize a practice template.**
- Identify the three to five most common client compliance regimes in your practice.
- Create a YAML template per regime in `templates/` (or use the built-in `hipaa-healthcare`, `pci-finance`, `soc2-saas` templates as starting points).
- Confirm a senior engineer can spin up a new engagement harness from a template in under five minutes.

**Days 46-75 — Roll out across active engagements.**
- For each active engagement, run the wizard, drop the harness in, capture the OSCAL evidence.
- Turn on autopilot drift detection for each engagement.
- Establish the practice-wide cadence (weekly drift scans, monthly evidence regeneration).

**Days 76-90 — Handoff and audit support.**
- For one engagement reaching close, deliver the OSCAL + AIBOM + audit chain alongside the code.
- Capture client feedback on the evidence format.
- Decide whether to invest in a custom practice-specific domain pack.

By the end of ninety days you have a standardized AI-agent setup across every active engagement, audit evidence ready for delivery, and partner-level visibility into the practice.

## Pricing and engagement

- **Open source core** — MIT licensed. Self-hosted. Use it for unlimited engagements.
- **Professional services** — Praglogic offers custom practice-specific domain pack development, multi-engagement workspace setup, GRC platform integration, and partner-led adoption support. Engagements typically run four to twelve weeks.
- **Hosted offerings** — In planning. A multi-tenant hosted offering with explicit engagement workspaces is on the roadmap and informed by consulting-firm requirements specifically. Let us know if this is a priority for you.

## What to read next

- [`EXECUTIVE-BRIEF.md`](EXECUTIVE-BRIEF.md) — the general executive brief.
- [`../CONSULTING-FIRM-DEPLOYMENT.md`](../CONSULTING-FIRM-DEPLOYMENT.md) — operator runbook for consulting-firm IT teams.
- [`../extension-guide/exporting-oscal-component-definitions.md`](../extension-guide/exporting-oscal-component-definitions.md) — how the OSCAL evidence is built.
- [`persona-healthcare-bpo.md`](persona-healthcare-bpo.md) — vertical-specific brief for healthcare BPO engagements.
- [`persona-federal-contractor.md`](persona-federal-contractor.md) — vertical-specific brief for federal engagements.

**Contact:** [praglogic.com](https://praglogic.com) · **Source:** [github.com/asq-sheriff/embediq](https://github.com/asq-sheriff/embediq)
